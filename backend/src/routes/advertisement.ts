import { AwsClient } from 'aws4fetch';
import { createResponse, validateSession } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { advertisementCampaigns, advertisementDays, playerdata } from '../db/schema.js';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import typia from 'typia';
import type {
    AdvertisementGetRequest,
    AdvertisementGetResponse,
    AdvertisementTodayGetResponse,
    AdvertisementPostRequest,
    AdvertisementLocations,
    AdvertisementStatus,
} from '@zeitvertreib/types';
import { ADVERTISEMENT_LOCATIONS } from '@zeitvertreib/types';

const BUCKET = 'test';
const ADVERTISEMENT_FOLDER = 'advertisements';
const ADVERTISEMENT_FOLDER_LOCALHOST = 'advertisements_localhost';
const PRICE_PER_DAY_PER_LOCATION = 50;

const aws = (env: Env): AwsClient =>
    new AwsClient({
        accessKeyId: env.MINIO_ACCESS_KEY,
        secretAccessKey: env.MINIO_SECRET_KEY,
        service: 's3',
        region: 'us-east-1',
    });

/**
 * Determine the advertisement folder based on the request origin
 */
function getAdvertisementFolder(origin: string | null): string {
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        return ADVERTISEMENT_FOLDER_LOCALHOST;
    }
    return ADVERTISEMENT_FOLDER;
}



/**
 * Get location column name from location type
 */
function getLocationColumn(location: AdvertisementLocations): keyof typeof advertisementDays.$inferSelect {
    const locationMap: Record<AdvertisementLocations, keyof typeof advertisementDays.$inferSelect> = {
        LOCATION_1: 'campaignInLocation1',
        LOCATION_2: 'campaignInLocation2',
        LOCATION_3: 'campaignInLocation3',
        LOCATION_4: 'campaignInLocation4',
        LOCATION_5: 'campaignInLocation5',
    };
    return locationMap[location];
}

/**
 * Get current date in Berlin timezone as YYYY-MM-DD string
 */
function getTodayInBerlin(): string {
    const now = new Date();
    const berlinOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    const formatter = new Intl.DateTimeFormat('en-CA', berlinOptions);
    return formatter.format(now); // en-CA gives YYYY-MM-DD format
}

/**
 * GET /advertisement
 * Public endpoint that returns all advertisements for a given month/year
 * If authenticated, includes status for owned campaigns and shows denied campaigns
 */
