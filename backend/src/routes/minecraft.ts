import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import typia from 'typia';
import { minecraftLinkCodes, minecraftStats } from '../db/schema.js';
import { checkApiKey, createResponse, validateSession } from '../utils.js';
import type { MinecraftCreateLinkCodeRequest, MinecraftLinkCodeRedeemRequest } from '@zeitvertreib/types';

const CODE_EXPIRY_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRandomCodePart(length: number): string {
    let result = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);

    for (let i = 0; i < randomValues.length; i++) {
        const randomValue = randomValues[i];
        if (randomValue === undefined) {
            continue;
        }
        const index = randomValue % CODE_ALPHABET.length;
        const character = CODE_ALPHABET.charAt(index);
        result += character;
    }

    return result;
}

function generateLinkCode(): string {
    const partA = generateRandomCodePart(4);
    const partB = generateRandomCodePart(4);
    return `${partA}-${partB}`;
}

export async function handleGetMinecraftStats(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);
    const minecraftUuid = url.searchParams.get('minecraftUuid');
    const userIdFromQuery = url.searchParams.get('userid') || url.searchParams.get('userId');

    if (!minecraftUuid && !userIdFromQuery) {
        return createResponse({ error: 'Missing query parameter: minecraftUuid or userid' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    let statsRecord:
        | {
            userId: string;
            minecraftUuid: string;
        }
        | undefined;

    if (minecraftUuid) {
        statsRecord = await db
            .select({
                userId: minecraftStats.userId,
                minecraftUuid: minecraftStats.minecraftUuid,
            })
            .from(minecraftStats)
            .where(eq(minecraftStats.minecraftUuid, minecraftUuid))
            .get();
    } else if (userIdFromQuery) {
        statsRecord = await db
            .select({
                userId: minecraftStats.userId,
                minecraftUuid: minecraftStats.minecraftUuid,
            })
            .from(minecraftStats)
            .where(eq(minecraftStats.userId, userIdFromQuery))
            .get();
    }

    if (!statsRecord) {
        return createResponse({ error: 'Minecraft stats entry not found' }, 404, origin);
    }

    return createResponse(statsRecord, 200, origin);
}

export async function handlePutMinecraftLink(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');

    if (!checkApiKey(request, env.MINECRAFT_API_KEY)) {
        return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return createResponse({ error: 'Invalid JSON' }, 400, origin);
    }

    if (!typia.is<MinecraftCreateLinkCodeRequest>(body)) {
        return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);
    const now = Date.now();
    const existingCodeForUuid = await db
        .select({
            code: minecraftLinkCodes.code,
            expiresAt: minecraftLinkCodes.expiresAt,
        })
        .from(minecraftLinkCodes)
        .where(eq(minecraftLinkCodes.minecraftUuid, body.minecraftUuid))
        .get();

    if (existingCodeForUuid && existingCodeForUuid.expiresAt > now) {
        const refreshedExpiresAt = now + CODE_EXPIRY_MS;

        await db
            .update(minecraftLinkCodes)
            .set({
                expiresAt: refreshedExpiresAt,
            })
            .where(eq(minecraftLinkCodes.minecraftUuid, body.minecraftUuid));

        return createResponse({ code: existingCodeForUuid.code }, 200, origin);
    }

    let generatedCode = '';

    for (let attempt = 0; attempt < 25; attempt++) {
        const candidateCode = generateLinkCode();
        const existingCode = await db
            .select({ code: minecraftLinkCodes.code })
            .from(minecraftLinkCodes)
            .where(eq(minecraftLinkCodes.code, candidateCode))
            .get();

        if (!existingCode) {
            generatedCode = candidateCode;
            break;
        }
    }

    if (!generatedCode) {
        return createResponse({ error: 'Failed to generate unique link code' }, 500, origin);
    }

    const expiresAt = now + CODE_EXPIRY_MS;

    await db
        .insert(minecraftLinkCodes)
        .values({
            minecraftUuid: body.minecraftUuid,
            code: generatedCode,
            expiresAt,
        })
        .onConflictDoUpdate({
            target: minecraftLinkCodes.minecraftUuid,
            set: {
                code: generatedCode,
                expiresAt,
            },
        });

    return createResponse({ code: generatedCode }, 200, origin);
}

export async function handlePostMinecraftLink(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const sessionValidation = await validateSession(request, env);

    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
        return createResponse(
            { error: sessionValidation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
            401,
            origin,
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return createResponse({ error: 'Invalid JSON' }, 400, origin);
    }

    if (!typia.is<MinecraftLinkCodeRedeemRequest>(body)) {
        return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);
    const linkCodeEntry = await db
        .select({
            minecraftUuid: minecraftLinkCodes.minecraftUuid,
            code: minecraftLinkCodes.code,
            expiresAt: minecraftLinkCodes.expiresAt,
        })
        .from(minecraftLinkCodes)
        .where(eq(minecraftLinkCodes.code, body.code))
        .get();

    if (!linkCodeEntry) {
        return createResponse({ error: 'Code not found' }, 404, origin);
    }

    if (linkCodeEntry.expiresAt <= Date.now()) {
        await db.delete(minecraftLinkCodes).where(eq(minecraftLinkCodes.minecraftUuid, linkCodeEntry.minecraftUuid));
        return createResponse({ error: 'Code expired' }, 400, origin);
    }

    await db.delete(minecraftLinkCodes).where(eq(minecraftLinkCodes.minecraftUuid, linkCodeEntry.minecraftUuid));

    await db
        .insert(minecraftStats)
        .values({
            userId: sessionValidation.steamId,
            minecraftUuid: linkCodeEntry.minecraftUuid,
        })
        .onConflictDoUpdate({
            target: minecraftStats.userId,
            set: {
                minecraftUuid: linkCodeEntry.minecraftUuid,
            },
        });

    return createResponse({ success: true, minecraftUuid: linkCodeEntry.minecraftUuid }, 200, origin);
}
