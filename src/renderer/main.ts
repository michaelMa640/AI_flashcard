import "./style.css";
import { DEFAULT_SYSTEM_PROMPT } from "../shared/ai-prompt.js";
import type { DesktopBridgeApi } from "../shared/desktop-bridge.js";
import { buildFallbackStructuredData, buildObsidianUri, folderFromType } from "../shared/flashcard-utils.js";
import { buildMarkdownDocument } from "../shared/markdown-generator.js";
import type { FormState, PersistedSettings, RunMode, SourceType, StructuredData } from "../shared/flashcard-types.js";
import type { VaultConfig } from "../shared/vault-types.js";
import { requestStructuredData } from "./services/ai-client.js";

type AppPage = "capture" | "settings";

type DemoPreset = {
  id: string;
  label: string;
  rawInput: string;
  sourceType: SourceType;
  mode: RunMode;
  folder: string;
  deckTag: string;
  context: string;
};

type HistoryEntry = {
  id: string;
  createdAt: string;
  title: string;
  sourceType: SourceType;
  mode: RunMode;
  rawInput: string;
  context: string;
  folder: string;
  deckTag: string;
  vaultName: string;
  structuredData: StructuredData;
  markdown: string;
  uri: string;
};

type Elements = {
  navCaptureButton: HTMLButtonElement;
  navSettingsButton: HTMLButtonElement;
  capturePage: HTMLElement;
  settingsPage: HTMLElement;
  debugSection: HTMLElement | null;
  presetButtons: HTMLButtonElement[];
  rawInput: HTMLTextAreaElement;
  sourceType: HTMLSelectElement;
  mode: HTMLSelectElement;
  folder: HTMLInputElement;
  deckTag: HTMLInputElement;
  context: HTMLTextAreaElement;
  runButton: HTMLButtonElement;
  fallbackButton: HTMLButtonElement;
  generationHint: HTMLParagraphElement;
  previewTitle: HTMLHeadingElement;
  previewMeta: HTMLParagraphElement;
  markdownOutput: HTMLPreElement;
  copyMarkdownButton: HTMLButtonElement;
  historyList: HTMLDivElement;
  historyEmpty: HTMLParagraphElement;
  baseUrl: HTMLInputElement;
  model: HTMLInputElement;
  apiKey: HTMLInputElement;
  systemPrompt: HTMLTextAreaElement;
  vaultName: HTMLInputElement;
  vaultPath: HTMLInputElement;
  saveSettingsButton: HTMLButtonElement;
  resetPromptButton: HTMLButtonElement;
  chooseVaultButton: HTMLButtonElement;
  writeVaultButton: HTMLButtonElement;
  dataStrategyHint: HTMLParagraphElement;
  vaultHint: HTMLParagraphElement;
  uriOutput: HTMLPreElement;
  uriHint: HTMLParagraphElement;
  copyUriButton: HTMLButtonElement;
  openUriButton: HTMLButtonElement;
  generateUriButton: HTMLButtonElement;
  persistHint: HTMLParagraphElement;
  jsonPanel: HTMLElement | null;
  jsonOutput: HTMLPreElement | null;
};

declare global {
  interface Window {
    desktopBridge?: DesktopBridgeApi;
  }
}

const SETTINGS_STORAGE_KEY = "flashcard-obsidian-desktop-settings";
const HISTORY_STORAGE_KEY = "flashcard-local-history";
const HISTORY_LIMIT = 24;
const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";
const buttonTimers = new WeakMap<HTMLButtonElement, number>();
const desktopBridge = window.desktopBridge;
const appInfo = desktopBridge?.appInfo ?? {
  name: "AI Flashcard",
  phase: "V2 Step 1",
  targetPlatforms: ["macOS", "Windows"],
  stack: ["Electron", "TypeScript", "Vite"],
};
const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "english-phrase",
    label: "英语词组",
    rawInput: "a blessing in disguise",
    sourceType: "phrase",
    mode: "ai",
    folder: "英语",
    deckTag: "english/phrases",
    context: "我想要这个短语的中文含义、语气和适合记忆的提示。",
  },
  {
    id: "english-word",
    label: "英语单词",
    rawInput: "serendipity",
    sourceType: "word",
    mode: "direct",
    folder: "英语",
    deckTag: "english/words",
    context: "这是我读文章时遇到的单词，希望快速生成复习卡片。",
  },
  {
    id: "job-custom",
    label: "求职知识点",
    rawInput: "STAR 法则在面试回答中的核心作用是什么？",
    sourceType: "custom",
    mode: "ai",
    folder: "求职",
    deckTag: "career/interview",
    context: "我想用这条内容生成面试复习卡片，重点是核心定义、提示和常见追问。",
  },
];

