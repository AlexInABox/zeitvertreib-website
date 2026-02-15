import { validateSession, createResponse, REDUCED_LUCK_USERS } from '../utils.js';
import typia from 'typia';

// List of admin Steam IDs allowed to manage reduced luck
const COIN_MANAGEMENT_ADMINS = ['76561198834070725@steam', '76561198354414854@steam'];

interface SetReducedLuckRequest {
  steamId: string;
  hasReducedLuck: boolean;
}

interface GetReducedLuckResponse {
  reducedLuckUsers: string[];
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

  const response: GetReducedLuckResponse = {
    reducedLuckUsers: [...REDUCED_LUCK_USERS],
  };

  return createResponse(response, 200, origin);
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

  const body = await request.json();

  if (!typia.is<SetReducedLuckRequest>(body)) {
    return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
  }

  const steamId = body.steamId.endsWith('@steam') ? body.steamId : `${body.steamId}@steam`;
  const hasReducedLuck = body.hasReducedLuck;

  const currentIndex = REDUCED_LUCK_USERS.indexOf(steamId);

  if (hasReducedLuck) {
    // Add to reduced luck list if not already present
    if (currentIndex === -1) {
      REDUCED_LUCK_USERS.push(steamId);
    }
  } else {
    // Remove from reduced luck list if present
    if (currentIndex !== -1) {
      REDUCED_LUCK_USERS.splice(currentIndex, 1);
    }
  }

  return createResponse(
    {
      success: true,
      message: hasReducedLuck
        ? 'Benutzer zu reduzierter Glücksliste hinzugefügt'
        : 'Benutzer von reduzierter Glücksliste entfernt',
      reducedLuckUsers: [...REDUCED_LUCK_USERS],
    },
    200,
    origin,
  );
}
