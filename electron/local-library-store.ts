import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildLocalLibrarySnapshot,
  createDefaultLocalLibraryData,
} from "../src/shared/local-library-defaults.js";
import type {
  LocalAppSettings,
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
} from "../src/shared/local-library-types.js";
import {
  mergeLocalLibraryData,
  saveCardInLibrary,
  saveFolderInLibrary,
  saveSettingsInLibrary,
  saveTemplateInLibrary,
  reviewCardInLibrary,
} from "../src/shared/local-library-engine.js";

function getLibraryPath() {
  return join(app.getPath("userData"), "local-library.json");
}

export async function loadLocalLibrarySnapshot(): Promise<LocalLibrarySnapshot> {
  const data = await loadLocalLibraryData();
  return buildLocalLibrarySnapshot(data);
}

export async function saveLocalAppSettings(settings: Partial<LocalAppSettings>): Promise<LocalLibrarySnapshot> {
  const data = await loadLocalLibraryData();
  const result = saveSettingsInLibrary(data, settings);
  await persistLocalLibraryData(result.data);
  return result.snapshot;
}

export async function saveLocalCard(input: SaveCardInput): Promise<SaveCardResult> {
  const data = await loadLocalLibraryData();
  const result = saveCardInLibrary(data, input);
  await persistLocalLibraryData(result.data);
  return {
    card: result.card,
    snapshot: result.snapshot,
    message: result.message,
  };
}

export async function saveLocalFolder(input: SaveFolderInput): Promise<SaveFolderResult> {
  const data = await loadLocalLibraryData();
  const result = saveFolderInLibrary(data, input);
  await persistLocalLibraryData(result.data);
  return {
    folder: result.folder,
    snapshot: result.snapshot,
    message: result.message,
  };
}

export async function saveLocalTemplate(input: SaveTemplateInput): Promise<SaveTemplateResult> {
  const data = await loadLocalLibraryData();
  const result = saveTemplateInLibrary(data, input);
  await persistLocalLibraryData(result.data);
  return {
    template: result.template,
    snapshot: result.snapshot,
    message: result.message,
  };
}

export async function reviewLocalCard(input: ReviewCardInput): Promise<ReviewCardResult> {
  const data = await loadLocalLibraryData();
  const result = reviewCardInLibrary(data, input);
  await persistLocalLibraryData(result.data);
  return {
    card: result.card,
    snapshot: result.snapshot,
    message: result.message,
  };
}

async function loadLocalLibraryData(): Promise<LocalLibraryData> {
  const defaults = createDefaultLocalLibraryData();

  try {
    const raw = await readFile(getLibraryPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalLibraryData>;
    return mergeLocalLibraryData(parsed, defaults);
  } catch {
    return defaults;
  }
}

async function persistLocalLibraryData(data: LocalLibraryData) {
  const libraryPath = getLibraryPath();
  await mkdir(dirname(libraryPath), { recursive: true });
  await writeFile(libraryPath, JSON.stringify(data, null, 2), "utf8");
}
