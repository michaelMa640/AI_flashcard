import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildLocalLibrarySnapshot,
  createDefaultLocalAppSettings,
  createDefaultLocalLibraryData,
  defaultFolderNameForSourceType,
  defaultTemplateIdForSourceType,
} from "../src/shared/local-library-defaults.js";
import type {
  FolderRecord,
  LocalAppSettings,
  LocalCardRecord,
  LocalLibraryData,
  LocalLibrarySnapshot,
  ReviewCardInput,
  ReviewCardResult,
  SaveCardInput,
  SaveCardResult,
  SaveFolderInput,
  SaveFolderResult,
  SaveTemplateInput,
  SaveTemplateResult,
  TemplateField,
  TemplateRecord,
} from "../src/shared/local-library-types.js";
import {
  buildReviewFeedbackMessage,
  buildReviewScheduleUpdate,
} from "../src/shared/review-scheduler.js";

function getLibraryPath() {
  return join(app.getPath("userData"), "local-library.json");
}

export async function loadLocalLibrarySnapshot(): Promise<LocalLibrarySnapshot> {
  const data = await loadLocalLibraryData();
  return buildLocalLibrarySnapshot(data);
}

export async function saveLocalAppSettings(settings: Partial<LocalAppSettings>): Promise<LocalLibrarySnapshot> {
  const data = await loadLocalLibraryData();
  data.settings = normalizeSettings({
    ...data.settings,
    ...settings,
  });
  await persistLocalLibraryData(data);
  return buildLocalLibrarySnapshot(data);
}

export async function saveLocalCard(input: SaveCardInput): Promise<SaveCardResult> {
  const data = await loadLocalLibraryData();
  const now = new Date().toISOString();
  const folderName = input.form.folder.trim() || defaultFolderNameForSourceType(input.form.sourceType);
  const folder = ensureFolder(data, folderName, input.structuredData.sourceType, now);
  const template = ensureTemplate(data, folder.templateId, input.structuredData.sourceType, now);
  const existing = input.cardId ? data.cards.find((card) => card.id === input.cardId) : undefined;

  const card: LocalCardRecord = {
    id: existing?.id || randomUUID(),
    title: input.structuredData.title,
    folderId: folder.id,
    folderName: folder.name,
    templateId: template.id,
    sourceType: input.structuredData.sourceType,
    mode: input.form.mode,
    rawInput: input.form.rawInput,
    context: input.form.context,
    deckTag: input.form.deckTag,
    summary: input.structuredData.summaryCn,
    explanation: input.structuredData.explanation,
    hint: input.structuredData.hint,
    keywords: input.structuredData.keywords,
    flashcards: input.structuredData.flashcards,
    notePath: input.structuredData.notePath,
    markdown: input.markdown,
    obsidianUri: input.uri,
    structuredData: input.structuredData,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    reviewState: existing?.reviewState || "new",
    reviewDueAt: existing?.reviewDueAt || now,
    reviewLastAt: existing?.reviewLastAt || null,
    reviewCount: existing?.reviewCount || 0,
    memoryScore: existing?.memoryScore || 0,
  };

  data.cards = [card].concat(data.cards.filter((item) => item.id !== card.id)).sort(sortCardsByUpdatedAt);
  data.settings = normalizeSettings({
    ...data.settings,
    folder: folder.name,
    deckTag: input.form.deckTag,
    vaultName: input.form.vaultName,
  });
  await persistLocalLibraryData(data);

  return {
    card,
    snapshot: buildLocalLibrarySnapshot(data),
    message: existing ? "本地知识卡片已更新。" : "已保存到本地知识库。",
  };
}

