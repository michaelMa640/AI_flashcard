import type { Flashcard, FormState, SourceType, StructuredData } from "./flashcard-types.js";
import { applyTemplateToStructuredData } from "./template-runtime.js";

export function buildFallbackStructuredData(form: FormState): StructuredData {
  const title = form.rawInput.split("\n")[0].trim().slice(0, 60) || "untitled";
  const summaryCn = fallbackSummary(form);
  const explanation = fallbackExplanation(form);
  const folder = form.folder || folderFromType(form.sourceType);

  return applyTemplateToStructuredData({
    title,
    sourceType: form.sourceType,
    summaryCn,
    explanation,
    hint: fallbackHint(form),
    keywords: fallbackKeywords(form),
    flashcards: buildFallbackFlashcards(title, form.rawInput, form.sourceType),
    notePath: buildNotePath(folder, title),
  }, form);
}

export function buildMarkdown(data: StructuredData, form: FormState) {
  const createdAt = new Date().toISOString().slice(0, 10);
  const tags = ["english", "flashcard", data.sourceType]
    .concat(data.keywords || [])
    .filter(Boolean);

  const deckLine = form.deckTag
    ? `#flashcards/${form.deckTag.replace(/^\/+|\/+$/g, "")}`
    : "#flashcards";

  const flashcardLines = data.flashcards.map((card) => `${card.front}::${card.back}`).join("\n");

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

export function buildObsidianUri(vaultName: string, notePath: string, markdown: string) {
  const vault = encodeURIComponent(vaultName.trim());
  const file = encodeURIComponent(notePath.replace(/\.md$/i, ""));
  const content = encodeURIComponent(markdown);
  return `obsidian://new?vault=${vault}&file=${file}&content=${content}&silent=true&overwrite=true`;
}

export function buildNotePath(folder: string, title: string) {
  const safeFolder = folder.replace(/\/+$/, "");
  return `${safeFolder}/${slugify(title)}.md`;
}

export function folderFromType(type: SourceType) {
  const folderMap: Record<SourceType, string> = {
    word: "English Cards/Words",
    phrase: "English Cards/Phrases",
    sentence: "English Cards/Sentences",
    custom: "Knowledge Cards",
  };
  return folderMap[type];
}

export function isFlashcardCandidate(item: Partial<Flashcard> | null): item is Required<Flashcard> {
  return Boolean(item?.front) && Boolean(item?.back);
}

function fallbackSummary(form: FormState) {
  const label: Record<SourceType, string> = {
    word: "这是一个需要记住词义和用法的英文单词。",
    phrase: "这是一个需要理解语义和语境的英文短语。",
    sentence: "这是一个值得拆解理解并复习表达方式的英文句子。",
    custom: "这是一条需要沉淀为知识卡片的内容。",
  };
  return label[form.sourceType];
}

function fallbackExplanation(form: FormState) {
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

function fallbackKeywords(form: FormState) {
  const base = [form.sourceType, "obsidian", "flashcard"];
  const contextWords = form.context
    ? form.context
        .split(/[\s,，。；;]+/)
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return [...new Set([...base, ...contextWords])];
}

function fallbackHint(form: FormState) {
  if (form.sourceType === "word") {
    return "先回忆这个词最常见的中文义项，再想它通常搭配什么词。";
  }

  if (form.sourceType === "phrase") {
    return "先抓住短语的整体语义，再回忆它常出现的情境。";
  }

  if (form.sourceType === "sentence") {
    return "先想这句话的大意，再回忆最值得记住的表达亮点。";
  }

  return "先回忆这条知识的核心定义，再想一个典型应用场景。";
}

function buildFallbackFlashcards(title: string, rawInput: string, sourceType: SourceType): Flashcard[] {
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
        front: "这句话想表达的核心意思是什么？",
        back: rawInput,
      },
      {
        front: "这句话里最值得记住的表达是什么？",
        back: "请补充关键词、句型或表达亮点。",
      },
      {
        front: "这句话适合在哪类语境中使用？",
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

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "untitled"
  );
}
