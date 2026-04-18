const DEFAULT_SYSTEM_PROMPT = `你是一个帮助用户把零散知识整理成 Obsidian 知识卡片的助手。

你的任务不是普通解释，而是把输入内容转换为适合复习的结构化结果。

请严格遵守：
1. 输出必须是 JSON，不要输出 Markdown 代码块，不要输出多余说明。
2. 输出字段必须包含：
   - title
   - sourceType
   - summaryCn
   - explanation
   - keywords
   - flashcards
   - notePath
3. flashcards 必须是数组，每个元素都包含：
   - front
   - back
4. front 和 back 要适合做复习卡片，避免过长。
5. explanation 用简洁中文说明。
6. 如果输入是英语句子、短语或生词，请同时给出适合中文用户理解的解释。
7. notePath 应根据 sourceType 生成到以下目录之一：
   - English Cards/Words/
   - English Cards/Phrases/
   - English Cards/Sentences/
   - Knowledge Cards/
8. 文件名要使用短横线 slug 风格，不要包含非法路径字符。`;

const STORAGE_KEY = "flashcard-obsidian-prototype-settings";

const $ = (id) => document.getElementById(id);

const elements = {
  rawInput: $("rawInput"),
  sourceType: $("sourceType"),
  mode: $("mode"),
  vaultName: $("vaultName"),
  deckTag: $("deckTag"),
  folder: $("folder"),
  context: $("context"),
  baseUrl: $("baseUrl"),
  model: $("model"),
  apiKey: $("apiKey"),
  systemPrompt: $("systemPrompt"),
  runButton: $("runButton"),
  fallbackButton: $("fallbackButton"),
  saveSettingsButton: $("saveSettingsButton"),
  resetPromptButton: $("resetPromptButton"),
  jsonOutput: $("jsonOutput"),
  markdownOutput: $("markdownOutput"),
  uriOutput: $("uriOutput"),
  copyMarkdownButton: $("copyMarkdownButton"),
  generateUriButton: $("generateUriButton"),
};

let currentStructuredData = null;
let currentMarkdown = "";

bootstrap();

