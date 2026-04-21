import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm/sql';
import * as schema from '../db/schema.js';
import { createResponse, validateSession } from '../utils.js';
import type { LootboxPurchaseResponse, LootboxReward, LootboxRarity } from '@zeitvertreib/types';

const LOOTBOX_COST = 1;

interface RewardDefinition {
  id: string;
  name: string;
  emoji: string;
  rarity: LootboxRarity;
  zvcValue: number;
  weight: number;
}

const REWARD_POOL: RewardDefinition[] = [
  // Common (60% combined)
  { id: 'zvc_50', name: '1 ZVC', emoji: '🪙', rarity: 'common', zvcValue: 1, weight: 25 },
  { id: 'zvc_75', name: '1 ZVC', emoji: '💰', rarity: 'common', zvcValue: 1, weight: 20 },
  { id: 'zvc_100', name: '1 ZVC', emoji: '💵', rarity: 'common', zvcValue: 1, weight: 15 },
  // Uncommon (25% combined)
  { id: 'zvc_150', name: '1 ZVC', emoji: '💎', rarity: 'uncommon', zvcValue: 1, weight: 15 },
  { id: 'zvc_200', name: '1 ZVC', emoji: '🔷', rarity: 'uncommon', zvcValue: 1, weight: 10 },
  // Rare (10% combined)
  { id: 'zvc_350', name: '1 ZVC', emoji: '✨', rarity: 'rare', zvcValue: 1, weight: 6 },
  { id: 'zvc_500', name: '1 ZVC', emoji: '🌟', rarity: 'rare', zvcValue: 1, weight: 4 },
  // Epic (4% combined)
  { id: 'zvc_750', name: '1 ZVC', emoji: '🔥', rarity: 'epic', zvcValue: 1, weight: 3 },
  { id: 'zvc_1000', name: '1 ZVC', emoji: '💫', rarity: 'epic', zvcValue: 1, weight: 1 },
  // Legendary (1%)
  { id: 'zvc_2500', name: '1 ZVC', emoji: '🏆', rarity: 'legendary', zvcValue: 1, weight: 1 },
];

const TOTAL_WEIGHT = REWARD_POOL.reduce((sum, entry) => sum + entry.weight, 0);

function getSecureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) {
    throw new Error('maxExclusive must be greater than 0');
  }

  const randomValues = new Uint32Array(1);
  const maxUint32 = 0x100000000;
  const limit = maxUint32 - (maxUint32 % maxExclusive);

  while (true) {
    crypto.getRandomValues(randomValues);
    const randomValue = randomValues[0]!;
    if (randomValue < limit) {
      return randomValue % maxExclusive;
    }
  }
}

function pickReward(): RewardDefinition {
  const roll = getSecureRandomInt(TOTAL_WEIGHT);
  let accumulated = 0;
  for (const entry of REWARD_POOL) {
    accumulated += entry.weight;
    if (roll < accumulated) {
      return entry;
    }
  }
  return REWARD_POOL[0]!;
}

/**
 * POST /lootbox
 * Opens a lootbox for the authenticated player.
 * Deducts LOOTBOX_COST ZVC from the player's balance and awards a random reward.
 */
export async function handleLootboxPurchase(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const db = drizzle(env.ZEITVERTREIB_DATA);

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid') {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  const steamId = validation.steamId!.endsWith('@steam') ? validation.steamId! : `${validation.steamId!}@steam`;

  const playerResult = await db
    .select({ experience: schema.playerdata.experience })
    .from(schema.playerdata)
    .where(eq(schema.playerdata.id, steamId));

  if (playerResult.length === 0) {
    return createResponse({ error: 'Spieler nicht gefunden' }, 404, origin);
  }

  const currentBalance = playerResult[0]!.experience ?? 0;

  if (currentBalance < LOOTBOX_COST) {
    return createResponse(
      {
        error: `Nicht genügend ZVC! Du hast ${currentBalance} ZVC, brauchst aber ${LOOTBOX_COST} ZVC.`,
      },
      400,
      origin,
    );
  }

  const pickedDefinition = pickReward();
  const reward: LootboxReward = {
    id: pickedDefinition.id,
    name: pickedDefinition.name,
    emoji: pickedDefinition.emoji,
    rarity: pickedDefinition.rarity,
    zvcValue: pickedDefinition.zvcValue,
  };

  const updatedRows = await db
    .update(schema.playerdata)
    .set({
      experience: sql`${schema.playerdata.experience} - ${LOOTBOX_COST} + ${reward.zvcValue}`,
    })
    .where(sql`${schema.playerdata.id} = ${steamId} AND ${schema.playerdata.experience} >= ${LOOTBOX_COST}`)
    .returning({ experience: schema.playerdata.experience });

  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    return createResponse(
      {
        error: `Nicht genügend ZVC! Du hast ${currentBalance} ZVC, brauchst aber ${LOOTBOX_COST} ZVC.`,
      },
      400,
      origin,
    );
  }

  const newBalance = updatedRows[0]!.experience;

  console.log(
    `🎁 Lootbox: ${steamId} paid ${LOOTBOX_COST} ZVC, won "${reward.name}" (${reward.rarity}, ${reward.zvcValue} ZVC). Balance: ${currentBalance} → ${newBalance}`,
  );

  const response: LootboxPurchaseResponse = {
    success: true,
    message: `Du hast "${reward.name}" gewonnen!`,
    reward,
    newBalance,
  };

  return createResponse(response, 200, origin);
}
