import { validateSession, createResponse, increment, fetchSteamUserData } from '../utils.js';
import { proxyFetch } from '../proxy.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';

import { playerdata, chickenCrossGames } from '../db/schema.js';
import {
  ChickenCrossGetRequest,
  ChickenCrossGetResponse,
  ChickenCrossInfoResponse,
  ChickenCrossPostRequest,
  ChickenCrossPostResponse,
  ChickenCrossActiveResponse,
} from '@zeitvertreib/types';

const MIN_BET = 10;
const MAX_BET = 5000;

function seededRandom(seed: number, step: number): number {
  const combined = seed * 10000 + step;
  let x = Math.sin(combined) * 10000;
  return x - Math.floor(x);
}

function getMultiplierForStep(seed: number, step: number): number {
  const baseMultiplier = Math.pow(1.08, step);
  const variance = seededRandom(seed, step * 1000);
  const withVariance = baseMultiplier * (1 + variance * 0.03);
  return Math.round(withVariance * 100) / 100;
}

function getSurvivalChance(multiplier: number): number {
  if (multiplier <= 0) {
    return 0;
  }
  return Math.min(1.0, 0.95 / multiplier);
}

function doesSurvive(seed: number, step: number): boolean {
  const multiplier = getMultiplierForStep(seed, step);
  const survivalChance = getSurvivalChance(multiplier);
  const randomValue = crypto.getRandomValues(new Uint32Array(1));
  const roll = randomValue[0]! / 0xffffffff;
  return roll < survivalChance;
}

/**
 * Send chicken cross result to Discord webhook
 */