export async function saveLocalFolder(input: SaveFolderInput): Promise<SaveFolderResult> {
  const data = await loadLocalLibraryData();
  const name = input.name.trim();
  const template = data.templates.find((item) => item.id === input.templateId);

  if (!name) {
    throw new Error("分类名称不能为空。");
  }

  if (!template) {
    throw new Error("未找到对应的模板。");
  }

  const duplicate = data.folders.find((item) => item.name === name && item.id !== input.id);
  if (duplicate) {
    throw new Error("已存在同名分类，请换一个名称。");
  }

  const now = new Date().toISOString();
  const existing = input.id ? data.folders.find((item) => item.id === input.id) : undefined;
  const folder: FolderRecord = {
    id: existing?.id || randomUUID(),
    name,
    templateId: template.id,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  data.folders = data.folders
    .filter((item) => item.id !== folder.id)
    .concat(folder)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  data.cards = data.cards.map((card) =>
    card.folderId === folder.id
      ? {
          ...card,
          folderName: folder.name,
          templateId: folder.templateId,
          updatedAt: now,
        }
      : card,
  );
  data.settings = normalizeSettings({
    ...data.settings,
    folder: folder.name,
  });
  await persistLocalLibraryData(data);

  return {
    folder,
    snapshot: buildLocalLibrarySnapshot(data),
    message: existing ? "分类已更新。" : "新分类已创建。",
  };
}

export async function saveLocalTemplate(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  const data = await loadLocalLibraryData();
  const name = input.name.trim();

  if (!name) {
    throw new Error("模板名称不能为空。");
  }

  const duplicate = data.templates.find((item) => item.name === name && item.id !== input.id);
  if (duplicate) {
    throw new Error("已存在同名模板，请换一个名称。");
  }

  const now = new Date().toISOString();
  const existing = input.id ? data.templates.find((item) => item.id === input.id) : undefined;
  const template: TemplateRecord = {
    id: existing?.id || randomUUID(),
    name,
    description: input.description.trim(),
    promptStrategy: input.promptStrategy,
    enabledFields: normalizeTemplateFields(input.enabledFields),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  data.templates = data.templates
    .filter((item) => item.id !== template.id)
    .concat(template)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  await persistLocalLibraryData(data);

  return {
    template,
    snapshot: buildLocalLibrarySnapshot(data),
    message: existing ? "模板已更新。" : "新模板已创建。",
  };
}

export async function reviewLocalCard(input: ReviewCardInput): Promise<ReviewCardResult> {
  const data = await loadLocalLibraryData();
  const existing = data.cards.find((card) => card.id === input.cardId);

  if (!existing) {
    throw new Error("未找到需要更新的复习卡片。");
  }

  const now = new Date();
  const schedule = buildReviewScheduleUpdate(existing, input.rating, now);
  const next = buildReviewedCard(existing, schedule, now);
  data.cards = [next].concat(data.cards.filter((card) => card.id !== next.id)).sort(sortCardsByUpdatedAt);
  await persistLocalLibraryData(data);

  return {
    card: next,
    snapshot: buildLocalLibrarySnapshot(data),
    message: buildReviewFeedbackMessage(input.rating, schedule, now),
  };
}

async function loadLocalLibraryData(): Promise<LocalLibraryData> {
  const defaults = createDefaultLocalLibraryData();

  try {
    const raw = await readFile(getLibraryPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalLibraryData>;
    return normalizeLocalLibraryData(parsed, defaults);
  } catch {
    return defaults;
  }
}

async function persistLocalLibraryData(data: LocalLibraryData) {
  const libraryPath = getLibraryPath();
  await mkdir(dirname(libraryPath), { recursive: true });
  await writeFile(libraryPath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeLocalLibraryData(raw: Partial<LocalLibraryData>, defaults: LocalLibraryData): LocalLibraryData {
  const templates = normalizeTemplates(raw.templates, defaults.templates);
  const folders = normalizeFolders(raw.folders, defaults.folders, templates);
  const templateIds = new Set(templates.map((item) => item.id));
  const folderMap = new Map(folders.map((item) => [item.id, item]));
  const cards = Array.isArray(raw.cards)
    ? raw.cards
        .map((item) => normalizeCard(item, folderMap, templateIds))
        .filter((item): item is LocalCardRecord => Boolean(item))
        .sort(sortCardsByUpdatedAt)
    : [];

  return {
    version: typeof raw.version === "number" ? raw.version : defaults.version,
    settings: normalizeSettings(raw.settings),
    folders,
    templates,
    cards,
  };
}

function normalizeSettings(input?: Partial<LocalAppSettings>): LocalAppSettings {
  const defaults = createDefaultLocalAppSettings();
  return {
    ...defaults,
    ...input,
    storageChannel:
      input?.storageChannel === "icloud-backup" || input?.storageChannel === "obsidian-export"
        ? input.storageChannel
        : defaults.storageChannel,
    dailyNewLimit: normalizePositiveInt(input?.dailyNewLimit, defaults.dailyNewLimit),
    dailyReviewLimit: normalizePositiveInt(input?.dailyReviewLimit, defaults.dailyReviewLimit),
  };
}

function normalizeTemplates(input: unknown, defaults: TemplateRecord[]) {
  const list = Array.isArray(input) ? input : [];
  const normalized = list
    .filter((item): item is Partial<TemplateRecord> => Boolean(item) && typeof item === "object")
    .map((item): TemplateRecord => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : randomUUID(),
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名模板",
      description: typeof item.description === "string" ? item.description : "",
      enabledFields: normalizeTemplateFields(item.enabledFields),
      promptStrategy:
        item.promptStrategy === "career" || item.promptStrategy === "general" ? item.promptStrategy : "english",
      createdAt: normalizeIsoDate(item.createdAt),
      updatedAt: normalizeIsoDate(item.updatedAt),
    }));

  const merged = new Map<string, TemplateRecord>();
  defaults.forEach((item) => merged.set(item.id, item));
  normalized.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function normalizeFolders(input: unknown, defaults: FolderRecord[], templates: TemplateRecord[]) {
  const list = Array.isArray(input) ? input : [];
  const templateIds = new Set(templates.map((item) => item.id));
  const normalized = list
    .filter((item): item is Partial<FolderRecord> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id : randomUUID(),
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名分类",
      templateId:
        typeof item.templateId === "string" && templateIds.has(item.templateId)
          ? item.templateId
          : defaults[0]?.templateId || defaultTemplateIdForSourceType("phrase"),
      createdAt: normalizeIsoDate(item.createdAt),
      updatedAt: normalizeIsoDate(item.updatedAt),
    }));

  const merged = new Map<string, FolderRecord>();
  defaults.forEach((item) => merged.set(item.id, item));
  normalized.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function normalizeCard(
  input: unknown,
  folderMap: Map<string, FolderRecord>,
  templateIds: Set<string>,
): LocalCardRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const card = input as Partial<LocalCardRecord>;
  if (typeof card.id !== "string" || !card.id.trim()) {
    return null;
  }

  const folder = folderMap.get(card.folderId || "") || Array.from(folderMap.values())[0];
  if (!folder) {
    return null;
  }

  return {
    id: card.id,
    title: typeof card.title === "string" && card.title.trim() ? card.title.trim() : "未命名卡片",
    folderId: folder.id,
    folderName: typeof card.folderName === "string" && card.folderName.trim() ? card.folderName.trim() : folder.name,
    templateId: typeof card.templateId === "string" && templateIds.has(card.templateId) ? card.templateId : folder.templateId,
    sourceType:
      card.sourceType === "word" || card.sourceType === "phrase" || card.sourceType === "sentence" || card.sourceType === "custom"
        ? card.sourceType
        : "custom",
    mode: card.mode === "direct" ? "direct" : "ai",
    rawInput: typeof card.rawInput === "string" ? card.rawInput : "",
    context: typeof card.context === "string" ? card.context : "",
    deckTag: typeof card.deckTag === "string" ? card.deckTag : "",
    summary: typeof card.summary === "string" ? card.summary : "",
    explanation: typeof card.explanation === "string" ? card.explanation : "",
    hint: typeof card.hint === "string" ? card.hint : "",
    keywords: Array.isArray(card.keywords) ? card.keywords.map(String) : [],
    flashcards: Array.isArray(card.flashcards)
      ? card.flashcards
          .filter((item) => item && typeof item.front === "string" && typeof item.back === "string")
          .map((item) => ({
            front: item.front.trim(),
            back: item.back.trim(),
          }))
      : [],
    notePath: typeof card.notePath === "string" ? card.notePath : "",
    markdown: typeof card.markdown === "string" ? card.markdown : "",
    obsidianUri: typeof card.obsidianUri === "string" ? card.obsidianUri : "",
    structuredData:
      card.structuredData && typeof card.structuredData === "object"
        ? {
            title: typeof card.structuredData.title === "string" ? card.structuredData.title : "未命名卡片",
            sourceType:
              card.structuredData.sourceType === "word" ||
              card.structuredData.sourceType === "phrase" ||
              card.structuredData.sourceType === "sentence" ||
              card.structuredData.sourceType === "custom"
                ? card.structuredData.sourceType
                : "custom",
            summaryCn: typeof card.structuredData.summaryCn === "string" ? card.structuredData.summaryCn : "",
            explanation: typeof card.structuredData.explanation === "string" ? card.structuredData.explanation : "",
            hint: typeof card.structuredData.hint === "string" ? card.structuredData.hint : "",
            keywords: Array.isArray(card.structuredData.keywords) ? card.structuredData.keywords.map(String) : [],
            flashcards: Array.isArray(card.structuredData.flashcards)
              ? card.structuredData.flashcards
                  .filter((item) => item && typeof item.front === "string" && typeof item.back === "string")
                  .map((item) => ({
                    front: item.front.trim(),
                    back: item.back.trim(),
                  }))
              : [],
            notePath: typeof card.structuredData.notePath === "string" ? card.structuredData.notePath : "",
            runtimeNotice:
              typeof card.structuredData.runtimeNotice === "string" ? card.structuredData.runtimeNotice : undefined,
          }
        : {
            title: typeof card.title === "string" ? card.title : "未命名卡片",
            sourceType:
              card.sourceType === "word" || card.sourceType === "phrase" || card.sourceType === "sentence" || card.sourceType === "custom"
                ? card.sourceType
                : "custom",
            summaryCn: typeof card.summary === "string" ? card.summary : "",
            explanation: typeof card.explanation === "string" ? card.explanation : "",
            hint: typeof card.hint === "string" ? card.hint : "",
            keywords: Array.isArray(card.keywords) ? card.keywords.map(String) : [],
            flashcards: Array.isArray(card.flashcards)
              ? card.flashcards
                  .filter((item) => item && typeof item.front === "string" && typeof item.back === "string")
                  .map((item) => ({
                    front: item.front.trim(),
                    back: item.back.trim(),
                  }))
              : [],
            notePath: typeof card.notePath === "string" ? card.notePath : "",
          },
    createdAt: normalizeIsoDate(card.createdAt),
    updatedAt: normalizeIsoDate(card.updatedAt),
    reviewState: card.reviewState === "learning" || card.reviewState === "review" ? card.reviewState : "new",
    reviewDueAt: normalizeIsoDate(card.reviewDueAt),
    reviewLastAt: typeof card.reviewLastAt === "string" ? normalizeIsoDate(card.reviewLastAt) : null,
    reviewCount: normalizeNonNegativeInt(card.reviewCount, 0),
    memoryScore: normalizeNumber(card.memoryScore, 0),
  };
}

function ensureFolder(data: LocalLibraryData, folderName: string, sourceType: LocalCardRecord["sourceType"], now: string) {
  const existing = data.folders.find((item) => item.name === folderName);
  if (existing) {
    return existing;
  }

  const folder: FolderRecord = {
    id: randomUUID(),
    name: folderName,
    templateId: defaultTemplateIdForSourceType(sourceType),
    createdAt: now,
    updatedAt: now,
  };

  data.folders = data.folders.concat(folder);
  return folder;
}

function ensureTemplate(data: LocalLibraryData, templateId: string, sourceType: LocalCardRecord["sourceType"], now: string) {
  const existing = data.templates.find((item) => item.id === templateId);
  if (existing) {
    return existing;
  }

  const template: TemplateRecord = {
    id: defaultTemplateIdForSourceType(sourceType),
    name: sourceType === "custom" ? "求职知识模板" : "英语学习模板",
    description: "运行时补齐的默认模板。",
    enabledFields: ["summary", "explanation", "hint", "flashcards", "keywords"],
    promptStrategy: sourceType === "custom" ? "career" : "english",
    createdAt: now,
    updatedAt: now,
  };

  data.templates = data.templates.concat(template);
  return template;
}

function normalizeIsoDate(value: unknown) {
  return typeof value === "string" && value.trim() ? value : new Date().toISOString();
}

function normalizePositiveInt(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.round(value));
}

function normalizeNonNegativeInt(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.round(value));
}

function normalizeNumber(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function buildReviewedCard(card: LocalCardRecord, schedule: ReturnType<typeof buildReviewScheduleUpdate>, now: Date): LocalCardRecord {
  return {
    ...card,
    updatedAt: now.toISOString(),
    reviewLastAt: now.toISOString(),
    reviewCount: card.reviewCount + 1,
    reviewState: schedule.reviewState,
    reviewDueAt: schedule.reviewDueAt,
    memoryScore: schedule.memoryScore,
  };
}

function normalizeTemplateFields(value: unknown): TemplateField[] {
  const allowed = new Set<TemplateField>(["summary", "explanation", "hint", "flashcards", "keywords"]);
  const fields = Array.isArray(value) ? value.filter((item): item is TemplateField => allowed.has(item as TemplateField)) : [];
  return fields.length > 0 ? fields : ["summary", "flashcards"];
}

function sortCardsByUpdatedAt(left: LocalCardRecord, right: LocalCardRecord) {
  return right.updatedAt.localeCompare(left.updatedAt);
}