let currentStructuredData: StructuredData | null = null;
let currentMarkdown = "";
let currentUri = "";
let currentVaultPath = "";
let currentPage: AppPage = "capture";
let historyEntries: HistoryEntry[] = [];
let isGenerating = false;

bootstrap();

function bootstrap() {
  const root = document.querySelector<HTMLDivElement>("#app");

  if (!root) {
    throw new Error("Renderer root #app was not found.");
  }

  root.innerHTML = renderAppShell();
  const elements = collectElements();
  const saved = loadSettings();

  historyEntries = loadHistory();
  hydrateDefaults(elements, saved);
  renderOutputs(elements, null, "", "");
  renderHistory(elements);
  bindEvents(elements);
  switchPage(elements, "capture");
  void hydrateVaultState(elements);
}

function renderAppShell() {
  return `
    <div class="ambient ambient-left"></div>
    <div class="ambient ambient-right"></div>

    <main class="app-shell">
      <section class="hero">
        <p class="eyebrow">${appInfo.phase} · Local First</p>
        <h1>${appInfo.name}</h1>
        <p class="hero-copy">
          这是一个本地优先的知识卡片工具。你可以在这里录入内容、生成卡片、查看历史，
          再按需把数据同步到可选的外部渠道。
        </p>
      </section>

      <section class="nav-shell">
        <button id="navCaptureButton" class="nav-chip nav-chip-active" type="button">录入与预览</button>
        <button id="navSettingsButton" class="nav-chip" type="button">设置</button>
      </section>

      <section id="capturePage" class="page-shell">
        <section class="page-grid">
          <section class="panel">
            <div class="panel-head">
              <h2>录入内容</h2>
              <p>先确定内容、分类文件夹和生成方式，再继续预览与保存。</p>
            </div>

            ${
              DEBUG_MODE
                ? `
                  <section id="debugSection" class="debug-card">
                    <div class="panel-head compact">
                      <h3>开发辅助</h3>
                      <p>仅用于开发阶段快速填充样例，正式界面不展示。</p>
                    </div>
                    <div class="preset-cloud">
                      ${DEMO_PRESETS.map(
                        (preset) => `
                          <button type="button" class="preset-chip" data-demo-preset="${preset.id}">
                            <span>${preset.label}</span>
                            <small>${preset.folder}</small>
                          </button>
                        `,
                      ).join("")}
                    </div>
                  </section>
                `
                : ""
            }

            <label class="field">
              <span>原始内容</span>
              <textarea
                id="rawInput"
                rows="8"
                placeholder="例如：A blessing in disguise"
              ></textarea>
            </label>

            <div class="field-row">
              <label class="field">
                <span>内容类型</span>
                <select id="sourceType">
                  <option value="word">单词</option>
                  <option value="phrase" selected>词组 / 短语</option>
                  <option value="sentence">句子</option>
                  <option value="custom">自定义知识</option>
                </select>
              </label>

              <label class="field">
                <span>生成方式</span>
                <select id="mode">
                  <option value="ai" selected>AI 解释</option>
                  <option value="direct">直接生成</option>
                </select>
              </label>
            </div>

            <div class="field-row">
              <label class="field">
                <span>分类文件夹</span>
                <input id="folder" type="text" placeholder="例如：英语" />
              </label>

              <label class="field">
                <span>复习标签</span>
                <input id="deckTag" type="text" placeholder="例如：english/phrases" />
              </label>
            </div>

            <label class="field">
              <span>补充上下文</span>
              <textarea
                id="context"
                rows="4"
                placeholder="例如：这是我读文章时看到的表达，我想知道它的含义、提示和使用场景。"
              ></textarea>
            </label>

            <div class="action-row">
              <button id="runButton" class="primary" type="button">AI 解释并结构化</button>
              <button id="fallbackButton" class="ghost" type="button">直接生成最小卡片</button>
            </div>

            <p id="generationHint" class="status-hint">
              当前还没有开始生成，你可以先输入内容或选择调试样例。
            </p>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2 id="previewTitle">卡片预览</h2>
              <p id="previewMeta">生成后这里会展示当前卡片内容。</p>
            </div>

            <pre id="markdownOutput" class="code-block preview-block">等待生成卡片内容…</pre>

            <div class="action-row">
              <button id="copyMarkdownButton" class="secondary" type="button">复制卡片内容</button>
            </div>

            ${
              DEBUG_MODE
                ? `
                  <section id="jsonPanel" class="debug-card subtle">
                    <div class="panel-head compact">
                      <h3>结构化结果（调试）</h3>
                      <p>正式页面不直接展示，仅用于当前开发阶段确认结构化输出。</p>
                    </div>
                    <pre id="jsonOutput" class="code-block small">等待生成结构化结果…</pre>
                  </section>
                `
                : ""
            }
          </section>
        </section>

        <section class="panel history-panel">
          <div class="panel-head">
            <h2>录入历史</h2>
            <p>这里会保留最近生成过的卡片草稿，方便你回看和继续处理。</p>
          </div>

          <p id="historyEmpty" class="empty-state">当前还没有录入历史。</p>
          <div id="historyList" class="history-list"></div>
        </section>
      </section>

      <section id="settingsPage" class="page-shell page-hidden">
        <section class="page-grid">
          <section class="panel">
            <div class="panel-head">
              <h2>AI 设置</h2>
              <p>这里管理模型接口、Prompt 模板和生成时依赖的配置。</p>
            </div>

            <div class="field-row">
              <label class="field">
                <span>Base URL</span>
                <input id="baseUrl" type="text" placeholder="https://api.openai.com/v1" />
              </label>

              <label class="field">
                <span>Model</span>
                <input id="model" type="text" placeholder="gpt-4.1-mini" />
              </label>
            </div>

            <label class="field">
              <span>API Key</span>
              <input id="apiKey" type="password" placeholder="sk-..." />
            </label>

            <label class="field">
              <span>System Prompt</span>
              <textarea id="systemPrompt" rows="12"></textarea>
            </label>

            <div class="action-row">
              <button id="saveSettingsButton" class="secondary" type="button">保存设置</button>
              <button id="resetPromptButton" class="ghost" type="button">恢复默认 Prompt</button>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>数据渠道</h2>
              <p>当前阶段默认使用本地应用数据；iCloud 和 Obsidian 作为可选外部渠道。</p>
            </div>

            <article class="channel-card">
              <strong>本地数据</strong>
              <p id="dataStrategyHint">当前默认策略：本地优先。当前录入历史保存在应用本地存储中。</p>
            </article>

            <article class="channel-card">
              <strong>iCloud 备份</strong>
              <p>V2 后续会把它作为可选备份渠道接入，这一步先保留产品位置和说明。</p>
            </article>

            <article class="channel-card">
              <strong>Obsidian 外部存储</strong>
              <p>如果你希望把卡片额外写入 Obsidian，可以在这里配置目录并执行同步。</p>

              <label class="field">
                <span>Obsidian 存储目录</span>
                <input id="vaultPath" type="text" placeholder="尚未选择目录" readonly />
              </label>

              <label class="field">
                <span>Obsidian 存储名称</span>
                <input id="vaultName" type="text" placeholder="My Knowledge Vault" />
              </label>

              <p id="vaultHint" class="persist-hint">当前尚未选择目录。</p>

              <div class="action-row">
                <button id="chooseVaultButton" class="secondary" type="button">选择目录</button>
                <button id="writeVaultButton" class="primary" type="button">同步到 Obsidian</button>
              </div>
            </article>
          </section>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>外部回退链接</h2>
            <p>当前链接仅在需要把卡片交给 Obsidian 创建时才会使用，平时不必关心。</p>
          </div>

          <pre id="uriOutput" class="code-block small">等待生成外部回退链接…</pre>
          <p id="uriHint" class="persist-hint">当前还没有生成外部回退链接。</p>

          <div class="action-row">
            <button id="generateUriButton" class="ghost" type="button">生成链接</button>
            <button id="copyUriButton" class="ghost" type="button">复制链接</button>
            <button id="openUriButton" class="secondary" type="button">打开 Obsidian</button>
          </div>

          <p id="persistHint" class="persist-hint">普通设置会保存在当前桌面应用的本地存储中。</p>
        </section>
      </section>
    </main>
  `;
}

