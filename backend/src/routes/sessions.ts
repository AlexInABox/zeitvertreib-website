import type { SessionsInfoGetResponse, SessionsInfoDeleteRequest } from '@zeitvertreib/types';
import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { sessions } from '../db/schema.js';
import { eq, inArray, and } from 'drizzle-orm';

export async function handleGetSessions(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);

  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Not authenticated' }, 401, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);
  const userSessions = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastLoginAt: sessions.lastLoginAt,
      expiresAt: sessions.expiresAt,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
    })
    .from(sessions)
    .where(eq(sessions.userid, validation.steamId));

  const response: SessionsInfoGetResponse = {
    sessions: userSessions,
  };

  return createResponse(response, 200, origin);
}

export async function handleDeleteSessions(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const validation = await validateSession(request, env);

  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Not authenticated' }, 401, origin);
  }

  const body: SessionsInfoDeleteRequest = await request.json();

  if (!body.id || !Array.isArray(body.id) || body.id.length === 0) {
    return createResponse({ error: 'Session IDs are required' }, 400, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);

  // Only delete sessions that belong to the current user
  await db
    .delete(sessions)
    .where(and(inArray(sessions.id, body.id), eq(sessions.userid, validation.steamId)));

  return createResponse({ success: true }, 200, origin);
}
