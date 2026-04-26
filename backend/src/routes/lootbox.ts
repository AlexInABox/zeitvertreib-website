import { drizzle } from 'drizzle-orm/d1';
import { and, eq, gte, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { createResponse, validateSession } from '../utils.js';
import typia from 'typia';
import type { LootboxPurchaseResponse, LootboxPurchaseRequest, LootboxInfoResponse, LootboxReward, LootboxRarity } from '@zeitvertreib/types';

const LOOTBOX_COST = 100;
const VOUCHER_MAX = 3;

interface RewardDefinition {
  id: string;
  name: string;
  emoji: string;
  rarity: LootboxRarity;
  zvcValue: number;
  weight: number;
  isVoucher?: boolean;
}

// Expected value: ~57.5 ZVC per 100 ZVC spent (~57.5% return rate)
// Win rate (>100 ZVC back or voucher): ~12.6% — win:lose ratio well below 1
// Voucher: ~2.9% chance (weight 30 / 1030); if player is at cap, re-picks from non-voucher pool
const REWARD_POOL: RewardDefinition[] = [
  { id: 'zvc_10', name: '10 ZVC', emoji: '🪙', rarity: 'common', zvcValue: 10, weight: 400 },
  { id: 'zvc_20', name: '20 ZVC', emoji: '💰', rarity: 'common', zvcValue: 20, weight: 250 },
  { id: 'zvc_30', name: '30 ZVC', emoji: '💵', rarity: 'common', zvcValue: 30, weight: 120 },
  { id: 'zvc_55', name: '55 ZVC', emoji: '💎', rarity: 'uncommon', zvcValue: 55, weight: 80 },
  { id: 'zvc_75', name: '75 ZVC', emoji: '🔷', rarity: 'uncommon', zvcValue: 75, weight: 50 },
  { id: 'zvc_120', name: '120 ZVC', emoji: '✨', rarity: 'rare', zvcValue: 120, weight: 50 },
  { id: 'zvc_200', name: '200 ZVC', emoji: '🌟', rarity: 'rare', zvcValue: 200, weight: 20 },
  { id: 'zvc_500', name: '500 ZVC', emoji: '🔥', rarity: 'epic', zvcValue: 500, weight: 20 },
  { id: 'zvc_1000', name: '1.000 ZVC', emoji: '💫', rarity: 'epic', zvcValue: 1000, weight: 6 },
  { id: 'voucher', name: 'Gratis-Lootbox', emoji: '🎟️', rarity: 'epic', zvcValue: 0, weight: 30, isVoucher: true },
  { id: 'zvc_2500', name: '2.500 ZVC', emoji: '🏆', rarity: 'legendary', zvcValue: 2500, weight: 3 },
  { id: 'zvc_5000', name: '5.000 ZVC', emoji: '🌈', rarity: 'legendary', zvcValue: 5000, weight: 1 },
];

const NON_VOUCHER_POOL = REWARD_POOL.filter((e) => !e.isVoucher);

const TOTAL_WEIGHT = REWARD_POOL.reduce((sum, entry) => sum + entry.weight, 0);
const NON_VOUCHER_TOTAL_WEIGHT = NON_VOUCHER_POOL.reduce((sum, entry) => sum + entry.weight, 0);

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

function pickReward(excludeVoucher = false): RewardDefinition {
  const pool = excludeVoucher ? NON_VOUCHER_POOL : REWARD_POOL;
  const total = excludeVoucher ? NON_VOUCHER_TOTAL_WEIGHT : TOTAL_WEIGHT;
  const roll = getSecureRandomInt(total);
  let accumulated = 0;
  for (const entry of pool) {
    accumulated += entry.weight;
    if (roll < accumulated) {
      return entry;
    }
  }
  return pool[0]!;
}

export async function handleLootboxInfo(request: Request, env: Env): Promise<Response> {
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
    .select({ lootboxVouchers: schema.playerdata.lootboxVouchers })
    .from(schema.playerdata)
    .where(eq(schema.playerdata.id, steamId));

  if (playerResult.length === 0) {
    return createResponse({ error: 'Spieler nicht gefunden' }, 404, origin);
  }

  const voucherCount = playerResult[0]!.lootboxVouchers;
  const response: LootboxInfoResponse = { voucherCount };
  return createResponse(response, 200, origin);
}

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

  let useVoucher = false;
  try {
    const parsed = await request.json();
    if (!typia.is<LootboxPurchaseRequest>(parsed)) {
      return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
    }
    useVoucher = parsed.useVoucher === true;
  } catch {
    // empty body / JSON parse error — defaults to paid spin
  }

  const playerResult = await db
    .select({ experience: schema.playerdata.experience, lootboxVouchers: schema.playerdata.lootboxVouchers })
    .from(schema.playerdata)
    .where(eq(schema.playerdata.id, steamId));

  if (playerResult.length === 0) {
    return createResponse({ error: 'Spieler nicht gefunden' }, 404, origin);
  }

  const currentBalance = playerResult[0]!.experience ?? 0;
  const currentVouchers = playerResult[0]!.lootboxVouchers;

  if (useVoucher) {
    if (currentVouchers < 1) {
      return createResponse({ error: 'Kein Gutschein vorhanden!' }, 400, origin);
    }
  } else {
    if (currentBalance < LOOTBOX_COST) {
      return createResponse(
        { error: `Nicht genügend ZVC! Du hast ${currentBalance} ZVC, brauchst aber ${LOOTBOX_COST} ZVC.` },
        400,
        origin,
      );
    }
  }

  // Pick a reward; if the player is at the voucher cap after this transaction, exclude vouchers
  const atVoucherCap = (currentVouchers - (useVoucher ? 1 : 0)) >= VOUCHER_MAX;
  const pickedDefinition = pickReward(atVoucherCap);

  const reward: LootboxReward = {
    id: pickedDefinition.id,
    name: pickedDefinition.name,
    emoji: pickedDefinition.emoji,
    rarity: pickedDefinition.rarity,
    zvcValue: pickedDefinition.zvcValue,
    isVoucher: pickedDefinition.isVoucher,
  };

  const zvcCost = useVoucher ? 0 : LOOTBOX_COST;
  const voucherCost = useVoucher ? 1 : 0;
  const voucherGain = reward.isVoucher ? 1 : 0;

  const updatedRows = await db
    .update(schema.playerdata)
    .set({
      experience: sql`${schema.playerdata.experience} - ${zvcCost} + ${reward.zvcValue}`,
      lootboxVouchers: sql`${schema.playerdata.lootboxVouchers} - ${voucherCost} + ${voucherGain}`,
    })
    .where(
      useVoucher
        ? and(eq(schema.playerdata.id, steamId), gte(schema.playerdata.lootboxVouchers, 1))
        : and(eq(schema.playerdata.id, steamId), gte(schema.playerdata.experience, LOOTBOX_COST)),
    )
    .returning({ experience: schema.playerdata.experience, lootboxVouchers: schema.playerdata.lootboxVouchers });

  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    return createResponse(
      {
        error: useVoucher
          ? 'Kein Gutschein vorhanden!'
          : `Nicht genügend ZVC! Du hast ${currentBalance} ZVC, brauchst aber ${LOOTBOX_COST} ZVC.`,
      },
      400,
      origin,
    );
  }

  const newBalance = updatedRows[0]!.experience ?? 0;
  const newVoucherCount = updatedRows[0]!.lootboxVouchers;

  console.log(
    `🎁 Lootbox: ${steamId} ${useVoucher ? 'used voucher' : `paid ${LOOTBOX_COST} ZVC`}, won "${reward.name}" (${reward.rarity}${reward.isVoucher ? ', VOUCHER' : `, ${reward.zvcValue} ZVC`}). Balance: ${currentBalance} → ${newBalance}, Vouchers: ${currentVouchers} → ${newVoucherCount}`,
  );

  const message = reward.isVoucher
    ? `🎟️ Glückwunsch! Du hast einen Gratis-Lootbox-Gutschein gewonnen!`
    : `Du hast "${reward.name}" gewonnen!`;

  const response: LootboxPurchaseResponse = {
    success: true,
    message,
    reward,
    newBalance,
    newVoucherCount,
  };

  return createResponse(response, 200, origin);
}