function collectElements(): Elements {
  return {
    navCaptureButton: byId<HTMLButtonElement>("navCaptureButton"),
    navSettingsButton: byId<HTMLButtonElement>("navSettingsButton"),
    capturePage: byId<HTMLElement>("capturePage"),
    settingsPage: byId<HTMLElement>("settingsPage"),
    debugSection: document.getElementById("debugSection"),
    presetButtons: Array.from(document.querySelectorAll<HTMLButtonElement>("[data-demo-preset]")),
    rawInput: byId<HTMLTextAreaElement>("rawInput"),
    sourceType: byId<HTMLSelectElement>("sourceType"),
    mode: byId<HTMLSelectElement>("mode"),
    folder: byId<HTMLInputElement>("folder"),
    deckTag: byId<HTMLInputElement>("deckTag"),
    context: byId<HTMLTextAreaElement>("context"),
    runButton: byId<HTMLButtonElement>("runButton"),
    fallbackButton: byId<HTMLButtonElement>("fallbackButton"),
    generationHint: byId<HTMLParagraphElement>("generationHint"),
    previewTitle: byId<HTMLHeadingElement>("previewTitle"),
    previewMeta: byId<HTMLParagraphElement>("previewMeta"),
    markdownOutput: byId<HTMLPreElement>("markdownOutput"),
    copyMarkdownButton: byId<HTMLButtonElement>("copyMarkdownButton"),
    historyList: byId<HTMLDivElement>("historyList"),
    historyEmpty: byId<HTMLParagraphElement>("historyEmpty"),
    baseUrl: byId<HTMLInputElement>("baseUrl"),
    model: byId<HTMLInputElement>("model"),
    apiKey: byId<HTMLInputElement>("apiKey"),
    systemPrompt: byId<HTMLTextAreaElement>("systemPrompt"),
    vaultName: byId<HTMLInputElement>("vaultName"),
    vaultPath: byId<HTMLInputElement>("vaultPath"),
    saveSettingsButton: byId<HTMLButtonElement>("saveSettingsButton"),
    resetPromptButton: byId<HTMLButtonElement>("resetPromptButton"),
    chooseVaultButton: byId<HTMLButtonElement>("chooseVaultButton"),
    writeVaultButton: byId<HTMLButtonElement>("writeVaultButton"),
    dataStrategyHint: byId<HTMLParagraphElement>("dataStrategyHint"),
    vaultHint: byId<HTMLParagraphElement>("vaultHint"),
    uriOutput: byId<HTMLPreElement>("uriOutput"),
    uriHint: byId<HTMLParagraphElement>("uriHint"),
    copyUriButton: byId<HTMLButtonElement>("copyUriButton"),
    openUriButton: byId<HTMLButtonElement>("openUriButton"),
    generateUriButton: byId<HTMLButtonElement>("generateUriButton"),
    persistHint: byId<HTMLParagraphElement>("persistHint"),
    jsonPanel: document.getElementById("jsonPanel"),
    jsonOutput: document.getElementById("jsonOutput") as HTMLPreElement | null,
  };
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Expected element #${id} to exist.`);
  }

  return element as T;
}

