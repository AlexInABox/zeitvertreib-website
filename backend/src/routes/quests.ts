import { dailyQuestProgress, playerdata } from '../db/schema.js';
import { validateSession, getPlayerData, createResponse, increment } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import typia from 'typia';
import type {
  GetQuestsTodayResponse,
  ClaimQuestRewardRequest,
  ClaimQuestRewardResponse,
  DailyQuestProgress,
  QuestDefinition,
  StatsPostRequest
} from '@zeitvertreib/types';

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
      .where(
        and(
          eq(dailyQuestProgress.id, body.questId),
          eq(dailyQuestProgress.userId, sessionResult.steamId),
        ),
      )
      .limit(1);

    const progressRow = progressRows[0];
    if (!progressRow) {
      return createResponse({ error: 'Quest progress not found' }, 400, origin);
    }

    // Verify the category belongs to one of today's quests
    const todaysQuests = getDailyQuests(todayDate);
    const questDef = todaysQuests.find((q) => q.category === progressRow.category);
    if (!questDef) {
      return createResponse({ error: 'Quest is not available today' }, 400, origin);
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
        .where(eq(dailyQuestProgress.id, progressRow.id))
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

  const deltas: Record<string, number> = {
    medipacks: params.medipacks ?? 0,
    colas: params.colas ?? 0,
    playtime: params.playtime ?? 0,
    kills: params.kills ?? 0,
    rounds: params.rounds ?? 0,
    pocketescapes: params.pocketescapes ?? 0,
    adrenaline: params.adrenaline ?? 0,
  };

  // Only process today's quests that have a non-zero delta
  const relevantQuests = getDailyQuests(todayDate).filter((q) => (deltas[q.category] ?? 0) > 0);
  if (relevantQuests.length === 0) return;

  const progressRows = await db
    .select()
    .from(dailyQuestProgress)
    .where(eq(dailyQuestProgress.userId, params.userId));

  const progressMap = new Map(progressRows.map((r) => [r.category, r]));

  const statements = relevantQuests.map((quest) => {
    const delta = deltas[quest.category] ?? 0;
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