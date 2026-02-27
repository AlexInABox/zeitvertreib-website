import { questDefinitions, questCompletion, playerdata } from '../db/schema.js';
import { validateSession, getPlayerData, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import typia from 'typia';
import type {
  GetQuestsTodayResponse,
  ClaimQuestRewardRequest,
  ClaimQuestRewardResponse,
  DailyQuestProgress,
} from '@zeitvertreib/types';

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

    // Get all active quest definitions
    const allQuests = await db.select().from(questDefinitions).where(eq(questDefinitions.isActive, 1));

    if (allQuests.length < 3) {
      return createResponse({ error: 'Not enough active quests available' }, 500, origin);
    }

    // Generate 3 pseudo-random quests based on date (same quests for all players each day)
    const seed = hashDate(todayDate);
    const selectedQuestIds = getRandomQuestIds(seed, allQuests, 3);
    const selectedQuests = selectedQuestIds.map((idValue) => allQuests.find((q) => q.id === idValue)!);

    // Get player data to calculate progress
    const playerDataRecord = await getPlayerData(sessionResult.steamId, db, env);

    if (!playerDataRecord) {
      return createResponse({ error: 'Player data not found' }, 404, origin);
    }

    // Get quest completion status
    const completions = await db
      .select()
      .from(questCompletion)
      .where(and(eq(questCompletion.userId, sessionResult.steamId), eq(questCompletion.date, todayDate)));

    const completionMap = new Map(completions.map((c) => [c.questId, c]));

    // Build quest progress objects and auto-create completion records
    const questsProgress: DailyQuestProgress[] = [];

    for (const quest of selectedQuests) {
      let currentProgress = 0;

      // Calculate current progress based on quest type
      switch (quest.questType) {
        case 'medipacks':
          currentProgress = playerDataRecord.usedmedkits || 0;
          break;
        case 'colas':
          currentProgress = playerDataRecord.usedcolas || 0;
          break;
        case 'playtime':
          currentProgress = playerDataRecord.playtime || 0;
          break;
        case 'kills':
          currentProgress = playerDataRecord.killcount || 0;
          break;
        case 'rounds':
          currentProgress = playerDataRecord.roundsplayed || 0;
          break;
        case 'pocketescapes':
          currentProgress = playerDataRecord.pocketescapes || 0;
          break;
        case 'adrenaline':
          currentProgress = playerDataRecord.usedadrenaline || 0;
          break;
      }

      let existingCompletion = completionMap.get(quest.id);

      // Create completion record on first fetch if it doesn't exist
      if (!existingCompletion) {
        const created = await db
          .insert(questCompletion)
          .values({
            userId: sessionResult.steamId,
            questId: quest.id,
            date: todayDate,
            completedAt: 0,
            baselineValue: currentProgress,
            rewardClaimed: 0,
          })
          .returning();

        existingCompletion = created[0];
      }

      let isCompleted = existingCompletion ? existingCompletion.completedAt > 0 : false;
      const isClaimed = existingCompletion ? existingCompletion.rewardClaimed === 1 : false;

      // Get baseline for incremental progress calculation
      const baseline = existingCompletion?.baselineValue ?? 0;
      const incrementalProgress = currentProgress - baseline;

      // Check if quest should be marked as completed
      if (!isCompleted && incrementalProgress >= quest.targetValue) {
        await db
          .update(questCompletion)
          .set({ completedAt: Math.floor(Date.now() / 1000) })
          .where(
            and(
              eq(questCompletion.userId, sessionResult.steamId),
              eq(questCompletion.questId, quest.id),
              eq(questCompletion.date, todayDate),
            ),
          );
        isCompleted = true;
      }

      questsProgress.push({
        id: quest.id,
        questId: quest.id,
        questType: quest.questType as DailyQuestProgress['questType'],
        description: quest.description,
        targetValue: quest.targetValue,
        currentProgress: incrementalProgress,
        coinReward: quest.coinReward,
        isCompleted,
        isClaimed,
      });
    }

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

    const questId = body.questId;

    // Verify the quest is one of today's daily quests
    const allQuests = await db.select().from(questDefinitions).where(eq(questDefinitions.isActive, 1));
    const seed = hashDate(todayDate);
    const todaysQuestIds = getRandomQuestIds(seed, allQuests, 3);

    if (!todaysQuestIds.includes(body.questId)) {
      return createResponse({ error: 'Quest is not available today' }, 400, origin);
    }

    // Get the quest definition
    const questDef = allQuests.find((q) => q.id === body.questId);
    if (!questDef) {
      return createResponse({ error: 'Quest not found' }, 404, origin);
    }

    // Check if quest completion exists and is not yet claimed
    const completionResults = await db
      .select()
      .from(questCompletion)
      .where(
        and(
          eq(questCompletion.userId, sessionResult.steamId),
          eq(questCompletion.questId, body.questId),
          eq(questCompletion.date, todayDate),
        ),
      )
      .limit(1);

    if (completionResults.length === 0) {
      return createResponse({ error: 'Quest not completed' }, 400, origin);
    }

    const completion = completionResults[0];
    if (!completion) {
      return createResponse({ error: 'Quest not completed' }, 400, origin);
    }

    if (completion.rewardClaimed === 1) {
      return createResponse({ error: 'Reward already claimed' }, 400, origin);
    }

    // Check if quest is actually completed
    const playerData = await getPlayerData(sessionResult.steamId, db, env);

    if (!playerData) {
      return createResponse({ error: 'Player data not found' }, 404, origin);
    }

    // Get baseline value to calculate incremental progress
    const baseline = completion.baselineValue || 0;
    let isActuallyCompleted = false;

    switch (questDef.questType) {
      case 'medipacks':
        isActuallyCompleted = (playerData.usedmedkits || 0) - baseline >= questDef.targetValue;
        break;
      case 'colas':
        isActuallyCompleted = (playerData.usedcolas || 0) - baseline >= questDef.targetValue;
        break;
      case 'playtime':
        isActuallyCompleted = (playerData.playtime || 0) - baseline >= questDef.targetValue;
        break;
      case 'kills':
        isActuallyCompleted = (playerData.killcount || 0) - baseline >= questDef.targetValue;
        break;
      case 'rounds':
        isActuallyCompleted = (playerData.roundsplayed || 0) - baseline >= questDef.targetValue;
        break;
      case 'pocketescapes':
        isActuallyCompleted = (playerData.pocketescapes || 0) - baseline >= questDef.targetValue;
        break;
      case 'adrenaline':
        isActuallyCompleted = (playerData.usedadrenaline || 0) - baseline >= questDef.targetValue;
        break;
    }

    if (!isActuallyCompleted) {
      return createResponse({ error: 'Quest requirements not met' }, 400, origin);
    }

    // Award ZV Coins (stored as experience) to player
    await db
      .update(playerdata)
      .set({
        experience: (playerData.experience || 0) + questDef.coinReward,
      })
      .where(eq(playerdata.id, sessionResult.steamId));

    // Mark reward as claimed
    await db.update(questCompletion).set({ rewardClaimed: 1 }).where(eq(questCompletion.id, completion.id));

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

function hashDate(dateString: string): number {
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function getRandomQuestIds(seed: number, quests: any[], count: number): number[] {
  const result: number[] = [];
  const available = [...quests];

  for (let i = 0; i < count && available.length > 0; i++) {
    const seedIter = seed + i * 12345;
    const index = seedIter % available.length;
    const selectedQuest = available[index];
    result.push(selectedQuest.id);

    const selectedType = selectedQuest.questType;
    for (let j = available.length - 1; j >= 0; j--) {
      if (available[j].questType === selectedType) {
        available.splice(j, 1);
      }
    }
  }

  return result;
}