function hydrateDefaults(elements: Elements, saved: PersistedSettings) {
  elements.baseUrl.value = saved.baseUrl || "https://api.openai.com/v1";
  elements.model.value = saved.model || "gpt-4.1-mini";
  elements.apiKey.value = saved.apiKey || "";
  elements.systemPrompt.value = saved.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  elements.vaultName.value = saved.vaultName || "My Knowledge Vault";
  elements.deckTag.value = saved.deckTag || "english/phrases";
  elements.folder.value = saved.folder || "英语";
  elements.dataStrategyHint.textContent = "当前默认策略：本地优先。当前录入历史保存在应用本地存储中。";
}

function bindEvents(elements: Elements) {
  elements.navCaptureButton.addEventListener("click", () => switchPage(elements, "capture"));
  elements.navSettingsButton.addEventListener("click", () => switchPage(elements, "settings"));
  elements.presetButtons.forEach((button) => {
    button.addEventListener("click", () => handleApplyPreset(elements, button.dataset.demoPreset || ""));
  });
  elements.saveSettingsButton.addEventListener("click", () => handleSaveSettings(elements));
  elements.resetPromptButton.addEventListener("click", () => handleResetPrompt(elements));
  elements.runButton.addEventListener("click", () => {
    void handleRunAI(elements);
  });
  elements.fallbackButton.addEventListener("click", () => handleFallbackGenerate(elements));
  elements.copyMarkdownButton.addEventListener("click", () => {
    void handleCopyMarkdown(elements);
  });
  elements.copyUriButton.addEventListener("click", () => {
    void handleCopyUri(elements);
  });
  elements.generateUriButton.addEventListener("click", () => handleGenerateUri(elements));
  elements.chooseVaultButton.addEventListener("click", () => {
    void handleChooseVault(elements);
  });
  elements.writeVaultButton.addEventListener("click", () => {
    void handleWriteVault(elements);
  });
  elements.openUriButton.addEventListener("click", () => {
    void handleOpenUri(elements);
  });
  elements.sourceType.addEventListener("change", () => syncSuggestedFolder(elements));
}

