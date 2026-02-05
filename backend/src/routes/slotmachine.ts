import { validateSession, createResponse, increment, fetchSteamUserData } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';

import { playerdata } from '../db/schema.js';

// Payout table configuration - shared between endpoints
const SLOT_COST = 10;
const PAYOUT_TABLE = [
  {
    symbol: '💎',
    name: 'Diamant',
    condition: '3 Gleiche',
    payout: 5000,
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
    symbol: '❓',
    name: 'Andere',
    condition: '3 Gleiche',
    payout: 350,
    tier: 'small_win',
    description: 'Crazy 3!!!',
  },
  {
    symbol: '❓',
    name: 'Beliebig',
    condition: '2 Gleiche',
    payout: 25,
    tier: 'mini_win',
    description: 'Verrückter Zweier ^^',
  },
];

const SLOT_EMOJIS = ['🍒', '🍉', '🍇', '🔔', '⭐', '💎', '🌈', '🔥', '🪙', '💰', '💫', '🎇', '🌟'];

/**
 * Send slot machine win to Discord webhook
 */
async function sendWinToDiscord(
  steamId: string,
  username: string,
  slots: string[],
  payout: number,
  winType: string,
  env: Env,
): Promise<void> {
  try {
    // Determine embed color based on win type
    let color = 0x808080; // Default gray
    if (winType === 'jackpot')
      color = 0xff00ff; // Magenta for jackpot
    else if (winType === 'big_win')
      color = 0xff6600; // Orange for big win
    else if (winType === 'small_win')
      color = 0xffd700; // Gold for small win
    else if (winType === 'mini_win') color = 0x00ff00; // Green for mini win

    const embed = {
      title: '🎰 Slots Gewinn!',
      color: color,
      fields: [
        {
          name: 'Spieler',
          value: username,
          inline: true,
        },
        {
          name: 'Ergebnis',
          value: slots.join(' '),
          inline: true,
        },
        {
          name: 'Gewinn',
          value: `${payout} ZVC`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    const payload = {
      embeds: [embed],
    };

    //simulate spin time 10seconds
    await new Promise((resolve) => setTimeout(resolve, 10000));

    await proxyFetch(
      env.GAMBLING_WINS_WEBHOOK,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      env,
    );

    console.log(`✅ Sent ${winType} notification to Discord for ${steamId}`);
  } catch (error) {
    console.error('Error sending win to Discord webhook:', error);
  }
}

/**
 * GET /slotmachine/info
 * Get slot machine payout table and information
 */
export async function handleSlotMachineInfo(request: Request, _env: Env): Promise<Response> {
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
export async function handleSlotMachine(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  const playerId = validation.steamId!.endsWith('@steam') ? validation.steamId! : `${validation.steamId}@steam`;

  // Calculate payout based on the slot results
  function calculatePayout(
    slot1: string,
    slot2: string,
    slot3: string,
  ): {
    payout: number;
    type: 'jackpot' | 'big_win' | 'small_win' | 'mini_win' | 'loss';
    message: string;
  } {
    // Check for 3 matching symbols
    if (slot1 === slot2 && slot2 === slot3) {
      // Check for specific symbol matches in payout table
      const diamondPayout = PAYOUT_TABLE.find((p) => p.symbol === '💎' && p.condition === '3 Gleiche');
      if (slot1 === '💎' && diamondPayout) {
        return {
          payout: diamondPayout.payout,
          type: diamondPayout.tier as 'jackpot',
          message: `💎 ${diamondPayout.description} 💎`,
        };
      }

      const firePayout = PAYOUT_TABLE.find((p) => p.symbol === '🔥' && p.condition === '3 Gleiche');
      if (slot1 === '🔥' && firePayout) {
        return {
          payout: firePayout.payout,
          type: firePayout.tier as 'big_win',
          message: `🔥 ${firePayout.description} 🔥`,
        };
      }

      // Other 3-of-a-kind matches - use "Andere" payout from table
      const otherPayout = PAYOUT_TABLE.find((p) => p.name === 'Andere' && p.condition === '3 Gleiche');
      if (otherPayout) {
        return {
          payout: otherPayout.payout,
          type: otherPayout.tier as 'small_win',
          message: `✨ ${otherPayout.description} ✨`,
        };
      }
    }

    // Check for any 2 matching symbols (mini win)
    if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
      const miniPayout = PAYOUT_TABLE.find((p) => p.condition === '2 Gleiche');
      if (miniPayout) {
        return {
          payout: miniPayout.payout,
          type: miniPayout.tier as 'mini_win',
          message: `✨ ${miniPayout.description} ✨`,
        };
      }
    }

    // No win
    return {
      payout: 0,
      type: 'loss',
      message: 'Viel Glück beim nächsten Mal!',
    };
  }

  try {
    // Get current balance
    const balanceResult = (await env.ZEITVERTREIB_DATA.prepare('SELECT experience FROM playerdata WHERE id = ?')
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

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Helper function for cryptographically secure random number generation
    const getRandomIndex = (max: number): number => {
      const randomBuffer = new Uint32Array(1);
      crypto.getRandomValues(randomBuffer);
      return randomBuffer[0]! % max;
    };

    // Generate three random emojis
    let slot1 = SLOT_EMOJIS[getRandomIndex(SLOT_EMOJIS.length)]!;
    let slot2 = SLOT_EMOJIS[getRandomIndex(SLOT_EMOJIS.length)]!;
    let slot3 = SLOT_EMOJIS[getRandomIndex(SLOT_EMOJIS.length)]!;

    // Calculate payout
    const result = calculatePayout(slot1, slot2, slot3);
    const netChange = result.payout - SLOT_COST;
    const newBalance = currentBalance + netChange;

    // Update player balance (using experience field as ZVC)
    await env.ZEITVERTREIB_DATA.prepare('UPDATE playerdata SET experience = ? WHERE id = ?')
      .bind(newBalance, playerId)
      .run();

    // Send webhook notification for significant wins only (jackpot, big_win, small_win)
    if (result.type === 'jackpot' || result.type === 'big_win' || result.type === 'small_win') {
      // Get Steam username from database cache
      let steamNickname = validation.steamId!;
      if (ctx) {
        const steamUser = await fetchSteamUserData(validation.steamId!, env, ctx);
        if (steamUser) {
          steamNickname = steamUser.username;
        }
      }

      // Send to Discord webhook (non-blocking) using ctx.waitUntil
      if (ctx) {
        ctx.waitUntil(
          sendWinToDiscord(
            validation.steamId!,
            steamNickname,
            [slot1, slot2, slot3],
            result.payout,
            result.type,
            env,
          ).catch((error) => console.error('Failed to send webhook notification:', error)),
        );
      }
    }

    console.log(
      `🎰 Slot machine: ${validation.steamId} ${result.type} with ${slot1}${slot2}${slot3}. Payout: ${
        result.payout
      } ZVC. Balance: ${currentBalance} → ${newBalance}`,
    );

    // Increment slot spins count
    await db
      .update(playerdata)
      .set({ slotSpins: increment(playerdata.slotSpins) })
      .where(eq(playerdata.id, playerId))
      .run();

    // Increment wins/losses amount
    await db
      .update(playerdata)
      .set({ slotLosses: increment(playerdata.slotLosses, SLOT_COST) })
      .where(eq(playerdata.id, playerId))
      .run();
    await db
      .update(playerdata)
      .set({ slotWins: increment(playerdata.slotWins, result.payout) })
      .where(eq(playerdata.id, playerId))
      .run();

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
