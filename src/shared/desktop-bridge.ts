import type { DesktopAppInfo } from "./app-info.js";
import type {
  LocalAppSettings,
  LocalLibrarySnapshot,
  ReviewCardInput,
  ReviewCardResult,
  SaveCardInput,
  SaveCardResult,
} from "./local-library-types.js";
import type { VaultConfig, WriteMarkdownRequest, WriteMarkdownResult } from "./vault-types.js";

export type DesktopBridgeApi = {
  appInfo: DesktopAppInfo;
  localLibrary: {
    loadSnapshot(): Promise<LocalLibrarySnapshot>;
    saveSettings(payload: Partial<LocalAppSettings>): Promise<LocalLibrarySnapshot>;
    saveCard(payload: SaveCardInput): Promise<SaveCardResult>;
    reviewCard(payload: ReviewCardInput): Promise<ReviewCardResult>;
  };
  vault: {
    loadConfig(): Promise<VaultConfig>;
    chooseDirectory(): Promise<VaultConfig>;
    writeMarkdown(payload: WriteMarkdownRequest): Promise<WriteMarkdownResult>;
  };
  obsidian: {
    openUri(uri: string): Promise<{
      ok: boolean;
      uri: string;
      message: string;
    }>;
  };
};
