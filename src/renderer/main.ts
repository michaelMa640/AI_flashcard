import "./style.css";
import { DEFAULT_SYSTEM_PROMPT } from "../shared/ai-prompt.js";
import type { DesktopBridgeApi } from "../shared/desktop-bridge.js";
import { buildFallbackStructuredData, buildObsidianUri, folderFromType } from "../shared/flashcard-utils.js";
import {
  createDefaultLocalAppSettings,
  defaultFolderNameForSourceType,
} from "../shared/local-library-defaults.js";
import type {
  LocalAppSettings,
  LocalCardRecord,
  LocalLibrarySnapshot,
  ReviewRating,
} from "../shared/local-library-types.js";
import { buildMarkdownDocument } from "../shared/markdown-generator.js";
import type { FormState, RunMode, SourceType, StructuredData } from "../shared/flashcard-types.js";
import type { VaultConfig } from "../shared/vault-types.js";
import { requestStructuredData } from "./services/ai-client.js";

type AppPage = "capture" | "review" | "settings";

type StudyQueueEntry = {
  card: LocalCardRecord;
  queueType: "new" | "review";
};

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

type Elements = {
  navCaptureButton: HTMLButtonElement;
  navReviewButton: HTMLButtonElement;
  navSettingsButton: HTMLButtonElement;
  capturePage: HTMLElement;
  reviewPage: HTMLElement;
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
  saveLocalButton: HTMLButtonElement;
  copyMarkdownButton: HTMLButtonElement;
  historyList: HTMLDivElement;
  historyEmpty: HTMLParagraphElement;
  reviewCountMetric: HTMLParagraphElement;
  newCountMetric: HTMLParagraphElement;
  progressMetric: HTMLParagraphElement;
  reviewQueueList: HTMLDivElement;
  reviewQueueEmpty: HTMLParagraphElement;
  studyStageBadge: HTMLSpanElement;
  studyCardTitle: HTMLHeadingElement;
  studyCardMeta: HTMLParagraphElement;
  studyCardFront: HTMLDivElement;
  studyAnswerPanel: HTMLDivElement;
  studyCardBack: HTMLParagraphElement;
  studySummary: HTMLParagraphElement;
  studyExplanation: HTMLParagraphElement;
  studyHintCard: HTMLDivElement;
  studyHintText: HTMLParagraphElement;
  revealAnswerButton: HTMLButtonElement;
  forgotButton: HTMLButtonElement;
  fuzzyButton: HTMLButtonElement;
  rememberedButton: HTMLButtonElement;
  studyStatusHint: HTMLParagraphElement;
  baseUrl: HTMLInputElement;
  model: HTMLInputElement;
  apiKey: HTMLInputElement;
  systemPrompt: HTMLTextAreaElement;
  dailyNewLimit: HTMLInputElement;
  dailyReviewLimit: HTMLInputElement;
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
  localLibraryHint: HTMLParagraphElement;
  folderSummary: HTMLParagraphElement;
  templateSummary: HTMLParagraphElement;
  jsonPanel: HTMLElement | null;
  jsonOutput: HTMLPreElement | null;
};

declare global {
  interface Window {
    desktopBridge?: DesktopBridgeApi;
  }
}