export async function handleGetAdvertisement(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    const db = drizzle(env.ZEITVERTREIB_DATA);

    try {
        const url = new URL(request.url);
        const monthParam = url.searchParams.get('month');
        const yearParam = url.searchParams.get('year');

        if (!monthParam || !yearParam) {
            return createResponse({ error: 'Fehlende Parameter: month und year erforderlich' }, 400, origin);
        }

        const month = parseInt(monthParam, 10);
        const year = parseInt(yearParam, 10);

        if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
            return createResponse({ error: 'Ungültige Parameter: month (1-12) und year müssen Zahlen sein' }, 400, origin);
        }

        // Check if user is authenticated (optional)
        let requestingUserId: string | null = null;
        const sessionValidation = await validateSession(request, env);
        if (sessionValidation.status === 'valid' && sessionValidation.steamId) {
            requestingUserId = sessionValidation.steamId;
        }

        // Build date range for the month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // Query all days in the month
        const days = await db
            .select()
            .from(advertisementDays)
            .where(and(gte(advertisementDays.day, startDate), lte(advertisementDays.day, endDate)));

        // Collect all unique campaign IDs
        const campaignIds = new Set<number>();
        for (const day of days) {
            if (day.campaignInLocation1) campaignIds.add(day.campaignInLocation1);
            if (day.campaignInLocation2) campaignIds.add(day.campaignInLocation2);
            if (day.campaignInLocation3) campaignIds.add(day.campaignInLocation3);
            if (day.campaignInLocation4) campaignIds.add(day.campaignInLocation4);
            if (day.campaignInLocation5) campaignIds.add(day.campaignInLocation5);
        }

        // Fetch campaign details
        const campaignIds_array = Array.from(campaignIds);
        const campaigns =
            campaignIds_array.length > 0
                ? await db.select().from(advertisementCampaigns).where(inArray(advertisementCampaigns.id, campaignIds_array))
                : [];

        // Create campaign lookup map
        const campaignMap = new Map<number, (typeof campaigns)[0]>();
        for (const campaign of campaigns) {
            campaignMap.set(campaign.id, campaign);
        }

        // Build response
        const advertisements: AdvertisementGetResponse['advertisements'] = [];

        for (const day of days) {
            for (const location of ADVERTISEMENT_LOCATIONS) {
                const columnName = getLocationColumn(location);
                const campaignId = day[columnName] as number | null;

                if (campaignId) {
                    const campaign = campaignMap.get(campaignId);
                    if (!campaign) continue;

                    const isOwner = requestingUserId !== null && campaign.userId === requestingUserId;

                    // Skip REJECTED unless user owns the campaign
                    if (campaign.status === 'REJECTED' && !isOwner) {
                        continue;
                    }

                    const adEntry: AdvertisementGetResponse['advertisements'][0] = {
                        id: campaign.id,
                        userId: campaign.userId,
                        location: location,
                        date: day.day,
                    };

                    // Add status only if the user owns the campaign
                    if (isOwner) {
                        adEntry.status = campaign.status as AdvertisementStatus;
                    }

                    advertisements.push(adEntry);
                }
            }
        }

        const response: AdvertisementGetResponse = { advertisements };
        return createResponse(response, 200, origin);
    } catch (error) {
        console.error('Error in handleGetAdvertisement:', error);
        return createResponse(
            {
                error: 'Fehler beim Abrufen der Werbungen',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            500,
            origin,
        );
    }
}

/**
 * GET /advertisement/today
 * Unauthenticated endpoint that returns all advertisements for today (based on Berlin time)
 */
