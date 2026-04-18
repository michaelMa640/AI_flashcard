import "./style.css";
import { DEFAULT_SYSTEM_PROMPT } from "../shared/ai-prompt.js";
import type { DesktopBridgeApi } from "../shared/desktop-bridge.js";
import {
  buildFallbackStructuredData,
  buildObsidianUri,
  folderFromType,
} from "../shared/flashcard-utils.js";
import { buildMarkdownDocument } from "../shared/markdown-generator.js";
import type { FormState, PersistedSettings, RunMode, SourceType, StructuredData } from "../shared/flashcard-types.js";
import type { VaultConfig } from "../shared/vault-types.js";
import { requestStructuredData } from "./services/ai-client.js";

type Elements = {
  rawInput: HTMLTextAreaElement;
  sourceType: HTMLSelectElement;
  mode: HTMLSelectElement;
  vaultName: HTMLInputElement;
  deckTag: HTMLInputElement;
  folder: HTMLInputElement;
  context: HTMLTextAreaElement;
  baseUrl: HTMLInputElement;
  model: HTMLInputElement;
  apiKey: HTMLInputElement;
  systemPrompt: HTMLTextAreaElement;
  vaultPath: HTMLInputElement;
  runButton: HTMLButtonElement;
  fallbackButton: HTMLButtonElement;
  saveSettingsButton: HTMLButtonElement;
  resetPromptButton: HTMLButtonElement;
  chooseVaultButton: HTMLButtonElement;
  writeVaultButton: HTMLButtonElement;
  jsonOutput: HTMLPreElement;
  markdownOutput: HTMLPreElement;
  uriOutput: HTMLPreElement;
  copyMarkdownButton: HTMLButtonElement;
  generateUriButton: HTMLButtonElement;
  persistHint: HTMLParagraphElement;
  vaultHint: HTMLParagraphElement;
};

declare global {
  interface Window {
    desktopBridge?: DesktopBridgeApi;
  }
}

const STORAGE_KEY = "flashcard-obsidian-desktop-settings";
const buttonTimers = new WeakMap<HTMLButtonElement, number>();
const desktopBridge = window.desktopBridge;
const appInfo = desktopBridge?.appInfo ?? {
  name: "AI Flashcard",
  phase: "V1 Step 5",
  targetPlatforms: ["macOS", "Windows"],
  stack: ["Electron", "TypeScript", "Vite"],
};

let currentStructuredData: StructuredData | null = null;
let currentMarkdown = "";
let currentVaultPath = "";

bootstrap();

function bootstrap() {
  const root = document.querySelector<HTMLDivElement>("#app");

  if (!root) {
    throw new Error("Renderer root #app was not found.");
  }

  root.innerHTML = renderAppShell();
  const elements = collectElements();
  const saved = loadSettings();

  hydrateDefaults(elements, saved);
  renderOutputs(elements, null, "", "");
  bindEvents(elements);
  void hydrateVaultState(elements);
}

