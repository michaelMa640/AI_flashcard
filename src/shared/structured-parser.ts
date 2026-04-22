import type { FormState, RawStructuredData, StructuredData } from "./flashcard-types.js";
import { normalizeSourceType } from "./flashcard-types.js";
import { applyTemplateToStructuredData } from "./template-runtime.js";
import {
  buildFallbackStructuredData,
  buildNotePath,
  folderFromType,
  isFlashcardCandidate,
} from "./flashcard-utils.js";

export function parseModelJson(content: string): RawStructuredData {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as RawStructuredData;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim()) as RawStructuredData;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as RawStructuredData;
  }

  throw new Error("无法从模型返回中解析 JSON");
}

export function normalizeStructuredData(raw: RawStructuredData, form: FormState): StructuredData {
  const title = raw.title || form.rawInput.slice(0, 48);
  const sourceType = normalizeSourceType(raw.sourceType) ?? form.sourceType;
  const notePath = raw.notePath || buildNotePath(form.folder || folderFromType(sourceType), title);

  const flashcards = Array.isArray(raw.flashcards)
    ? raw.flashcards
        .filter(isFlashcardCandidate)
        .map((item) => ({
          front: String(item.front).trim(),
          back: String(item.back).trim(),
        }))
    : [];

  return applyTemplateToStructuredData({
    title,
    sourceType,
    summaryCn: raw.summaryCn || "待补充中文速记",
    explanation: raw.explanation || "待补充解释",
    hint: raw.hint || raw.summaryCn || "请补充一个帮助回忆的提示。",
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : [],
    flashcards:
      flashcards.length > 0
        ? flashcards
        : buildFallbackStructuredData(form).flashcards,
    notePath,
    runtimeNotice: raw.runtimeNotice,
  }, form);
}
