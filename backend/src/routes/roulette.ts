import { validateSession, createResponse, increment } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';

import { playerdata } from '../db/schema.js';

const MIN_BET = 1;
const MAX_BET = 500;
const ROULETTE_NUMBERS = Array.from({ length: 37 }, (_, i) => i);

function isRed(number: number): boolean {
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(number);
}

type BetType = 'red' | 'black' | 'odd' | 'even' | 'number' | '1to18' | '19to36';

interface BetOutcome {
  won: boolean;
  multiplier: number;
}

function checkBetOutcome(betType: BetType, betValue: string | number, spinResult: number): BetOutcome {
  switch (betType) {
    case 'red': {
      const won = isRed(spinResult) && spinResult !== 0;
      return { won, multiplier: 2 };
    }
    case 'black': {
      const won = !isRed(spinResult) && spinResult !== 0;
      return { won, multiplier: 2 };
    }
    case 'odd': {
      const won = spinResult % 2 === 1;
      return { won, multiplier: 2 };
    }
    case 'even': {
      const won = spinResult % 2 === 0 && spinResult !== 0;
      return { won, multiplier: 2 };
    }
    case '1to18': {
      const won = spinResult >= 1 && spinResult <= 18;
      return { won, multiplier: 2 };
    }
    case '19to36': {
      const won = spinResult >= 19 && spinResult <= 36;
      return { won, multiplier: 2 };
    }
    case 'number': {
      const won = spinResult === Number(betValue);
      return { won, multiplier: 36 };
    }
    default:
      return { won: false, multiplier: 0 };
  }
}

//discord webhook implementation (?) please verify, Alex
async function sendRouletteWinToDiscord(
  steamId: string,
  username: string,
  betAmount: number,
  betType: BetType,
  betValue: string | number,
  spinResult: number,
  payout: number,
  env: Env,
): Promise<void> {
  try {
    const betDescription = betType === 'number' ? `Nummer ${betValue}` : betType;

    const embed = {
      title: '🎡 Roulette Gewinn!',
      color: 0x00ff00,
      fields: [
        {
          name: 'Spieler',
          value: username,
          inline: true,
        },
        {
          name: 'Einsatz',
          value: betDescription,
          inline: true,
        },
        {
          name: 'Ergebnis',
          value: spinResult === 0 ? '0 (Grün)' : `${spinResult} (${isRed(spinResult) ? 'Rot' : 'Schwarz'})`,
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

  return createResponse(
    {
      minBet: MIN_BET,
      maxBet: MAX_BET,
      betTypes: {
        red: { description: 'Rot (2:1)', multiplier: 2 },
        black: { description: 'Schwarz (2:1)', multiplier: 2 },
        odd: { description: 'Ungerade (2:1)', multiplier: 2 },
        even: { description: 'Gerade (2:1)', multiplier: 2 },
        '1to18': { description: '1-18 (2:1)', multiplier: 2 },
        '19to36': { description: '19-36 (2:1)', multiplier: 2 },
        number: { description: 'Spezifische Nummer (36:1)', multiplier: 36 },
      },
      numbers: ROULETTE_NUMBERS,
      description: 'lets go gambling!',
    },
    200,
    origin,
  );
}

//post-roulette
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

  let betAmount: number;
  let betType: BetType;
  let betValue: string | number = '';

  try {
    const body = (await request.json()) as { bet: number; type: BetType; value?: string | number };
    betAmount = parseInt(String(body.bet));
    betType = body.type;
    betValue = body.value || '';

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

    const validBetTypes = ['red', 'black', 'odd', 'even', 'number', '1to18', '19to36'];
    if (!validBetTypes.includes(betType)) {
      return createResponse(
        {
          error: 'Ungültige Wettart.',
          validTypes: validBetTypes,
        },
        400,
        origin,
      );
    }

    if (betType === 'number') {
      const numberValue = parseInt(String(betValue));
      if (isNaN(numberValue) || numberValue < 0 || numberValue > 36) {
        return createResponse(
          {
            error: 'Ungültige Nummer. Muss zwischen 0 und 36 liegen.',
          },
          400,
          origin,
        );
      }
    }
  } catch (error) {
    return createResponse(
      {
        error: 'Ungültige Anfrage.',
        example: { bet: 100, type: 'red' },
      },
      400,
      origin,
    );
  }

  try {
    const db = drizzle(env.ZEITVERTREIB_DATA);

    //get balance, I have no idea what claude did here but I wont question it
    const playerRecord = await db
      .select({ experience: playerdata.experience })
      .from(playerdata)
      .where(eq(playerdata.id, playerId))
      .get();

    const currentBalance = playerRecord?.experience || 0;

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

    //RNG 0-36
    const randomBuffer = new Uint32Array(1);
    crypto.getRandomValues(randomBuffer);
    const spinResult = randomBuffer[0]! % 37; // 0-36

    //check win
    const betOutcome = checkBetOutcome(betType, betValue, spinResult);

    // Debug logging
    console.log(
      `Roulette debug: spinResult=${spinResult}, betType=${betType}, betValue=${betValue}, won=${betOutcome.won}, color=${spinResult === 0 ? 'green' : isRed(spinResult) ? 'red' : 'black'}`,
    );

    //payout calculation
    const payout = betOutcome.won ? betAmount * betOutcome.multiplier : 0;
    const netChange = payout - betAmount;
    const newBalance = currentBalance + netChange;

    // Update player balance and stats
    await db
      .update(playerdata)
      .set({
        experience: increment(playerdata.experience, netChange),
      })
      .where(eq(playerdata.id, playerId))
      .run();

    // Send webhook notification for big wins (Alex please verify)
    if (betOutcome.won && betType === 'number' && betAmount >= 50) {
      // Get Steam username from cache
      let steamNickname = validation.steamId!;
      if (ctx) {
        const steamUser = await fetchSteamUserData(validation.steamId!, env, ctx);
        if (steamUser) {
          steamNickname = steamUser.username;
        }
      }

      if (ctx) {
        ctx.waitUntil(
          sendRouletteWinToDiscord(
            playerId,
            steamNickname,
            betAmount,
            betType,
            betValue,
            spinResult,
            payout,
            env,
          ).catch((error) => console.error('Failed to send webhook notification:', error)),
        );
      }
    }

    console.log(
      `🎡 Roulette: ${playerId} bet ${betAmount} ZVC on ${betType}${betType === 'number' ? ` (${betValue})` : ''}, spun ${spinResult}, ${
        betOutcome.won ? `won ${payout} ZVC` : 'lost'
      }. Balance: ${currentBalance} → ${newBalance}`,
    );

    return createResponse(
      {
        spinResult: spinResult,
        color: spinResult === 0 ? 'green' : isRed(spinResult) ? 'red' : 'black',
        betType: betType,
        betAmount: betAmount,
        won: betOutcome.won,
        payout: payout,
        netChange: netChange,
        newBalance: newBalance,
        message: betOutcome.won
          ? `Glück gehabt! ${payout} ZVC gewonnen!`
          : `Pech gehabt! Die Kugel ist auf ${spinResult} gelandet.`,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error in roulette:', error);
    return createResponse({ error: 'Interner Serverfehler' }, 500, origin);
  }
}