const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";
const buttonTimers = new WeakMap<HTMLButtonElement, number>();
const desktopBridge = window.desktopBridge;
const appInfo = desktopBridge?.appInfo ?? {
  name: "AI Flashcard",
  phase: "V2 Step 3",
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
let currentCardId = "";
let currentVaultPath = "";
let currentPage: AppPage = "capture";
let localLibrarySnapshot: LocalLibrarySnapshot | null = null;
let historyCards: LocalCardRecord[] = [];
let studyQueueEntries: StudyQueueEntry[] = [];
let currentStudyIndex = 0;
let studyAnswerVisible = false;
let studyHintVisible = false;
let isGenerating = false;

bootstrap();

function bootstrap() {
  const root = document.querySelector<HTMLDivElement>("#app");

  if (!root) {
    throw new Error("Renderer root #app was not found.");
  }

  root.innerHTML = renderAppShell();
  const elements = collectElements();
  hydrateDefaults(elements);
  renderOutputs(elements, null, "", "");
  renderHistory(elements);
  rebuildStudyQueue(elements);
  bindEvents(elements);
  switchPage(elements, "capture");
  void hydrateLocalLibrary(elements);
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
        <button id="navReviewButton" class="nav-chip" type="button">学习与复习</button>
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
              <button id="saveLocalButton" class="primary" type="button">保存到本地知识库</button>
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

      <section id="reviewPage" class="page-shell page-hidden">
        <section class="page-grid">
          <section class="panel">
            <div class="panel-head">
              <h2>今日任务</h2>
              <p>这里集中展示今天应该先复习哪些卡片，以及还能新学多少张。</p>
            </div>

            <div class="review-metrics">
              <article class="metric-card">
                <span>待复习</span>
                <p id="reviewCountMetric">0</p>
              </article>
              <article class="metric-card">
                <span>待新学</span>
                <p id="newCountMetric">0</p>
              </article>
              <article class="metric-card">
                <span>当前进度</span>
                <p id="progressMetric">0 / 0</p>
              </article>
            </div>

            <div class="panel-head compact">
              <h3>今日队列</h3>
              <p>优先展示到期复习卡，再补足今日新学卡片。</p>
            </div>

            <p id="reviewQueueEmpty" class="empty-state">当前还没有可学习的卡片，先去录入并保存几张卡片吧。</p>
            <div id="reviewQueueList" class="history-list"></div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <span id="studyStageBadge" class="stage-badge">待开始</span>
              <h2 id="studyCardTitle">学习与复习</h2>
              <p id="studyCardMeta">加载本地知识库后，这里会展示今日第一张卡片。</p>
            </div>

            <div id="studyCardFront" class="study-surface">
              暂无卡片，先在录入页保存几张卡片到本地知识库。
            </div>

            <div id="studyAnswerPanel" class="study-answer-panel" hidden>
              <p id="studyCardBack" class="study-answer-line"></p>
              <p id="studySummary" class="study-detail-line"></p>
              <p id="studyExplanation" class="study-detail-line"></p>
            </div>

            <div id="studyHintCard" class="debug-card subtle" hidden>
              <div class="panel-head compact">
                <h3>回忆提示</h3>
                <p>你选择了“模糊”，先看一眼提示，再决定是否继续记为模糊。</p>
              </div>
              <p id="studyHintText" class="persist-hint"></p>
            </div>

            <div class="action-row">
              <button id="revealAnswerButton" class="secondary" type="button">显示答案</button>
              <button id="forgotButton" class="ghost" type="button">不记得</button>
              <button id="fuzzyButton" class="ghost" type="button">模糊</button>
              <button id="rememberedButton" class="primary" type="button">记得</button>
            </div>

            <p id="studyStatusHint" class="status-hint">完成加载后，这里会提示当前学习动作和下一步反馈。</p>
          </section>
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

            <div class="field-row">
              <label class="field">
                <span>每日新学数量</span>
                <input id="dailyNewLimit" type="number" min="1" step="1" placeholder="10" />
              </label>

              <label class="field">
                <span>每日复习数量</span>
                <input id="dailyReviewLimit" type="number" min="1" step="1" placeholder="30" />
              </label>
            </div>

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
              <p id="localLibraryHint" class="channel-meta">启动后会在这里显示本地知识库统计信息。</p>
              <p id="folderSummary" class="channel-meta">分类加载中…</p>
              <p id="templateSummary" class="channel-meta">模板加载中…</p>
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
    navReviewButton: byId<HTMLButtonElement>("navReviewButton"),
    navSettingsButton: byId<HTMLButtonElement>("navSettingsButton"),
    capturePage: byId<HTMLElement>("capturePage"),
    reviewPage: byId<HTMLElement>("reviewPage"),
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
    saveLocalButton: byId<HTMLButtonElement>("saveLocalButton"),
    copyMarkdownButton: byId<HTMLButtonElement>("copyMarkdownButton"),
    historyList: byId<HTMLDivElement>("historyList"),
    historyEmpty: byId<HTMLParagraphElement>("historyEmpty"),
    reviewCountMetric: byId<HTMLParagraphElement>("reviewCountMetric"),
    newCountMetric: byId<HTMLParagraphElement>("newCountMetric"),
    progressMetric: byId<HTMLParagraphElement>("progressMetric"),
    reviewQueueList: byId<HTMLDivElement>("reviewQueueList"),
    reviewQueueEmpty: byId<HTMLParagraphElement>("reviewQueueEmpty"),
    studyStageBadge: byId<HTMLSpanElement>("studyStageBadge"),
    studyCardTitle: byId<HTMLHeadingElement>("studyCardTitle"),
    studyCardMeta: byId<HTMLParagraphElement>("studyCardMeta"),
    studyCardFront: byId<HTMLDivElement>("studyCardFront"),
    studyAnswerPanel: byId<HTMLDivElement>("studyAnswerPanel"),
    studyCardBack: byId<HTMLParagraphElement>("studyCardBack"),
    studySummary: byId<HTMLParagraphElement>("studySummary"),
    studyExplanation: byId<HTMLParagraphElement>("studyExplanation"),
    studyHintCard: byId<HTMLDivElement>("studyHintCard"),
    studyHintText: byId<HTMLParagraphElement>("studyHintText"),
    revealAnswerButton: byId<HTMLButtonElement>("revealAnswerButton"),
    forgotButton: byId<HTMLButtonElement>("forgotButton"),
    fuzzyButton: byId<HTMLButtonElement>("fuzzyButton"),
    rememberedButton: byId<HTMLButtonElement>("rememberedButton"),
    studyStatusHint: byId<HTMLParagraphElement>("studyStatusHint"),
    baseUrl: byId<HTMLInputElement>("baseUrl"),
    model: byId<HTMLInputElement>("model"),
    apiKey: byId<HTMLInputElement>("apiKey"),
    systemPrompt: byId<HTMLTextAreaElement>("systemPrompt"),
    dailyNewLimit: byId<HTMLInputElement>("dailyNewLimit"),
    dailyReviewLimit: byId<HTMLInputElement>("dailyReviewLimit"),
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
    localLibraryHint: byId<HTMLParagraphElement>("localLibraryHint"),
    folderSummary: byId<HTMLParagraphElement>("folderSummary"),
    templateSummary: byId<HTMLParagraphElement>("templateSummary"),
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

function hydrateDefaults(elements: Elements) {
  applySettingsToFields(elements, createDefaultLocalAppSettings(), true);
  elements.dataStrategyHint.textContent = "当前默认策略：本地优先。卡片将优先保存到应用本地知识库。";
  elements.localLibraryHint.textContent = "正在连接本地知识库…";
  elements.folderSummary.textContent = "分类加载中…";
  elements.templateSummary.textContent = "模板加载中…";
  elements.saveLocalButton.disabled = true;
  elements.forgotButton.disabled = true;
  elements.fuzzyButton.disabled = true;
  elements.rememberedButton.disabled = true;
}

function bindEvents(elements: Elements) {
  elements.navCaptureButton.addEventListener("click", () => switchPage(elements, "capture"));
  elements.navReviewButton.addEventListener("click", () => switchPage(elements, "review"));
  elements.navSettingsButton.addEventListener("click", () => switchPage(elements, "settings"));
  elements.presetButtons.forEach((button) => {
    button.addEventListener("click", () => handleApplyPreset(elements, button.dataset.demoPreset || ""));
  });
  elements.saveSettingsButton.addEventListener("click", () => {
    void handleSaveSettings(elements);
  });
  elements.resetPromptButton.addEventListener("click", () => {
    void handleResetPrompt(elements);
  });
  elements.runButton.addEventListener("click", () => {
    void handleRunAI(elements);
  });
  elements.fallbackButton.addEventListener("click", () => handleFallbackGenerate(elements));
  elements.saveLocalButton.addEventListener("click", () => {
    void handleSaveLocalCard(elements);
  });
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
  elements.revealAnswerButton.addEventListener("click", () => handleRevealAnswer(elements));
  elements.forgotButton.addEventListener("click", () => {
    void handleStudyFeedback(elements, "forgot");
  });
  elements.fuzzyButton.addEventListener("click", () => {
    void handleStudyFeedback(elements, "fuzzy");
  });
  elements.rememberedButton.addEventListener("click", () => {
    void handleStudyFeedback(elements, "remembered");
  });
  elements.sourceType.addEventListener("change", () => syncSuggestedFolder(elements));
}

async function hydrateLocalLibrary(elements: Elements) {
  if (!desktopBridge?.localLibrary) {
    elements.dataStrategyHint.textContent = "当前环境未连接桌面本地知识库，暂时只支持本次会话预览。";
    elements.localLibraryHint.textContent = "未检测到本地知识库存储能力。";
    elements.folderSummary.textContent = "分类信息暂不可用。";
    elements.templateSummary.textContent = "模板信息暂不可用。";
    elements.saveLocalButton.disabled = true;
    return;
  }

  const snapshot = await desktopBridge.localLibrary.loadSnapshot();
  localLibrarySnapshot = snapshot;
  historyCards = snapshot.cards;
  applySettingsToFields(elements, snapshot.settings, true);
  renderLocalLibrarySummary(elements, snapshot);
  renderHistory(elements);
  rebuildStudyQueue(elements);
  elements.saveLocalButton.disabled = false;
}

function switchPage(elements: Elements, page: AppPage) {
  currentPage = page;
  const captureActive = page === "capture";
  const reviewActive = page === "review";
  elements.capturePage.classList.toggle("page-hidden", !captureActive);
  elements.reviewPage.classList.toggle("page-hidden", !reviewActive);
  elements.settingsPage.classList.toggle("page-hidden", captureActive || reviewActive);
  elements.navCaptureButton.classList.toggle("nav-chip-active", captureActive);
  elements.navReviewButton.classList.toggle("nav-chip-active", reviewActive);
  elements.navSettingsButton.classList.toggle("nav-chip-active", page === "settings");
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

function applySettingsToFields(elements: Elements, settings: LocalAppSettings, forceFormFields: boolean) {
  elements.baseUrl.value = settings.baseUrl || "https://api.openai.com/v1";
  elements.model.value = settings.model || "gpt-4.1-mini";
  elements.apiKey.value = settings.apiKey || "";
  elements.systemPrompt.value = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  elements.dailyNewLimit.value = String(settings.dailyNewLimit);
  elements.dailyReviewLimit.value = String(settings.dailyReviewLimit);

  if (forceFormFields || !elements.vaultName.value.trim()) {
    elements.vaultName.value = settings.vaultName || "My Knowledge Vault";
  }

  if (forceFormFields || !elements.deckTag.value.trim()) {
    elements.deckTag.value = settings.deckTag || "english/phrases";
  }

  if (forceFormFields || !elements.folder.value.trim()) {
    elements.folder.value = settings.folder || "英语";
  }
}

function buildSettingsPayload(elements: Elements): Partial<LocalAppSettings> {
  return {
    baseUrl: elements.baseUrl.value.trim(),
    model: elements.model.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    systemPrompt: elements.systemPrompt.value,
    vaultName: elements.vaultName.value.trim(),
    deckTag: elements.deckTag.value.trim(),
    folder: elements.folder.value.trim(),
    dailyNewLimit: normalizeInputInt(elements.dailyNewLimit.value, 10),
    dailyReviewLimit: normalizeInputInt(elements.dailyReviewLimit.value, 30),
  };
}

function renderLocalLibrarySummary(elements: Elements, snapshot: LocalLibrarySnapshot) {
  elements.dataStrategyHint.textContent =
    "当前默认策略：本地优先。录入、设置和知识卡片都会先保存到应用本地知识库。";
  elements.localLibraryHint.textContent =
    `本地知识库当前共有 ${snapshot.stats.totalCards} 张卡片，今日到期 ${snapshot.stats.dueTodayCount} 张。`;
  elements.folderSummary.textContent =
    `当前已准备 ${snapshot.stats.totalFolders} 个分类：${snapshot.folders.map((item) => item.name).join("、")}`;
  elements.templateSummary.textContent =
    `当前已准备 ${snapshot.stats.totalTemplates} 个模板：${snapshot.templates.map((item) => item.name).join("、")}`;
}

function rebuildStudyQueue(elements: Elements) {
  studyQueueEntries = buildStudyQueue(localLibrarySnapshot);

  if (studyQueueEntries.length === 0) {
    currentStudyIndex = 0;
    studyAnswerVisible = false;
    studyHintVisible = false;
    renderStudyQueueList(elements);
    renderStudyCard(elements);
    return;
  }

  currentStudyIndex = Math.min(currentStudyIndex, studyQueueEntries.length - 1);
  renderStudyQueueList(elements);
  renderStudyCard(elements);
}

function buildStudyQueue(snapshot: LocalLibrarySnapshot | null): StudyQueueEntry[] {
  if (!snapshot) {
    return [];
  }

  const now = Date.now();
  const dueCards: StudyQueueEntry[] = snapshot.cards
    .filter((card) => card.reviewState !== "new" && new Date(card.reviewDueAt).getTime() <= now)
    .sort((left, right) => left.reviewDueAt.localeCompare(right.reviewDueAt))
    .slice(0, snapshot.settings.dailyReviewLimit)
    .map((card) => ({ card, queueType: "review" as const }));

  const newCards: StudyQueueEntry[] = snapshot.cards
    .filter((card) => card.reviewState === "new")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, snapshot.settings.dailyNewLimit)
    .map((card) => ({ card, queueType: "new" as const }));

  return dueCards.concat(newCards);
}

function renderStudyQueueList(elements: Elements) {
  const reviewCount = studyQueueEntries.filter((item) => item.queueType === "review").length;
  const newCount = studyQueueEntries.filter((item) => item.queueType === "new").length;
  const currentPosition = studyQueueEntries.length === 0 ? 0 : Math.min(currentStudyIndex + 1, studyQueueEntries.length);

  elements.reviewCountMetric.textContent = String(reviewCount);
  elements.newCountMetric.textContent = String(newCount);
  elements.progressMetric.textContent = `${currentPosition} / ${studyQueueEntries.length}`;

  if (studyQueueEntries.length === 0) {
    elements.reviewQueueEmpty.hidden = false;
    elements.reviewQueueList.innerHTML = "";
    return;
  }

  elements.reviewQueueEmpty.hidden = true;
  elements.reviewQueueList.innerHTML = studyQueueEntries
    .map((entry, index) => {
      const queueLabel = entry.queueType === "review" ? "待复习" : "待新学";
      const activeClass = index === currentStudyIndex ? " history-item-active" : "";
      return `
        <button class="history-item${activeClass}" type="button" data-study-card-id="${entry.card.id}">
          <span class="history-item-title">${escapeHtml(entry.card.title)}</span>
          <span class="history-item-meta">${queueLabel} · ${sourceTypeLabel(entry.card.sourceType)} · ${escapeHtml(entry.card.folderName)}</span>
          <span class="history-item-snippet">${escapeHtml(readFrontPrompt(entry.card))}</span>
        </button>
      `;
    })
    .join("");

  elements.reviewQueueList.querySelectorAll<HTMLButtonElement>("[data-study-card-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const cardId = button.dataset.studyCardId || "";
      const nextIndex = studyQueueEntries.findIndex((entry) => entry.card.id === cardId);
      if (nextIndex < 0) {
        return;
      }

      currentStudyIndex = nextIndex;
      studyAnswerVisible = false;
      studyHintVisible = false;
      renderStudyQueueList(elements);
      renderStudyCard(elements);
    });
  });
}