function switchPage(elements: Elements, page: AppPage) {
  currentPage = page;
  const captureActive = page === "capture";
  elements.capturePage.classList.toggle("page-hidden", !captureActive);
  elements.settingsPage.classList.toggle("page-hidden", captureActive);
  elements.navCaptureButton.classList.toggle("nav-chip-active", captureActive);
  elements.navSettingsButton.classList.toggle("nav-chip-active", !captureActive);
}

async function hydrateVaultState(elements: Elements) {
  if (!desktopBridge?.vault) {
    elements.vaultHint.textContent = "当前环境不支持 Obsidian 外部存储目录选择。";
    return;
  }

  const config = await desktopBridge.vault.loadConfig();
  applyVaultConfig(elements, config);
}

function applyVaultConfig(elements: Elements, config: VaultConfig) {
  currentVaultPath = config.vaultPath ?? "";
  elements.vaultPath.value = currentVaultPath;

  if (currentVaultPath) {
    elements.vaultHint.textContent = `已选择目录：${currentVaultPath}`;
    if (!elements.vaultName.value.trim()) {
      elements.vaultName.value = extractVaultName(currentVaultPath);
    }
    return;
  }

  elements.vaultHint.textContent = "当前尚未选择目录。";
}

function loadSettings(): PersistedSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedSettings) : {};
  } catch {
    return {};
  }
}

function saveSettings(elements: Elements) {
  const payload: PersistedSettings = {
    baseUrl: elements.baseUrl.value.trim(),
    model: elements.model.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    systemPrompt: elements.systemPrompt.value,
    vaultName: elements.vaultName.value.trim(),
    deckTag: elements.deckTag.value.trim(),
    folder: elements.folder.value.trim(),
  };

  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries));
}

function persistHistoryEntry(entry: HistoryEntry) {
  historyEntries = [entry]
    .concat(historyEntries.filter((item) => item.id !== entry.id))
    .slice(0, HISTORY_LIMIT);
  saveHistory();
}

function renderHistory(elements: Elements) {
  if (historyEntries.length === 0) {
    elements.historyEmpty.hidden = false;
    elements.historyList.innerHTML = "";
    return;
  }

  elements.historyEmpty.hidden = true;
  elements.historyList.innerHTML = historyEntries
    .map(
      (entry) => `
        <button class="history-item" type="button" data-history-id="${entry.id}">
          <span class="history-item-title">${escapeHtml(entry.title)}</span>
          <span class="history-item-meta">${renderHistoryMeta(entry)}</span>
          <span class="history-item-snippet">${escapeHtml(entry.rawInput.slice(0, 120))}</span>
        </button>
      `,
    )
    .join("");

  elements.historyList.querySelectorAll<HTMLButtonElement>("[data-history-id]").forEach((button) => {
    button.addEventListener("click", () => handleHistorySelect(elements, button.dataset.historyId || ""));
  });
}

function renderHistoryMeta(entry: HistoryEntry) {
  return `${formatRelativeDate(entry.createdAt)} · ${sourceTypeLabel(entry.sourceType)} · ${entry.folder}`;
}

function handleHistorySelect(elements: Elements, entryId: string) {
  const entry = historyEntries.find((item) => item.id === entryId);

  if (!entry) {
    return;
  }

  elements.rawInput.value = entry.rawInput;
  elements.sourceType.value = entry.sourceType;
  elements.mode.value = entry.mode;
  elements.folder.value = entry.folder;
  elements.deckTag.value = entry.deckTag;
  elements.context.value = entry.context;
  elements.vaultName.value = entry.vaultName;
  currentStructuredData = entry.structuredData;
  currentMarkdown = entry.markdown;
  currentUri = entry.uri;
  isGenerating = false;
  renderOutputs(elements, currentStructuredData, currentMarkdown, currentUri);
  elements.generationHint.textContent = "已加载一条历史记录，你可以继续编辑、预览或同步到外部存储。";
  switchPage(elements, "capture");
}

function handleSaveSettings(elements: Elements) {
  saveSettings(elements);
  elements.persistHint.textContent = "设置已保存到当前桌面应用的本地存储。";
  setButtonLabel(elements.saveSettingsButton, "已保存");
}

