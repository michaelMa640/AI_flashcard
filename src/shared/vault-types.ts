export type VaultConfig = {
  vaultPath: string | null;
};

export type WriteMarkdownStrategy = "overwrite" | "skip";

export type WriteMarkdownRequest = {
  vaultPath: string;
  notePath: string;
  content: string;
  strategy?: WriteMarkdownStrategy;
};

export type WriteMarkdownResult = {
  ok: boolean;
  filePath: string;
  existed: boolean;
  written: boolean;
  strategy: WriteMarkdownStrategy;
  message: string;
};