function renderStudyCard(elements: Elements) {
  const currentEntry = studyQueueEntries[currentStudyIndex];

  if (!currentEntry) {
    elements.studyStageBadge.textContent = "今日完成";
    elements.studyCardTitle.textContent = "今天暂时没有待学卡片";
    elements.studyCardMeta.textContent = "你可以先去录入页继续保存卡片，或者明天再回来复习。";
    elements.studyCardFront.textContent = "当前队列为空。";
    elements.studyAnswerPanel.hidden = true;
    elements.studyHintCard.hidden = true;
    elements.studyStatusHint.textContent = "今天的学习与复习队列已经处理完了。";
    elements.revealAnswerButton.disabled = true;
    elements.forgotButton.disabled = true;
    elements.fuzzyButton.disabled = true;
    elements.rememberedButton.disabled = true;
    return;
  }

  const { card, queueType } = currentEntry;
  elements.studyStageBadge.textContent = queueType === "review" ? "待复习" : "待新学";
  elements.studyCardTitle.textContent = card.title;
  elements.studyCardMeta.textContent =
    `${sourceTypeLabel(card.sourceType)} · ${card.folderName} · 第 ${currentStudyIndex + 1} 张 / 共 ${studyQueueEntries.length} 张`;
  elements.studyCardFront.textContent = readFrontPrompt(card);
  elements.studyCardBack.textContent = `答案：${readBackPrompt(card)}`;
  elements.studySummary.textContent = `速记：${card.summary || "待补充"}`;
  elements.studyExplanation.textContent = `解释：${card.explanation || "待补充"}`;
  elements.studyHintText.textContent = card.hint || "当前这张卡片还没有单独提示。";
  elements.studyAnswerPanel.hidden = !studyAnswerVisible;
  elements.studyHintCard.hidden = !studyHintVisible;
  elements.revealAnswerButton.disabled = studyAnswerVisible;
  elements.forgotButton.disabled = !studyAnswerVisible;
  elements.fuzzyButton.disabled = !studyAnswerVisible;
  elements.rememberedButton.disabled = !studyAnswerVisible;
  elements.studyStatusHint.textContent = studyHintVisible
    ? "提示已展开。如果仍然觉得模糊，再点一次“模糊”记录反馈，或改选“不记得 / 记得”。"
    : "先回忆答案，再点“显示答案”，之后用三档反馈更新这张卡片。";
}

