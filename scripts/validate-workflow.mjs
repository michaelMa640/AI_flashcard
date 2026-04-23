import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFallbackStructuredData, buildObsidianUri } from "../dist-electron/src/shared/flashcard-utils.js";
import { createDefaultLocalAppSettings } from "../dist-electron/src/shared/local-library-defaults.js";
import { createDefaultLocalLibraryData } from "../dist-electron/src/shared/local-library-defaults.js";
import {
  reviewCardInLibrary,
  saveCardInLibrary,
  saveFolderInLibrary,
  saveSettingsInLibrary,
  saveTemplateInLibrary,
} from "../dist-electron/src/shared/local-library-engine.js";
import { buildMarkdownDocument } from "../dist-electron/src/shared/markdown-generator.js";
import { buildDailyStudyPlan, buildReviewScheduleUpdate } from "../dist-electron/src/shared/review-scheduler.js";
import { normalizeStructuredData, parseModelJson } from "../dist-electron/src/shared/structured-parser.js";
import { writeMarkdownToVault } from "../dist-electron/electron/vault-adapter.js";

const cases = [
  {
    id: "word-direct",
    description: "Direct fallback workflow for a single word",
    form: {
      rawInput: "serendipity",
      sourceType: "word",
      mode: "direct",
      vaultName: "AI Flashcard Demo Vault",
      deckTag: "english/words",
      folder: "English Cards/Words",
      context: "Seen in a novel and want a memorable Chinese explanation.",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      apiKey: "",
      systemPrompt: "unused in validation",
    },
    source: "fallback",
  },
  {
    id: "phrase-ai",
    description: "Structured AI workflow for a phrase",
    form: {
      rawInput: "a blessing in disguise",
      sourceType: "phrase",
      mode: "ai",
      vaultName: "AI Flashcard Demo Vault",
      deckTag: "english/phrases",
      folder: "English Cards/Phrases",
      context: "I want meaning, tone, and one memorable usage note.",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      apiKey: "mock-key",
      systemPrompt: "unused in validation",
    },
    source: "ai",
    modelResponse: `Here is the JSON:
{
  "title": "A blessing in disguise",
  "sourceType": "phrase",
  "summaryCn": "表面看像坏事，后来证明反而带来好结果。",
  "explanation": "常用于表达某件事起初令人失望，但长期看却有积极价值，语气偏书面但也常见于日常表达。",
  "keywords": ["turning point", "phrase", "mindset"],
  "flashcards": [
    {
      "front": "a blessing in disguise 的核心中文含义是什么？",
      "back": "看似坏事，实则因祸得福。"
    },
    {
      "front": "a blessing in disguise 常用来描述什么情况？",
      "back": "起初不理想、后来证明有帮助或带来更好结果的经历。"
    }
  ],
  "notePath": "English Cards/Phrases/a blessing in disguise.md"
}`,
  },
  {
    id: "sentence-ai",
    description: "Structured AI workflow for a sentence",
    form: {
      rawInput: "What feels like the end is often the beginning in disguise.",
      sourceType: "sentence",
      mode: "ai",
      vaultName: "AI Flashcard Demo Vault",
      deckTag: "english/sentences",
      folder: "English Cards/Sentences",
      context: "Need a quick Chinese gloss and a flashcard-friendly takeaway.",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      apiKey: "mock-key",
      systemPrompt: "unused in validation",
    },
    source: "ai",
    modelResponse: `\`\`\`json
{
  "title": "What feels like the end is often the beginning in disguise",
  "sourceType": "sentence",
  "summaryCn": "很多看似结束的时刻，往往只是新的开始换了一种方式出现。",
  "explanation": "这句话强调视角转换：不要把暂时的失去或结束直接等同于彻底终止，它可能只是新阶段的入口。",
  "keywords": ["perspective", "sentence", "encouragement"],
  "flashcards": [
    {
      "front": "这句话想表达的核心意思是什么？",
      "back": "看似结束的事情，可能正以另一种形式开启新的开始。"
    },
    {
      "front": "这句话适合用在什么语境中？",
      "back": "鼓励别人面对转折、失去或阶段结束时重新理解局势。"
    }
  ]
}
\`\`\``,
  },
];

