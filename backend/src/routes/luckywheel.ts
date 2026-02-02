import { validateSession, createResponse, increment, fetchSteamUserData } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';

import { playerdata } from '../db/schema.js';

// Lucky Wheel configuration - easily modifiable
const MIN_BET = 1;
const MAX_BET = 500;

// Payout multipliers and their weights
const LUCKYWHEEL_TABLE = [
  { multiplier: 0, weight: 1 },
  { multiplier: 0.3, weight: 6 },
  { multiplier: 0.7, weight: 5 },
  { multiplier: 1.2, weight: 4 },
  { multiplier: 2, weight: 2 },
  { multiplier: 4, weight: 1 },
];

/**
 * Send lucky wheel mega win to Discord webhook
 */
async function sendLuckyWheelMegaWinToDiscord(
  steamId: string,
  username: string,
  betAmount: number,
  multiplier: number,
  payout: number,
  env: Env,
): Promise<void> {
  try {
    const embed = {
      title: '🎡 Lucky Wheel MEGA WIN!',
      color: 0xff00ff, // Magenta
      fields: [
        {
          name: 'Spieler',
          value: username,
          inline: true,
        },
        {
          name: 'Einsatz',
          value: `${betAmount} ZVC`,
          inline: true,
        },
        {
          name: 'Multiplikator',
          value: `${multiplier}x`,
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

    // Simulate spin time 10 seconds
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

    console.log(`✅ Sent ${multiplier}x mega win notification to Discord for ${steamId}`);
  } catch (error) {
    console.error('Error sending lucky wheel win to Discord webhook:', error);
  }
}

/**
 * GET /luckywheel/info
 * Get lucky wheel payout table and information
 */
export async function handleLuckyWheelInfo(request: Request, _env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  return createResponse(
    {
      minBet: MIN_BET,
      maxBet: MAX_BET,
      payoutTable: LUCKYWHEEL_TABLE,
      description: 'Drehe das Glücksrad für variable Gewinne!',
    },
    200,
    origin,
  );
}

/**
 * POST /luckywheel
 * Play lucky wheel - bet between 1-500 ZVC for a chance to multiply your bet!
 */
export async function handleLuckyWheel(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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

  // Parse request body for bet amount
  let betAmount: number;
  try {
    const body = (await request.json()) as { bet: number };
    betAmount = parseInt(String(body.bet));

    if (isNaN(betAmount) || betAmount < MIN_BET || betAmount > MAX_BET || !Number.isInteger(betAmount)) {
      return createResponse(
        {
          error: `Ungültiger Einsatz. Muss zwischen ${MIN_BET} und ${MAX_BET} ZVC liegen.`,
          minBet: MIN_BET,
          maxBet: MAX_BET,
        },
        400,
        origin,
      );
    }
  } catch (error) {
    return createResponse(
      {
        error: 'Ungültige Anfrage. Einsatz erforderlich.',
        example: { bet: 100 },
      },
      400,
      origin,
    );
  }

  try {
    // Get current balance
    const balanceResult = (await env.ZEITVERTREIB_DATA.prepare('SELECT experience FROM playerdata WHERE id = ?')
      .bind(playerId)
      .first()) as { experience: number } | null;

    const currentBalance = balanceResult?.experience || 0;

    // Check if player has enough ZVC
    if (currentBalance < betAmount) {
      return createResponse(
        {
          error: 'Nicht genügend ZVC',
          required: betAmount,
          current: currentBalance,
        },
        400,
        origin,
      );
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Weighted random selection using crypto.getRandomValues
    const totalWeight = LUCKYWHEEL_TABLE.reduce((sum, entry) => sum + entry.weight, 0);

    const randomBuffer = new Uint32Array(1);
    crypto.getRandomValues(randomBuffer);
    let random = (randomBuffer[0]! / 0xffffffff) * totalWeight;

    let selectedEntry = LUCKYWHEEL_TABLE[0]!;
    for (const entry of LUCKYWHEEL_TABLE) {
      random -= entry.weight;
      if (random <= 0) {
        selectedEntry = entry;
        break;
      }
    }

    // Calculate payout
    const payout = Math.floor(betAmount * selectedEntry.multiplier);
    const netChange = payout - betAmount;
    const newBalance = currentBalance + netChange;

    // Update player balance and stats
    await db
      .update(playerdata)
      .set({
        experience: increment(playerdata.experience, netChange),
        luckyWheelSpins: increment(playerdata.luckyWheelSpins, 1),
        luckyWheelWins: increment(playerdata.luckyWheelWins, payout),
        luckyWheelLosses: increment(playerdata.luckyWheelLosses, betAmount),
      })
      .where(eq(playerdata.id, playerId))
      .run();

    // Send webhook notification for the highest multiplier only (if bet >= 100)
    const maxMultiplier = Math.max(...LUCKYWHEEL_TABLE.map((entry) => entry.multiplier));
    if (selectedEntry.multiplier >= maxMultiplier && maxMultiplier > 0 && betAmount >= 100) {
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
          sendLuckyWheelMegaWinToDiscord(
            validation.steamId!,
            steamNickname,
            betAmount,
            selectedEntry.multiplier,
            payout,
            env,
          ).catch((error) => console.error('Failed to send webhook notification:', error)),
        );
      }
    }

    console.log(
      `🎰 Lucky Wheel: ${validation.steamId} bet ${betAmount} ZVC, got ${selectedEntry.multiplier
      }x (${payout} ZVC). Balance: ${currentBalance} → ${newBalance}`,
    );

    return createResponse(
      {
        multiplier: selectedEntry.multiplier,
        betAmount: betAmount,
        payout: payout,
        netChange: netChange,
        message:
          payout > 0 ? `${selectedEntry.multiplier}x - ${payout} ZVC gewonnen!` : 'Viel Glück beim nächsten Mal!',
        payoutTable: LUCKYWHEEL_TABLE,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error in lucky wheel:', error);
    return createResponse({ error: 'Interner Serverfehler' }, 500, origin);
  }
}
