import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { createResponse, validateSession, isDonator } from '../utils.js';
import type { LootboxPurchaseResponse, LootboxStatusResponse, LootboxReward, LootboxRarity } from '@zeitvertreib/types';

const LOOTBOX_COST = 100;

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
  { id: 'zvc_50', name: '50 ZVC', emoji: '🪙', rarity: 'common', zvcValue: 67, weight: 25 },
  { id: 'zvc_75', name: '75 ZVC', emoji: '💰', rarity: 'common', zvcValue: 67, weight: 20 },
  { id: 'zvc_100', name: '100 ZVC', emoji: '💵', rarity: 'common', zvcValue: 67, weight: 15 },
  // Uncommon (25% combined)
  { id: 'zvc_150', name: '150 ZVC', emoji: '💎', rarity: 'uncommon', zvcValue: 67, weight: 15 },
  { id: 'zvc_200', name: '200 ZVC', emoji: '🔷', rarity: 'uncommon', zvcValue: 67, weight: 10 },
  // Rare (10% combined)
  { id: 'zvc_350', name: '350 ZVC', emoji: '✨', rarity: 'rare', zvcValue: 67, weight: 6 },
  { id: 'zvc_500', name: '500 ZVC', emoji: '🌟', rarity: 'rare', zvcValue: 67, weight: 4 },
  // Epic (4% combined)
  { id: 'zvc_750', name: '750 ZVC', emoji: '🔥', rarity: 'epic', zvcValue: 67, weight: 3 },
  { id: 'zvc_1000', name: '1.000 ZVC', emoji: '💫', rarity: 'epic', zvcValue: 67, weight: 1 },
  // Legendary (1%)
  { id: 'zvc_2500', name: '2.500 ZVC', emoji: '🏆', rarity: 'legendary', zvcValue: 67, weight: 1 },
];

const TOTAL_WEIGHT = REWARD_POOL.reduce((sum, entry) => sum + entry.weight, 0);

function pickReward(): RewardDefinition {
  const roll = Math.random() * TOTAL_WEIGHT;
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
 * GET /lootbox
 * Returns the current lootbox status for the authenticated player,
 * including whether a free daily claim is available (donators only).
 */
export async function handleLootboxStatus(request: Request, env: Env): Promise<Response> {
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

  const [playerResult, userIsDonator] = await Promise.all([
    db
      .select({ lastFreeLootboxClaim: schema.playerdata.lastFreeLootboxClaim })
      .from(schema.playerdata)
      .where(eq(schema.playerdata.id, steamId)),
    isDonator(steamId, env),
  ]);

  if (playerResult.length === 0) {
    return createResponse({ error: 'Spieler nicht gefunden' }, 404, origin);
  }

  const todayUTC = Math.floor(Date.now() / 86400000);
  const lastClaim = playerResult[0]!.lastFreeLootboxClaim ?? 0;

  const response: LootboxStatusResponse = {
    isDonator: userIsDonator,
    freeLootboxAvailable: userIsDonator && lastClaim !== todayUTC,
  };

  return createResponse(response, 200, origin);
}

/**
 * POST /lootbox
 * Opens a lootbox for the authenticated player.
 * - Default: deducts LOOTBOX_COST ZVC from the player's balance.
 * - Free: if body contains { free: true }, donators may skip the cost once per UTC day.
 * The reward ZVC is added directly to the player's balance.
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

  let isFree = false;
  try {
    const body = (await request.json()) as { free?: boolean };
    isFree = body.free === true;
  } catch {
    // empty or invalid body — treat as a normal paid purchase
  }

  const [playerResult, userIsDonator] = await Promise.all([
    db
      .select({
        experience: schema.playerdata.experience,
        lastFreeLootboxClaim: schema.playerdata.lastFreeLootboxClaim,
      })
      .from(schema.playerdata)
      .where(eq(schema.playerdata.id, steamId)),
    isDonator(steamId, env),
  ]);

  if (playerResult.length === 0) {
    return createResponse({ error: 'Spieler nicht gefunden' }, 404, origin);
  }

  const currentBalance = playerResult[0]!.experience ?? 0;
  const todayUTC = Math.floor(Date.now() / 86400000);
  const lastClaim = playerResult[0]!.lastFreeLootboxClaim ?? 0;

  if (isFree) {
    if (!userIsDonator) {
      return createResponse({ error: 'Nur Unterstützer können täglich gratis eine Lootbox öffnen.' }, 403, origin);
    }
    if (lastClaim === todayUTC) {
      return createResponse({ error: 'Du hast deine tägliche Gratis-Lootbox bereits geöffnet.' }, 400, origin);
    }
  } else {
    if (currentBalance < LOOTBOX_COST) {
      return createResponse(
        {
          error: `Nicht genügend ZVC! Du hast ${currentBalance} ZVC, brauchst aber ${LOOTBOX_COST} ZVC.`,
        },
        400,
        origin,
      );
    }
  }

  const pickedDefinition = pickReward();
  const reward: LootboxReward = {
    id: pickedDefinition.id,
    name: pickedDefinition.name,
    emoji: pickedDefinition.emoji,
    rarity: pickedDefinition.rarity,
    zvcValue: pickedDefinition.zvcValue,
  };

  let newBalance: number;
  if (isFree) {
    newBalance = currentBalance + reward.zvcValue;
    await db
      .update(schema.playerdata)
      .set({ experience: newBalance, lastFreeLootboxClaim: todayUTC })
      .where(eq(schema.playerdata.id, steamId));
  } else {
    newBalance = currentBalance - LOOTBOX_COST + reward.zvcValue;
    await db.update(schema.playerdata).set({ experience: newBalance }).where(eq(schema.playerdata.id, steamId));
  }

  // After a paid purchase, the free claim state is unchanged; after a free purchase it's consumed for today
  const freeLootboxAvailable = isFree ? false : userIsDonator && lastClaim !== todayUTC;

  console.log(
    `🎁 Lootbox: ${steamId} ${isFree ? '(GRATIS)' : `paid ${LOOTBOX_COST} ZVC`}, won "${reward.name}" (${reward.rarity}, ${reward.zvcValue} ZVC). Balance: ${currentBalance} → ${newBalance}`,
  );

  const response: LootboxPurchaseResponse = {
    success: true,
    message: `Du hast "${reward.name}" gewonnen!`,
    reward,
    newBalance,
    freeLootboxAvailable,
  };

  return createResponse(response, 200, origin);
}
