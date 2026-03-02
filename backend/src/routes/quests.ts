import { dailyQuestProgress, playerdata } from '../db/schema.js';
import { validateSession, getPlayerData, createResponse, increment } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray } from 'drizzle-orm';
import typia from 'typia';
import type {
  GetQuestsTodayResponse,
  GetQuestsWeeklyResponse,
  ClaimQuestRewardRequest,
  ClaimQuestRewardResponse,
  DailyQuestProgress,
  QuestDefinition,
  StatsPostRequest,
} from '@zeitvertreib/types';

/**
 * Extract base category from a quest category string.
 * Handles both daily (e.g., 'kills') and weekly (e.g., 'weekly-2026W09-kills') formats.
 */
function extractBaseCategory(category: string): string {
  // Weekly format: weekly-2026W09-kills -> kills
  const weeklyMatch = category.match(/^weekly-\d{4}W\d{2}-(.+)$/);
  if (weeklyMatch && weeklyMatch[1]) {
    return weeklyMatch[1];
  }
  // Old weekly format fallback: weekly-kills -> kills
  if (category.startsWith('weekly-')) {
    return category.replace('weekly-', '');
  }
  // Daily format: kills -> kills
  return category;
}

const QUEST_DEFINITIONS: QuestDefinition[] = [
  // Medipack quests
  { category: 'medipacks', targetValue: 1, coinReward: 20, description: 'Verwende 1 Medikit' },
  { category: 'medipacks', targetValue: 4, coinReward: 35, description: 'Verwende 4 Medikits' },
  { category: 'medipacks', targetValue: 10, coinReward: 50, description: 'Verwende 10 Medikits' },
  // Cola quests
  { category: 'colas', targetValue: 1, coinReward: 10, description: 'Trinke 1 Cola' },
  { category: 'colas', targetValue: 3, coinReward: 30, description: 'Trinke 3 Colas' },
  { category: 'colas', targetValue: 5, coinReward: 50, description: 'Trinke 5 Colas' },
  // Playtime quests (in seconds)
  { category: 'playtime', targetValue: 600, coinReward: 20, description: 'Spiele 10 Minuten' },
  { category: 'playtime', targetValue: 1200, coinReward: 40, description: 'Spiele 20 Minuten' },
  { category: 'playtime', targetValue: 1800, coinReward: 60, description: 'Spiele 30 Minuten' },
  // Kill quests
  { category: 'kills', targetValue: 3, coinReward: 25, description: 'Erziele 3 Kills' },
  { category: 'kills', targetValue: 5, coinReward: 50, description: 'Erziele 5 Kills' },
  { category: 'kills', targetValue: 10, coinReward: 75, description: 'Erziele 10 Kills' },
  { category: 'kills', targetValue: 20, coinReward: 100, description: 'Erziele 20 Kills' },
  // Round quests
  { category: 'rounds', targetValue: 3, coinReward: 20, description: 'Spiele 3 Runden' },
  { category: 'rounds', targetValue: 5, coinReward: 35, description: 'Spiele 5 Runden' },
  { category: 'rounds', targetValue: 10, coinReward: 60, description: 'Spiele 10 Runden' },
  { category: 'rounds', targetValue: 15, coinReward: 100, description: 'Spiele 15 Runden' },
  // Pocket escape quests
  { category: 'pocketescapes', targetValue: 1, coinReward: 30, description: 'Schaffe 1 Pocket Escape' },
  { category: 'pocketescapes', targetValue: 2, coinReward: 60, description: 'Schaffe 2 Pocket Escapes' },
  { category: 'pocketescapes', targetValue: 3, coinReward: 90, description: 'Schaffe 3 Pocket Escapes' },
  { category: 'pocketescapes', targetValue: 5, coinReward: 150, description: 'Schaffe 5 Pocket Escapes' },
  // Adrenaline quests
  { category: 'adrenaline', targetValue: 2, coinReward: 25, description: 'Verwende 2 Adrenaline' },
  { category: 'adrenaline', targetValue: 4, coinReward: 40, description: 'Verwende 4 Adrenaline' },
  { category: 'adrenaline', targetValue: 6, coinReward: 60, description: 'Verwende 6 Adrenaline' },
  { category: 'adrenaline', targetValue: 10, coinReward: 100, description: 'Verwende 10 Adrenaline' },
];

