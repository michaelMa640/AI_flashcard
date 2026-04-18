import type { FormState, SourceType, StructuredData } from "./flashcard-types.js";
import { buildNotePath, folderFromType } from "./flashcard-utils.js";

export type MarkdownDocument = {
  title: string;
  notePath: string;
  deckTagLine: string;
  content: string;
  tags: string[];
  keywords: string[];
};

export function buildMarkdownDocument(data: StructuredData, form: FormState): MarkdownDocument {
  const title = normalizeTitle(data.title, form.rawInput);
  const notePath = normalizeNotePath(data.notePath, title, data.sourceType);
  const keywords = normalizeKeywords(data.keywords);
  const tags = buildFrontmatterTags(data.sourceType, keywords);
  const deckTagLine = buildDeckTagLine(form.deckTag, data.sourceType);
  const createdAt = new Date().toISOString().slice(0, 10);
  const flashcardLines = normalizeFlashcardLines(data).join("\n");

  const sections = [
    frontmatterBlock({
      type: "knowledge-card",
      source_type: data.sourceType,
      created_at: createdAt,
      note_path: notePath,
      deck_tag: deckTagLine.replace(/^#/, ""),
      keywords,
      tags,
    }),
    `# ${title}`,
    deckTagLine,
    "## 原文",
    safeMultiline(form.rawInput || title),
    "## 中文速记",
    safeMultiline(data.summaryCn || "待补充中文速记"),
    "## AI解释",
    safeMultiline(data.explanation || "待补充解释"),
  ];

  if (form.context.trim()) {
    sections.push("## 补充上下文", safeMultiline(form.context.trim()));
  }

  if (data.runtimeNotice?.trim()) {
    sections.push("## 生成说明", safeMultiline(data.runtimeNotice.trim()));
  }

  sections.push("## 卡片", flashcardLines || "待补充卡片::待补充答案");

  return {
    title,
    notePath,
    deckTagLine,
    content: sections.join("\n\n"),
    tags,
    keywords,
  };
}

function normalizeTitle(candidate: string, fallbackRawInput: string) {
  const base = candidate.trim() || fallbackRawInput.split("\n")[0].trim() || "Untitled Flashcard";
  return base.replace(/\s+/g, " ").slice(0, 120);
}

function normalizeNotePath(candidate: string, title: string, sourceType: SourceType) {
  if (!candidate.trim()) {
    return buildNotePath(folderFromType(sourceType), title);
  }

  const normalized = candidate
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean)
    .join("/");

  if (!normalized) {
    return buildNotePath(folderFromType(sourceType), title);
  }

  const withExtension = normalized.endsWith(".md") ? normalized : `${normalized}.md`;
  return withExtension.replace(/^\/+/, "");
}

function sanitizePathSegment(segment: string) {
  return segment
    .trim()
    .replace(/[<>:"|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.{1,2}$/, "")
    .replace(/\/+/g, "-");
}

function normalizeKeywords(keywords: string[]) {
  const cleaned = keywords
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\s+/g, " "))
    .slice(0, 12);

  return [...new Set(cleaned)];
}

function buildFrontmatterTags(sourceType: SourceType, keywords: string[]) {
  const base = ["flashcard", "obsidian", sourceType];
  const keywordTags = keywords.map(toTagToken).filter(Boolean);
  return [...new Set([...base, ...keywordTags])];
}

function toTagToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDeckTagLine(rawDeckTag: string, sourceType: SourceType) {
  const fallbackDeck: Record<SourceType, string> = {
    word: "english/words",
    phrase: "english/phrases",
    sentence: "english/sentences",
    custom: "knowledge/custom",
  };

  const normalized = rawDeckTag
    .split("/")
    .map((item) => toTagToken(item))
    .filter(Boolean)
    .join("/");

  return normalized ? `#flashcards/${normalized}` : `#flashcards/${fallbackDeck[sourceType]}`;
}

function normalizeFlashcardLines(data: StructuredData) {
  return data.flashcards
    .map((card) => {
      const front = singleLine(card.front);
      const back = singleLine(card.back);
      return front && back ? `${front}::${back}` : "";
    })
    .filter(Boolean);
}

function singleLine(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function safeMultiline(value: string) {
  return value.trim() || "待补充";
}

function frontmatterBlock(record: Record<string, string | string[]>) {
  const lines = ["---"];

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      if (value.length === 0) {
        lines.push("  - none");
      } else {
        value.forEach((item) => lines.push(`  - ${item}`));
      }
      continue;
    }

    lines.push(`${key}: ${value}`);
  }

  lines.push("---");
  return lines.join("\n");
}
