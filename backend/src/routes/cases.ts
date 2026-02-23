import { AwsClient } from 'aws4fetch';
import {
  createResponse,
  validateSession,
  isTeam,
  fetchSteamUserData,
  validateSteamId,
  fetchDiscordUserData,
} from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, asc, inArray, sql, and } from 'drizzle-orm';
import { cases, casesRelatedUsers, discordInfo, playerdata } from '../db/schema.js';
import typia from 'typia';
import {
  CaseFileUploadGetResponse,
  CaseListItem,
  ListCasesGetResponse,
  ListCasesBySteamIdGetResponse,
  GetCaseMetadataGetResponse,
  CreateCasePostResponse,
  UpdateCaseMetadataPutRequest,
  UpdateCaseMetadataPutResponse,
  CaseCategory,
} from '@zeitvertreib/types';

const BUCKET = 'zeitvertreib-tickets';

// Allowed file extensions
const ALLOWED_EXTENSIONS = [
  // Images
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'bmp',
  'svg',
  // Videos
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
  // Audio
  'mp3',
  'wav',
  'ogg',
  // Documents
  'pdf',
  'txt',
  'md',
  // Archives
  'zip',
  'tar',
  'gz',
];

const aws = (env: Env): AwsClient =>
  new AwsClient({
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
    service: 's3',
    region: 'us-east-1',
  });

