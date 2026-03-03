import { AwsClient } from 'aws4fetch';
import {
  createResponse,
  validateSession,
  isTeam,
  validateSteamId,
  getCedModWarns,
  getCedModLastReport,
  fetchSteamUserData,
} from '../utils.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc } from 'drizzle-orm';
import { reports } from '../db/schema.js';
import typia from 'typia';
import {
  CreateReportPostRequest,
  CreateReportPostResponse,
  ReportFileUploadGetResponse,
  GetReportByTokenResponse,
  ListReportsGetResponse,
  GetReportsByReportedPlayerResponse,
  UpdateReportStatusPutRequest,
  UpdateReportStatusPutResponse,
  GetReportWarnsResponse,
  CedModLastReportResponse,
  ReportStatus,
} from '@zeitvertreib/types';

const BUCKET = 'zeitvertreib-reports';

const ALLOWED_EXTENSIONS = [
  // Images
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  // Videos
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
];

const aws = (env: Env): AwsClient =>
  new AwsClient({
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
    service: 's3',
    region: 'us-east-1',
  });

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_FILES_PER_REPORT = 5;

/// POST /reports — create a new report (no auth required)
export async function handleCreateReport(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const body: CreateReportPostRequest = await request.json();

    if (!typia.is<CreateReportPostRequest>(body)) {
      return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
    }

    if (!validateSteamId(body.steamId)) {
      return createResponse({ error: 'Ungültige Steam-ID (deine)' }, 400, origin);
    }

    if (!validateSteamId(body.reportedSteamId)) {
      return createResponse({ error: 'Ungültige Steam-ID (gemeldeter Spieler)' }, 400, origin);
    }

    if (body.description.trim().length === 0) {
      return createResponse({ error: 'Beschreibung darf nicht leer sein' }, 400, origin);
    }

    if (body.description.length > MAX_DESCRIPTION_LENGTH) {
      return createResponse(
        { error: `Beschreibung darf maximal ${MAX_DESCRIPTION_LENGTH} Zeichen lang sein` },
        400,
        origin,
      );
    }

    const reportToken = crypto.randomUUID();
    const now = Date.now();

    const db = drizzle(env.ZEITVERTREIB_DATA);
    await db.insert(reports).values({
      reportToken,
      steamId: body.steamId,
      reportedSteamId: body.reportedSteamId,
      description: body.description.trim(),
      status: 'pending',
      fileCount: 0,
      createdAt: now,
    });

    // Create the folder in S3
    const folderUrl = `https://s3.zeitvertreib.vip/${BUCKET}/${reportToken}/`;
    const folderRequest = await aws(env).sign(folderUrl, {
      method: 'PUT',
      aws: { signQuery: true },
    });
    await fetch(folderRequest);

    const responseBody: CreateReportPostResponse = {
      reportToken,
      message: 'Report wurde erstellt. Bewahre den Token auf, um den Status zu verfolgen.',
    };
    return createResponse(responseBody, 201, origin);
  } catch (error) {
    console.error('Error creating report:', error);
    return createResponse({ error: 'Fehler beim Erstellen des Reports' }, 500, origin);
  }
}

/// GET /reports/upload?report={reportToken}&extension={ext} — get presigned upload URL (no auth)
export async function handleReportFileUpload(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const reportToken = url.searchParams.get('report');
    const extension = url.searchParams.get('extension') || '';

    if (!reportToken) {
      return createResponse({ error: 'Fehlender Parameter: report' }, 400, origin);
    }

    if (extension && !ALLOWED_EXTENSIONS.includes(extension.toLowerCase())) {
      return createResponse({ error: 'Ungültige Dateiendung', allowedExtensions: ALLOWED_EXTENSIONS }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);
    const report = await db.select().from(reports).where(eq(reports.reportToken, reportToken)).get();

    if (!report) {
      return createResponse({ error: 'Report nicht gefunden' }, 404, origin);
    }

    if (report.fileCount >= MAX_FILES_PER_REPORT) {
      return createResponse({ error: `Maximale Anzahl an Dateien (${MAX_FILES_PER_REPORT}) erreicht` }, 400, origin);
    }

    const randomName = crypto.randomUUID();
    const filename = `${randomName}.${extension.toLowerCase()}`;

    const presignedUrl = await aws(env).sign(`https://s3.zeitvertreib.vip/${BUCKET}/${reportToken}/${filename}`, {
      method: 'PUT',
      aws: { signQuery: true },
    });

    // Increment file count
    await db
      .update(reports)
      .set({ fileCount: report.fileCount + 1 })
      .where(eq(reports.reportToken, reportToken));

    const responseBody: ReportFileUploadGetResponse = {
      url: presignedUrl.url,
      method: 'PUT',
    };
    return createResponse(responseBody, 200, origin);
  } catch (error) {
    console.error('Report file upload error:', error);
    return createResponse({ error: 'Fehler beim Generieren der Upload-URL' }, 500, origin);
  }
}