const WEEKLY_QUEST_DEFINITIONS: QuestDefinition[] = [
  // Weekly Medipack quests
  { category: 'weekly-medipacks', targetValue: 30, coinReward: 175, description: 'Verwende diese Woche 30 Medikits' },
  { category: 'weekly-medipacks', targetValue: 60, coinReward: 325, description: 'Verwende diese Woche 60 Medikits' },
  { category: 'weekly-medipacks', targetValue: 100, coinReward: 550, description: 'Verwende diese Woche 100 Medikits' },
  // Weekly Cola quests
  { category: 'weekly-colas', targetValue: 25, coinReward: 150, description: 'Trinke diese Woche 25 Colas' },
  // Weekly Playtime quests (in seconds)
  { category: 'weekly-playtime', targetValue: 18000, coinReward: 450, description: 'Spiele diese Woche 5 Stunden' },
  { category: 'weekly-playtime', targetValue: 36000, coinReward: 750, description: 'Spiele diese Woche 10 Stunden' },
  { category: 'weekly-playtime', targetValue: 54000, coinReward: 1000, description: 'Spiele diese Woche 15 Stunden' },
  // Weekly Kill quests
  { category: 'weekly-kills', targetValue: 50, coinReward: 200, description: 'Erziele diese Woche 50 Kills' },
  { category: 'weekly-kills', targetValue: 75, coinReward: 350, description: 'Erziele diese Woche 75 Kills' },
  // Weekly Round quests
  { category: 'weekly-rounds', targetValue: 35, coinReward: 200, description: 'Spiele diese Woche 35 Runden' },
  { category: 'weekly-rounds', targetValue: 50, coinReward: 375, description: 'Spiele diese Woche 50 Runden' },
  // Weekly Pocket escape quests
  {
    category: 'weekly-pocketescapes',
    targetValue: 5,
    coinReward: 300,
    description: 'Schaffe diese Woche 5 Pocket Escapes',
  },
  {
    category: 'weekly-pocketescapes',
    targetValue: 10,
    coinReward: 550,
    description: 'Schaffe diese Woche 10 Pocket Escapes',
  },
  // Weekly Adrenaline quests
  {
    category: 'weekly-adrenaline',
    targetValue: 25,
    coinReward: 175,
    description: 'Verwende diese Woche 25 Adrenaline',
  },
  {
    category: 'weekly-adrenaline',
    targetValue: 50,
    coinReward: 325,
    description: 'Verwende diese Woche 50 Adrenaline',
  },
  {
    category: 'weekly-adrenaline',
    targetValue: 80,
    coinReward: 525,
    description: 'Verwende diese Woche 80 Adrenaline',
  },
];

/**
 * Get 3 random daily quests for today.
 * Quests rotate daily and player progress is tracked per day.
 */
