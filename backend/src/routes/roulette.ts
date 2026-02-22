import { validateSession, createResponse, increment, fetchSteamUserData, checkHasReducedLuck } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import typia from 'typia';

import { playerdata } from '../db/schema.js';

import {
  RouletteBetType,
  RouletteGetInfoResponse,
  RoulettePostRequest,
  RoulettePostResponse,
} from '@zeitvertreib/types';

const MIN_BET = 10;
const MAX_BET = 500;

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

interface BetOutcome {
  won: boolean;
  multiplier: number;
}
function checkBetOutcome(betType: RouletteBetType, spinResult: number, betValue?: number): BetOutcome {
  switch (betType) {
    case 'red': {
      return { won: RED_NUMBERS.includes(spinResult), multiplier: 2 };
    }
    case 'black': {
      return { won: BLACK_NUMBERS.includes(spinResult), multiplier: 2 };
    }
    case 'odd': {
      return { won: spinResult % 2 === 1, multiplier: 2 };
    }
    case 'even': {
      return { won: spinResult % 2 === 0 && spinResult !== 0, multiplier: 2 };
    }
    case '1to18': {
      return { won: spinResult >= 1 && spinResult <= 18, multiplier: 2 };
    }
    case '19to36': {
      return { won: spinResult >= 19 && spinResult <= 36, multiplier: 2 };
    }
    case 'number': {
      return { won: spinResult == betValue!, multiplier: 36 };
    }
  }
}

async function sendRouletteWinToDiscord(
  steamId: string,
  username: string,
  betAmount: number,
  betType: RouletteBetType,
  spinResult: number,
  payout: number,
  env: Env,
  betValue?: number,
): Promise<void> {
  try {
    const embed = {
      title: '🎡 Roulette Gewinn!',
      description: `${username} hat \`${payout} ZVC\` im Roulette gewonnen!`,
      color: 0x00ff00,
    };

    const payload = {
      embeds: [embed],
    };

    //spin delay
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

    console.log(`Sent roulette win notification to Discord for ${steamId}`);
  } catch (error) {
    console.error('Error sending roulette win to Discord webhook:', error);
  }
}

export async function handleRouletteInfo(request: Request, _env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  const response: RouletteGetInfoResponse = {
    minBet: MIN_BET,
    maxBet: MAX_BET,
  };

  return createResponse(response, 200, origin);
}

/** POST /roulette */
export async function handleRoulette(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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

  const body: RoulettePostRequest = await request.json();

  if (!typia.is<RoulettePostRequest>(body)) {
    return createResponse(
      {
        error: 'Ungültige Anfragedaten',
      },
      400,
      origin,
    );
  }
  if (body.bet < MIN_BET || body.bet > MAX_BET) {
    return createResponse(
      {
        error: `Einsatz muss zwischen ${MIN_BET} und ${MAX_BET} ZVC liegen`,
      },
      400,
      origin,
    );
  }
  if (
    (body.value !== undefined && (body.value < 1 || body.value > 36)) ||
    (body.type === 'number' && (body.value === undefined || body.value === null || body.value === 0))
  ) {
    return createResponse(
      {
        error: 'Ungültiger Zahlenwert für die Wette',
      },
      400,
      origin,
    );
  }

  try {
    const db = drizzle(env.ZEITVERTREIB_DATA);

    const playerRecord = await db
      .select({ experience: playerdata.experience })
      .from(playerdata)
      .where(eq(playerdata.id, playerId))
      .get();

    const currentBalance = playerRecord?.experience || 0;

    if (currentBalance < body.bet) {
      return createResponse(
        {
          error: 'Nicht genügend ZVC in deinem Account!',
        },
        400,
        origin,
      );
    }

    // Check if user has reduced luck
    const hasReducedLuck = await checkHasReducedLuck(playerId, env);

    if (hasReducedLuck) {
      console.log(`REDUCED LUCK: Forcing loss for ${playerId} in roulette (bet: ${body.type})`);
    }

    //"RNG" 0-36
    function biasedSpin(probZero = 0.1): number {
      // 10% bias for 0
      const randomBuffer = new Uint32Array(1);
      crypto.getRandomValues(randomBuffer);
      const r = randomBuffer[0]! / 2 ** 32;

      if (r < probZero) return 0;

      const scaled = (r - probZero) / (1 - probZero);
      return 1 + Math.floor(scaled * 36);
    }

    // Force losing spin for reduced luck users
    function forceLosingSpin(betType: RouletteBetType, betValue?: number): number {
      // Force a result that guarantees loss based on bet type
      switch (betType) {
        case 'red':
          return BLACK_NUMBERS[0]!; // Return first black number
        case 'black':
          return RED_NUMBERS[0]!; // Return first red number
        case 'odd':
          return 2; // Even number
        case 'even':
          return 1; // Odd number
        case '1to18':
          return 19; // Number in 19-36 range
        case '19to36':
          return 1; // Number in 1-18 range
        case 'number':
          // Return any number except the bet value
          return betValue === 1 ? 2 : 1;
        default:
          return 0;
      }
    }

    const spinResult = hasReducedLuck ? forceLosingSpin(body.type, body.value) : biasedSpin();

    //check win
    const betOutcome = checkBetOutcome(body.type, spinResult, body.value);

    // Debug logging
    console.log(
      `Roulette debug: spinResult=${spinResult}, betType=${body.type}, betValue=${body.value}, won=${betOutcome.won}, color=${spinResult === 0 ? 'green' : RED_NUMBERS.includes(spinResult) ? 'red' : 'black'}`,
    );

    //payout calculation
    const payout = betOutcome.won ? body.bet * betOutcome.multiplier : 0;
    const netChange = payout - body.bet;
    const newBalance = currentBalance + netChange;

    // Update player balance and stats
    await db
      .update(playerdata)
      .set({
        experience: increment(playerdata.experience, netChange),
        rouletteSpins: increment(playerdata.rouletteSpins, 1),
        rouletteWins: increment(playerdata.rouletteWins, payout),
        rouletteLosses: increment(playerdata.rouletteLosses, body.bet),
      })
      .where(eq(playerdata.id, playerId))
      .run();

    // Send webhook notification for big wins
    if (betOutcome.won && body.type === 'number' && body.bet >= 50) {
      let username = validation.steamId!;
      if (ctx) {
        const steamUser = await fetchSteamUserData(validation.steamId!, env, ctx);
        if (steamUser) {
          username = steamUser.username;
        }
      }

      if (ctx) {
        ctx.waitUntil(
          sendRouletteWinToDiscord(playerId, username, body.bet, body.type, spinResult, payout, env, body.value).catch(
            (error) => console.error('Failed to send webhook notification:', error),
          ),
        );
      }
    }

    console.log(
      `🎡 Roulette: ${playerId} bet ${body.bet} ZVC on ${body.type}${body.type === 'number' ? ` (${body.value})` : ''}, spun ${spinResult}, ${
        betOutcome.won ? `won ${payout} ZVC` : 'lost'
      }. Balance: ${currentBalance} → ${newBalance}`,
    );

    const response: RoulettePostResponse = {
      spinResult: spinResult,
      won: betOutcome.won,
      payout: payout,
    };

    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('Error in roulette:', error);
    return createResponse({ error: 'Interner Serverfehler' }, 500, origin);
  }
}
