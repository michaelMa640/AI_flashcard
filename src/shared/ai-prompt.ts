import type { FormState } from "./flashcard-types.js";

export const DEFAULT_SYSTEM_PROMPT = `你是一个帮助用户把零散知识整理成 Obsidian 知识卡片的助手。

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

export function buildUserPrompt(form: FormState) {
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
