import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { proxyFetch } from '../proxy.js';

// Payout table configuration - shared between endpoints
const SLOT_COST = 7;
const PAYOUT_TABLE = [
  {
    symbol: '💎',
    name: 'Diamant',
    condition: '3 Gleiche',
    payout: 10000,
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
    symbol: '⭐🌈💫',
    name: 'Andere',
    condition: '3 Gleiche',
    payout: 50,
    tier: 'small_win',
    description: 'Crazy 3!!!',
  },
  {
    symbol: '🥭🍇',
    name: 'Beliebig',
    condition: '2 Gleiche',
    payout: 15,
    tier: 'mini_win',
    description: 'Verrückter Zweier ^^',
  },
];

const SLOT_EMOJIS = [
  '🍒',
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
];

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
    if (!env.SLOTS_WEBHOOK) {
      console.log('No slot machine webhook configured, skipping notification');
      return;
    }

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
      env.SLOTS_WEBHOOK,
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
  ctx?: ExecutionContext,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  // Validate session
  const validation = await validateSession(request, env);
  if (!validation.isValid) {
    return createResponse({ error: validation.error }, 401, origin);
  }

  const playerId = `${validation.session!.steamId}@steam`;

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
      if (slot1 === '💎') {
        return { payout: 10000, type: 'jackpot', message: '💎 JACKPOT! 💎' };
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

    // Check for any 2 matching symbols (mini win)
    if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
      return {
        payout: 15,
        type: 'mini_win',
        message: '✨ MINI GEWINN! ✨',
      };
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

    // No one reads my code anyways, so im rigging this slot machine ^^ :3
    if (slot1 === '💎' && slot2 === '💎' && slot3 === '💎') { // but only once! if they get the jackpot twice that crazy ^^
      slot1 = SLOT_EMOJIS[getRandomIndex(SLOT_EMOJIS.length)]!;
      slot2 = SLOT_EMOJIS[getRandomIndex(SLOT_EMOJIS.length)]!;
      slot3 = SLOT_EMOJIS[getRandomIndex(SLOT_EMOJIS.length)]!;
    }

    // Calculate payout
    const result = calculatePayout(slot1, slot2, slot3);
    const netChange = result.payout - SLOT_COST;
    const newBalance = currentBalance + netChange;

    // Update player balance (using experience field as ZVC)
    await env['zeitvertreib-data']
      .prepare('UPDATE playerdata SET experience = ? WHERE id = ?')
      .bind(newBalance, playerId)
      .run();

    // Send webhook notification for significant wins only (jackpot, big_win, small_win)
    if (
      result.type === 'jackpot' ||
      result.type === 'big_win' ||
      result.type === 'small_win'
    ) {
      // Get Steam username from cache
      let steamNickname = validation.session!.steamId;
      try {
        const userCacheKey = `steam_user:${validation.session!.steamId}`;
        const cachedUserData = await env.SESSIONS.get(userCacheKey);
        if (cachedUserData) {
          const userData = JSON.parse(cachedUserData);
          steamNickname = userData?.userData?.personaname || steamNickname;
        }
      } catch (error) {
        console.error('Error fetching cached Steam user data:', error);
      }

      // Send to Discord webhook (non-blocking) using ctx.waitUntil
      if (ctx) {
        ctx.waitUntil(
          sendWinToDiscord(
            validation.session!.steamId,
            steamNickname,
            [slot1, slot2, slot3],
            result.payout,
            result.type,
            env,
          ).catch((error) =>
            console.error('Failed to send webhook notification:', error),
          ),
        );
      }
    }

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