function handleResetPrompt(elements: Elements) {
  elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
  saveSettings(elements);
  elements.persistHint.textContent = "系统 Prompt 已恢复默认并同步保存。";
}

function handleApplyPreset(elements: Elements, presetId: string) {
  const preset = DEMO_PRESETS.find((item) => item.id === presetId);

  if (!preset) {
    return;
  }

  elements.rawInput.value = preset.rawInput;
  elements.sourceType.value = preset.sourceType;
  elements.mode.value = preset.mode;
  elements.folder.value = preset.folder;
  elements.deckTag.value = preset.deckTag;
  elements.context.value = preset.context;
  elements.generationHint.textContent = `已载入“${preset.label}”调试样例，可继续生成预览。`;
}

async function handleChooseVault(elements: Elements) {
  if (!desktopBridge?.vault) {
    elements.vaultHint.textContent = "当前环境不支持选择 Obsidian 外部存储目录。";
    return;
  }

  setButtonLabel(elements.chooseVaultButton, "选择中...");
  const config = await desktopBridge.vault.chooseDirectory();
  applyVaultConfig(elements, config);
  setButtonLabel(elements.chooseVaultButton, config.vaultPath ? "已选择" : "未变更");
}

function syncSuggestedFolder(elements: Elements) {
  const type = elements.sourceType.value as SourceType;
  const suggestions: Record<SourceType, string> = {
    word: "英语",
    phrase: "英语",
    sentence: "英语",
    custom: "求职",
  };

  if (!elements.folder.value.trim()) {
    elements.folder.value = suggestions[type];
  }
}

async function handleRunAI(elements: Elements) {
  saveSettings(elements);

  const form = collectForm(elements);
  if (!form.rawInput) {
    renderValidationError(elements, "请先输入知识内容。");
    return;
  }

  if (form.mode === "direct" || !form.apiKey || !form.baseUrl || !form.model) {
    const fallback = buildFallbackStructuredData(form);
    if (form.mode === "ai" && (!form.apiKey || !form.baseUrl || !form.model)) {
      fallback.runtimeNotice = "AI 配置尚未完整，已自动降级为本地最小卡片生成。";
    }
    updateWithStructuredData(elements, fallback);
    return;
  }

  beginGeneration(elements, "AI 正在解析内容并生成结构化卡片，请稍候…");

  try {
    const result = await requestStructuredData(form);
    updateWithStructuredData(elements, result);
  } catch (error) {
    const fallback = buildFallbackStructuredData(form);
    fallback.runtimeNotice =
      "接口调用失败，已降级为本地最小卡片生成。错误信息：" +
      String(error instanceof Error ? error.message : error);
    updateWithStructuredData(elements, fallback);
  }
}

function handleFallbackGenerate(elements: Elements) {
  saveSettings(elements);
  const form = collectForm(elements);

  if (!form.rawInput) {
    renderValidationError(elements, "请先输入知识内容。");
    return;
  }

  beginGeneration(elements, "正在基于当前内容生成本地卡片草稿…");
  window.setTimeout(() => {
    updateWithStructuredData(elements, buildFallbackStructuredData(form));
  }, 0);
}

function beginGeneration(elements: Elements, message: string) {
  isGenerating = true;
  currentStructuredData = null;
  currentMarkdown = "";
  currentUri = "";
  elements.generationHint.textContent = message;
  renderOutputs(elements, null, "", "");
  setButtonDisabled(elements.runButton, true);
  setButtonDisabled(elements.fallbackButton, true);
}

function endGeneration(elements: Elements, message: string) {
  isGenerating = false;
  elements.generationHint.textContent = message;
  setButtonDisabled(elements.runButton, false);
  setButtonDisabled(elements.fallbackButton, false);
}

function setButtonDisabled(button: HTMLButtonElement, disabled: boolean) {
  button.disabled = disabled;
}

async function handleCopyMarkdown(elements: Elements) {
  if (!currentMarkdown) {
    return;
  }

  try {
    await navigator.clipboard.writeText(currentMarkdown);
    setButtonLabel(elements.copyMarkdownButton, "已复制");
  } catch {
    setButtonLabel(elements.copyMarkdownButton, "复制失败");
  }
}

async function handleCopyUri(elements: Elements) {
  if (!ensureContentReady(elements)) {
    return;
  }

  currentUri = buildCurrentUri(elements);
  renderOutputs(elements, currentStructuredData, currentMarkdown, currentUri);

  try {
    await navigator.clipboard.writeText(currentUri);
    setButtonLabel(elements.copyUriButton, "已复制链接");
  } catch {
    setButtonLabel(elements.copyUriButton, "复制失败");
  }
}

