import type { BirthdayGetResponse, BirthdayPostRequest, BirthdayDeleteRequest } from '@zeitvertreib/types';
import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { birthdays, birthdayUpdates } from '../db/schema.js';

function isValidDate(day: number, month: number, year: number): boolean {
  const currentYear = new Date().getFullYear();

  if (year < currentYear - 100 || year > currentYear) {
    return false;
  }

  // Create the date. If JS had to fix it, it was invalid.
  const d = new Date(year, month - 1, day);

  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export async function handleGetBirthday(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);

  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Not authenticated' }, 401, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const birthdayRecord = await db.select().from(birthdays).where(eq(birthdays.userid, validation.steamId)).get();
  const birthdayLastUpdatedRecord = await db
    .select()
    .from(birthdayUpdates)
    .where(eq(birthdayUpdates.userid, validation.steamId))
    .get();

  let response: BirthdayGetResponse = {
    birthday: null,
    lastUpdated: birthdayLastUpdatedRecord ? birthdayLastUpdatedRecord.lastUpdated : null,
  };

  if (birthdayRecord) {
    response = {
      birthday: {
        day: birthdayRecord.day,
        month: birthdayRecord.month,
        ...(birthdayRecord.year != null && { year: birthdayRecord.year }),
      },
      lastUpdated: birthdayLastUpdatedRecord ? birthdayLastUpdatedRecord.lastUpdated : null,
    };
  }

  return createResponse(response, 200, origin);
}

export async function handlePostBirthday(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);

  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Not authenticated' }, 401, origin);
  }

  const body: BirthdayPostRequest = await request.json();

  if (!isValidDate(body.day, body.month, body.year ?? 2000)) {
    return createResponse({ error: 'Invalid date' }, 400, origin);
  }

  // Reject users under 18 years old
  if (body.year !== undefined) {
    const today = new Date();
    const birthDate = new Date(body.year, body.month - 1, body.day);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 18) {
      return createResponse({ error: 'You must be at least 18 years old' }, 400, origin);
    }
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const now = Date.now();

  // Check if birthday was updated in the last 30 days
  const birthdayLastUpdatedRecord = await db
    .select()
    .from(birthdayUpdates)
    .where(eq(birthdayUpdates.userid, validation.steamId))
    .get();

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  if (birthdayLastUpdatedRecord && now - birthdayLastUpdatedRecord.lastUpdated < THIRTY_DAYS_MS) {
    return createResponse({ error: 'Birthday can only be updated once every 30 days' }, 429, origin);
  }

  await db
    .insert(birthdays)
    .values({
      userid: validation.steamId,
      day: body.day,
      month: body.month,
      year: body.year ?? null,
    })
    .onConflictDoUpdate({
      target: birthdays.userid,
      set: {
        day: body.day,
        month: body.month,
        year: body.year ?? null,
      },
    });

  await db
    .insert(birthdayUpdates)
    .values({
      userid: validation.steamId,
      lastUpdated: now,
    })
    .onConflictDoUpdate({
      target: birthdayUpdates.userid,
      set: {
        lastUpdated: now,
      },
    });

  return createResponse({}, 200, origin);
}

export async function handleDeleteBirthday(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);

  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Not authenticated' }, 401, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);

  await db.delete(birthdays).where(eq(birthdays.userid, validation.steamId));

  return createResponse({}, 200, origin);
}