async function main() {
  const tempVaultRoot = await mkdtemp(join(tmpdir(), "ai-flashcard-step7-"));
  const results = [];

  try {
    for (const item of cases) {
      const structured =
        item.source === "fallback"
          ? buildFallbackStructuredData(item.form)
          : normalizeStructuredData(parseModelJson(item.modelResponse), item.form);

      const document = buildMarkdownDocument(structured, item.form);
      const uri = buildObsidianUri(item.form.vaultName, document.notePath, document.content);
      const writeResult = await writeMarkdownToVault({
        vaultPath: tempVaultRoot,
        notePath: document.notePath,
        content: document.content,
        strategy: "overwrite",
      });

      const writtenContent = await readFile(writeResult.filePath, "utf8");

      assert(document.content.includes("## 卡片"), `${item.id}: missing flashcard section`);
      assert(document.content.includes("::"), `${item.id}: missing spaced repetition delimiter`);
      assert(document.content.includes("deck_tag:"), `${item.id}: missing deck_tag frontmatter`);
      assert(writtenContent === document.content, `${item.id}: vault write content mismatch`);
      assert(uri.startsWith("obsidian://new?"), `${item.id}: invalid Obsidian URI`);
      assert(uri.includes("overwrite=true"), `${item.id}: URI missing overwrite flag`);

      results.push({
        id: item.id,
        description: item.description,
        notePath: document.notePath,
        filePath: writeResult.filePath,
        uriLength: uri.length,
      });
    }

    const schedulerSettings = createDefaultLocalAppSettings();
    const reviewSeed = {
      id: "review-seed",
      title: "seed review",
      folderId: "folder-english",
      folderName: "英语",
      templateId: "template-english-core",
      sourceType: "word",
      mode: "ai",
      rawInput: "serendipity",
      context: "",
      deckTag: "english/words",
      summary: "summary",
      explanation: "explanation",
      hint: "hint",
      keywords: [],
      flashcards: [{ front: "front", back: "back" }],
      notePath: "英语/serendipity.md",
      markdown: "# demo",
      obsidianUri: "obsidian://demo",
      structuredData: {
        title: "seed review",
        sourceType: "word",
        summaryCn: "summary",
        explanation: "explanation",
        hint: "hint",
        keywords: [],
        flashcards: [{ front: "front", back: "back" }],
        notePath: "英语/serendipity.md",
      },
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-20T10:00:00.000Z",
      reviewState: "review",
      reviewDueAt: "2026-04-21T10:00:00.000Z",
      reviewLastAt: "2026-04-20T10:00:00.000Z",
      reviewCount: 2,
      memoryScore: 2,
    };
    const newSeed = {
      ...reviewSeed,
      id: "new-seed",
      title: "seed new",
      reviewState: "new",
      reviewDueAt: "2026-04-23T09:00:00.000Z",
      reviewLastAt: null,
      reviewCount: 0,
      memoryScore: 0,
    };

    const plan = buildDailyStudyPlan(
      [reviewSeed, newSeed],
      {
        ...schedulerSettings,
        dailyReviewLimit: 1,
        dailyNewLimit: 1,
      },
      new Date("2026-04-23T10:00:00.000Z"),
    );
    const remembered = buildReviewScheduleUpdate(newSeed, "remembered", new Date("2026-04-23T10:00:00.000Z"));

    assert(plan.scheduledReviewCards.length === 1, "scheduler: expected one scheduled review card");
    assert(plan.scheduledNewCards.length === 1, "scheduler: expected one scheduled new card");
    assert(remembered.memoryScore === 1, "scheduler: remembered new card should advance to stage 1");
    assert(remembered.reviewState === "learning", "scheduler: remembered new card should enter learning state first");
    assert(remembered.reviewDueAt.startsWith("2026-04-24"), "scheduler: remembered new card should be scheduled for next day");

    const workflowSummary = validateLocalLibraryJourney();

    console.log(JSON.stringify({
      ok: true,
      platform: process.platform,
      tempVaultRoot,
      cases: results,
      localJourney: workflowSummary,
    }, null, 2));
  } finally {
    await rm(tempVaultRoot, { recursive: true, force: true });
  }
}