/// GET /reports?token={reportToken} — view a report by token (no auth, privacy via token)
export async function handleGetReport(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const reportToken = url.searchParams.get('token');

    if (!reportToken) {
      return createResponse({ error: 'Fehlender Parameter: token' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);
    const report = await db.select().from(reports).where(eq(reports.reportToken, reportToken)).get();

    if (!report) {
      return createResponse({ error: 'Report nicht gefunden' }, 404, origin);
    }

    // List files from S3
    const files = await listReportFiles(reportToken, env);

    const responseBody: GetReportByTokenResponse = {
      reportToken: report.reportToken,
      steamId: report.steamId,
      reportedSteamId: report.reportedSteamId,
      description: report.description,
      status: report.status as ReportStatus,
      createdAt: report.createdAt,
      files,
    };
    return createResponse(responseBody, 200, origin);
  } catch (error) {
    console.error('Error getting report:', error);
    return createResponse({ error: 'Fehler beim Laden des Reports' }, 500, origin);
  }
}

/// GET /reports/files?report={reportToken}&file={filename} — get presigned download URL
export async function handleGetReportFile(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const reportToken = url.searchParams.get('report');
    const filename = url.searchParams.get('file');

    if (!reportToken || !filename) {
      return createResponse({ error: 'Fehlende Parameter: report, file' }, 400, origin);
    }

    // Check if the request is from staff or from the token holder
    const validation = await validateSession(request, env);
    const isStaff = validation.status === 'valid' && validation.steamId && (await isTeam(validation.steamId, env));

    // For non-staff, verify the token exists (token knowledge = access)
    if (!isStaff) {
      const db = drizzle(env.ZEITVERTREIB_DATA);
      const report = await db.select().from(reports).where(eq(reports.reportToken, reportToken)).get();
      if (!report) {
        return createResponse({ error: 'Report nicht gefunden' }, 404, origin);
      }
    }

    const presignedUrl = await aws(env).sign(`https://s3.zeitvertreib.vip/${BUCKET}/${reportToken}/${filename}`, {
      method: 'GET',
      aws: { signQuery: true },
    });

    return createResponse({ url: presignedUrl.url }, 200, origin);
  } catch (error) {
    console.error('Error getting report file:', error);
    return createResponse({ error: 'Fehler beim Laden der Datei' }, 500, origin);
  }
}

/// GET /reports/list — list all reports (staff only)
export async function handleListReports(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Nicht authentifiziert' }, 401, origin);
  }

  if (!(await isTeam(validation.steamId, env))) {
    return createResponse({ error: 'Keine Berechtigung' }, 401, origin);
  }

  try {
    const db = drizzle(env.ZEITVERTREIB_DATA);
    const allReports = await db.select().from(reports).orderBy(desc(reports.createdAt)).all();

    const responseBody: ListReportsGetResponse = {
      reports: allReports.map((r: (typeof allReports)[number]) => ({
        reportToken: r.reportToken,
        steamId: r.steamId,
        reportedSteamId: r.reportedSteamId,
        description: r.description,
        status: r.status as ReportStatus,
        createdAt: r.createdAt,
        linkedCaseId: r.linkedCaseId,
        fileCount: r.fileCount,
      })),
    };
    return createResponse(responseBody, 200, origin);
  } catch (error) {
    console.error('Error listing reports:', error);
    return createResponse({ error: 'Fehler beim Laden der Reports' }, 500, origin);
  }
}