function renderHistory(elements: Elements) {
  if (historyCards.length === 0) {
    elements.historyEmpty.hidden = false;
    elements.historyList.innerHTML = "";
    return;
  }

  elements.historyEmpty.hidden = true;
  elements.historyList.innerHTML = historyCards
    .map(
      (card) => `
        <button class="history-item" type="button" data-history-id="${card.id}">
          <span class="history-item-title">${escapeHtml(card.title)}</span>
          <span class="history-item-meta">${renderHistoryMeta(card)}</span>
          <span class="history-item-snippet">${escapeHtml(card.rawInput.slice(0, 120))}</span>
        </button>
      `,
    )
    .join("");

  elements.historyList.querySelectorAll<HTMLButtonElement>("[data-history-id]").forEach((button) => {
    button.addEventListener("click", () => handleHistorySelect(elements, button.dataset.historyId || ""));
  });
}

function renderHistoryMeta(card: LocalCardRecord) {
  const reviewLabel = card.reviewState === "new" ? "待学习" : card.reviewState === "learning" ? "学习中" : "待复习";
  return `${formatRelativeDate(card.updatedAt)} · ${sourceTypeLabel(card.sourceType)} · ${card.folderName} · ${reviewLabel}`;
}

function handleHistorySelect(elements: Elements, entryId: string) {
  const entry = historyCards.find((item) => item.id === entryId);

  if (!entry) {
    return;
  }

  currentCardId = entry.id;
  elements.rawInput.value = entry.rawInput;
  elements.sourceType.value = entry.sourceType;
  elements.mode.value = entry.mode;
  elements.folder.value = entry.folderName;
  elements.deckTag.value = entry.deckTag;
  elements.context.value = entry.context;
  currentStructuredData = entry.structuredData;
  currentMarkdown = entry.markdown;
  currentUri = entry.obsidianUri;
  isGenerating = false;
  renderOutputs(elements, currentStructuredData, currentMarkdown, currentUri);
  elements.generationHint.textContent = "已加载一条本地卡片记录，你可以继续编辑、预览或同步到外部存储。";
  switchPage(elements, "capture");
}

