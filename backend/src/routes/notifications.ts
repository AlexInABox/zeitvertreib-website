import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, inArray, desc, count, isNull } from 'drizzle-orm';
import { notifications } from '../db/schema.js';
import typia from 'typia';
import type {
  GetNotificationsResponse,
  MarkNotificationsReadRequest,
  UserNotification,
  UserNotificationType,
} from '@zeitvertreib/types';

export async function handleGetNotifications(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  const sessionResult = await validateSession(request, env);
  if (sessionResult.status !== 'valid' || !sessionResult.steamId) {
    return createResponse(
      { error: sessionResult.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  const notificationsResult = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, sessionResult.steamId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  const notificationsMapped: UserNotification[] = notificationsResult.map((row) => ({
    id: row.id,
    type: row.type as UserNotificationType,
    title: row.title,
    message: row.message,
    createdAt: row.createdAt,
    readAt: row.readAt,
  }));

  const response: GetNotificationsResponse = {
    notifications: notificationsMapped,
  };

  return createResponse(response, 200, origin);
}

export async function handleMarkNotificationsRead(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  const sessionResult = await validateSession(request, env);
  if (sessionResult.status !== 'valid' || !sessionResult.steamId) {
    return createResponse(
      { error: sessionResult.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createResponse({ error: 'Invalid JSON' }, 400, origin);
    }

    if (!typia.is<MarkNotificationsReadRequest>(body)) {
      return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
    }

    const now = Date.now();

    if (body.ids !== undefined) {
      if (body.ids.length === 0) {
        return createResponse({ success: true }, 200, origin);
      }
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.userId, sessionResult.steamId),
            inArray(notifications.id, body.ids),
            isNull(notifications.readAt),
          ),
        );
    } else {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.userId, sessionResult.steamId), isNull(notifications.readAt)));
    }

    return createResponse({ success: true }, 200, origin);
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return createResponse({ error: 'Failed to mark notifications as read' }, 500, origin);
  }
}