function renderAppShell() {
  return `
    <div class="ambient ambient-left"></div>
    <div class="ambient ambient-right"></div>

    <main class="app-shell">
      <section class="hero">
        <p class="eyebrow">${appInfo.phase} · Vault Adapter</p>
        <h1>${appInfo.name}</h1>
        <p class="hero-copy">
          第 5 步已经接入桌面端 VaultAdapter：现在可以选择 Obsidian vault 目录、保存路径，
          并将当前生成的 Markdown 直接写入 vault。写入失败时仍保留 URI 保底链路。
        </p>

        <div class="hero-badges">
          ${appInfo.targetPlatforms.map((item) => `<span>${item}</span>`).join("")}
          ${appInfo.stack.map((item) => `<span>${item}</span>`).join("")}
          <span>Vault Adapter</span>
        </div>
      </section>

      <section class="warning-card">
        <strong>当前阶段</strong>
        <p>
          当前重点已经进入“桌面端落库”。AI 结构化结果与 Markdown 生成器会直接驱动 vault 写入，
          未来只需要继续完善路径策略和联调体验。
        </p>
      </section>

      <section class="grid">
        <section class="panel input-panel">
          <div class="panel-head">
            <h2>录入</h2>
            <p>决定这条内容是直接入库，还是先让 AI 结构化解释。</p>
          </div>

          <label class="field">
            <span>原始内容</span>
            <textarea
              id="rawInput"
              rows="7"
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
              <span>处理方式</span>
              <select id="mode">
                <option value="ai" selected>先 AI 解释</option>
                <option value="direct">直接加入知识库</option>
              </select>
            </label>
          </div>

          <div class="field-row">
            <label class="field">
              <span>Vault 名称</span>
              <input id="vaultName" type="text" placeholder="My English Vault" />
            </label>

            <label class="field">
              <span>Deck 标签</span>
              <input id="deckTag" type="text" placeholder="english/phrases" />
            </label>
          </div>

          <label class="field">
            <span>默认目录</span>
            <input id="folder" type="text" placeholder="English Cards/Phrases" />
          </label>

          <label class="field">
            <span>补充上下文</span>
            <textarea
              id="context"
              rows="4"
              placeholder="例如：这是我读文章时看到的表达，我想知道语气、含义和使用场景。"
            ></textarea>
          </label>

          <div class="action-row">
            <button id="runButton" class="primary">AI 解释并结构化</button>
            <button id="fallbackButton" class="ghost">直接生成最小卡片</button>
          </div>
        </section>

        <section class="panel settings-panel">
          <div class="panel-head">
            <h2>设置</h2>
            <p>支持 OpenAI 兼容接口，也支持手动调整 Prompt 模板与桌面端 vault 目录。</p>
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

          <label class="field">
            <span>Vault 目录</span>
            <input id="vaultPath" type="text" placeholder="尚未选择 Vault 目录" readonly />
          </label>

          <p id="persistHint" class="persist-hint">
            普通设置当前仍保存在桌面应用本地存储中。
          </p>
          <p id="vaultHint" class="persist-hint">
            当前尚未选择 Vault 目录。
          </p>

          <div class="action-row">
            <button id="saveSettingsButton" class="secondary">保存设置</button>
            <button id="resetPromptButton" class="ghost">恢复默认 Prompt</button>
            <button id="chooseVaultButton" class="secondary">选择 Vault 目录</button>
            <button id="writeVaultButton" class="primary">写入到 Vault</button>
          </div>
        </section>
      </section>

      <section class="grid output-grid">
        <section class="panel">
          <div class="panel-head">
            <h2>结构化结果</h2>
            <p>AI 返回后先落到统一数据结构，再转 Markdown。</p>
          </div>
          <pre id="jsonOutput" class="code-block"></pre>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Markdown 预览</h2>
            <p>这部分就是将来写入 Obsidian 的笔记内容。</p>
          </div>
          <pre id="markdownOutput" class="code-block"></pre>
          <div class="action-row">
            <button id="copyMarkdownButton" class="secondary">复制 Markdown</button>
            <button id="generateUriButton" class="ghost">生成 Obsidian URI</button>
          </div>
        </section>
      </section>

      <section class="panel final-panel">
        <div class="panel-head">
          <h2>Obsidian URI</h2>
          <p>在支持的平台上，这里就是后续“同步到 Obsidian”按钮的保底链路。</p>
        </div>
        <pre id="uriOutput" class="code-block small"></pre>
      </section>
    </main>
  `;
}

