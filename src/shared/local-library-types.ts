import type { Flashcard, FormState, PersistedSettings, RunMode, SourceType, StructuredData } from "./flashcard-types.js";

export type StorageChannel = "local" | "icloud-backup" | "obsidian-export";
export type TemplateField = "summary" | "explanation" | "hint" | "flashcards" | "keywords";
export type PromptStrategy = "english" | "career" | "general";
export type ReviewState = "new" | "learning" | "review";

export type LocalAppSettings = PersistedSettings & {
  storageChannel: StorageChannel;
  dailyNewLimit: number;
  dailyReviewLimit: number;
};

export type FolderRecord = {
  id: string;
  name: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
};

export type TemplateRecord = {
  id: string;
  name: string;
  description: string;
  enabledFields: TemplateField[];
  promptStrategy: PromptStrategy;
  createdAt: string;
  updatedAt: string;
};

export type LocalCardRecord = {
  id: string;
  title: string;
  folderId: string;
  folderName: string;
  templateId: string;
  sourceType: SourceType;
  mode: RunMode;
  rawInput: string;
  context: string;
  deckTag: string;
  summary: string;
  explanation: string;
  hint: string;
  keywords: string[];
  flashcards: Flashcard[];
  notePath: string;
  markdown: string;
  obsidianUri: string;
  structuredData: StructuredData;
  createdAt: string;
  updatedAt: string;
  reviewState: ReviewState;
  reviewDueAt: string;
  reviewLastAt: string | null;
  reviewCount: number;
  memoryScore: number;
};

export type LocalLibraryData = {
  version: number;
  settings: LocalAppSettings;
  folders: FolderRecord[];
  templates: TemplateRecord[];
  cards: LocalCardRecord[];
};

export type LocalLibraryStats = {
  totalCards: number;
  totalFolders: number;
  totalTemplates: number;
  dueTodayCount: number;
};

export type LocalLibrarySnapshot = LocalLibraryData & {
  stats: LocalLibraryStats;
};

export type SaveCardInput = {
  cardId?: string;
  form: FormState;
  structuredData: StructuredData;
  markdown: string;
  uri: string;
};

export type SaveCardResult = {
  card: LocalCardRecord;
  snapshot: LocalLibrarySnapshot;
  message: string;
};
