import { AwsClient } from 'aws4fetch';
import { createResponse, validateSession, isDonator } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { sprays } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { SprayPostRequest, SprayDeleteRequest, SprayGetResponseItem } from '@zeitvertreib/types';

const BUCKET = 'test';
const SPRAY_FOLDER = 'sprays';
const SPRAY_FOLDER_LOCALHOST = 'sprays_localhost';

const aws = (env: Env): AwsClient =>
  new AwsClient({
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
    service: 's3',
    region: 'us-east-1',
  });

/**
 * Determine the spray folder based on the request origin
 */
function getSprayFolder(origin: string | null): string {
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    return SPRAY_FOLDER_LOCALHOST;
  }
  return SPRAY_FOLDER;
}

/**
 * POST /spray
 * Upload a new spray
 */
export async function handlePostSpray(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const db = drizzle(env.ZEITVERTREIB_DATA);

  try {
    // Authenticate
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Authentication required' }, 401, origin);
    }

    const userid = sessionValidation.steamId;

    // Parse request body
    let body: SprayPostRequest;
    try {
      body = (await request.json()) as SprayPostRequest;
    } catch {
      return createResponse({ error: 'Invalid JSON body' }, 400, origin);
    }

    const name = body.name;
    const full_res = body.full_res;
    const text_toy = body.text_toy;

    if (!name || !full_res || !text_toy) {
      return createResponse({ error: 'Missing required fields: name, full_res, text_toy' }, 400, origin);
    }

    if (name.length > 20) {
      return createResponse({ error: 'Spray name must be 20 characters or less' }, 400, origin);
    }

    const nameRegex = /^[a-zA-Z0-9_ ]+$/;
    if (!nameRegex.test(name)) {
      return createResponse(
        { error: 'Spray name can only contain letters, numbers, underscores, and spaces' },
        400,
        origin,
      );
    }

    // Check spray limit
    const userIsDonator = await isDonator(userid, env);
    const maxSprays = userIsDonator ? 3 : 2;

    const existingSprays = await db
      .select()
      .from(sprays)
      .where(and(eq(sprays.userid, userid), eq(sprays.deletedAt, 0)));

    if (existingSprays.length >= maxSprays) {
      return createResponse(
        {
          error: `Spray limit reached. ${userIsDonator ? 'Donators' : 'Users'} can have up to ${maxSprays} sprays.`,
        },
        400,
        origin,
      );
    }

    // Insert into database
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const result = await db
      .insert(sprays)
      .values({
        userid,
        name,
        uploadedAt: currentTimestamp,
        deletedAt: 0,
      })
      .returning({ id: sprays.id });

    const sprayId = result[0]?.id;
    if (!sprayId) {
      return createResponse({ error: 'Failed to create spray record' }, 500, origin);
    }

    // Upload to S3 (use environment-specific folder)
    const folder = getSprayFolder(origin);
    const basePath = `${folder}/${sprayId}`;
    const txtPath = `${basePath}.txt`;
    const base64Path = `${basePath}.base64`;

    // Upload .txt file
    const txtUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${txtPath}`;
    const txtRequest = await aws(env).sign(txtUrl, {
      method: 'PUT',
      body: text_toy,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
    const txtResponse = await fetch(txtRequest);
    if (!txtResponse.ok) {
      console.error('Failed to upload .txt file:', await txtResponse.text());
      return createResponse({ error: 'Failed to upload text_toy to storage' }, 500, origin);
    }

    // Upload .base64 file
    const base64Url = `https://s3.zeitvertreib.vip/${BUCKET}/${base64Path}`;
    const base64Request = await aws(env).sign(base64Url, {
      method: 'PUT',
      body: full_res,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
    const base64Response = await fetch(base64Request);
    if (!base64Response.ok) {
      console.error('Failed to upload .base64 file:', await base64Response.text());
      return createResponse({ error: 'Failed to upload full_res to storage' }, 500, origin);
    }

    return createResponse(
      {
        success: true,
        id: sprayId,
        message: 'Spray uploaded successfully',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error in handlePostSpray:', error);
    return createResponse(
      {
        error: 'Failed to upload spray',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

/**
 * DELETE /spray
 * Soft delete a spray
 */
export async function handleDeleteSpray(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const db = drizzle(env.ZEITVERTREIB_DATA);

  try {
    // Authenticate
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Authentication required' }, 401, origin);
    }

    const userid = sessionValidation.steamId;

    // Parse request body
    let body: SprayDeleteRequest;
    try {
      body = (await request.json()) as SprayDeleteRequest;
    } catch {
      return createResponse({ error: 'Invalid JSON body' }, 400, origin);
    }

    const id = body.id;
    if (!id) {
      return createResponse({ error: 'Missing required field: id' }, 400, origin);
    }

    // Verify ownership
    const existingSpray = await db
      .select()
      .from(sprays)
      .where(and(eq(sprays.id, id), eq(sprays.userid, userid)))
      .limit(1);

    if (existingSpray.length === 0) {
      return createResponse({ error: 'Spray not found or access denied' }, 404, origin);
    }

    // Soft delete
    const currentTimestamp = Math.floor(Date.now() / 1000);
    await db.update(sprays).set({ deletedAt: currentTimestamp }).where(eq(sprays.id, id));

    return createResponse(
      {
        success: true,
        message: 'Spray deleted successfully',
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Error in handleDeleteSpray:', error);
    return createResponse(
      {
        error: 'Failed to delete spray',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

/**
 * GET /spray
 * Get all sprays for the authenticated user
 */
export async function handleGetSpray(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const db = drizzle(env.ZEITVERTREIB_DATA);

  try {
    // Authenticate
    const sessionValidation = await validateSession(request, env);
    if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
      return createResponse({ error: 'Authentication required' }, 401, origin);
    }

    const userid = sessionValidation.steamId;

    // Parse query params
    const url = new URL(request.url);
    const includeFull = url.searchParams.get('full_res') === 'true';
    const includeText = url.searchParams.get('text_toy') === 'true';

    // Fetch sprays from database
    const userSprays = await db
      .select()
      .from(sprays)
      .where(and(eq(sprays.userid, userid), eq(sprays.deletedAt, 0)));

    // Build response
    const folder = getSprayFolder(origin);
    const sprayItems = await Promise.all(
      userSprays.map(async (spray) => {
        const item: {
          id: number;
          name: string;
          full_res?: string;
          text_toy?: string;
        } = {
          id: spray.id,
          name: spray.name,
        };

        // Conditionally fetch from S3 (use environment-specific folder)
        const basePath = `${folder}/${spray.id}`;

        if (includeFull) {
          const base64Path = `${basePath}.base64`;
          const base64Url = `https://s3.zeitvertreib.vip/${BUCKET}/${base64Path}`;
          const base64Request = await aws(env).sign(base64Url, { method: 'GET' });
          const base64Response = await fetch(base64Request);
          if (base64Response.ok) {
            item.full_res = await base64Response.text();
          } else {
            console.warn(`Failed to fetch full_res for spray ${spray.id}`);
          }
        }

        if (includeText) {
          const txtPath = `${basePath}.txt`;
          const txtUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${txtPath}`;
          const txtRequest = await aws(env).sign(txtUrl, { method: 'GET' });
          const txtResponse = await fetch(txtRequest);
          if (txtResponse.ok) {
            item.text_toy = await txtResponse.text();
          } else {
            console.warn(`Failed to fetch text_toy for spray ${spray.id}`);
          }
        }

        return item;
      }),
    );

    const response: SprayGetResponseItem = {
      sprays: sprayItems,
    };

    return createResponse(response, 200, origin);
  } catch (error) {
    console.error('Error in handleGetSpray:', error);
    return createResponse(
      {
        error: 'Failed to retrieve sprays',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}