export async function handleGetAdvertisementToday(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> {
    const origin = request.headers.get('Origin');
    const db = drizzle(env.ZEITVERTREIB_DATA);

    try {
        const today = getTodayInBerlin();

        // Query today's advertisements
        const dayEntry = await db.select().from(advertisementDays).where(eq(advertisementDays.day, today)).limit(1);

        if (dayEntry.length === 0) {
            const response: AdvertisementTodayGetResponse = { advertisement: [] };
            return createResponse(response, 200, origin);
        }

        const day = dayEntry[0];
        if (!day) {
            const response: AdvertisementTodayGetResponse = { advertisement: [] };
            return createResponse(response, 200, origin);
        }
        const folder = getAdvertisementFolder(origin);

        // Collect campaign IDs for today
        const campaignIds: number[] = [];
        const locationToCampaign: Map<AdvertisementLocations, number> = new Map();

        for (const location of ADVERTISEMENT_LOCATIONS) {
            const columnName = getLocationColumn(location);
            const campaignId = day[columnName] as number | null;
            if (campaignId) {
                campaignIds.push(campaignId);
                locationToCampaign.set(location, campaignId);
            }
        }

        if (campaignIds.length === 0) {
            const response: AdvertisementTodayGetResponse = { advertisement: [] };
            return createResponse(response, 200, origin);
        }

        // Fetch campaigns - only approved ones for public display
        const campaigns = await db
            .select()
            .from(advertisementCampaigns)
            .where(and(inArray(advertisementCampaigns.id, campaignIds), eq(advertisementCampaigns.status, 'APPROVED')));

        // Create campaign lookup map
        const campaignMap = new Map<number, (typeof campaigns)[0]>();
        for (const campaign of campaigns) {
            campaignMap.set(campaign.id, campaign);
        }

        // Build response with text_toy fetched from S3
        const advertisementItems: AdvertisementTodayGetResponse['advertisement'] = [];

        for (const locKV of locationToCampaign.entries()) {
            const location = locKV[0];
            const campaignId = locKV[1];
            const campaign = campaignMap.get(campaignId);

            // Only include approved campaigns
            if (!campaign) continue;

            // Fetch text_toy from S3
            let textToy = '';
            try {
                const txtPath = `${folder}/${campaign.id}.txt`;
                const txtUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${txtPath}`;
                const txtRequest = await aws(env).sign(txtUrl, { method: 'GET' });
                const txtResponse = await fetch(txtRequest);
                if (txtResponse.ok) {
                    textToy = await txtResponse.text();
                }
            } catch (error) {
                console.warn(`Failed to fetch text_toy for advertisement ${campaign.id}:`, error);
            }

            advertisementItems.push({
                id: campaign.id,
                userId: campaign.userId,
                location: location,
                text_toy: textToy,
            });
        }

        const response: AdvertisementTodayGetResponse = { advertisement: advertisementItems };
        return createResponse(response, 200, origin);
    } catch (error) {
        console.error('Error in handleGetAdvertisementToday:', error);
        return createResponse(
            {
                error: 'Fehler beim Abrufen der heutigen Werbungen',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            500,
            origin,
        );
    }
}

/**
 * POST /advertisement
 * Authenticated endpoint to create a new advertisement campaign
 * Costs 50 ZVC per day per location
 */
export async function handlePostAdvertisement(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    const db = drizzle(env.ZEITVERTREIB_DATA);

    try {
        // Authenticate
        const sessionValidation = await validateSession(request, env);
        if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
            return createResponse({ error: 'Authentifizierung erforderlich' }, 401, origin);
        }

        let userid = sessionValidation.steamId;
        userid = userid.endsWith('@steam') ? userid : `${userid}@steam`;

        // Parse request body
        let body: AdvertisementPostRequest;
        try {
            body = (await request.json()) as AdvertisementPostRequest;
        } catch {
            return createResponse({ error: 'Ungültiger JSON-Body' }, 400, origin);
        }

        // Validate request body with typia
        if (!typia.is<AdvertisementPostRequest>(body)) {
            return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
        }

        const location = body.location;
        const dates = body.dates;
        const fullRes = body.full_res;

        if (!location || !dates || dates.length === 0 || !fullRes) {
            return createResponse({ error: 'Fehlende erforderliche Felder: location, dates, full_res' }, 400, origin);
        }

        // Validate location
        if (!ADVERTISEMENT_LOCATIONS.includes(location as AdvertisementLocations)) {
            return createResponse({ error: 'Ungültige Location' }, 400, origin);
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        for (const date of dates) {
            if (!dateRegex.test(date)) {
                return createResponse({ error: `Ungültiges Datumsformat: ${date}. Erwartet: YYYY-MM-DD` }, 400, origin);
            }
        }

        // Calculate total cost
        const totalCost = dates.length * PRICE_PER_DAY_PER_LOCATION;

        // Check user's ZVC balance
        const userResult = await db.select({ experience: playerdata.experience }).from(playerdata).where(eq(playerdata.id, userid));

        if (userResult.length === 0) {
            return createResponse({ error: 'Benutzer nicht gefunden' }, 404, origin);
        }

        const userBalance = userResult[0]?.experience || 0;
        if (userBalance < totalCost) {
            return createResponse(
                {
                    error: `Nicht genügend ZVC. Benötigt: ${totalCost} ZVC, Verfügbar: ${userBalance} ZVC`,
                },
                400,
                origin,
            );
        }

        // Check if slots are available for requested dates and location
        const columnName = getLocationColumn(location);
        const existingDays = await db
            .select()
            .from(advertisementDays)
            .where(inArray(advertisementDays.day, dates));

        for (const existingDay of existingDays) {
            const existingCampaignId = existingDay[columnName] as number | null;
            if (existingCampaignId) {
                return createResponse(
                    {
                        error: `Slot bereits belegt am ${existingDay.day} für ${location}`,
                    },
                    400,
                    origin,
                );
            }
        }

        // Compute SHA-256 hash of the raw image data (truncate to first 10 chars)
        const base64Data = fullRes.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const hashBuffer = await crypto.subtle.digest('SHA-256', imageBuffer);
        const fullHash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        const sha256 = fullHash.substring(0, 10);

        // Create campaign record
        const campaignResult = await db
            .insert(advertisementCampaigns)
            .values({
                userId: userid,
                sha256: sha256,
                status: 'PENDING',
            })
            .returning({ id: advertisementCampaigns.id });

        const campaignId = campaignResult[0]?.id;
        if (!campaignId) {
            return createResponse({ error: 'Fehler beim Erstellen der Kampagne' }, 500, origin);
        }

        // Upload to S3
        const folder = getAdvertisementFolder(origin);
        const txtPath = `${folder}/${campaignId}.txt`;
        const base64Path = `${folder}/${campaignId}.base64`;

        // Upload placeholder text_toy (will be converted later)
        const placeholderTextToy = 'PLACEHOLDER_TEXT_TOY';
        const txtUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${txtPath}`;
        const txtRequest = await aws(env).sign(txtUrl, {
            method: 'PUT',
            body: placeholderTextToy,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
        const txtResponse = await fetch(txtRequest);
        if (!txtResponse.ok) {
            console.error('Failed to upload .txt file:', await txtResponse.text());
            // Rollback campaign creation
            await db.delete(advertisementCampaigns).where(eq(advertisementCampaigns.id, campaignId));
            return createResponse({ error: 'Fehler beim Hochladen der text_toy-Datei' }, 500, origin);
        }

        // Upload full_res as base64
        const base64Url = `https://s3.zeitvertreib.vip/${BUCKET}/${base64Path}`;
        const base64Request = await aws(env).sign(base64Url, {
            method: 'PUT',
            body: fullRes,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
        const base64Response = await fetch(base64Request);
        if (!base64Response.ok) {
            console.error('Failed to upload .base64 file:', await base64Response.text());
            // Rollback - delete txt file and campaign
            const deleteTxtRequest = await aws(env).sign(txtUrl, { method: 'DELETE' });
            await fetch(deleteTxtRequest);
            await db.delete(advertisementCampaigns).where(eq(advertisementCampaigns.id, campaignId));
            return createResponse({ error: 'Fehler beim Hochladen der full_res-Datei' }, 500, origin);
        }

        // Update/Insert advertisement days
        for (const date of dates) {
            const existingDay = existingDays.find((d) => d.day === date);
            if (existingDay) {
                // Update existing day entry
                await db
                    .update(advertisementDays)
                    .set({ [columnName]: campaignId })
                    .where(eq(advertisementDays.day, date));
            } else {
                // Insert new day entry
                const newDayValues: typeof advertisementDays.$inferInsert = {
                    day: date,
                };
                (newDayValues as any)[columnName] = campaignId;
                await db.insert(advertisementDays).values(newDayValues);
            }
        }

        // Deduct ZVC from user
        await db
            .update(playerdata)
            .set({ experience: userBalance - totalCost })
            .where(eq(playerdata.id, userid));

        return createResponse(
            {
                success: true,
                campaignId: campaignId,
                message: `Werbung erfolgreich erstellt. ${totalCost} ZVC wurden abgezogen.`,
                cost: totalCost,
                daysBooked: dates.length,
            },
            200,
            origin,
        );
    } catch (error) {
        console.error('Error in handlePostAdvertisement:', error);
        return createResponse(
            {
                error: 'Fehler beim Erstellen der Werbung',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            500,
            origin,
        );
    }
}