function handleRevealAnswer(elements: Elements) {
  if (!studyQueueEntries[currentStudyIndex]) {
    return;
  }

  studyAnswerVisible = true;
  studyHintVisible = false;
  renderStudyCard(elements);
}

async function handleStudyFeedback(elements: Elements, rating: ReviewRating) {
  const currentEntry = studyQueueEntries[currentStudyIndex];

  if (!currentEntry || !desktopBridge?.localLibrary) {
    return;
  }

  if (!studyAnswerVisible) {
    elements.studyStatusHint.textContent = "请先显示答案，再选择反馈。";
    return;
  }

  if (rating === "fuzzy" && !studyHintVisible) {
    studyHintVisible = true;
    renderStudyCard(elements);
    return;
  }

  const currentCardIdForReview = currentEntry.card.id;
  elements.studyStatusHint.textContent = "正在记录当前反馈并更新下一次复习时间…";
  setStudyButtonsDisabled(elements, true);

  try {
    const result = await desktopBridge.localLibrary.reviewCard({
      cardId: currentCardIdForReview,
      rating,
    });

    localLibrarySnapshot = result.snapshot;
    historyCards = result.snapshot.cards;
    renderLocalLibrarySummary(elements, result.snapshot);
    renderHistory(elements);
    studyAnswerVisible = false;
    studyHintVisible = false;
    rebuildStudyQueue(elements);
    elements.studyStatusHint.textContent = result.message;
  } catch (error) {
    elements.studyStatusHint.textContent =
      "记录复习反馈失败：" + String(error instanceof Error ? error.message : error);
    setStudyButtonsDisabled(elements, false);
  }
}