function collectElements(): Elements {
  return {
    rawInput: byId<HTMLTextAreaElement>("rawInput"),
    sourceType: byId<HTMLSelectElement>("sourceType"),
    mode: byId<HTMLSelectElement>("mode"),
    vaultName: byId<HTMLInputElement>("vaultName"),
    deckTag: byId<HTMLInputElement>("deckTag"),
    folder: byId<HTMLInputElement>("folder"),
    context: byId<HTMLTextAreaElement>("context"),
    baseUrl: byId<HTMLInputElement>("baseUrl"),
    model: byId<HTMLInputElement>("model"),
    apiKey: byId<HTMLInputElement>("apiKey"),
    systemPrompt: byId<HTMLTextAreaElement>("systemPrompt"),
    vaultPath: byId<HTMLInputElement>("vaultPath"),
    runButton: byId<HTMLButtonElement>("runButton"),
    fallbackButton: byId<HTMLButtonElement>("fallbackButton"),
    saveSettingsButton: byId<HTMLButtonElement>("saveSettingsButton"),
    resetPromptButton: byId<HTMLButtonElement>("resetPromptButton"),
    chooseVaultButton: byId<HTMLButtonElement>("chooseVaultButton"),
    writeVaultButton: byId<HTMLButtonElement>("writeVaultButton"),
    jsonOutput: byId<HTMLPreElement>("jsonOutput"),
    markdownOutput: byId<HTMLPreElement>("markdownOutput"),
    uriOutput: byId<HTMLPreElement>("uriOutput"),
    copyMarkdownButton: byId<HTMLButtonElement>("copyMarkdownButton"),
    generateUriButton: byId<HTMLButtonElement>("generateUriButton"),
    persistHint: byId<HTMLParagraphElement>("persistHint"),
    vaultHint: byId<HTMLParagraphElement>("vaultHint"),
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
  elements.vaultName.value = saved.vaultName || "My English Vault";
  elements.deckTag.value = saved.deckTag || "english/phrases";
  elements.folder.value = saved.folder || "English Cards/Phrases";
}

function bindEvents(elements: Elements) {
  elements.saveSettingsButton.addEventListener("click", () => handleSaveSettings(elements));
  elements.resetPromptButton.addEventListener("click", () => handleResetPrompt(elements));
  elements.runButton.addEventListener("click", () => {
    void handleRunAI(elements);
  });
  elements.fallbackButton.addEventListener("click", () => handleFallbackGenerate(elements));
  elements.copyMarkdownButton.addEventListener("click", () => {
    void handleCopyMarkdown(elements);
  });
  elements.generateUriButton.addEventListener("click", () => handleGenerateUri(elements));
  elements.chooseVaultButton.addEventListener("click", () => {
    void handleChooseVault(elements);
  });
  elements.writeVaultButton.addEventListener("click", () => {
    void handleWriteVault(elements);
  });
  elements.sourceType.addEventListener("change", () => syncSuggestedFolder(elements));
}

async function hydrateVaultState(elements: Elements) {
  if (!desktopBridge?.vault) {
    elements.vaultHint.textContent = "当前环境不支持桌面端 Vault 访问。";
    return;
  }

  const config = await desktopBridge.vault.loadConfig();
  applyVaultConfig(elements, config);
}

function applyVaultConfig(elements: Elements, config: VaultConfig) {
  currentVaultPath = config.vaultPath ?? "";
  elements.vaultPath.value = currentVaultPath;

  if (currentVaultPath) {
    elements.vaultHint.textContent = `已选择 Vault 目录：${currentVaultPath}`;
    if (!elements.vaultName.value.trim()) {
      elements.vaultName.value = extractVaultName(currentVaultPath);
    }
    return;
  }

  elements.vaultHint.textContent = "当前尚未选择 Vault 目录。";
}

function loadSettings(): PersistedSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function handleSaveSettings(elements: Elements) {
  saveSettings(elements);
  elements.persistHint.textContent = "设置已保存到当前桌面应用本地存储。";
  setButtonLabel(elements.saveSettingsButton, "已保存");
}

function handleResetPrompt(elements: Elements) {
  elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
  saveSettings(elements);
  elements.persistHint.textContent = "系统 Prompt 已恢复默认并同步保存。";
}

async function handleChooseVault(elements: Elements) {
  if (!desktopBridge?.vault) {
    elements.vaultHint.textContent = "当前环境不支持选择 Vault 目录。";
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
    word: "English Cards/Words",
    phrase: "English Cards/Phrases",
    sentence: "English Cards/Sentences",
    custom: "Knowledge Cards",
  };

  if (!elements.folder.value.trim()) {
    elements.folder.value = suggestions[type];
    return;
  }

  const current = elements.folder.value.trim();
  const known = Object.values(suggestions);
  if (known.includes(current)) {
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
    updateWithStructuredData(elements, buildFallbackStructuredData(form));
    return;
  }

  setButtonLabel(elements.runButton, "请求中...");

  try {
    const result = await requestStructuredData(form);
    updateWithStructuredData(elements, result);
    setButtonLabel(elements.runButton, "AI 解释并结构化");
  } catch (error) {
    const fallback = buildFallbackStructuredData(form);
    fallback.runtimeNotice =
      "接口调用失败，已降级为本地最小卡片生成。错误信息：" +
      String(error instanceof Error ? error.message : error);
    updateWithStructuredData(elements, fallback);
    setButtonLabel(elements.runButton, "AI 解释并结构化");
  }
}

function handleFallbackGenerate(elements: Elements) {
  saveSettings(elements);
  const form = collectForm(elements);

  if (!form.rawInput) {
    renderValidationError(elements, "请先输入知识内容。");
    return;
  }

  updateWithStructuredData(elements, buildFallbackStructuredData(form));
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

function handleGenerateUri(elements: Elements) {
  if (!currentStructuredData) {
    return;
  }

  const uri = buildObsidianUri(elements.vaultName.value, currentStructuredData.notePath, currentMarkdown);
  elements.uriOutput.textContent = uri;
  setButtonLabel(elements.generateUriButton, "已生成 URI");
}

async function handleWriteVault(elements: Elements) {
  if (!desktopBridge?.vault) {
    elements.vaultHint.textContent = "当前环境不支持桌面端 Vault 写入。";
    return;
  }

  if (!currentVaultPath) {
    elements.vaultHint.textContent = "请先选择 Vault 目录。";
    return;
  }

  if (!currentStructuredData) {
    const form = collectForm(elements);
    if (!form.rawInput) {
      renderValidationError(elements, "请先输入知识内容。");
      return;
    }

    updateWithStructuredData(elements, buildFallbackStructuredData(form));
  }

  if (!currentStructuredData || !currentMarkdown) {
    elements.vaultHint.textContent = "当前没有可写入的 Markdown 内容。";
    return;
  }

  setButtonLabel(elements.writeVaultButton, "写入中...");

  try {
    const result = await desktopBridge.vault.writeMarkdown({
      vaultPath: currentVaultPath,
      notePath: currentStructuredData.notePath,
      content: currentMarkdown,
      strategy: "overwrite",
    });

    elements.vaultHint.textContent = `${result.message} ${result.filePath}`;
    setButtonLabel(elements.writeVaultButton, result.written ? "已写入" : "已跳过");
  } catch (error) {
    elements.vaultHint.textContent =
      "写入 Vault 失败，请改用 URI 保底或检查目录权限。错误：" +
      String(error instanceof Error ? error.message : error);
    setButtonLabel(elements.writeVaultButton, "写入失败");
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
  renderOutputs(
    elements,
    {
      title: "错误",
      sourceType: "custom",
      summaryCn: "",
      explanation: "",
      keywords: [],
      flashcards: [],
      notePath: "",
      runtimeNotice: message,
    },
    "",
    "",
  );
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
  const uri = buildObsidianUri(elements.vaultName.value, document.notePath, document.content);
  renderOutputs(elements, currentStructuredData, currentMarkdown, uri);
}

function renderOutputs(
  elements: Elements,
  jsonData: StructuredData | null,
  markdown: string,
  uri: string,
) {
  elements.jsonOutput.textContent = jsonData
    ? JSON.stringify(jsonData, null, 2)
    : "等待生成结构化结果…";
  elements.markdownOutput.textContent = markdown || "等待生成 Markdown…";
  elements.uriOutput.textContent = uri || "等待生成 Obsidian URI…";
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
  return segments.at(-1) || "My English Vault";
}
