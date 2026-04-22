import { DEFAULT_SYSTEM_PROMPT } from "./ai-prompt.js";
import type { SourceType } from "./flashcard-types.js";
import type {
  FolderRecord,
  LocalAppSettings,
  LocalLibraryData,
  LocalLibrarySnapshot,
  LocalLibraryStats,
  TemplateRecord,
} from "./local-library-types.js";

export const LOCAL_LIBRARY_VERSION = 1;

export const DEFAULT_FOLDER_NAMES: Record<SourceType, string> = {
  word: "英语",
  phrase: "英语",
  sentence: "英语",
  custom: "求职",
};

export const DEFAULT_TEMPLATE_IDS = {
  english: "template-english-core",
  career: "template-career-core",
  general: "template-general-core",
} as const;

export function createDefaultLocalAppSettings(): LocalAppSettings {
  return {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    vaultName: "My Knowledge Vault",
    deckTag: "english/phrases",
    folder: "英语",
    storageChannel: "local",
    dailyNewLimit: 10,
    dailyReviewLimit: 30,
  };
}

export function createDefaultLocalLibraryData(now = new Date().toISOString()): LocalLibraryData {
  return {
    version: LOCAL_LIBRARY_VERSION,
    settings: createDefaultLocalAppSettings(),
    folders: buildDefaultFolders(now),
    templates: buildDefaultTemplates(now),
    cards: [],
  };
}

export function buildLocalLibrarySnapshot(data: LocalLibraryData): LocalLibrarySnapshot {
  return {
    ...data,
    stats: buildLocalLibraryStats(data),
  };
}

export function buildLocalLibraryStats(data: LocalLibraryData): LocalLibraryStats {
  const today = new Date().toISOString().slice(0, 10);
  return {
    totalCards: data.cards.length,
    totalFolders: data.folders.length,
    totalTemplates: data.templates.length,
    dueTodayCount: data.cards.filter((card) => card.reviewDueAt.slice(0, 10) <= today).length,
  };
}

export function defaultFolderNameForSourceType(sourceType: SourceType) {
  return DEFAULT_FOLDER_NAMES[sourceType];
}

export function defaultTemplateIdForSourceType(sourceType: SourceType) {
  if (sourceType === "custom") {
    return DEFAULT_TEMPLATE_IDS.career;
  }

  return DEFAULT_TEMPLATE_IDS.english;
}

export function buildDefaultFolders(now = new Date().toISOString()): FolderRecord[] {
  return [
    {
      id: "folder-english",
      name: "英语",
      templateId: DEFAULT_TEMPLATE_IDS.english,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "folder-career",
      name: "求职",
      templateId: DEFAULT_TEMPLATE_IDS.career,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function buildDefaultTemplates(now = new Date().toISOString()): TemplateRecord[] {
  return [
    {
      id: DEFAULT_TEMPLATE_IDS.english,
      name: "英语学习模板",
      description: "适用于英语单词、词组和句子的本地卡片模板。",
      enabledFields: ["summary", "explanation", "hint", "flashcards", "keywords"],
      promptStrategy: "english",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: DEFAULT_TEMPLATE_IDS.career,
      name: "求职知识模板",
      description: "适用于求职概念、面试问题和职业知识点。",
      enabledFields: ["summary", "explanation", "hint", "flashcards", "keywords"],
      promptStrategy: "career",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: DEFAULT_TEMPLATE_IDS.general,
      name: "通用知识模板",
      description: "适用于未来扩展的其他知识分类。",
      enabledFields: ["summary", "explanation", "hint", "flashcards", "keywords"],
      promptStrategy: "general",
      createdAt: now,
      updatedAt: now,
    },
  ];
}
