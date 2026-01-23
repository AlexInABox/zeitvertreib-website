import type { DeletionGetResponse, DeletionPostRequest } from '@zeitvertreib/types';
import { validateSession, createResponse } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { deletionEnabledUsers } from '../db/schema.js';

export async function handleGetDeletion(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const validation = await validateSession(request, env);

    if (validation.status !== 'valid' || !validation.steamId) {
        return createResponse({ error: 'Not authenticated' }, 401, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);
    const deletionRecord = await db
        .select({ enabledAt: deletionEnabledUsers.enabledAt })
        .from(deletionEnabledUsers)
        .where(eq(deletionEnabledUsers.userid, validation.steamId))
        .get();

    const response: DeletionGetResponse = {
        enabledAt: deletionRecord?.enabledAt ?? 0,
    };

    return createResponse(response, 200, origin);
}

export async function handlePostDeletion(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const validation = await validateSession(request, env);

    if (validation.status !== 'valid' || !validation.steamId) {
        return createResponse({ error: 'Not authenticated' }, 401, origin);
    }

    const body: DeletionPostRequest = await request.json();
    const db = drizzle(env.ZEITVERTREIB_DATA);

    // If enabledAt is 0, disable (delete the row)
    if (body.enabledAt === 0) {
        await db.delete(deletionEnabledUsers).where(eq(deletionEnabledUsers.userid, validation.steamId));
        return createResponse({ success: true, enabledAt: 0 }, 200, origin);
    }

    // Otherwise, enable (insert or update with current timestamp)
    const now = Date.now();
    await db
        .insert(deletionEnabledUsers)
        .values({
            userid: validation.steamId,
            enabledAt: now,
        })
        .onConflictDoUpdate({
            target: deletionEnabledUsers.userid,
            set: { enabledAt: now },
        });

    return createResponse({ success: true, enabledAt: now }, 200, origin);
}
