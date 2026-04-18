import type { DesktopAppInfo } from "./app-info.js";
import type { VaultConfig, WriteMarkdownRequest, WriteMarkdownResult } from "./vault-types.js";

export type DesktopBridgeApi = {
  appInfo: DesktopAppInfo;
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