async function sendResultToDiscord(
  steamId: string,
  username: string,
  initialWager: number,
  finalPayout: number,
  step: number,
  state: 'LOST' | 'CASHED_OUT',
  env: Env,
): Promise<void> {
  try {
    const isWin = state === 'CASHED_OUT' && finalPayout > initialWager;
    const isBigWin = finalPayout >= initialWager * 2 && initialWager >= 50;

    // Only send to Discord for significant wins
    if (!isWin || !isBigWin) return;

    const color = finalPayout >= initialWager * 10 ? 0xff00ff : 0xffd700; // Magenta for huge, gold for big

    const embed = {
      title: '🐔 Chicken Cross Gewinn!',
      color: color,
      fields: [
        {
          name: 'Spieler',
          value: username,
          inline: true,
        },
        {
          name: 'Einsatz',
          value: `${initialWager} ZVC`,
          inline: true,
        },
        {
          name: 'Gewinn',
          value: `${finalPayout} ZVC`,
          inline: true,
        },
        {
          name: 'Schritte',
          value: `${step}`,
          inline: true,
        },
        {
          name: 'Multiplikator',
          value: `~${(finalPayout / initialWager).toFixed(1)}x`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    const payload = {
      embeds: [embed],
    };

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

    console.log(`✅ Sent chicken cross win notification to Discord for ${steamId}`);
  } catch (error) {
    console.error('Error sending chicken cross result to Discord webhook:', error);
  }
}

export async function handleChickenCrossInfo(request: Request, _env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const response: ChickenCrossInfoResponse = {
    minBet: MIN_BET,
    maxBet: MAX_BET,
  };
  return createResponse(response, 200, origin);
}

export async function handleChickenCrossActive(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  const steamId = validation.steamId;
  const db = drizzle(env.ZEITVERTREIB_DATA);

  const activeGame = await db
    .select()
    .from(chickenCrossGames)
    .where(and(eq(chickenCrossGames.userid, steamId), eq(chickenCrossGames.state, 'ACTIVE')))
    .get();

  const response: ChickenCrossActiveResponse = activeGame ? { activeGameSeed: activeGame.seed } : {};

  return createResponse(response, 200, origin);
}

export async function handleChickenCrossGet(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  const steamId = validation.steamId;
  const url = new URL(request.url);
  const seedParam = url.searchParams.get('seed');

  if (!seedParam) {
    return createResponse({ error: 'Missing seed parameter' }, 400, origin);
  }

  const getRequest: ChickenCrossGetRequest = {
    seed: parseInt(seedParam, 10),
  };

  if (isNaN(getRequest.seed)) {
    return createResponse({ error: 'Invalid seed parameter' }, 400, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const game = await db.select().from(chickenCrossGames).where(eq(chickenCrossGames.seed, getRequest.seed)).get();

  if (!game) {
    return createResponse({ error: 'Game not found' }, 404, origin);
  }

  if (game.userid !== steamId) {
    return createResponse({ error: 'Unauthorized: You do not own this game' }, 403, origin);
  }

  const response: ChickenCrossGetResponse = {
    seed: game.seed,
    initialWager: game.initialWager,
    currentPayout: game.currentPayout,
    step: game.step,
    state: game.state as 'ACTIVE' | 'LOST' | 'CASHED_OUT',
    lastUpdatedAt: game.lastUpdatedAt,
  };

  return createResponse(response, 200, origin);
}

export async function handleChickenCrossPost(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  const steamId = validation.steamId;
  let body: ChickenCrossPostRequest;
  try {
    body = await request.json();
  } catch {
    return createResponse({ error: 'Invalid JSON body' }, 400, origin);
  }

  const intent = body.intent;
  const seed = body.seed;
  const bet = body.bet;

  if (intent !== 'MOVE' && intent !== 'CASHOUT') {
    return createResponse({ error: 'Invalid intent. Must be MOVE or CASHOUT' }, 400, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);

  if (intent === 'MOVE' && !seed) {
    if (!bet) {
      return createResponse({ error: 'Missing bet amount for new game' }, 400, origin);
    }

    if (bet < MIN_BET || bet > MAX_BET) {
      return createResponse({ error: `Bet must be between ${MIN_BET} and ${MAX_BET}` }, 400, origin);
    }

    const player = await db.select().from(playerdata).where(eq(playerdata.id, steamId)).get();
    if (!player) {
      return createResponse({ error: 'Player not found' }, 404, origin);
    }

    const currentExperience = player.experience ?? 0;
    if (currentExperience < bet) {
      return createResponse({ error: 'Insufficient ZVC balance' }, 400, origin);
    }

    const existingGame = await db
      .select()
      .from(chickenCrossGames)
      .where(and(eq(chickenCrossGames.userid, steamId), eq(chickenCrossGames.state, 'ACTIVE')))
      .get();

    if (existingGame) {
      return createResponse(
        { error: 'You already have an active game. Complete it first.', seed: existingGame.seed },
        400,
        origin,
      );
    }

    await db
      .update(playerdata)
      .set({ experience: increment(playerdata.experience, -bet) })
      .where(eq(playerdata.id, steamId));

    const seedBuffer = new Uint32Array(1);
    crypto.getRandomValues(seedBuffer);
    const newSeed = seedBuffer[0]! % 2147483647;
    const step = 0;
    const currentPayout = bet;
    const now = Date.now();

    await db.insert(chickenCrossGames).values({
      seed: newSeed,
      userid: steamId,
      initialWager: bet,
      currentPayout: currentPayout,
      step: step,
      state: 'ACTIVE',
      lastUpdatedAt: now,
    });

    const response: ChickenCrossPostResponse = {
      seed: newSeed,
      state: 'ACTIVE',
      currentPayout: currentPayout,
    };

    return createResponse(response, 200, origin);
  }

  if (!seed) {
    return createResponse({ error: 'Missing seed for game action' }, 400, origin);
  }

  const game = await db.select().from(chickenCrossGames).where(eq(chickenCrossGames.seed, seed)).get();

  if (!game) {
    return createResponse({ error: 'Game not found' }, 404, origin);
  }

  if (game.userid !== steamId) {
    return createResponse({ error: 'Unauthorized: You do not own this game' }, 403, origin);
  }

  if (game.state !== 'ACTIVE') {
    return createResponse({ error: 'Game is no longer active' }, 400, origin);
  }

  const now = Date.now();

  if (intent === 'CASHOUT') {
    await db
      .update(playerdata)
      .set({ experience: increment(playerdata.experience, game.currentPayout) })
      .where(eq(playerdata.id, steamId));

    await db
      .update(chickenCrossGames)
      .set({ state: 'CASHED_OUT', lastUpdatedAt: now })
      .where(eq(chickenCrossGames.seed, seed));

    if (ctx) {
      const player = await db.select().from(playerdata).where(eq(playerdata.id, steamId)).get();
      if (player) {
        const steamUser = await fetchSteamUserData(steamId.replace('@steam', ''), env, ctx);
        const username = steamUser?.username ?? player.username ?? steamId;
        ctx.waitUntil(
          sendResultToDiscord(steamId, username, game.initialWager, game.currentPayout, game.step, 'CASHED_OUT', env),
        );
      }
    }

    const response: ChickenCrossPostResponse = {
      seed: game.seed,
      state: 'CASHED_OUT',
      currentPayout: game.currentPayout,
    };

    return createResponse(response, 200, origin);
  }

  if (intent === 'MOVE') {
    const nextStep = game.step + 1;
    const survived = doesSurvive(game.seed, nextStep);

    if (!survived) {
      await db
        .update(chickenCrossGames)
        .set({ state: 'LOST', step: nextStep, currentPayout: 0, lastUpdatedAt: now })
        .where(eq(chickenCrossGames.seed, seed));

      const response: ChickenCrossPostResponse = {
        seed: game.seed,
        state: 'LOST',
        currentPayout: 0,
      };

      return createResponse(response, 200, origin);
    }

    const nextMultiplier = getMultiplierForStep(game.seed, nextStep);
    const newPayout = Math.floor(game.initialWager * nextMultiplier);

    await db
      .update(chickenCrossGames)
      .set({ step: nextStep, currentPayout: newPayout, lastUpdatedAt: now })
      .where(eq(chickenCrossGames.seed, seed));

    const response: ChickenCrossPostResponse = {
      seed: game.seed,
      state: 'ACTIVE',
      currentPayout: newPayout,
    };

    return createResponse(response, 200, origin);
  }

  return createResponse({ error: 'Invalid request' }, 400, origin);
}