/// GET /reports/by-reported-player?steamId={steamId} — list reports for a specific reported player (staff only)
export async function handleGetReportsByReportedPlayer(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Nicht authentifiziert' }, 401, origin);
  }

  if (!(await isTeam(validation.steamId, env))) {
    return createResponse({ error: 'Keine Berechtigung' }, 401, origin);
  }

  try {
    const url = new URL(request.url);
    const reportedSteamId = url.searchParams.get('steamId');

    if (!reportedSteamId || !validateSteamId(reportedSteamId)) {
      return createResponse({ error: 'Ungültige Steam-ID' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);
    const playerReports = await db
      .select()
      .from(reports)
      .where(eq(reports.reportedSteamId, reportedSteamId))
      .orderBy(desc(reports.createdAt))
      .limit(10)
      .all();

    // Fetch files and Steam user data for each report
    const reportsWithFiles = await Promise.all(
      playerReports.map(async (r: (typeof playerReports)[number]) => {
        const [reporterData, reportedData, files] = await Promise.all([
          fetchSteamUserData(r.steamId, env, ctx),
          fetchSteamUserData(r.reportedSteamId, env, ctx),
          listReportFiles(r.reportToken, env),
        ]);

        return {
          reportToken: r.reportToken,
          steamId: r.steamId,
          reporterUsername: reporterData?.username || r.steamId,
          reporterAvatarUrl: reporterData?.avatarUrl || '',
          reportedSteamId: r.reportedSteamId,
          reportedUsername: reportedData?.username || r.reportedSteamId,
          reportedAvatarUrl: reportedData?.avatarUrl || '',
          description: r.description,
          status: r.status as ReportStatus,
          createdAt: r.createdAt,
          fileCount: r.fileCount,
          files,
        };
      }),
    );

    const responseBody: GetReportsByReportedPlayerResponse = {
      reports: reportsWithFiles,
    };
    return createResponse(responseBody, 200, origin);
  } catch (error) {
    console.error('Error fetching reports by reported player:', error);
    return createResponse({ error: 'Fehler beim Laden der Reports' }, 500, origin);
  }
}

/// PUT /reports/status — update report status (staff only)
export async function handleUpdateReportStatus(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Nicht authentifiziert' }, 401, origin);
  }

  if (!(await isTeam(validation.steamId, env))) {
    return createResponse({ error: 'Keine Berechtigung' }, 401, origin);
  }

  try {
    const body: UpdateReportStatusPutRequest = await request.json();

    if (!typia.is<UpdateReportStatusPutRequest>(body)) {
      return createResponse({ error: 'Ungültige Anfragedaten' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);
    const report = await db.select().from(reports).where(eq(reports.reportToken, body.reportToken)).get();

    if (!report) {
      return createResponse({ error: 'Report nicht gefunden' }, 404, origin);
    }

    const updateData: Record<string, any> = { status: body.status };
    if (body.linkedCaseId !== undefined) {
      // updateData is a generic record, so use bracket notation to satisfy TS
      updateData['linkedCaseId'] = body.linkedCaseId;
    }

    await db.update(reports).set(updateData).where(eq(reports.reportToken, body.reportToken));

    const responseBody: UpdateReportStatusPutResponse = {
      success: true,
      message: 'Report-Status aktualisiert',
    };
    return createResponse(responseBody, 200, origin);
  } catch (error) {
    console.error('Error updating report status:', error);
    return createResponse({ error: 'Fehler beim Aktualisieren des Reports' }, 500, origin);
  }
}

/// GET /reports/recent - get the most recent reports with files (staff only, for case integration)
export async function handleGetRecentReports(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Nicht authentifiziert' }, 401, origin);
  }

  if (!(await isTeam(validation.steamId, env))) {
    return createResponse({ error: 'Keine Berechtigung' }, 401, origin);
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

    const db = drizzle(env.ZEITVERTREIB_DATA);
    const recentReports = await db
      .select()
      .from(reports)
      .where(eq(reports.status, 'pending')) // Only pending reports with potential evidence
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .all();

    // Fetch files and Steam user data for each report
    const reportsWithFiles = await Promise.all(
      recentReports.map(async (r: (typeof recentReports)[number]) => {
        const [reporterData, reportedData, files] = await Promise.all([
          fetchSteamUserData(r.steamId, env, ctx),
          fetchSteamUserData(r.reportedSteamId, env, ctx),
          listReportFiles(r.reportToken, env),
        ]);

        return {
          reportToken: r.reportToken,
          steamId: r.steamId,
          reporterUsername: reporterData?.username || r.steamId,
          reporterAvatarUrl: reporterData?.avatarUrl || '',
          reportedSteamId: r.reportedSteamId,
          reportedUsername: reportedData?.username || r.reportedSteamId,
          reportedAvatarUrl: reportedData?.avatarUrl || '',
          description: r.description,
          status: r.status as ReportStatus,
          createdAt: r.createdAt,
          fileCount: r.fileCount,
          files,
        };
      }),
    );

    const responseBody: GetReportsByReportedPlayerResponse = {
      reports: reportsWithFiles,
    };
    return createResponse(responseBody, 200, origin);
  } catch (error) {
    console.error('Error fetching recent reports:', error);
    return createResponse({ error: 'Fehler beim Laden der Reports' }, 500, origin);
  }
}

/// GET /reports/warns?steamId={steamId} — fetch CedMod warns (staff only)
export async function handleGetReportWarns(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Nicht authentifiziert' }, 401, origin);
  }

  if (!(await isTeam(validation.steamId, env))) {
    return createResponse({ error: 'Keine Berechtigung' }, 401, origin);
  }

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');

    if (!steamId || !validateSteamId(steamId)) {
      return createResponse({ error: 'Ungültige Steam-ID' }, 400, origin);
    }

    const warns = await getCedModWarns(steamId, env);

    const responseBody: GetReportWarnsResponse = { warns };
    return createResponse(responseBody, 200, origin);
  } catch (error) {
    console.error('Error fetching warns:', error);
    return createResponse({ error: 'Fehler beim Laden der Verwarnungen' }, 500, origin);
  }
}

