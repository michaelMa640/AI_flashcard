import type { FormState, StructuredData } from "./flashcard-types.js";
import type { PromptStrategy, TemplateField, TemplateRecord } from "./local-library-types.js";

const DEFAULT_TEMPLATE_FIELDS: TemplateField[] = ["summary", "explanation", "hint", "flashcards", "keywords"];

export function enabledTemplateFieldsFromForm(form: FormState): TemplateField[] {
  return normalizeTemplateFields(form.templateEnabledFields);
}

export function applyTemplateToStructuredData(data: StructuredData, form: FormState): StructuredData {
  const fields = new Set(enabledTemplateFieldsFromForm(form));

  return {
    ...data,
    summaryCn: fields.has("summary") ? data.summaryCn : "",
    explanation: fields.has("explanation") ? data.explanation : "",
    hint: fields.has("hint") ? data.hint : "",
    keywords: fields.has("keywords") ? data.keywords : [],
    flashcards: fields.has("flashcards") ? data.flashcards : [],
  };
}

export function templateHasField(fields: TemplateField[], field: TemplateField) {
  return new Set(normalizeTemplateFields(fields)).has(field);
}

export function normalizeTemplateFields(fields?: string[]): TemplateField[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    return DEFAULT_TEMPLATE_FIELDS;
  }

  const allowed = new Set<TemplateField>(DEFAULT_TEMPLATE_FIELDS);
  const normalized = fields.filter((item): item is TemplateField => allowed.has(item as TemplateField));
  return normalized.length > 0 ? normalized : DEFAULT_TEMPLATE_FIELDS;
}

export function templateStrategyLabel(strategy: PromptStrategy) {
  if (strategy === "career") {
    return "求职";
  }

  if (strategy === "general") {
    return "通用";
  }

  return "英语";
}

export function resolveTemplateForCard(templates: TemplateRecord[], templateId: string) {
  return templates.find((item) => item.id === templateId) || null;
}