function validateLocalLibraryJourney() {
  const now = "2026-04-23T10:30:00.000Z";
  let library = createDefaultLocalLibraryData(now);

  const templateResult = saveTemplateInLibrary(library, {
    name: "英语精听模板",
    description: "适用于英语表达精听与精读回忆。",
    promptStrategy: "english",
    enabledFields: ["summary", "explanation", "hint", "flashcards"],
  });
  library = templateResult.data;

  const folderResult = saveFolderInLibrary(library, {
    name: "英语精听",
    templateId: templateResult.template.id,
  });
  library = folderResult.data;

  const settingsResult = saveSettingsInLibrary(library, {
    folder: "英语精听",
    deckTag: "english/listening",
    dailyNewLimit: 2,
    dailyReviewLimit: 3,
  });
  library = settingsResult.data;

  const cardForm = {
    rawInput: "strike while the iron is hot",
    sourceType: "phrase",
    mode: "ai",
    vaultName: "My Knowledge Space",
    deckTag: "english/listening",
    folder: "英语精听",
    folderId: folderResult.folder.id,
    templateId: templateResult.template.id,
    templateName: templateResult.template.name,
    templatePromptStrategy: templateResult.template.promptStrategy,
    templateEnabledFields: templateResult.template.enabledFields,
    templateDescription: templateResult.template.description,
    context: "关注地道表达、动作感和适用语境。",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "mock-key",
    systemPrompt: "unused in validation",
  };
  const structured = normalizeStructuredData(
    parseModelJson(`{
      "title": "Strike while the iron is hot",
      "sourceType": "phrase",
      "summaryCn": "趁热打铁，抓住时机立刻行动。",
      "explanation": "强调机会稍纵即逝，最好在条件最合适的时候马上行动。",
      "hint": "先想“机会窗口很短”这个画面。",
      "keywords": ["timing", "action", "phrase"],
      "flashcards": [
        {
          "front": "strike while the iron is hot 的核心含义是什么？",
          "back": "趁热打铁，抓住时机立刻行动。"
        },
        {
          "front": "这个表达常用来提醒什么？",
          "back": "机会有限，不要拖延，适合马上推进。"
        }
      ],
      "notePath": "英语精听/strike while the iron is hot.md"
    }`),
    cardForm,
  );
  const markdown = buildMarkdownDocument(structured, cardForm);

  const firstSave = saveCardInLibrary(library, {
    form: cardForm,
    structuredData: {
      ...structured,
      title: markdown.title,
      notePath: markdown.notePath,
      keywords: markdown.keywords,
    },
    markdown: markdown.content,
    uri: buildObsidianUri(cardForm.vaultName, markdown.notePath, markdown.content),
  });
  library = firstSave.data;

  const secondSave = saveCardInLibrary(library, {
    form: {
      ...cardForm,
      rawInput: "behavioral interview - STAR method",
      sourceType: "custom",
      folder: "求职",
      deckTag: "career/interview",
    },
    structuredData: {
      title: "STAR method",
      sourceType: "custom",
      summaryCn: "用情境、任务、行动、结果结构化回答经历题。",
      explanation: "适合行为面试，用结构化方式讲清经历与结果。",
      hint: "先回忆四个字母分别代表什么。",
      keywords: ["interview", "star", "career"],
      flashcards: [
        {
          front: "STAR 分别代表什么？",
          back: "Situation, Task, Action, Result。",
        },
      ],
      notePath: "求职/star method.md",
    },
    markdown: "# STAR",
    uri: "obsidian://demo",
  });
  library = secondSave.data;

  const reviewResult = reviewCardInLibrary(library, {
    cardId: firstSave.card.id,
    rating: "remembered",
  });
  library = reviewResult.data;

  const journeyPlan = buildDailyStudyPlan(library.cards, library.settings, new Date("2026-04-23T10:40:00.000Z"));
  const firstReviewed = reviewResult.card;

  assert(library.cards.length === 2, "journey: expected two saved cards");
  assert(library.settings.folder === "求职", "journey: settings folder should track latest saved folder");
  assert(templateResult.snapshot.templates.some((item) => item.name === "英语精听模板"), "journey: template should be persisted");
  assert(folderResult.snapshot.folders.some((item) => item.name === "英语精听"), "journey: folder should be persisted");
  assert(firstSave.snapshot.cards[0].id === firstSave.card.id, "journey: latest saved card should appear first in history");
  assert(reviewResult.card.reviewCount === 1, "journey: review should increment count");
  assert(firstReviewed.reviewState === "learning", "journey: remembered new card should enter learning state");
  assert(journeyPlan.scheduledNewCards.length === 1, "journey: one new card should remain in today queue");
  assert(journeyPlan.scheduledReviewCards.length === 0, "journey: reviewed card should leave immediate due queue");

  return {
    templateName: templateResult.template.name,
    folderName: folderResult.folder.name,
    savedCardCount: library.cards.length,
    reviewedCardState: firstReviewed.reviewState,
    reviewedCardDueAt: firstReviewed.reviewDueAt,
    remainingNewCards: journeyPlan.scheduledNewCards.length,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

await main();
