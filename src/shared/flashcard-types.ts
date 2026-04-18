export type SourceType = "word" | "phrase" | "sentence" | "custom";
export type RunMode = "ai" | "direct";

export type Flashcard = {
  front: string;
  back: string;
};

export type StructuredData = {
  title: string;
  sourceType: SourceType;
  summaryCn: string;
  explanation: string;
  keywords: string[];
  flashcards: Flashcard[];
  notePath: string;
  runtimeNotice?: string;
};

export type PersistedSettings = {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  systemPrompt?: string;
  vaultName?: string;
  deckTag?: string;
  folder?: string;
};

export type FormState = {
  rawInput: string;
  sourceType: SourceType;
  mode: RunMode;
  vaultName: string;
  deckTag: string;
  folder: string;
  context: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
};

export type RawStructuredData = Partial<StructuredData> & {
  flashcards?: Array<Partial<Flashcard> | null> | unknown;
  keywords?: unknown;
};

export function normalizeSourceType(value?: string): SourceType | null {
  if (value === "word" || value === "phrase" || value === "sentence" || value === "custom") {
    return value;
  }

  return null;
}