// Helper: list files in a report folder from S3
async function listReportFiles(reportToken: string, env: Env): Promise<string[]> {
  try {
    const listUrl = `https://s3.zeitvertreib.vip/${BUCKET}?list-type=2&prefix=${reportToken}/`;
    const listRequest = await aws(env).sign(listUrl, { method: 'GET' });
    const listResponse = await fetch(listRequest);

    if (!listResponse.ok) {
      return [];
    }

    const xml = await listResponse.text();
    const files: string[] = [];

    // Parse S3 ListObjectsV2 XML response
    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    let match = keyRegex.exec(xml);
    while (match !== null) {
      const key = match[1] as string; // regex capture guaranteed by pattern
      // Skip the folder itself
      if (key !== `${reportToken}/`) {
        const filename = key.replace(`${reportToken}/`, '');
        if (filename) {
          files.push(filename);
        }
      }
      match = keyRegex.exec(xml);
    }

    return files;
  } catch (error) {
    console.error('Error listing report files:', error);
    return [];
  }
}

/// GET /reports/cedmod-lookup?steamId={steamId} — auto-fill: last in-game report filed by this player (public)
export async function handleCedModLookup(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const steamId = url.searchParams.get('steamId');

    if (!steamId || !validateSteamId(steamId).valid) {
      return createResponse({ error: 'Ungültige Steam-ID' }, 400, origin);
    }

    const result = await getCedModLastReport(steamId, env);

    const responseBody: CedModLastReportResponse = result
      ? {
          found: true,
          reportedSteamId: result.reportedSteamId,
          reason: result.reason,
          reportedAt: result.reportedAt,
        }
      : {
          found: false,
          reportedSteamId: null,
          reason: null,
          reportedAt: null,
        };

    return createResponse(responseBody, 200, origin);
  } catch (error) {
    console.error('Error in CedMod lookup:', error);
    return createResponse({ error: 'Fehler beim Abfragen des CedMod-Reports' }, 500, origin);
  }
}

/// GET /reports/by-case?caseId={caseId} — get all reports linked to a case (staff only)
export async function handleGetReportsByCase(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  const validation = await validateSession(request, env);
  if (validation.status !== 'valid' || !validation.steamId) {
    return createResponse({ error: 'Nicht authentifiziert' }, 401, origin);
  }

  if (!(await isTeam(validation.steamId, env))) {
    return createResponse({ error: 'Keine Berechtigung' }, 401, origin);
  }

  try {
    const url = new URL(request.url);
    const caseId = url.searchParams.get('caseId');

    if (!caseId) {
      return createResponse({ error: 'caseId parameter is required' }, 400, origin);
    }

    const db = drizzle(env.ZEITVERTREIB_DATA);

    // Get all reports linked to this case
    const linkedReports = await db
      .select({
        reportToken: reports.reportToken,
        steamId: reports.steamId,
        reportedSteamId: reports.reportedSteamId,
        description: reports.description,
        status: reports.status,
        fileCount: reports.fileCount,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.linkedCaseId, caseId))
      .orderBy(desc(reports.createdAt));

    // Fetch steam user data for reporters and reported
    const reportsWithUsers = await Promise.all(
      linkedReports.map(async (r) => {
        const reporterData = await fetchSteamUserData(r.steamId, env, ctx);
        const reportedData = await fetchSteamUserData(r.reportedSteamId, env, ctx);
        const files = await listReportFiles(r.reportToken, env);

        return {
          reportToken: r.reportToken,
          steamId: r.steamId,
          reportedSteamId: r.reportedSteamId,
          reporterUsername: reporterData?.username || r.steamId,
          reporterAvatarUrl: reporterData?.avatarUrl || null,
          reportedUsername: reportedData?.username || r.reportedSteamId,
          reportedAvatarUrl: reportedData?.avatarUrl || null,
          description: r.description,
          status: r.status,
          fileCount: r.fileCount,
          files,
          createdAt: r.createdAt,
        };
      }),
    );

    return createResponse({ reports: reportsWithUsers }, 200, origin);
  } catch (error) {
    console.error('Error fetching reports by case:', error);
    return createResponse({ error: 'Fehler beim Abrufen der Reports' }, 500, origin);
  }
}
