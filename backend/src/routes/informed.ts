import typia from 'typia';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { informedTracking } from '../db/schema.js';
import { checkApiKey, createResponse } from '../utils.js';
import type { InformedTrackingPostRequest } from '@zeitvertreib/types';

export async function handleCreateInformedTracking(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  if (!checkApiKey(request, env.INFORMED_API_KEY)) {
    return createResponse({ error: 'Unauthorized' }, 401, origin);
  }

  try {
    const body = await request.json();
    if (!typia.is<InformedTrackingPostRequest>(body)) {
      return createResponse({ error: 'Invalid payload' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);
    const inserted = await db
      .insert(informedTracking)
      .values({ steamId: body.steamId, roundNumber: body.roundNumber })
      .returning({ id: informedTracking.id });
    const entry = inserted[0];

    if (!entry) {
      return createResponse({ error: 'Failed to create tracking identifier' }, 500, origin);
    }

    return createResponse({ id: entry.id }, 201, origin);
  } catch (error) {
    console.error('[Informed] Error creating tracking identifier:', error);
    return createResponse({ error: 'Invalid request' }, 400, origin);
  }
}

export async function handleResolveInformedTracking(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const id = new URL(request.url).searchParams.get('id');

  if (!id || !/^\d+$/.test(id) || Number(id) < 1) {
    return createResponse({ error: 'A valid numeric id is required' }, 400, origin);
  }

  const entry = await drizzle(env.ZEITVERTREIB_DATA)
    .select({ steamId: informedTracking.steamId, roundNumber: informedTracking.roundNumber })
    .from(informedTracking)
    .where(eq(informedTracking.id, Number(id)))
    .get();

  if (!entry) {
    return createResponse({ error: 'Tracking identifier not found' }, 404, origin);
  }

  return createResponse(entry, 200, origin);
}
