import type {
  LocalAppSettings,
  LocalCardRecord,
  ReviewRating,
  ReviewState,
} from "./local-library-types.js";

const EBBINGHAUS_INTERVAL_HOURS = [8, 24, 72, 168, 360, 720, 1440] as const;
const MAX_REVIEW_STAGE = EBBINGHAUS_INTERVAL_HOURS.length - 1;

export type DailyStudyPlan = {
  dueReviewCards: LocalCardRecord[];
  newCards: LocalCardRecord[];
  scheduledReviewCards: LocalCardRecord[];
  scheduledNewCards: LocalCardRecord[];
  reviewBacklogCount: number;
  newBacklogCount: number;
  scheduledTodayCount: number;
};

export type ReviewScheduleUpdate = {
  reviewState: ReviewState;
  reviewDueAt: string;
  memoryScore: number;
  intervalHours: number;
  phaseLabel: string;
};

export function buildDailyStudyPlan(
  cards: LocalCardRecord[],
  settings: Pick<LocalAppSettings, "dailyNewLimit" | "dailyReviewLimit">,
  now = new Date(),
): DailyStudyPlan {
  const nowTime = now.getTime();
  const dueReviewCards = cards
    .filter((card) => card.reviewState !== "new" && new Date(card.reviewDueAt).getTime() <= nowTime)
    .sort(sortReviewCardsByUrgency);
  const newCards = cards
    .filter((card) => card.reviewState === "new")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const scheduledReviewCards = dueReviewCards.slice(0, settings.dailyReviewLimit);
  const scheduledNewCards = newCards.slice(0, settings.dailyNewLimit);

  return {
    dueReviewCards,
    newCards,
    scheduledReviewCards,
    scheduledNewCards,
    reviewBacklogCount: Math.max(0, dueReviewCards.length - scheduledReviewCards.length),
    newBacklogCount: Math.max(0, newCards.length - scheduledNewCards.length),
    scheduledTodayCount: scheduledReviewCards.length + scheduledNewCards.length,
  };
}

export function buildReviewScheduleUpdate(
  card: LocalCardRecord,
  rating: ReviewRating,
  now = new Date(),
): ReviewScheduleUpdate {
  const currentStage = getReviewStage(card);

  if (rating === "forgot") {
    const nextStage = currentStage <= 1 ? 0 : currentStage - 1;
    const intervalHours = currentStage <= 1 ? 8 : 24;
    return {
      reviewState: "learning",
      reviewDueAt: addHours(now, intervalHours).toISOString(),
      memoryScore: nextStage,
      intervalHours,
      phaseLabel: reviewPhaseLabelFromState("learning", nextStage),
    };
  }

  if (rating === "fuzzy") {
    const nextStage = currentStage;
    const intervalHours = currentStage === 0 ? 8 : intervalHoursForStage(nextStage);
    const nextState = nextStage <= 1 ? "learning" : "review";
    return {
      reviewState: nextState,
      reviewDueAt: addHours(now, intervalHours).toISOString(),
      memoryScore: nextStage,
      intervalHours,
      phaseLabel: reviewPhaseLabelFromState(nextState, nextStage),
    };
  }

  const nextStage = Math.min(MAX_REVIEW_STAGE, currentStage + 1);
  const intervalHours = intervalHoursForStage(nextStage);
  const nextState = nextStage <= 1 ? "learning" : "review";
  return {
    reviewState: nextState,
    reviewDueAt: addHours(now, intervalHours).toISOString(),
    memoryScore: nextStage,
    intervalHours,
    phaseLabel: reviewPhaseLabelFromState(nextState, nextStage),
  };
}

export function buildReviewChoiceHints(card: LocalCardRecord, now = new Date()) {
  return {
    forgot: describeFutureReviewAt(buildReviewScheduleUpdate(card, "forgot", now).reviewDueAt, now),
    fuzzy: describeFutureReviewAt(buildReviewScheduleUpdate(card, "fuzzy", now).reviewDueAt, now),
    remembered: describeFutureReviewAt(buildReviewScheduleUpdate(card, "remembered", now).reviewDueAt, now),
  };
}

export function buildReviewFeedbackMessage(
  rating: ReviewRating,
  outcome: ReviewScheduleUpdate,
  now = new Date(),
) {
  const dueText = describeFutureReviewAt(outcome.reviewDueAt, now);

  if (rating === "forgot") {
    return `已记录为“不记得”，已回退到${outcome.phaseLabel}，下次复习：${dueText}。`;
  }

  if (rating === "fuzzy") {
    return `已记录为“模糊”，当前保持在${outcome.phaseLabel}，系统会更快再次安排：${dueText}。`;
  }

  return `已记录为“记得”，已进入${outcome.phaseLabel}，下次复习：${dueText}。`;
}

export function reviewPhaseLabel(card: LocalCardRecord) {
  if (card.reviewState === "new") {
    return "新卡待学";
  }

  return reviewPhaseLabelFromState(card.reviewState, getReviewStage(card));
}

export function describeReviewDueState(reviewDueAt: string, now = new Date()) {
  const target = new Date(reviewDueAt);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) {
    return "已到期";
  }

  const targetDay = target.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const tomorrow = addDays(now, 1).toISOString().slice(0, 10);

  if (targetDay === today) {
    return `今天 ${formatClock(target)}`;
  }

  if (targetDay === tomorrow) {
    return `明天 ${formatClock(target)}`;
  }

  const hours = Math.ceil(diffMs / (1000 * 60 * 60));
  return formatIntervalLabel(hours);
}

export function describeFutureReviewAt(reviewDueAt: string, now = new Date()) {
  return `${describeReviewDueState(reviewDueAt, now)}（${formatMonthDayTime(new Date(reviewDueAt))}）`;
}

export function formatIntervalLabel(hours: number) {
  if (hours <= 24) {
    return hours === 24 ? "1 天后" : `${hours} 小时后`;
  }

  const days = Math.round(hours / 24);
  return `${days} 天后`;
}

function sortReviewCardsByUrgency(left: LocalCardRecord, right: LocalCardRecord) {
  const byDue = left.reviewDueAt.localeCompare(right.reviewDueAt);
  if (byDue !== 0) {
    return byDue;
  }

  const byStage = getReviewStage(left) - getReviewStage(right);
  if (byStage !== 0) {
    return byStage;
  }

  return left.updatedAt.localeCompare(right.updatedAt);
}

function getReviewStage(card: LocalCardRecord) {
  return Math.max(0, Math.min(MAX_REVIEW_STAGE, Math.round(card.memoryScore)));
}

function reviewPhaseLabelFromState(reviewState: ReviewState, stage: number) {
  if (reviewState === "new") {
    return "新卡待学";
  }

  if (stage === 0) {
    return "首次巩固";
  }

  if (reviewState === "learning") {
    return `第 ${stage} 轮巩固`;
  }

  return `第 ${stage} 轮复习`;
}

function intervalHoursForStage(stage: number) {
  return EBBINGHAUS_INTERVAL_HOURS[Math.max(0, Math.min(MAX_REVIEW_STAGE, stage))];
}

function addHours(date: Date, hours: number) {
  const copy = new Date(date);
  copy.setTime(copy.getTime() + hours * 60 * 60 * 1000);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatClock(date: Date) {
  return date.toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMonthDayTime(date: Date) {
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
