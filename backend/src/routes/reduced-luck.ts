import { drizzle } from 'drizzle-orm/d1';
import { reducedLuckUsers } from '../db/schema.js';
import { validateSession, createResponse } from '../utils.js';
import { eq } from 'drizzle-orm';
import typia from 'typia';

// List of admin Steam IDs allowed to manage reduced luck
const COIN_MANAGEMENT_ADMINS = ['76561198834070725@steam', '76561198354414854@steam'];

interface SetReducedLuckRequest {
  steamId: string;
  hasReducedLuck: boolean;
  reason?: string;
}

interface GetReducedLuckResponse {
  reducedLuckUsers: Array<{
    steamId: string;
    addedAt: number;
    reason: string | null;
  }>;
}

export async function handleGetReducedLuck(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid') {
    return createResponse({ error: 'Nicht autorisiert' }, 401, origin);
  }

  // Check if user is an admin
  if (!validation.steamId || !COIN_MANAGEMENT_ADMINS.includes(validation.steamId)) {
    return createResponse({ error: 'Zugriff verweigert - Admin-Rechte erforderlich' }, 403, origin);
  }

  const db = drizzle(env.ZEITVERTREIB_DATA);

  try {
    const users = await db.select().from(reducedLuckUsers);

    const response: GetReducedLuckResponse = {
      reducedLuckUsers: users.map((user) => ({
        steamId: user.steamId,
        addedAt: user.addedAt,
        reason: user.reason,
      })),
    };

    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('Error fetching reduced luck users:', error);
    return createResponse({ error: 'Fehler beim Laden der Liste' }, 500, origin);
  }
}

export async function handleSetReducedLuck(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid') {
    return createResponse({ error: 'Nicht autorisiert' }, 401, origin);
  }

  // Check if user is an admin
  if (!validation.steamId || !COIN_MANAGEMENT_ADMINS.includes(validation.steamId)) {
    return createResponse({ error: 'Zugriff verweigert - Admin-Rechte erforderlich' }, 403, origin);
  }

  const bodyRaw = await request.json();

  if (!typia.is<SetReducedLuckRequest>(bodyRaw)) {
    return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
  }

  const body = bodyRaw as SetReducedLuckRequest;
  const steamId = body.steamId.endsWith('@steam') ? body.steamId : `${body.steamId}@steam`;
  const hasReducedLuck = body.hasReducedLuck;

  const db = drizzle(env.ZEITVERTREIB_DATA);

  try {
    if (hasReducedLuck) {
      // Add to reduced luck list using INSERT OR IGNORE for efficiency
      await db
        .insert(reducedLuckUsers)
        .values({
          steamId,
          addedAt: Math.floor(Date.now() / 1000),
          reason: body.reason || null,
        })
        .onConflictDoNothing();
    } else {
      // Remove from reduced luck list
      await db.delete(reducedLuckUsers).where(eq(reducedLuckUsers.steamId, steamId));
    }

    // Fetch updated list
    const users = await db.select().from(reducedLuckUsers);

    return createResponse(
      {
        success: true,
        message: hasReducedLuck
          ? 'Benutzer zu reduzierter Glücksliste hinzugefügt'
          : 'Benutzer von reduzierter Glücksliste entfernt',
        reducedLuckUsers: users.map((user) => ({
          steamId: user.steamId,
          addedAt: user.addedAt,
          reason: user.reason,
        })),
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error updating reduced luck:', error);
    return createResponse({ error: 'Fehler beim Aktualisieren der Liste' }, 500, origin);
  }
}