function bootstrap() {
  const saved = loadSettings();
  elements.baseUrl.value = saved.baseUrl || "https://api.openai.com/v1";
  elements.model.value = saved.model || "gpt-4.1-mini";
  elements.apiKey.value = saved.apiKey || "";
  elements.systemPrompt.value = saved.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  elements.vaultName.value = saved.vaultName || "My English Vault";
  elements.deckTag.value = saved.deckTag || "english/phrases";
  elements.folder.value = saved.folder || "English Cards/Phrases";
  renderOutputs(null, "", "");

  elements.saveSettingsButton.addEventListener("click", handleSaveSettings);
  elements.resetPromptButton.addEventListener("click", handleResetPrompt);
  elements.runButton.addEventListener("click", handleRunAI);
  elements.fallbackButton.addEventListener("click", handleFallbackGenerate);
  elements.copyMarkdownButton.addEventListener("click", handleCopyMarkdown);
  elements.generateUriButton.addEventListener("click", handleGenerateUri);
  elements.sourceType.addEventListener("change", syncSuggestedFolder);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSettings() {
  const payload = {
    baseUrl: elements.baseUrl.value.trim(),
    model: elements.model.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    systemPrompt: elements.systemPrompt.value,
    vaultName: elements.vaultName.value.trim(),
    deckTag: elements.deckTag.value.trim(),
    folder: elements.folder.value.trim(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function handleSaveSettings() {
  saveSettings();
  setButtonLabel(elements.saveSettingsButton, "已保存");
}

function handleResetPrompt() {
  elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
  saveSettings();
}

function syncSuggestedFolder() {
  const type = elements.sourceType.value;
  const suggestions = {
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

async function handleRunAI() {
  saveSettings();

  const form = collectForm();
  if (!form.rawInput) {
    renderOutputs({ error: "请先输入知识内容。" }, "", "");
    return;
  }

  if (form.mode === "direct" || !form.apiKey || !form.baseUrl || !form.model) {
    const fallback = buildFallbackStructuredData(form);
    updateWithStructuredData(fallback);
    return;
  }

  setButtonLabel(elements.runButton, "请求中...");

  try {
    const result = await callCompatibleChatApi(form);
    updateWithStructuredData(result);
    setButtonLabel(elements.runButton, "AI 解释并结构化");
  } catch (error) {
    const fallback = buildFallbackStructuredData(form);
    fallback.runtimeNotice =
      "接口调用失败，已降级为本地最小卡片生成。错误信息：" + String(error.message || error);
    updateWithStructuredData(fallback);
    setButtonLabel(elements.runButton, "AI 解释并结构化");
  }
}

function handleFallbackGenerate() {
  saveSettings();
  const form = collectForm();
  if (!form.rawInput) {
    renderOutputs({ error: "请先输入知识内容。" }, "", "");
    return;
  }

  const fallback = buildFallbackStructuredData(form);
  updateWithStructuredData(fallback);
}

async function handleCopyMarkdown() {
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

function handleGenerateUri() {
  if (!currentStructuredData) {
    return;
  }

  const uri = buildObsidianUri(currentStructuredData, currentMarkdown);
  elements.uriOutput.textContent = uri;
  setButtonLabel(elements.generateUriButton, "已生成 URI");
}

function collectForm() {
  return {
    rawInput: elements.rawInput.value.trim(),
    sourceType: elements.sourceType.value,
    mode: elements.mode.value,
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

async function callCompatibleChatApi(form) {
  const userPrompt = buildUserPrompt(form);
  const url = form.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const payload = {
    model: form.model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: form.systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${form.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message?.content;
  if (!message) {
    throw new Error("返回结果中没有 message.content");
  }

  return normalizeStructuredData(parseModelJson(message), form);
}

function buildUserPrompt(form) {
  return `请将下面内容整理为适合 Obsidian + Spaced Repetition 使用的知识卡片数据。

内容类型：${form.sourceType}
原始内容：${form.rawInput}
补充上下文：${form.context || "无"}
默认目录：${form.folder || "自动判断"}
默认 deck 标签：${form.deckTag || "flashcards"}

要求：
1. 如果内容是单词，请给出词义、常见用法、易混点，并生成 2-4 张卡片。
2. 如果内容是词组，请解释语义、语气、适用语境，并生成 2-4 张卡片。
3. 如果内容是句子，请解释整体意思、关键词、表达亮点，并生成 3-6 张卡片。
4. 卡片要适合快速复习，不要写成长段落。
5. summaryCn 应为一句话中文速记。
6. notePath 尽量与目录规则一致。`;
}

function parseModelJson(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("无法从模型返回中解析 JSON");
}

function normalizeStructuredData(raw, form) {
  const title = raw.title || form.rawInput.slice(0, 48);
  const sourceType = raw.sourceType || form.sourceType;
  const notePath =
    raw.notePath ||
    buildNotePath(form.folder || folderFromType(sourceType), title);

  const flashcards = Array.isArray(raw.flashcards)
    ? raw.flashcards
        .filter((item) => item?.front && item?.back)
        .map((item) => ({
          front: String(item.front).trim(),
          back: String(item.back).trim(),
        }))
    : [];

  return {
    title,
    sourceType,
    summaryCn: raw.summaryCn || "待补充中文速记",
    explanation: raw.explanation || "待补充解释",
    keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    flashcards:
      flashcards.length > 0
        ? flashcards
        : buildFallbackFlashcards(title, form.rawInput, sourceType),
    notePath,
  };
}

function buildFallbackStructuredData(form) {
  const title = form.rawInput.split("\n")[0].trim().slice(0, 60) || "untitled";
  const summaryCn = fallbackSummary(form);
  const explanation = fallbackExplanation(form);
  const folder = form.folder || folderFromType(form.sourceType);

  return {
    title,
    sourceType: form.sourceType,
    summaryCn,
    explanation,
    keywords: fallbackKeywords(form),
    flashcards: buildFallbackFlashcards(title, form.rawInput, form.sourceType),
    notePath: buildNotePath(folder, title),
  };
}

function fallbackSummary(form) {
  const label = {
    word: "这是一个需要记住词义和用法的英文单词。",
    phrase: "这是一个需要理解语义和语境的英文短语。",
    sentence: "这是一个值得拆解理解并复习表达方式的英文句子。",
    custom: "这是一条需要沉淀为知识卡片的内容。",
  };
  return label[form.sourceType];
}

function fallbackExplanation(form) {
  const input = form.rawInput;

  if (form.sourceType === "word") {
    return `请补充这个单词的核心词义、词性、常见搭配和易混点。原始内容：${input}`;
  }

  if (form.sourceType === "phrase") {
    return `请补充这个短语的中文含义、语气、使用语境与常见例句。原始内容：${input}`;
  }

  if (form.sourceType === "sentence") {
    return `请补充这个句子的整体意思、关键词、表达亮点与值得复习的部分。原始内容：${input}`;
  }

  return `请补充这条知识的核心定义、关键点和适合复习的问答形式。原始内容：${input}`;
}

function fallbackKeywords(form) {
  const base = [form.sourceType, "obsidian", "flashcard"];
  const contextWords = form.context
    ? form.context
        .split(/[\s,，。；;]+/)
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return [...new Set([...base, ...contextWords])];
}

function buildFallbackFlashcards(title, rawInput, sourceType) {
  if (sourceType === "word") {
    return [
      {
        front: `${title} 的核心中文含义是什么？`,
        back: "请补充最常用、最容易记忆的中文义项。",
      },
      {
        front: `${title} 的常见用法要注意什么？`,
        back: "请补充词性、搭配或典型语境。",
      },
    ];
  }

  if (sourceType === "phrase") {
    return [
      {
        front: `${title} 的常见中文含义是什么？`,
        back: "请补充一句简洁、可快速回忆的中文解释。",
      },
      {
        front: `${title} 适合出现在什么语境中？`,
        back: "请补充它的语气、语境或常见使用场景。",
      },
    ];
  }

  if (sourceType === "sentence") {
    return [
      {
        front: `这句话想表达的核心意思是什么？`,
        back: rawInput,
      },
      {
        front: `这句话里最值得记住的表达是什么？`,
        back: "请补充关键词、句型或表达亮点。",
      },
      {
        front: `这句话适合在哪类语境中使用？`,
        back: "请补充语气、场景或写作/口语用途。",
      },
    ];
  }

  return [
    {
      front: `${title} 的核心定义是什么？`,
      back: "请补充一句可用于快速回忆的解释。",
    },
    {
      front: `${title} 最值得复习的点是什么？`,
      back: "请补充关键概念、误区或应用场景。",
    },
  ];
}

function buildNotePath(folder, title) {
  const safeFolder = folder.replace(/\/+$/, "");
  return `${safeFolder}/${slugify(title)}.md`;
}

function folderFromType(type) {
  const folderMap = {
    word: "English Cards/Words",
    phrase: "English Cards/Phrases",
    sentence: "English Cards/Sentences",
    custom: "Knowledge Cards",
  };
  return folderMap[type] || "Knowledge Cards";
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "untitled";
}

function updateWithStructuredData(structuredData) {
  currentStructuredData = structuredData;
  currentMarkdown = buildMarkdown(structuredData, collectForm());
  const uri = buildObsidianUri(structuredData, currentMarkdown);
  renderOutputs(structuredData, currentMarkdown, uri);
}

function buildMarkdown(data, form) {
  const createdAt = new Date().toISOString().slice(0, 10);
  const tags = ["english", "flashcard", data.sourceType]
    .concat(data.keywords || [])
    .filter(Boolean);

  const deckLine = form.deckTag
    ? `#flashcards/${form.deckTag.replace(/^\/+|\/+$/g, "")}`
    : "#flashcards";

  const flashcardLines = data.flashcards
    .map((card) => `${card.front}::${card.back}`)
    .join("\n");

  return `---
type: knowledge-card
source_type: ${data.sourceType}
created_at: ${createdAt}
keywords:
${(data.keywords || []).map((item) => `  - ${item}`).join("\n") || "  - flashcard"}
tags:
${tags.map((item) => `  - ${item}`).join("\n")}
---

# ${data.title}

${deckLine}

## 原文

${form.rawInput}

## 中文速记

${data.summaryCn}

## AI解释

${data.explanation}

## 卡片

${flashcardLines}`;
}

function buildObsidianUri(data, markdown) {
  const vault = encodeURIComponent(elements.vaultName.value.trim());
  const file = encodeURIComponent(data.notePath.replace(/\.md$/i, ""));
  const content = encodeURIComponent(markdown);
  return `obsidian://new?vault=${vault}&file=${file}&content=${content}&silent=true&overwrite=true`;
}

function renderOutputs(jsonData, markdown, uri) {
  elements.jsonOutput.textContent = jsonData
    ? JSON.stringify(jsonData, null, 2)
    : "等待生成结构化结果…";
  elements.markdownOutput.textContent = markdown || "等待生成 Markdown…";
  elements.uriOutput.textContent = uri || "等待生成 Obsidian URI…";
}

function setButtonLabel(button, label) {
  const original = button.dataset.originalLabel || button.textContent;
  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = original;
  }

  button.textContent = label;
  window.clearTimeout(button._labelTimer);
  button._labelTimer = window.setTimeout(() => {
    button.textContent = button.dataset.originalLabel;
  }, 1600);
}
