import type { BirthdayGetResponse, BirthdayPostRequest, BirthdayDeleteRequest } from '@zeitvertreib/types';
import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { birthdays } from '../db/schema.js';

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

  let response: BirthdayGetResponse = {
    birthday: null,
  };

  if (birthdayRecord) {
    response = {
      birthday: {
        day: birthdayRecord.day,
        month: birthdayRecord.month,
        ...(birthdayRecord.year != null && { year: birthdayRecord.year }),
        setAt: birthdayRecord.setAt,
      },
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

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const now = Date.now();

  await db
    .insert(birthdays)
    .values({
      userid: validation.steamId,
      day: body.day,
      month: body.month,
      year: body.year ?? null,
      setAt: now,
    })
    .onConflictDoUpdate({
      target: birthdays.userid,
      set: {
        day: body.day,
        month: body.month,
        year: body.year ?? null,
        setAt: now,
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
