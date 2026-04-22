import type { FormState } from "./flashcard-types.js";
import type { PromptStrategy } from "./local-library-types.js";
import { enabledTemplateFieldsFromForm, templateStrategyLabel } from "./template-runtime.js";

export const DEFAULT_SYSTEM_PROMPT = `你是一个帮助用户把零散知识整理成可复习知识卡片的助手。

你的任务不是普通解释，而是把输入内容转换为适合复习的结构化结果。

请严格遵守：
1. 输出必须是 JSON，不要输出 Markdown 代码块，不要输出多余说明。
2. 输出字段必须包含：
   - title
   - sourceType
   - summaryCn
   - explanation
   - hint
   - keywords
   - flashcards
   - notePath
3. flashcards 必须是数组，每个元素都包含：
   - front
   - back
4. front 和 back 要适合做复习卡片，避免过长。
5. explanation 用简洁中文说明。
6. 如果输入是英语句子、短语或生词，请同时给出适合中文用户理解的解释。
7. hint 应是一个简短提示，帮助用户在“模糊”状态下回忆知识点。
8. notePath 应根据 sourceType 生成到合理的分类目录中。
9. 文件名要使用短横线 slug 风格，不要包含非法路径字符。`;

export function buildUserPrompt(form: FormState) {
  const templateFields = enabledTemplateFieldsFromForm(form).join("、");
  const templateInfo = form.templateName
    ? `
模板名称：${form.templateName}
模板策略：${templateStrategyLabel((form.templatePromptStrategy as PromptStrategy | undefined) || "general")}
模板字段：${templateFields}
模板说明：${form.templateDescription || "无"}`
    : `
模板名称：未指定
模板策略：未指定
模板字段：未指定
模板说明：无`;
  const strategyRequirement = buildStrategyRequirement((form.templatePromptStrategy as PromptStrategy | undefined) || "general");

  return `请将下面内容整理为适合知识卡片复习使用的结构化数据。

内容类型：${form.sourceType}
原始内容：${form.rawInput}
补充上下文：${form.context || "无"}
默认目录：${form.folder || "自动判断"}
默认 deck 标签：${form.deckTag || "flashcards"}
${templateInfo}
模板策略重点：${strategyRequirement}

要求：
1. 如果内容是单词，请给出词义、常见用法、易混点，并生成 2-4 张卡片。
2. 如果内容是词组，请解释语义、语气、适用语境，并生成 2-4 张卡片。
3. 如果内容是句子，请解释整体意思、关键词、表达亮点，并生成 3-6 张卡片。
4. 如果内容是求职或自定义知识，请给出核心定义、提示和常见应用场景，并生成 2-4 张卡片。
5. 卡片要适合快速复习，不要写成长段落。
6. summaryCn 应为一句话中文速记。
7. hint 应为一句帮助回忆的简短提示。
8. notePath 尽量与目录规则一致。
9. 如果已经提供模板字段，请优先保证这些字段的信息质量。`;
}

function buildStrategyRequirement(strategy: PromptStrategy) {
  if (strategy === "career") {
    return "优先突出核心定义、面试或求职应用场景、常见追问和可回忆提示。";
  }

  if (strategy === "english") {
    return "优先突出中英对照、词义语气、搭配语境和适合中文用户记忆的表达提示。";
  }

  return "优先突出概念定义、适用场景、记忆提示和复习问答。";
}
