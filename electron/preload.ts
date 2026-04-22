import { contextBridge, ipcRenderer } from "electron";
import { desktopAppInfo } from "../src/shared/app-info.js";
import type { DesktopBridgeApi } from "../src/shared/desktop-bridge.js";

const desktopBridge: DesktopBridgeApi = {
  appInfo: desktopAppInfo,
  localLibrary: {
    loadSnapshot: () => ipcRenderer.invoke("local-library:load-snapshot"),
    saveSettings: (payload) => ipcRenderer.invoke("local-library:save-settings", payload),
    saveCard: (payload) => ipcRenderer.invoke("local-library:save-card", payload),
    reviewCard: (payload) => ipcRenderer.invoke("local-library:review-card", payload),
  },
  vault: {
    loadConfig: () => ipcRenderer.invoke("vault:load-config"),
    chooseDirectory: () => ipcRenderer.invoke("vault:choose-directory"),
    writeMarkdown: (payload) => ipcRenderer.invoke("vault:write-markdown", payload),
  },
  obsidian: {
    openUri: (uri) => ipcRenderer.invoke("obsidian:open-uri", uri),
  },
};

contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
