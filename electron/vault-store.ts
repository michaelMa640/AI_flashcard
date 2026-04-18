import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { VaultConfig } from "../src/shared/vault-types.js";

const DEFAULT_CONFIG: VaultConfig = {
  vaultPath: null,
};

function getConfigPath() {
  return join(app.getPath("userData"), "vault-config.json");
}

export async function loadVaultConfig(): Promise<VaultConfig> {
  try {
    const raw = await readFile(getConfigPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<VaultConfig>;
    return {
      vaultPath: typeof parsed.vaultPath === "string" && parsed.vaultPath.trim() ? parsed.vaultPath : null,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveVaultConfig(config: VaultConfig): Promise<VaultConfig> {
  const normalized: VaultConfig = {
    vaultPath: config.vaultPath?.trim() || null,
  };

  const configPath = getConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
