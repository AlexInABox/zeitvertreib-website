import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';

// Payout table configuration - shared between endpoints
const SLOT_COST = 10;
const PAYOUT_TABLE = [
  {
    symbol: '💎',
    name: 'Diamant',
    condition: '3 Gleiche',
    payout: 1000,
    tier: 'jackpot',
    description: 'JACKPOT!',
  },
  {
    symbol: '🔥',
    name: 'Feuer',
    condition: '3 Gleiche',
    payout: 500,
    tier: 'big_win',
    description: 'GROSSER GEWINN!',
  },
  {
    symbol: '🍒',
    name: 'Kirsche',
    condition: '3 Gleiche',
    payout: 100,
    tier: 'small_win',
    description: 'KLEINER GEWINN!',
  },
  {
    symbol: '🍒',
    name: 'Kirsche',
    condition: '2 Gleiche',
    payout: 50,
    tier: 'mini_win',
    description: 'MINI GEWINN!',
  },
  {
    symbol: '⭐🌟💫',
    name: 'Andere',
    condition: '3 Gleiche',
    payout: 50,
    tier: 'small_win',
    description: 'Crazy 3!!!',
  },
];

const SLOT_EMOJIS = [
  '🍒',
  '🍋',
  '🍉',
  '🍇',
  '🔔',
  '⭐',
  '💎',
  '🌈',
  '🔥',
  '🪙',
  '💰',
  '💫',
  '🎇',
  '🌟',
  '🥭',
  '🍍',
];

/**
 * GET /slotmachine/info
 * Get slot machine payout table and information
 */
export async function handleSlotMachineInfo(
  request: Request,
  _db: ReturnType<typeof drizzle>,
  _env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  return createResponse(
    {
      cost: SLOT_COST,
      payoutTable: PAYOUT_TABLE,
      symbols: SLOT_EMOJIS,
      description: 'Drehe die Slotmaschine für eine Chance auf große Gewinne!',
    },
    200,
    origin,
  );
}

/**
 * POST /slotmachine
 * Play the slot machine game - costs 10 ZVC, chance to win big!
 */
export async function handleSlotMachine(
  request: Request,
  _db: ReturnType<typeof drizzle>,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const validation = await validateSession(request, env);
  if (!validation.isValid) {
    return createResponse({ error: validation.error }, 401, origin);
  }

  const playerId = `${validation.session!.steamId}@steam`;

  // Calculate payout based on the slot results
  function calculatePayout(slot1: string, slot2: string, slot3: string): {
    payout: number;
    type: 'jackpot' | 'big_win' | 'small_win' | 'mini_win' | 'loss';
    message: string;
  } {
    // Check for 3 matching symbols
    if (slot1 === slot2 && slot2 === slot3) {
      if (slot1 === '💎') {
        return { payout: 1000, type: 'jackpot', message: '💎 JACKPOT! 💎' };
      } else if (slot1 === '🔥') {
        return {
          payout: 500,
          type: 'big_win',
          message: '🔥 GROSSER GEWINN! 🔥',
        };
      } else if (slot1 === '🍒') {
        return {
          payout: 100,
          type: 'small_win',
          message: '🍒 KLEINER GEWINN! 🍒',
        };
      } else {
        // Other 3-of-a-kind matches - small consolation prize
        return {
          payout: 50,
          type: 'small_win',
          message: '✨ 3 Gleiche! ✨',
        };
      }
    }

    // Check for 2 🍒 (mini win)
    const cherryCount = [slot1, slot2, slot3].filter((s) => s === '🍒').length;
    if (cherryCount === 2) {
      return {
        payout: 50,
        type: 'mini_win',
        message: '🍒 MINI GEWINN! 🍒',
      };
    }

    // No win
    return { payout: 0, type: 'loss', message: 'Viel Glück beim nächsten Mal!' };
  }

  try {
    // Get current balance
    const balanceResult = (await env['zeitvertreib-data']
      .prepare('SELECT experience FROM playerdata WHERE id = ?')
      .bind(playerId)
      .first()) as { experience: number } | null;

    const currentBalance = balanceResult?.experience || 0;

    // Check if player has enough ZVC (using experience as ZVC)
    if (currentBalance < SLOT_COST) {
      return createResponse(
        {
          error: 'Nicht genügend ZVC',
          required: SLOT_COST,
          current: currentBalance,
        },
        400,
        origin,
      );
    }

    // Generate three random emojis
    const slot1 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)]!;
    const slot2 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)]!;
    const slot3 = SLOT_EMOJIS[Math.floor(Math.random() * SLOT_EMOJIS.length)]!;

    // Calculate payout
    const result = calculatePayout(slot1, slot2, slot3);
    const netChange = result.payout - SLOT_COST;
    const newBalance = currentBalance + netChange;

    // Update player balance (using experience field as ZVC)
    await env['zeitvertreib-data']
      .prepare('UPDATE playerdata SET experience = ? WHERE id = ?')
      .bind(newBalance, playerId)
      .run();

    console.log(
      `🎰 Slot machine: ${validation.session!.steamId} ${result.type} with ${slot1}${slot2}${slot3}. Payout: ${result.payout} ZVC. Balance: ${currentBalance} → ${newBalance}`,
    );

    return createResponse(
      {
        result: [slot1, slot2, slot3],
        emojis: SLOT_EMOJIS,
        winType: result.type,
        payout: result.payout,
        netChange: netChange,
        message: result.message,
        payoutTable: PAYOUT_TABLE,
        cost: SLOT_COST,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error in slot machine:', error);
    return createResponse({ error: 'Interner Serverfehler' }, 500, origin);
  }
}
