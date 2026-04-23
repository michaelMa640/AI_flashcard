import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { WriteMarkdownRequest, WriteMarkdownResult } from "../src/shared/vault-types.js";

export async function writeMarkdownToVault(payload: WriteMarkdownRequest): Promise<WriteMarkdownResult> {
  const strategy = payload.strategy ?? "overwrite";
  const vaultPath = payload.vaultPath.trim();
  const notePath = payload.notePath.trim().replace(/\\/g, "/");

  if (!vaultPath) {
    throw new Error("外部知识库目录不能为空。");
  }

  if (!notePath) {
    throw new Error("笔记路径不能为空。");
  }

  const targetPath = resolve(vaultPath, notePath);
  ensurePathInsideVault(vaultPath, targetPath);

  const existed = await pathExists(targetPath);
  if (existed && strategy === "skip") {
    return {
      ok: true,
      filePath: targetPath,
      existed: true,
      written: false,
      strategy,
      message: "目标文件已存在，已按 skip 策略跳过写入。",
    };
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, payload.content, "utf8");

  return {
    ok: true,
    filePath: targetPath,
    existed,
    written: true,
    strategy,
    message: existed ? "已覆盖现有文件。" : "已创建新文件。",
  };
}

function ensurePathInsideVault(vaultPath: string, targetPath: string) {
  if (!isAbsolute(vaultPath)) {
    throw new Error("外部知识库目录必须是绝对路径。");
  }

  const relativePath = relative(resolve(vaultPath), targetPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("笔记路径超出了外部知识库目录范围。");
  }
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