async function handleSaveSettings(elements: Elements) {
  if (desktopBridge?.localLibrary) {
    const snapshot = await desktopBridge.localLibrary.saveSettings(buildSettingsPayload(elements));
    localLibrarySnapshot = snapshot;
    renderLocalLibrarySummary(elements, snapshot);
    rebuildStudyQueue(elements);
  }

  elements.persistHint.textContent = "设置已保存到当前桌面应用的本地知识库。";
  setButtonLabel(elements.saveSettingsButton, "已保存");
}

async function handleResetPrompt(elements: Elements) {
  elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
  await handleSaveSettings(elements);
  elements.persistHint.textContent = "系统 Prompt 已恢复默认并同步保存。";
}

function handleApplyPreset(elements: Elements, presetId: string) {
  const preset = DEMO_PRESETS.find((item) => item.id === presetId);

  if (!preset) {
    return;
  }

  currentCardId = "";
  elements.rawInput.value = preset.rawInput;
  elements.sourceType.value = preset.sourceType;
  elements.mode.value = preset.mode;
  elements.folder.value = preset.folder;
  elements.deckTag.value = preset.deckTag;
  elements.context.value = preset.context;
  elements.generationHint.textContent = `已载入“${preset.label}”调试样例，可继续生成预览。`;
}