function handleGenerateUri(elements: Elements) {
  if (!ensureContentReady(elements)) {
    return;
  }

  currentUri = buildCurrentUri(elements);
  renderOutputs(elements, currentStructuredData, currentMarkdown, currentUri);
  elements.uriHint.textContent = "已生成可选的外部回退链接，仅在需要交给 Obsidian 时使用。";
  setButtonLabel(elements.generateUriButton, "已生成");
}

async function handleWriteVault(elements: Elements) {
  if (!ensureContentReady(elements)) {
    elements.vaultHint.textContent = "当前没有可同步的卡片内容。";
    return;
  }

  if (!desktopBridge?.vault) {
    await triggerUriFallback(elements, "当前环境不支持 Obsidian 外部存储写入。");
    return;
  }

  if (!currentVaultPath) {
    await triggerUriFallback(elements, "尚未选择 Obsidian 外部存储目录。");
    return;
  }

  const structuredData = currentStructuredData;
  const markdown = currentMarkdown;
  if (!structuredData || !markdown) {
    elements.vaultHint.textContent = "当前没有可同步的卡片内容。";
    return;
  }

  setButtonLabel(elements.writeVaultButton, "同步中...");

  try {
    const result = await desktopBridge.vault.writeMarkdown({
      vaultPath: currentVaultPath,
      notePath: structuredData.notePath,
      content: markdown,
      strategy: "overwrite",
    });

    elements.vaultHint.textContent = `${result.message} ${result.filePath}`;
    setButtonLabel(elements.writeVaultButton, result.written ? "已同步" : "已跳过");
  } catch (error) {
    await triggerUriFallback(
      elements,
      "同步到 Obsidian 失败，已尝试切换到外部回退链接。",
      String(error instanceof Error ? error.message : error),
    );
  }
}

async function handleOpenUri(elements: Elements) {
  if (!ensureContentReady(elements)) {
    return false;
  }

  currentUri = buildCurrentUri(elements);
  renderOutputs(elements, currentStructuredData, currentMarkdown, currentUri);

  if (!desktopBridge?.obsidian) {
    elements.vaultHint.textContent = "当前环境不支持直接唤起 Obsidian，请先复制外部回退链接。";
    setButtonLabel(elements.openUriButton, "仅生成链接");
    return false;
  }

  try {
    const result = await desktopBridge.obsidian.openUri(currentUri);
    elements.vaultHint.textContent = result.message;
    setButtonLabel(elements.openUriButton, "已打开");
    return true;
  } catch (error) {
    elements.vaultHint.textContent =
      "Obsidian 打开失败，请手动复制外部回退链接。错误：" +
      String(error instanceof Error ? error.message : error);
    setButtonLabel(elements.openUriButton, "打开失败");
    return false;
  }
}

function collectForm(elements: Elements): FormState {
  return {
    rawInput: elements.rawInput.value.trim(),
    sourceType: elements.sourceType.value as SourceType,
    mode: elements.mode.value as RunMode,
    vaultName: elements.vaultName.value.trim(),
    deckTag: elements.deckTag.value.trim(),
    folder: elements.folder.value.trim(),
    context: elements.context.value.trim(),
    baseUrl: elements.baseUrl.value.trim(),
    model: elements.model.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    systemPrompt: elements.systemPrompt.value.trim(),
  };
}

function renderValidationError(elements: Elements, message: string) {
  currentStructuredData = null;
  currentMarkdown = "";
  currentUri = "";
  isGenerating = false;
  renderOutputs(elements, null, "", "");
  elements.generationHint.textContent = message;
  setButtonDisabled(elements.runButton, false);
  setButtonDisabled(elements.fallbackButton, false);
}

function updateWithStructuredData(elements: Elements, structuredData: StructuredData) {
  const document = buildMarkdownDocument(structuredData, collectForm(elements));
  currentMarkdown = document.content;
  currentStructuredData = {
    ...structuredData,
    title: document.title,
    notePath: document.notePath,
    keywords: document.keywords,
  };
  currentUri = buildObsidianUri(elements.vaultName.value, document.notePath, document.content);
  persistHistoryEntry(buildHistoryEntry(elements));
  renderHistory(elements);
  renderOutputs(elements, currentStructuredData, currentMarkdown, currentUri);
  endGeneration(elements, "当前卡片已生成完成，你可以继续查看预览或同步到外部存储。");
}