export async function handleGetQuestsToday(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  const sessionResult = await validateSession(request, env);

  if (sessionResult.status !== 'valid' || !sessionResult.steamId) {
    return createResponse(
      { error: sessionResult.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  try {
    const todayDate = new Date().toISOString().split('T')[0];
    if (!todayDate) {
      return createResponse({ error: 'Failed to get current date' }, 500, origin);
    }

    const todaysQuests = getDailyQuests(todayDate);

    // Get progress rows for this user
    const progressRows = await db
      .select()
      .from(dailyQuestProgress)
      .where(eq(dailyQuestProgress.userId, sessionResult.steamId));

    const progressMap = new Map(progressRows.map((r) => [r.category, r]));

    // Build quest progress response
    const questsProgress: DailyQuestProgress[] = todaysQuests.map((quest) => {
      const row = progressMap.get(quest.category);
      const currentProgress = row?.progress ?? 0;
      const isCompleted = currentProgress >= quest.targetValue;
      const claimedAt = row?.claimedAt ?? 0;

      return {
        id: row?.id ?? 0,
        category: quest.category,
        description: quest.description,
        targetValue: quest.targetValue,
        currentProgress,
        coinReward: quest.coinReward,
        isCompleted,
        claimedAt,
      };
    });

    const response: GetQuestsTodayResponse = {
      date: todayDate,
      quests: questsProgress,
    };

    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('Quests error:', error);
    return createResponse({ error: 'Failed to fetch quests' }, 500, origin);
  }
}

/**
 * Claim a reward for a completed quest
 */
export async function handleClaimQuestReward(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  const sessionResult = await validateSession(request, env);

  if (sessionResult.status !== 'valid' || !sessionResult.steamId) {
    return createResponse(
      { error: sessionResult.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  let body: ClaimQuestRewardRequest;
  try {
    body = (await request.json()) as ClaimQuestRewardRequest;
  } catch {
    return createResponse({ error: 'Invalid JSON' }, 400, origin);
  }

  if (!typia.is<ClaimQuestRewardRequest>(body)) {
    return createResponse({ error: 'Invalid request data' }, 400, origin);
  }

  try {
    const todayDate = new Date().toISOString().split('T')[0];
    if (!todayDate) {
      return createResponse({ error: 'Failed to get current date' }, 500, origin);
    }

    // Look up the progress row by id
    const progressRows = await db
      .select()
      .from(dailyQuestProgress)
      .where(and(eq(dailyQuestProgress.id, body.questId), eq(dailyQuestProgress.userId, sessionResult.steamId)))
      .limit(1);

    const progressRow = progressRows[0];
    if (!progressRow) {
      return createResponse({ error: 'Quest progress not found' }, 400, origin);
    }

    // Verify the category belongs to either today's quests or this week's quests
    const weekString = getCurrentWeekString();
    const todaysQuests = getDailyQuests(todayDate);
    const weeklyQuests = getWeeklyQuests(weekString);
    const allQuests = [...todaysQuests, ...weeklyQuests];

    const questDef = allQuests.find((q) => q.category === progressRow.category);
    if (!questDef) {
      return createResponse({ error: 'Quest is not available' }, 400, origin);
    }

    if ((progressRow.claimedAt ?? 0) > 0) {
      return createResponse({ error: 'Reward already claimed' }, 400, origin);
    }

    if (progressRow.progress < questDef.targetValue) {
      return createResponse({ error: 'Quest requirements not met' }, 400, origin);
    }

    // Get player data to award coins
    const playerData = await getPlayerData(sessionResult.steamId, db, env);
    if (!playerData) {
      return createResponse({ error: 'Player data not found' }, 404, origin);
    }

    await db.batch([
      db
        .update(playerdata)
        .set({
          experience: increment(playerdata.experience, questDef.coinReward),
        })
        .where(eq(playerdata.id, sessionResult.steamId)),
      db
        .update(dailyQuestProgress)
        .set({ claimedAt: Math.floor(Date.now() / 1000) })
        .where(eq(dailyQuestProgress.id, progressRow.id)),
    ]);

    const response: ClaimQuestRewardResponse = {
      success: true,
      coinsAwarded: questDef.coinReward,
      message: `Belohnung beansprucht! +${questDef.coinReward} Coins`,
    };

    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('Claim reward error:', error);
    return createResponse({ error: 'Failed to claim reward' }, 500, origin);
  }
}

/**
 * Get the current ISO week string (e.g., 2026-W10)
 */
export function getCurrentWeekString(date: Date = new Date()): string {
  const tempDate = new Date(date.valueOf());
  const dayNum = (tempDate.getDay() + 6) % 7; // Monday = 0, Sunday = 6
  tempDate.setDate(tempDate.getDate() - dayNum + 3); // Move to Thursday of the same ISO week
  // Capture the ISO year from Thursday before further mutations
  const isoYear = tempDate.getFullYear();
  const firstThursday = tempDate.valueOf();
  tempDate.setMonth(0, 1); // Move to Jan 1 of the ISO year
  if (tempDate.getDay() !== 4) {
    tempDate.setMonth(0, 1 + ((4 - tempDate.getDay() + 7) % 7)); // Move to first Thursday of year
  }
  const weekNum = 1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000);
  return `${isoYear}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Get 3 random weekly quests for the current week.
 */
export async function handleGetQuestsWeekly(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  const sessionResult = await validateSession(request, env);

  if (sessionResult.status !== 'valid' || !sessionResult.steamId) {
    return createResponse(
      { error: sessionResult.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  try {
    const weekString = getCurrentWeekString();

    const weeklyQuests = getWeeklyQuests(weekString);

    // Get progress rows for this user, limited to the categories of this week's quests
    const weeklyQuestCategories = weeklyQuests.map((q) => q.category);
    const progressRows = await db
      .select()
      .from(dailyQuestProgress)
      .where(
        and(
          eq(dailyQuestProgress.userId, sessionResult.steamId),
          inArray(dailyQuestProgress.category, weeklyQuestCategories),
        ),
      );

    const progressMap = new Map(progressRows.map((r) => [r.category, r]));

    // Build quest progress response
    const questsProgress: DailyQuestProgress[] = weeklyQuests.map((quest) => {
      const row = progressMap.get(quest.category);
      const currentProgress = row?.progress ?? 0;
      const isCompleted = currentProgress >= quest.targetValue;
      const claimedAt = row?.claimedAt ?? 0;

      return {
        id: row?.id ?? 0,
        category: quest.category,
        description: quest.description,
        targetValue: quest.targetValue,
        currentProgress,
        coinReward: quest.coinReward,
        isCompleted,
        claimedAt,
      };
    });

    const response: GetQuestsWeeklyResponse = {
      week: weekString,
      quests: questsProgress,
    };

    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('Weekly quests error:', error);
    return createResponse({ error: 'Failed to fetch weekly quests' }, 500, origin);
  }
}

/**
 * Returns 3 pseudo-random quests for a given date string (YYYY-MM-DD).
 * Same quests for all players each day, each with a different category.
 */
function getDailyQuests(dateString: string): QuestDefinition[] {
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const seed = Math.abs(hash);

  const result: QuestDefinition[] = [];
  const available = [...QUEST_DEFINITIONS];

  for (let i = 0; i < 3 && available.length > 0; i++) {
    const index = (seed + i * 12345) % available.length;
    const selected = available[index];
    if (!selected) continue;
    result.push(selected);

    // Remove all quests of the same category so each daily quest is unique
    const selectedCategory = selected.category;
    for (let j = available.length - 1; j >= 0; j--) {
      if (available[j]?.category === selectedCategory) {
        available.splice(j, 1);
      }
    }
  }

  return result;
}

/**
 * Returns 3 pseudo-random weekly quests for a given week string (YYYY-Wxx).
 * Same quests for all players each week, each with a different category.
 * Categories include the week string to ensure automatic reset each Monday.
 */
function getWeeklyQuests(weekString: string): QuestDefinition[] {
  let hash = 0;
  for (let i = 0; i < weekString.length; i++) {
    const char = weekString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const seed = Math.abs(hash);

  const result: QuestDefinition[] = [];
  const available = [...WEEKLY_QUEST_DEFINITIONS];

  for (let i = 0; i < 3 && available.length > 0; i++) {
    const index = (seed + i * 54321) % available.length;
    const selected = available[index];
    if (!selected) continue;

    // Include week string in category for automatic weekly reset
    // e.g., weekly-medipacks becomes weekly-2026W09-medipacks
    const baseCategory = selected.category.replace('weekly-', '');
    const weekCategory = `weekly-${weekString.replace('-', '')}-${baseCategory}` as QuestDefinition['category'];

    result.push({
      ...selected,
      category: weekCategory,
    });

    // Remove all quests of the same base category so each weekly quest is unique
    const selectedCategory = selected.category;
    for (let j = available.length - 1; j >= 0; j--) {
      if (available[j]?.category === selectedCategory) {
        available.splice(j, 1);
      }
    }
  }

  return result;
}

export async function logProgress(
  env: Env,
  params: {
    userId: string;
    medipacks?: number;
    colas?: number;
    playtime?: number;
    kills?: number;
    rounds?: number;
    pocketescapes?: number;
    adrenaline?: number;
  },
): Promise<void> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const todayDate = new Date().toISOString().split('T')[0];
  if (!todayDate) return;

  const weekString = getCurrentWeekString();

  const deltas: Record<string, number> = {
    medipacks: params.medipacks ?? 0,
    colas: params.colas ?? 0,
    playtime: params.playtime ?? 0,
    kills: params.kills ?? 0,
    rounds: params.rounds ?? 0,
    pocketescapes: params.pocketescapes ?? 0,
    adrenaline: params.adrenaline ?? 0,
  };

  // Get both daily and weekly quests that have non-zero deltas
  const dailyQuests = getDailyQuests(todayDate).filter((q) => (deltas[q.category] ?? 0) > 0);
  const weeklyQuests = getWeeklyQuests(weekString);

  // Map weekly quest categories to their base categories (e.g., weekly-2026W09-kills -> kills)
  const weeklyQuestsToUpdate = weeklyQuests.filter((wq) => {
    const baseCategory = extractBaseCategory(wq.category);
    return (deltas[baseCategory] ?? 0) > 0;
  });

  const allRelevantQuests = [...dailyQuests, ...weeklyQuestsToUpdate];
  if (allRelevantQuests.length === 0) return;

  // Query only the progress rows for the quests we're updating
  const relevantCategories = allRelevantQuests.map((q) => q.category);
  const progressRows = await db
    .select()
    .from(dailyQuestProgress)
    .where(and(eq(dailyQuestProgress.userId, params.userId), inArray(dailyQuestProgress.category, relevantCategories)));

  const progressMap = new Map(progressRows.map((r) => [r.category, r]));

  const statements = allRelevantQuests.map((quest) => {
    // For weekly quests, get the delta from the base category (e.g., weekly-2026W09-kills -> kills)
    const categoryKey = quest.category.startsWith('weekly-')
      ? extractBaseCategory(quest.category)
      : (quest.category as keyof typeof deltas);
    const delta = deltas[categoryKey] ?? 0;
    const existingRow = progressMap.get(quest.category);
    if (existingRow) {
      return db
        .update(dailyQuestProgress)
        .set({ progress: increment(dailyQuestProgress.progress, delta) })
        .where(eq(dailyQuestProgress.id, existingRow.id));
    }
    return db.insert(dailyQuestProgress).values({ userId: params.userId, category: quest.category, progress: delta });
  });

  await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
}
