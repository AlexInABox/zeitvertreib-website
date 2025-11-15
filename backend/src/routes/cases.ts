import { AwsClient } from 'aws4fetch';
import { createResponse, validateSession, getPlayerData } from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';

const BUCKET = 'test';

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

// Helper function to check if user has required permissions
async function hasPermission(
  request: Request,
  db: ReturnType<typeof drizzle>,
  env: Env,
): Promise<boolean> {
  const { isValid, session } = await validateSession(request, env);

  if (!isValid || !session) {
    return false;
  }

  // Get player data to check admin status
  const playerData = await getPlayerData(session.steamId, db, env);

  // Check if user has fakerank admin access based on unix timestamp
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const fakerankAdminUntil = playerData?.fakerankadmin_until || 0;

  // If fakerankadmin_until is 0 or current time is past the expiration, no access
  if (fakerankAdminUntil === 0 || currentTimestamp > fakerankAdminUntil) {
    return false;
  }

  return true;
}

/// GET /cases/upload?case={caseId}&extension={ext}
export async function handleCaseFileUpload(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Get folder and extension from query parameters
    const url = new URL(request.url);
    const caseId = url.searchParams.get('case');
    const extension = url.searchParams.get('extension') || '';
    console.log('caseId:', caseId, 'extension:', extension);

    if (!caseId) {
      return createResponse(
        { error: 'Missing required parameter: case' },
        400,
        origin,
      );
    }

    // Validate case ID format (5 lowercase letters or numbers)
    if (!/^[a-z0-9]{5}$/.test(caseId)) {
      return createResponse(
        {
          error: 'Invalid case format. Must be 5 lowercase letters or numbers',
        },
        400,
        origin,
      );
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

    // Verify that the folder exists
    const folderPath = `case-${caseId}`;
    const checkUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${folderPath}/`;
    const checkRequest = await aws(env).sign(checkUrl, {
      method: 'HEAD',
    });
    const checkResponse = await fetch(checkRequest);

    if (checkResponse.status === 404) {
      return createResponse(
        { error: `Folder ${folderPath} does not exist` },
        404,
        origin,
      );
    }

    // Generate random filename
    const randomName = crypto.randomUUID();
    const filename = extension ? `${randomName}.${extension}` : randomName;
    const filePath = `case-${caseId}/${filename}`;

    // Create presigned PUT URL with 1 hour expiry
    const presignedUrl = await aws(env).sign(
      `https://s3.zeitvertreib.vip/${BUCKET}/${filePath}`,
      {
        method: 'PUT',
        aws: { signQuery: true },
      },
    );

    // Return the presigned PUT URL
    return createResponse(
      {
        url: presignedUrl.url,
        method: 'PUT',
        filename,
        fileUrl: `https://s3.zeitvertreib.vip/${BUCKET}/${filePath}`,
        expiresIn: 3600,
      },
      200,
      origin,
    );
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

/// GET /cases
export async function handleListCases(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const authorized = await hasPermission(request, db, env);
    if (!authorized) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // List objects with delimiter to get folders
    const url = `https://s3.zeitvertreib.vip/${BUCKET}/?list-type=2&delimiter=/`;
    const signedRequest = await aws(env).sign(url, {
      method: 'GET',
    });

    const response = await fetch(signedRequest);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `S3 request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const xmlText = await response.text();

    // Parse XML response to extract CommonPrefixes
    const prefixMatches = xmlText.matchAll(/<Prefix>([^<]+)<\/Prefix>/g);
    const caseFolders = Array.from(prefixMatches)
      .map((match) => match[1]?.replace('/', '') || '')
      .filter((folder) => folder.startsWith('case-'));

    return createResponse(
      {
        folders: caseFolders,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('List folders error:', error);
    return createResponse(
      {
        error: 'Failed to list folders',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

/// GET /cases/metadata?case={caseId}
export async function handleGetCaseMetadata(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Get case ID from query parameter
    const url = new URL(request.url);
    const caseId = url.searchParams.get('case');

    if (!caseId) {
      return createResponse(
        { error: 'Missing required parameter: case' },
        400,
        origin,
      );
    }

    // Validate case ID format (5 lowercase letters or numbers)
    if (!/^[a-z0-9]{5}$/.test(caseId)) {
      return createResponse(
        {
          error: 'Invalid case format. Must be 5 lowercase letters or numbers',
        },
        400,
        origin,
      );
    }

    const folderName = `case-${caseId}`;

    // List all files in the folder to get count, size, and last modified
    const listUrl = `https://s3.zeitvertreib.vip/${BUCKET}/?list-type=2&prefix=${folderName}/`;
    const listRequest = await aws(env).sign(listUrl, {
      method: 'GET',
    });
    const listResponse = await fetch(listRequest);

    if (!listResponse.ok) {
      if (listResponse.status === 404) {
        return createResponse({ error: 'Case not found' }, 404, origin);
      }
      throw new Error(`Failed to list files for ${folderName}`);
    }

    const listXml = await listResponse.text();

    // Extract all file entries (Contents elements)
    const contentsRegex = /<Contents>(.*?)<\/Contents>/gs;
    const contentsMatches = Array.from(listXml.matchAll(contentsRegex));

    // If no contents found, the folder doesn't exist
    if (contentsMatches.length === 0) {
      return createResponse({ error: 'Case not found' }, 404, origin);
    }

    let fileCount = 0;
    let totalSize = 0;
    let createdAt = 0;
    let lastModified = 0;

    for (const match of contentsMatches) {
      const content = match[1] || '';

      // Extract Key to skip the folder itself
      const keyMatch = content.match(/<Key>([^<]+)<\/Key>/);
      const key = keyMatch ? keyMatch[1] : '';

      // Skip the folder marker (ends with /)
      if (key === `${folderName}/`) {
        // Get creation date from folder marker
        const folderModifiedMatch = content.match(
          /<LastModified>([^<]+)<\/LastModified>/,
        );
        if (folderModifiedMatch) {
          createdAt = new Date(folderModifiedMatch[1] || '').getTime();
        }
        continue;
      }

      // Check if this is the .meta file
      const isMetaFile = key ? key.endsWith('/.meta') : false;

      // Only count and add size for non-.meta files
      if (!isMetaFile) {
        fileCount++;

        // Extract Size
        const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
        if (sizeMatch) {
          totalSize += parseInt(sizeMatch[1] || '0', 10);
        }
      }

      // Extract LastModified for tracking most recent update (including .meta file)
      const modifiedMatch = content.match(
        /<LastModified>([^<]+)<\/LastModified>/,
      );
      if (modifiedMatch) {
        const fileModified = new Date(modifiedMatch[1] || '').getTime();
        if (fileModified > lastModified) {
          lastModified = fileModified;
        }
      }
    }

    // If no creation date from folder marker, use the oldest file or 0
    if (createdAt === 0 && lastModified > 0) {
      createdAt = lastModified;
    }

    // Try to fetch .meta file if it exists
    let metaData = null;
    try {
      const metaFileKey = `${folderName}/.meta`;
      const metaUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${metaFileKey}`;
      const metaRequest = await aws(env).sign(metaUrl, {
        method: 'GET',
      });
      const metaResponse = await fetch(metaRequest);

      if (metaResponse.ok) {
        const metaText = await metaResponse.text();
        try {
          metaData = JSON.parse(metaText);
        } catch (parseError) {
          console.warn('Failed to parse .meta file as JSON:', parseError);
        }
      }
    } catch (metaError) {
      // .meta file doesn't exist or couldn't be fetched, that's okay
      console.log('No .meta file found or error fetching it:', metaError);
    }

    const responseData: any = {
      id: folderName,
      caseId: caseId,
      createdAt,
      lastModified: lastModified || createdAt,
      fileCount,
      totalSize,
    };

    // Merge meta data directly into response if it exists
    if (metaData !== null && typeof metaData === 'object') {
      Object.assign(responseData, metaData);
    }

    return createResponse(responseData, 200, origin);
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
export async function handleCreateCase(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const authorized = await hasPermission(request, db, env);
    if (!authorized) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // Generate random 5-character alphanumeric string and check if it exists
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let folderName = '';
    let maxAttempts = 10;
    let attempts = 0;

    while (attempts < maxAttempts) {
      let randomId = '';
      for (let i = 0; i < 5; i++) {
        randomId += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      folderName = `case-${randomId}`;

      // Check if folder already exists
      const checkUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${folderName}/`;
      const checkRequest = await aws(env).sign(checkUrl, {
        method: 'HEAD',
      });
      const checkResponse = await fetch(checkRequest);

      // If folder doesn't exist (404), we can use this name
      if (checkResponse.status === 404) {
        break;
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error(
        'Failed to generate unique folder name after multiple attempts',
      );
    }

    // Create a folder by uploading an empty object with trailing slash
    const url = `https://s3.zeitvertreib.vip/${BUCKET}/${folderName}/`;
    const signedRequest = await aws(env).sign(url, {
      method: 'PUT',
      body: new Uint8Array(0),
    });

    const response = await fetch(signedRequest);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `S3 request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return createResponse(
      {
        folderName,
      },
      200,
      origin,
    );
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
export async function handleUpdateCaseMetadata(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const authorized = await hasPermission(request, db, env);
    if (!authorized) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // Get case ID from query parameter
    const url = new URL(request.url);
    const caseId = url.searchParams.get('case');

    if (!caseId) {
      return createResponse(
        { error: 'Missing required parameter: case' },
        400,
        origin,
      );
    }

    // Validate case ID format (5 lowercase letters or numbers)
    if (!/^[a-z0-9]{5}$/.test(caseId)) {
      return createResponse(
        {
          error: 'Invalid case format. Must be 5 lowercase letters or numbers',
        },
        400,
        origin,
      );
    }

    // Parse request body as JSON
    let metaData: any;
    try {
      metaData = await request.json();
    } catch (parseError) {
      return createResponse(
        { error: 'Invalid JSON in request body' },
        400,
        origin,
      );
    }

    // Verify that the case folder exists
    const folderName = `case-${caseId}`;
    const checkUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${folderName}/`;
    const checkRequest = await aws(env).sign(checkUrl, {
      method: 'HEAD',
    });
    const checkResponse = await fetch(checkRequest);

    if (checkResponse.status === 404) {
      return createResponse({ error: 'Case not found' }, 404, origin);
    }

    // Upload the .meta file
    const metaFileKey = `${folderName}/.meta`;
    const metaUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${metaFileKey}`;
    const metaJson = JSON.stringify(metaData, null, 2);

    const putRequest = await aws(env).sign(metaUrl, {
      method: 'PUT',
      body: metaJson,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const putResponse = await fetch(putRequest);

    if (!putResponse.ok) {
      const errorText = await putResponse.text();
      throw new Error(
        `S3 request failed: ${putResponse.status} ${putResponse.statusText} - ${errorText}`,
      );
    }

    return createResponse(
      {
        success: true,
        caseId,
        message: 'Metadata updated successfully',
      },
      200,
      origin,
    );
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

/// GET /cases/files?case={caseId}
export async function handleListCaseFiles(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Get case ID from query parameter
    const url = new URL(request.url);
    const caseId = url.searchParams.get('case');

    if (!caseId) {
      return createResponse(
        { error: 'Missing required parameter: case' },
        400,
        origin,
      );
    }

    // Validate case ID format (5 lowercase letters or numbers)
    if (!/^[a-z0-9]{5}$/.test(caseId)) {
      return createResponse(
        {
          error: 'Invalid case format. Must be 5 lowercase letters or numbers',
        },
        400,
        origin,
      );
    }

    // List objects in the case folder
    const folderPath = `case-${caseId}`;
    const listUrl = `https://s3.zeitvertreib.vip/${BUCKET}/?list-type=2&prefix=${folderPath}/`;
    const signedRequest = await aws(env).sign(listUrl, {
      method: 'GET',
    });

    const response = await fetch(signedRequest);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `S3 request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const xmlText = await response.text();

    // Parse XML response to extract file information with metadata
    const contentsRegex = /<Contents>(.*?)<\/Contents>/gs;
    const contentsMatches = Array.from(xmlText.matchAll(contentsRegex));

    const fileData = contentsMatches
      .map((match) => {
        const content = match[1] || '';

        // Extract Key
        const keyMatch = content.match(/<Key>([^<]+)<\/Key>/);
        const key = keyMatch ? keyMatch[1] : '';

        // Skip the folder itself and .meta file
        if (!key || key === `${folderPath}/` || key.endsWith('/.meta')) {
          return null;
        }

        // Extract LastModified (creation/upload date)
        const lastModifiedMatch = content.match(
          /<LastModified>([^<]+)<\/LastModified>/,
        );
        const lastModified = lastModifiedMatch
          ? new Date(lastModifiedMatch[1] || '').getTime()
          : 0;

        // Extract Size
        const sizeMatch = content.match(/<Size>(\d+)<\/Size>/);
        const size = sizeMatch ? parseInt(sizeMatch[1] || '0', 10) : 0;

        const fileName = key.replace(`${folderPath}/`, '');

        return {
          key,
          fileName,
          lastModified,
          size,
        };
      })
      .filter((file) => file !== null);

    // Generate presigned GET URLs for each file (valid for 20 minutes = 1200 seconds)
    const filesWithLinks = await Promise.all(
      fileData.map(async (fileInfo) => {
        // Create URL with X-Amz-Expires query parameter before signing
        const baseUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${fileInfo.key}`;
        const urlWithExpiry = `${baseUrl}?X-Amz-Expires=1200`;

        const presignedUrl = await aws(env).sign(urlWithExpiry, {
          method: 'GET',
          aws: {
            signQuery: true,
          },
        });

        return {
          name: fileInfo.fileName,
          viewUrl: presignedUrl.url,
          uploadedAt: fileInfo.lastModified,
          size: fileInfo.size,
          expiresIn: 1200, // 20 minutes in seconds
        };
      }),
    );

    return createResponse(
      {
        files: filesWithLinks,
        expiresIn: 1200,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('List case files error:', error);
    return createResponse(
      {
        error: 'Failed to list files',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

/// GET /cases/file/hash?case={caseId}&filename={filename}
export async function handleGetFileHash(
  request: Request,
  env: Env,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Get case ID and filename from query parameters
    const url = new URL(request.url);
    const caseId = url.searchParams.get('case');
    const filename = url.searchParams.get('filename');

    if (!caseId) {
      return createResponse(
        { error: 'Missing required parameter: case' },
        400,
        origin,
      );
    }

    if (!filename) {
      return createResponse(
        { error: 'Missing required parameter: filename' },
        400,
        origin,
      );
    }

    // Validate case ID format (5 lowercase letters or numbers)
    if (!/^[a-z0-9]{5}$/.test(caseId)) {
      return createResponse(
        {
          error: 'Invalid case format. Must be 5 lowercase letters or numbers',
        },
        400,
        origin,
      );
    }

    // Construct the file path
    const folderPath = `case-${caseId}`;
    const filePath = `${folderPath}/${filename}`;

    // Use HEAD request to get file metadata without downloading the file
    // Retry logic to handle presigned URL issues
    let headResponse: Response | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const headUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${filePath}`;
        const headRequest = await aws(env).sign(headUrl, {
          method: 'HEAD',
        });

        headResponse = await fetch(headRequest);

        if (headResponse.ok) {
          break; // Success, exit retry loop
        }

        // If 404, no point retrying
        if (headResponse.status === 404) {
          return createResponse({ error: 'File not found' }, 404, origin);
        }

        // For other errors, capture and retry
        lastError = new Error(
          `S3 request failed: ${headResponse.status} ${headResponse.statusText}`,
        );

        // Short delay before retry
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    if (!headResponse || !headResponse.ok) {
      const errorText = lastError?.message || 'Unknown error';
      throw new Error(errorText);
    }

    // Get ETag header which contains the MD5 hash (remove quotes)
    const etag = headResponse.headers.get('ETag')?.replace(/"/g, '') || '';
    const contentLength = headResponse.headers.get('Content-Length') || '0';
    const lastModified = headResponse.headers.get('Last-Modified') || '';

    return createResponse(
      {
        filename,
        hash: etag,
        hashType: 'md5',
        size: parseInt(contentLength, 10),
        lastModified: lastModified ? new Date(lastModified).getTime() : 0,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Get file hash error:', error);
    return createResponse(
      {
        error: 'Failed to get file hash',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}

/// DELETE /cases/file?case={caseId}&filename={filename}
export async function handleDeleteCaseFile(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const origin = request.headers.get('Origin');

  try {
    // Validate admin privileges
    const authorized = await hasPermission(request, db, env);
    if (!authorized) {
      return createResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // Get case ID and filename from query parameters
    const url = new URL(request.url);
    const caseId = url.searchParams.get('case');
    const filename = url.searchParams.get('filename');

    if (!caseId) {
      return createResponse(
        { error: 'Missing required parameter: case' },
        400,
        origin,
      );
    }

    if (!filename) {
      return createResponse(
        { error: 'Missing required parameter: filename' },
        400,
        origin,
      );
    }

    // Validate case ID format (5 lowercase letters or numbers)
    if (!/^[a-z0-9]{5}$/.test(caseId)) {
      return createResponse(
        {
          error: 'Invalid case format. Must be 5 lowercase letters or numbers',
        },
        400,
        origin,
      );
    }

    // Prevent deletion of .meta file
    if (filename === '.meta') {
      return createResponse(
        { error: 'Cannot delete metadata file' },
        403,
        origin,
      );
    }

    // Construct the file path
    const folderPath = `case-${caseId}`;
    const filePath = `${folderPath}/${filename}`;

    // Delete the file from S3
    const deleteUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${filePath}`;
    const deleteRequest = await aws(env).sign(deleteUrl, {
      method: 'DELETE',
    });

    const deleteResponse = await fetch(deleteRequest);

    if (!deleteResponse.ok) {
      if (deleteResponse.status === 404) {
        return createResponse({ error: 'File not found' }, 404, origin);
      }
      const errorText = await deleteResponse.text();
      throw new Error(
        `S3 request failed: ${deleteResponse.status} ${deleteResponse.statusText} - ${errorText}`,
      );
    }

    return createResponse(
      {
        success: true,
        message: 'File deleted successfully',
        filename,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error('Delete file error:', error);
    return createResponse(
      {
        error: 'Failed to delete file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
      origin,
    );
  }
}