function buildHistoryEntry(elements: Elements): HistoryEntry {
  if (!currentStructuredData) {
    throw new Error("Cannot build history entry without current structured data.");
  }

  const form = collectForm(elements);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    title: currentStructuredData.title,
    sourceType: currentStructuredData.sourceType,
    mode: form.mode,
    rawInput: form.rawInput,
    context: form.context,
    folder: form.folder,
    deckTag: form.deckTag,
    vaultName: form.vaultName,
    structuredData: currentStructuredData,
    markdown: currentMarkdown,
    uri: currentUri,
  };
}

function renderOutputs(
  elements: Elements,
  jsonData: StructuredData | null,
  markdown: string,
  uri: string,
) {
  if (isGenerating) {
    elements.previewTitle.textContent = "正在生成";
    elements.previewMeta.textContent = "旧预览已清空，等待本次生成完成。";
    elements.markdownOutput.textContent = "正在生成卡片内容…";
    if (elements.jsonOutput) {
      elements.jsonOutput.textContent = "正在生成结构化结果…";
    }
    elements.uriOutput.textContent = "将在生成完成后再准备外部回退链接…";
    elements.uriHint.textContent = "当前还没有生成外部回退链接。";
    return;
  }

  if (jsonData) {
    elements.previewTitle.textContent = jsonData.title || "卡片预览";
    elements.previewMeta.textContent = `${sourceTypeLabel(jsonData.sourceType)} · ${jsonData.notePath}`;
  } else {
    elements.previewTitle.textContent = "卡片预览";
    elements.previewMeta.textContent = "生成后这里会展示当前卡片内容。";
  }

  elements.markdownOutput.textContent = markdown || "等待生成卡片内容…";
  if (elements.jsonOutput) {
    elements.jsonOutput.textContent = jsonData
      ? JSON.stringify(jsonData, null, 2)
      : "等待生成结构化结果…";
  }
  elements.uriOutput.textContent = uri || "等待生成外部回退链接…";
  elements.uriHint.textContent = describeUriState(uri);
}

function ensureContentReady(elements: Elements) {
  if (currentStructuredData && currentMarkdown) {
    return true;
  }

  const form = collectForm(elements);
  if (!form.rawInput) {
    renderValidationError(elements, "请先输入知识内容。");
    return false;
  }

  updateWithStructuredData(elements, buildFallbackStructuredData(form));
  return Boolean(currentStructuredData && currentMarkdown);
}

function buildCurrentUri(elements: Elements) {
  if (!currentStructuredData || !currentMarkdown) {
    throw new Error("当前缺少可用的外部回退链接内容。");
  }

  return buildObsidianUri(elements.vaultName.value, currentStructuredData.notePath, currentMarkdown);
}

async function triggerUriFallback(elements: Elements, reason: string, originalError?: string) {
  const opened = await handleOpenUri(elements);
  const details = originalError ? ` 原始错误：${originalError}` : "";

  if (opened) {
    elements.vaultHint.textContent = `${reason} 已成功切换到外部回退链接。${details}`;
    setButtonLabel(elements.writeVaultButton, "已回退");
    return;
  }

  elements.vaultHint.textContent = `${reason} 已生成外部回退链接，可手动继续。${details}`;
  setButtonLabel(elements.writeVaultButton, "同步失败");
}

function describeUriState(uri: string) {
  if (!uri) {
    return "当前还没有生成外部回退链接。";
  }

  if (uri.length > 1800) {
    return `当前链接长度约 ${uri.length} 个字符，内容较长时建议优先使用 Obsidian 外部存储同步。`;
  }

  return `当前链接长度约 ${uri.length} 个字符，仅在需要交给 Obsidian 创建时使用。`;
}

function sourceTypeLabel(sourceType: SourceType) {
  const labels: Record<SourceType, string> = {
    word: "单词",
    phrase: "词组",
    sentence: "句子",
    custom: "自定义知识",
  };

  return labels[sourceType];
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setButtonLabel(button: HTMLButtonElement, label: string) {
  const original = button.dataset.originalLabel || button.textContent || "";
  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = original;
  }

  button.textContent = label;
  const previousTimer = buttonTimers.get(button);
  if (previousTimer) {
    window.clearTimeout(previousTimer);
  }

  const timer = window.setTimeout(() => {
    button.textContent = button.dataset.originalLabel || original;
  }, 1600);

  buttonTimers.set(button, timer);
}

function extractVaultName(vaultPath: string) {
  const normalized = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || "My Knowledge Vault";
}
