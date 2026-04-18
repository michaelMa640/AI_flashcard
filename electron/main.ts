import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVaultConfig, saveVaultConfig } from "./vault-store.js";
import { writeMarkdownToVault } from "./vault-adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isDev = !app.isPackaged;
const rendererDevUrl = "http://127.0.0.1:5173";
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    title: "AI Flashcard",
    backgroundColor: "#f4efe8",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = window;

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    void window.loadURL(rendererDevUrl);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  void window.loadFile(join(__dirname, "..", "dist", "index.html"));
}

function registerIpcHandlers() {
  ipcMain.handle("vault:load-config", async () => loadVaultConfig());

  ipcMain.handle("vault:choose-directory", async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
    const options = {
      properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
      title: "选择 Obsidian Vault 目录",
    };
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return loadVaultConfig();
    }

    return saveVaultConfig({
      vaultPath: result.filePaths[0] ?? null,
    });
  });

  ipcMain.handle("vault:write-markdown", async (_event, payload) => {
    return writeMarkdownToVault(payload);
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