function setStudyButtonsDisabled(elements: Elements, disabled: boolean) {
  elements.revealAnswerButton.disabled = disabled || studyAnswerVisible;
  elements.forgotButton.disabled = disabled || !studyAnswerVisible;
  elements.fuzzyButton.disabled = disabled || !studyAnswerVisible;
  elements.rememberedButton.disabled = disabled || !studyAnswerVisible;
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

  if (!elements.folder.value.trim()) {
    elements.folder.value = defaultFolderNameForSourceType(type);
  }
}

async function handleRunAI(elements: Elements) {
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
  setButtonDisabled(elements.saveLocalButton, true);
}

function endGeneration(elements: Elements, message: string) {
  isGenerating = false;
  elements.generationHint.textContent = message;
  setButtonDisabled(elements.runButton, false);
  setButtonDisabled(elements.fallbackButton, false);
  setButtonDisabled(elements.saveLocalButton, !desktopBridge?.localLibrary);
}

function setButtonDisabled(button: HTMLButtonElement, disabled: boolean) {
  button.disabled = disabled;
}

async function handleSaveLocalCard(elements: Elements) {
  if (!ensureContentReady(elements)) {
    return;
  }

  if (!desktopBridge?.localLibrary || !currentStructuredData || !currentMarkdown) {
    elements.generationHint.textContent = "当前环境不支持本地知识库存储。";
    return;
  }

  setButtonLabel(elements.saveLocalButton, "保存中...");

  try {
    const result = await desktopBridge.localLibrary.saveCard({
      cardId: currentCardId || undefined,
      form: collectForm(elements),
      structuredData: currentStructuredData,
      markdown: currentMarkdown,
      uri: currentUri || buildCurrentUri(elements),
    });

    currentCardId = result.card.id;
    localLibrarySnapshot = result.snapshot;
    historyCards = result.snapshot.cards;
    renderLocalLibrarySummary(elements, result.snapshot);
    renderHistory(elements);
    rebuildStudyQueue(elements);
    elements.generationHint.textContent = result.message;
    elements.persistHint.textContent = "当前卡片已经写入本地知识库，后续可继续扩展为学习与复习数据。";
    setButtonLabel(elements.saveLocalButton, "已保存");
  } catch (error) {
    elements.generationHint.textContent =
      "保存到本地知识库失败：" + String(error instanceof Error ? error.message : error);
    setButtonLabel(elements.saveLocalButton, "保存失败");
  }
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
  setButtonDisabled(elements.saveLocalButton, !desktopBridge?.localLibrary);
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
  renderOutputs(elements, currentStructuredData, currentMarkdown, currentUri);
  endGeneration(elements, "当前卡片已生成完成，你可以保存到本地知识库，或继续同步到外部存储。");
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

function readFrontPrompt(card: LocalCardRecord) {
  return card.flashcards[0]?.front || card.summary || card.title;
}

function readBackPrompt(card: LocalCardRecord) {
  return card.flashcards[0]?.back || card.summary || "待补充答案";
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

function normalizeInputInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
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
