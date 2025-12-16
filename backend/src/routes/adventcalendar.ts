import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { createResponse, validateSession, isDonator, increment } from '../utils.js';

// 2026 Advent rewards with exciting bumps and Christmas bonus - if this is still here in 2027 thats awkward lol
const ADVENT_REWARDS: Record<number, number> = {
  1: 150, // Tue - first day surprise
  2: 120, // Wed
  3: 140, // Thu - mini surprise
  4: 110, // Fri
  5: 140, // Sat
  6: 180, // Sun - 1st Advent bonus!
  7: 120, // Mon
  8: 160, // Tue - Immaculate Conception bonus
  9: 110, // Wed
  10: 130, // Thu - mini surprise
  11: 130, // Fri
  12: 140, // Sat
  13: 190, // Sun - 2nd Advent bonus!
  14: 120, // Mon
  15: 130, // Tue
  16: 110, // Wed
  17: 130, // Thu - mini surprise
  18: 140, // Fri
  19: 200, // Sun - 3rd Advent bonus!
  20: 130, // Mon
  21: 140, // Tue
  22: 120, // Wed
  23: 110, // Thu
  24: 350, // Thu - Christmas Eve, amazing!
};

/**
 * GET /adventcalendar
 * Get the user's advent calendar state for December
 * Returns null if not December, or the calendar state with opened doors only showing their rewards
 */
export async function handleGetAdventCalendar(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const db = drizzle(env.ZEITVERTREIB_DATA);

  // Check visibility window: show calendar from Nov 15 through December (German timezone)
  const nowGerman = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const currentMonth = nowGerman.getMonth() + 1; // 0-indexed
  const currentDay = nowGerman.getDate();

  const visible = currentMonth === 12 || (currentMonth === 11 && currentDay >= 15);
  if (!visible) {
    return createResponse({ calendar: null }, 200, origin);
  }

  // Validate session
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  const userId = validation.steamId.endsWith('@steam') ? validation.steamId : `${validation.steamId}@steam`;

  // Get or create calendar entry
  let calendarResult = await db.select().from(schema.adventCalendar).where(eq(schema.adventCalendar.userId, userId));

  if (calendarResult.length === 0) {
    // Create new calendar entry for user
    await db.insert(schema.adventCalendar).values({ userId });
    calendarResult = await db.select().from(schema.adventCalendar).where(eq(schema.adventCalendar.userId, userId));
  }

  const calendar = calendarResult[0];
  if (!calendar) {
    return createResponse({ error: 'Failed to create calendar' }, 500, origin);
  }

  // Build response with only opened doors showing rewards
  const doors: { day: number; opened: boolean; redeemedAt: number; reward?: number }[] = [];
  for (let day = 1; day <= 24; day++) {
    const fieldName = `day${day}` as keyof typeof calendar;
    const redeemedAt = calendar[fieldName] as number;
    const opened = redeemedAt > 0;

    const door: { day: number; opened: boolean; redeemedAt: number; reward?: number } = {
      day,
      opened,
      redeemedAt,
    };

    // Only include reward info for opened doors
    if (opened) {
      door.reward = ADVENT_REWARDS[day] ?? 0;
    }

    doors.push(door);
  }

  return createResponse({ calendar: { doors } }, 200, origin);
}

/**
 * POST /adventcalendar/redeem
 * Redeem a door for the current day
 * Body: { day: number }
 */
export async function handleRedeemAdventDoor(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const db = drizzle(env.ZEITVERTREIB_DATA);

  // Check if it's December (German timezone)
  const nowGerman = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const currentMonth = nowGerman.getMonth() + 1;
  const currentDay = nowGerman.getDate();

  if (currentMonth !== 12) {
    return createResponse({ error: 'Advent calendar is only available in December' }, 400, origin);
  }

  // Validate session
  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  const userId = validation.steamId.endsWith('@steam') ? validation.steamId : `${validation.steamId}@steam`;

  // Parse request body
  let requestBody: { day?: number };
  try {
    requestBody = (await request.json()) as { day?: number };
  } catch (e) {
    return createResponse({ error: 'Invalid request body' }, 400, origin);
  }

  const day = requestBody.day;
  if (!day || day < 1 || day > 24 || !Number.isInteger(day)) {
    return createResponse({ error: 'Invalid day. Must be an integer between 1 and 24' }, 400, origin);
  }

  // Check if user is a donator
  const userIsDonator = await isDonator(userId, env);

  // Donators can open past doors, everyone else can only open today's door
  if (!userIsDonator) {
    if (day !== currentDay) {
      return createResponse({ error: "You can only open today's door" }, 400, origin);
    }
  } else {
    // Donators can open today or any past door, but not future doors
    if (day > currentDay) {
      return createResponse({ error: 'You cannot open future doors' }, 400, origin);
    }
  }

  // Get or create calendar entry
  let calendarResult = await db.select().from(schema.adventCalendar).where(eq(schema.adventCalendar.userId, userId));

  if (calendarResult.length === 0) {
    await db.insert(schema.adventCalendar).values({ userId });
    calendarResult = await db.select().from(schema.adventCalendar).where(eq(schema.adventCalendar.userId, userId));
  }

  const calendar = calendarResult[0];
  if (!calendar) {
    return createResponse({ error: 'Failed to create calendar' }, 500, origin);
  }

  // Check if door is already opened
  const fieldName = `day${day}` as keyof typeof calendar;
  const redeemedAt = calendar[fieldName] as number;
  if (redeemedAt > 0) {
    return createResponse({ error: 'Door already opened' }, 400, origin);
  }

  // Calculate reward from constant map
  const reward = ADVENT_REWARDS[day] ?? 0;
  if (reward === 0) {
    return createResponse({ error: 'Invalid day' }, 400, origin);
  }

  const timestamp = Math.floor(Date.now() / 1000);

  // Update calendar and award ZVC
  await db
    .update(schema.adventCalendar)
    .set({ [fieldName]: timestamp })
    .where(eq(schema.adventCalendar.userId, userId));

  // Get current ZVC
  const playerResult = await db.select().from(schema.playerdata).where(eq(schema.playerdata.id, userId));

  const currentZvc = playerResult[0]?.experience ?? 0;
  const newZvc = currentZvc + reward;

  // Update ZVC
  await db
    .update(schema.playerdata)
    .set({
      experience: increment(schema.playerdata.experience, reward),
    })
    .where(eq(schema.playerdata.id, userId))
    .run();

  return createResponse(
    {
      success: true,
      day,
      reward,
      newZvc,
    },
    200,
    origin,
  );
}