async function caseExists(caseId: string, env: Env): Promise<boolean> {
  const checkUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${caseId}/`;
  const checkRequest = await aws(env).sign(checkUrl, {
    method: 'HEAD',
  });
  const checkResponse = await fetch(checkRequest);
  return checkResponse.ok;
}

async function updateCaseLastUpdatedAt(caseId: string, env: Env): Promise<void> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const now = Date.now();
  await db.update(cases).set({ lastUpdatedAt: now }).where(eq(cases.id, caseId));
}

/// GET /cases/upload?case={caseId}&extension={ext}
export async function handleCaseFileUpload(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse(
      { error: validation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  if (!(await isTeam(validation.steamId, env))) {
    return createResponse({ error: 'Unauthorized' }, 401, origin);
  }

  try {
    // Get folder and extension from query parameters
    const url = new URL(request.url);
    const caseId = url.searchParams.get('case');
    const extension = url.searchParams.get('extension') || '';

    if (!caseId) {
      return createResponse({ error: 'Missing required parameter: case' }, 400, origin);
    }

    // Validate extension if provided
    if (extension && !ALLOWED_EXTENSIONS.includes(extension.toLowerCase())) {
      return createResponse(
        {
          error: 'Invalid file extension',
          allowedExtensions: ALLOWED_EXTENSIONS,
        },
        400,
        origin,
      );
    }

    if (!caseExists(caseId, env)) {
      return createResponse({ error: `Case ${caseId} does not exist` }, 404, origin);
    }

    // Generate random filename
    const randomName = crypto.randomUUID();
    const filename = `${randomName}.${extension}`;

    // Create presigned PUT URL with 1 hour expiry
    const presignedUrl = await aws(env).sign(`https://s3.zeitvertreib.vip/${BUCKET}/${caseId}/${filename}`, {
      method: 'PUT',
      aws: { signQuery: true },
    });

    await updateCaseLastUpdatedAt(caseId, env);

    // Return the presigned PUT URL
    const responseBody: CaseFileUploadGetResponse = {
      url: presignedUrl.url,
      method: 'PUT',
    };
    return createResponse(responseBody, 200, origin);
  } catch (error) {
    console.error('Presigned URL generation error:', error);
    return createResponse(
      {
        error: 'Failed to generate upload URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

/// GET /cases?page=1&limit=20&sortBy=createdAt&sortOrder=desc&createdByDiscordId=123
/// GET /cases?steamId=76561198XXXXXXXXX  — returns ALL cases linked to that steamId, no pagination
export async function handleListCases(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Authentifizierung erforderlich' }, 401, origin);
    }
    const userid = sessionValidation.steamId;

    if (!(await isTeam(userid, env))) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // Parse query parameters for pagination and sorting
    const url = new URL(request.url);
    const filterBySteamId = url.searchParams.get('steamId');

    // If steamId is provided, return ALL cases linked to that steamId without pagination
    if (filterBySteamId) {
      const linkedCaseRows = await db
        .select({ caseId: casesRelatedUsers.caseId })
        .from(casesRelatedUsers)
        .where(eq(casesRelatedUsers.steamId, filterBySteamId));

      const linkedCaseIds = linkedCaseRows.map((r) => r.caseId).filter((id): id is string => id !== null);

      if (linkedCaseIds.length === 0) {
        return createResponse({ cases: [] }, 200, origin);
      }

      const casesList = await db
        .select({
          id: cases.id,
          title: cases.title,
          description: cases.description,
          category: cases.category,
          createdByDiscordId: cases.createdByDiscordId,
          createdAt: cases.createdAt,
          lastUpdatedAt: cases.lastUpdatedAt,
        })
        .from(cases)
        .where(inArray(cases.id, linkedCaseIds))
        .orderBy(desc(cases.createdAt));

      const allLinkedUsers = await db
        .select({
          caseId: casesRelatedUsers.caseId,
          steamId: casesRelatedUsers.steamId,
        })
        .from(casesRelatedUsers)
        .where(inArray(casesRelatedUsers.caseId, linkedCaseIds));

      const linkedUsersMap: Record<string, string[]> = {};
      for (const link of allLinkedUsers) {
        if (link.caseId) {
          const existingList = linkedUsersMap[link.caseId];
          if (existingList) {
            existingList.push(link.steamId);
          } else {
            linkedUsersMap[link.caseId] = [link.steamId];
          }
        }
      }

      const createdByList = await Promise.all(
        casesList.map((c) => fetchDiscordUserData(c.createdByDiscordId, env, ctx)),
      );

      const casesWithLinkedUsers: CaseListItem[] = casesList.map((c, index) => ({
        caseId: c.id,
        title: c.title,
        description: c.description,
        category: c.category as CaseCategory,
        createdBy: {
          discordId: c.createdByDiscordId,
          displayName: createdByList[index]?.displayName || c.createdByDiscordId,
          username: createdByList[index]?.username || c.createdByDiscordId,
          avatarUrl: createdByList[index]?.avatarUrl || '',
        },
        createdAt: c.createdAt,
        lastUpdatedAt: c.lastUpdatedAt,
        linkedSteamIds: linkedUsersMap[c.id] || [],
      }));

      const steamIdResponse: ListCasesBySteamIdGetResponse = { cases: casesWithLinkedUsers };
      return createResponse(steamIdResponse, 200, origin);
    }

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const sortBy = url.searchParams.get('sortBy') === 'lastUpdatedAt' ? 'lastUpdatedAt' : 'createdAt';
    const sortOrder = url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
    const filterByDiscordId = url.searchParams.get('createdByDiscordId');
    const filterByCategory = url.searchParams.get('category') as CaseCategory | null;
    const offset = (page - 1) * limit;

    // Build the query with optional filters
    const whereConditions = [];
    if (filterByDiscordId) {
      whereConditions.push(eq(cases.createdByDiscordId, filterByDiscordId));
    }
    if (filterByCategory) {
      whereConditions.push(eq(cases.category, filterByCategory));
    }
    const whereCondition = whereConditions.length > 0 ? and(...whereConditions) : undefined;
    const orderByColumn = sortBy === 'lastUpdatedAt' ? cases.lastUpdatedAt : cases.createdAt;
    const orderByDirection = sortOrder === 'asc' ? asc(orderByColumn) : desc(orderByColumn);

    // Get total count for pagination info
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(cases)
      .where(whereCondition);
    const totalCount = countResult[0]?.count || 0;

    // Query cases with pagination and sorting
    const casesList = await db
      .select({
        id: cases.id,
        title: cases.title,
        description: cases.description,
        category: cases.category,
        createdByDiscordId: cases.createdByDiscordId,
        createdAt: cases.createdAt,
        lastUpdatedAt: cases.lastUpdatedAt,
      })
      .from(cases)
      .where(whereCondition)
      .orderBy(orderByDirection)
      .limit(limit)
      .offset(offset);

    // Get linked steam IDs for all cases in one query
    const caseIds = casesList.map((c) => c.id);
    let linkedUsersMap: Record<string, string[]> = {};

    if (caseIds.length > 0) {
      const linkedUsers = await db
        .select({
          caseId: casesRelatedUsers.caseId,
          steamId: casesRelatedUsers.steamId,
        })
        .from(casesRelatedUsers)
        .where(inArray(casesRelatedUsers.caseId, caseIds));

      for (const link of linkedUsers) {
        if (link.caseId) {
          const existingList = linkedUsersMap[link.caseId];
          if (existingList) {
            existingList.push(link.steamId);
          } else {
            linkedUsersMap[link.caseId] = [link.steamId];
          }
        }
      }
    }

    // Fetch creator data for all cases
    const createdByList = await Promise.all(casesList.map((c) => fetchDiscordUserData(c.createdByDiscordId, env, ctx)));

    // Build response with linked steam IDs
    const casesWithLinkedUsers: CaseListItem[] = casesList.map((c, index) => ({
      caseId: c.id,
      title: c.title,
      description: c.description,
      category: c.category as CaseCategory,
      createdBy: {
        discordId: c.createdByDiscordId,
        displayName: createdByList[index]?.displayName || c.createdByDiscordId,
        username: createdByList[index]?.username || c.createdByDiscordId,
        avatarUrl: createdByList[index]?.avatarUrl || '',
      },
      createdAt: c.createdAt,
      lastUpdatedAt: c.lastUpdatedAt,
      linkedSteamIds: linkedUsersMap[c.id] || [],
    }));

    const totalPages = Math.ceil(totalCount / limit);

    const paginatedResponse: ListCasesGetResponse = {
      cases: casesWithLinkedUsers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
    return createResponse(paginatedResponse, 200, origin);
  } catch (error) {
    console.error('List cases error:', error);
    return createResponse(
      {
        error: 'Failed to list cases',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

/// GET /cases/metadata?case={caseId} - Returns full case details: DB row, linked users, and file list
export async function handleGetCaseMetadata(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Get case ID from query parameter
    const url = new URL(request.url);
    const caseId = url.searchParams.get('case');

    if (!caseId) {
      return createResponse({ error: 'Missing required parameter: case' }, 400, origin);
    }

    // Fetch the full case row from DB
    const caseResult = await db
      .select({
        id: cases.id,
        title: cases.title,
        description: cases.description,
        category: cases.category,
        createdByDiscordId: cases.createdByDiscordId,
        createdAt: cases.createdAt,
        lastUpdatedAt: cases.lastUpdatedAt,
      })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);

    if (caseResult.length === 0 || !caseExists(caseId, env)) {
      return createResponse({ error: 'Case not found' }, 404, origin);
    }

    const caseRow = caseResult[0]!;

    // Fetch linked steam IDs then resolve each via fetchSteamUserData (refreshes stale cache)
    const linkedSteamIdRows = await db
      .select({ steamId: casesRelatedUsers.steamId })
      .from(casesRelatedUsers)
      .where(eq(casesRelatedUsers.caseId, caseId));

    const linkedUsers = await Promise.all(
      linkedSteamIdRows.map(async (row) => {
        const steamData = await fetchSteamUserData(row.steamId, env, ctx);
        return {
          steamId: row.steamId,
          username: steamData?.username || row.steamId,
          avatarUrl: steamData?.avatarUrl || '',
        };
      }),
    );

    // List all files in the S3 folder
    const listUrl = `https://s3.zeitvertreib.vip/${BUCKET}/?list-type=2&prefix=${caseId}/`;
    const listRequest = await aws(env).sign(listUrl, {
      method: 'GET',
    });
    const listResponse = await fetch(listRequest);

    if (!listResponse.ok) {
      throw new Error(`Failed to list files for ${caseId}`);
    }

    const listXml = await listResponse.text();

    const contentsRegex = /<Contents>(.*?)<\/Contents>/gs;
    const contentsMatches = Array.from(listXml.matchAll(contentsRegex));

    const files: Array<{ name: string; size: number; createdAt: number; url: string }> = [];

    for (const match of contentsMatches) {
      const content = match[1] || '';

      const keyMatch = content.match(/<Key>([^<]+)<\/Key>/);
      const key = keyMatch ? keyMatch[1] : '';

      // Skip the folder marker
      if (!key || key === `${caseId}/`) {
        continue;
      }

      const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
      const size = sizeMatch ? parseInt(sizeMatch[1] || '0', 10) : 0;

      const lastModifiedMatch = content.match(/<LastModified>([^<]+)<\/LastModified>/);
      const createdAt = lastModifiedMatch ? new Date(lastModifiedMatch[1] || '').getTime() : 0;

      const fileName = key.replace(`${caseId}/`, '');

      // Generate presigned GET URL with 20-minute expiry
      const getPresignedUrl = await aws(env).sign(`https://s3.zeitvertreib.vip/${BUCKET}/${caseId}/${fileName}`, {
        method: 'GET',
        aws: { signQuery: true },
      });

      files.push({
        name: fileName,
        size,
        createdAt,
        url: getPresignedUrl.url,
      });
    }

    const createdBy = await fetchDiscordUserData(caseRow.createdByDiscordId, env, ctx);

    const metadataResponse: GetCaseMetadataGetResponse = {
      id: caseRow.id,
      caseId,
      title: caseRow.title,
      description: caseRow.description,
      category: caseRow.category as CaseCategory,
      createdBy: {
        discordId: caseRow.createdByDiscordId,
        displayName: createdBy?.displayName || caseRow.createdByDiscordId,
        username: createdBy?.username || caseRow.createdByDiscordId,
        avatarUrl: createdBy?.avatarUrl || '',
      },
      createdAt: caseRow.createdAt,
      lastUpdatedAt: caseRow.lastUpdatedAt,
      linkedUsers: linkedUsers.map((u) => ({
        steamId: u.steamId,
        username: u.username || u.steamId,
        avatarUrl: u.avatarUrl || '',
      })),
      files,
    };
    return createResponse(metadataResponse, 200, origin);
  } catch (error) {
    console.error('Get case metadata error:', error);
    return createResponse(
      {
        error: 'Failed to get case metadata',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

/// POST /cases
export async function handleCreateCase(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Authentifizierung erforderlich' }, 401, origin);
    }
    let userid = sessionValidation.steamId;
    const discordId = await db
      .select({ discordId: playerdata.discordId })
      .from(playerdata)
      .where(eq(playerdata.id, userid))
      .limit(1);

    if (!(await isTeam(userid, env)) || discordId[0]?.discordId === null) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // Generate SHA-256 from random UUID and take first 10 chars
    const randomData = crypto.randomUUID();
    const encoder = new TextEncoder();
    const data = encoder.encode(randomData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    const caseId = hashHex.substring(0, 10);

    await db.insert(cases).values({
      id: caseId,
      createdByDiscordId: discordId[0]!.discordId,
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
    });

    // Create a folder by uploading an empty object with trailing slash
    const url = `https://s3.zeitvertreib.vip/${BUCKET}/${caseId}/`;
    const signedRequest = await aws(env).sign(url, {
      method: 'PUT',
      body: new Uint8Array(0),
    });

    const response = await fetch(signedRequest);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`S3 request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const createResponse_: CreateCasePostResponse = { caseId };
    return createResponse(createResponse_, 200, origin);
  } catch (error) {
    console.error('Create folder error:', error);
    return createResponse(
      {
        error: 'Failed to create folder',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

/// PUT /cases/metadata?case={caseId}
/// Body (all fields optional; omitting a field leaves it unchanged):
///   title?: string
///   description?: string
///   linkedSteamIds?: string[]  — replaces the entire linked-user list when present
export async function handleUpdateCaseMetadata(request: Request, env: Env): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Authentifizierung erforderlich' }, 401, origin);
    }
    const userid = sessionValidation.steamId;

    if (!(await isTeam(userid, env))) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    const url = new URL(request.url);
    const caseId = url.searchParams.get('case');

    if (!caseId) {
      return createResponse({ error: 'Missing required parameter: case' }, 400, origin);
    }

    // Parse and validate request body with typia
    let bodyRaw: unknown;
    try {
      bodyRaw = await request.json();
    } catch {
      return createResponse({ error: 'Invalid JSON in request body' }, 400, origin);
    }

    if (!typia.is<UpdateCaseMetadataPutRequest>(bodyRaw)) {
      return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
    }

    const body = bodyRaw as UpdateCaseMetadataPutRequest;

    // Verify case exists in DB
    const caseResult = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId)).limit(1);
    if (caseResult.length === 0) {
      return createResponse({ error: 'Case not found' }, 404, origin);
    }

    // Build DB update — only include fields explicitly present in the body
    const updateFields: Partial<{ title: string; description: string; category: CaseCategory; lastUpdatedAt: number }> =
      {
        lastUpdatedAt: Date.now(),
      };

    if ('title' in body && body.title !== undefined) {
      updateFields.title = body.title;
    }

    if ('description' in body && body.description !== undefined) {
      updateFields.description = body.description;
    }

    if ('category' in body && body.category !== undefined) {
      updateFields.category = body.category as CaseCategory;
    }

    await db.update(cases).set(updateFields).where(eq(cases.id, caseId));

    // Replace linked users when linkedSteamIds is present in the body
    if ('linkedSteamIds' in body && body.linkedSteamIds !== undefined) {
      // Validate and normalize each Steam ID
      const validatedIds: string[] = [];
      const invalidIds: string[] = [];

      for (const id of body.linkedSteamIds) {
        const validation = validateSteamId(id);
        if (validation.valid && validation.normalized) {
          validatedIds.push(validation.normalized);
        } else {
          invalidIds.push(`${id} (${validation.error})`);
        }
      }

      if (invalidIds.length > 0) {
        return createResponse(
          {
            error: 'One or more Steam IDs are invalid',
            invalidIds,
          },
          400,
          origin,
        );
      }

      // Deduplicate validated Steam IDs
      const uniqueSteamIds = Array.from(new Set(validatedIds));

      // Remove all previous links then insert the new list
      await db.delete(casesRelatedUsers).where(eq(casesRelatedUsers.caseId, caseId));
      if (uniqueSteamIds.length > 0) {
        await db.insert(casesRelatedUsers).values(uniqueSteamIds.map((steamId) => ({ caseId, steamId })));
      }
    }

    const updateResult: UpdateCaseMetadataPutResponse = { success: true, caseId };
    return createResponse(updateResult, 200, origin);
  } catch (error) {
    console.error('Update case metadata error:', error);
    return createResponse(
      {
        error: 'Failed to update case metadata',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}
