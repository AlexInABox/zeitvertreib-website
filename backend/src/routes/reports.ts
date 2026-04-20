import { AwsClient } from 'aws4fetch';
import { createResponse, getCedModLastReports, getCedModReportsBySteamId, fetchSteamUserData, validateSession, isTeam, validateSteamId } from '../utils.js';
import type { GetReportsResponse, ReportFileUploadGetRequest, ReportFileUploadGetResponse, SearchReportsBySteamIdGetResponse } from '@zeitvertreib/types';
import { caseToCedModReportLinks } from '../db/schema.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';

const REPORTS_BUCKET = 'zeitvertreib-reports';
const CASES_BUCKET = 'zeitvertreib-tickets';

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

/// GET /reports/upload?reportId={reportId}&extension={ext}
export async function handleReportFileUpload(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  const url = new URL(request.url);
  const reportIdParam = url.searchParams.get('reportId');
  const extension = url.searchParams.get('extension') || '';

  if (!reportIdParam) {
    return createResponse({ error: 'Missing required parameter: reportId' }, 400, origin);
  }

  const reportId = parseInt(reportIdParam, 10);
  if (isNaN(reportId)) {
    return createResponse({ error: 'Invalid reportId: must be a number' }, 400, origin);
  }

  if (!ALLOWED_EXTENSIONS.includes(extension.toLowerCase())) {
    return createResponse({ error: 'Invalid file extension', allowedExtensions: ALLOWED_EXTENSIONS }, 400, origin);
  }

  // Rate limit uploads per report to prevent abuse
  const { success } = await env.REPORT_UPLOADS_LIMITER.limit({ key: reportId.toString() });
  if (!success) {
    return createResponse({ error: 'Upload limit exceeded for this report' }, 429, origin);
  }

  // Check if reportId exists!
  const cedModReports = await getCedModLastReports(env);
  const reportExists = cedModReports.some((report) => report.id === reportId);
  if (!reportExists) {
    return createResponse({ error: 'Report not found' }, 404, origin);
  }

  // Check if this report is already linked to a case; if so, store in the cases bucket instead
  const db = drizzle(env.ZEITVERTREIB_DATA);
  const caseLink = await db
    .select({ caseId: caseToCedModReportLinks.caseId })
    .from(caseToCedModReportLinks)
    .where(eq(caseToCedModReportLinks.reportId, reportId))
    .limit(1);

  const linkedCaseId = caseLink[0]?.caseId ?? null;

  const randomName = crypto.randomUUID();
  const filename = `${randomName}.${extension}`;

  const uploadBucket = linkedCaseId ? CASES_BUCKET : REPORTS_BUCKET;
  const uploadFolder = linkedCaseId ?? reportId.toString();

  const presignedUrl = await aws(env).sign(`https://s3.zeitvertreib.vip/${uploadBucket}/${uploadFolder}/${filename}`, {
    method: 'PUT',
    aws: { signQuery: true },
  });

  const responseBody: ReportFileUploadGetResponse = { url: presignedUrl.url, method: 'PUT' };
  return createResponse(responseBody, 200, origin);
}

/// GET /reports/search?steamId={steamId}
export async function handleSearchReportsBySteamId(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin');

  const sessionValidation = await validateSession(request, env);
  if (sessionValidation.status !== 'valid' || !sessionValidation.steamId) {
    return createResponse(
      { error: sessionValidation.status === 'expired' ? 'Session expired' : 'Not authenticated' },
      401,
      origin,
    );
  }

  if (!(await isTeam(sessionValidation.steamId, env))) {
    return createResponse({ error: 'Unauthorized' }, 401, origin);
  }

  const url = new URL(request.url);
  const steamIdParam = url.searchParams.get('steamId');
  if (!steamIdParam) {
    return createResponse({ error: 'Missing required parameter: steamId' }, 400, origin);
  }

  const steamIdValidation = validateSteamId(steamIdParam);
  if (!steamIdValidation.valid) {
    return createResponse({ error: steamIdValidation.error || 'Invalid Steam ID' }, 400, origin);
  }

  const normalizedSteamId = steamIdValidation.normalized!;
  const cedModReports = await getCedModReportsBySteamId(normalizedSteamId, env);

  const reporterData = await Promise.all(
    cedModReports.map((report) => fetchSteamUserData(report.reporterId, env, ctx)),
  );

  const reportedData = await Promise.all(
    cedModReports.map((report) => fetchSteamUserData(report.reportedId, env, ctx)),
  );

  const responseData: SearchReportsBySteamIdGetResponse = {
    reports: cedModReports.map((report, index) => ({
      id: report.id,
      reporter: {
        id: report.reporterId,
        username: reporterData[index]?.username ?? 'Unknown',
        avatarUrl: reporterData[index]?.avatarUrl ?? '',
      },
      reported: {
        id: report.reportedId,
        username: reportedData[index]?.username ?? 'Unknown',
        avatarUrl: reportedData[index]?.avatarUrl ?? '',
      },
      reason: report.reason,
      createdAt: report.reportedAt,
    })),
  };

  return createResponse(responseData, 200, origin);
}

export async function handleGetReports(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cedModReports = await getCedModLastReports(env);

  const reporterData = await Promise.all(
    cedModReports.map((report) => fetchSteamUserData(report.reporterId, env, ctx)),
  );

  const reportedData = await Promise.all(
    cedModReports.map((report) => fetchSteamUserData(report.reportedId, env, ctx)),
  );

  const responseData: GetReportsResponse = {
    reports: cedModReports.map((report, index) => ({
      id: report.id,
      reporter: {
        id: report.reporterId,
        username: reporterData[index]?.username ?? 'Unknown',
        avatarUrl: reporterData[index]?.avatarUrl ?? '',
      },
      reported: {
        id: report.reportedId,
        username: reportedData[index]?.username ?? 'Unknown',
        avatarUrl: reportedData[index]?.avatarUrl ?? '',
      },
      reason: report.reason,
      createdAt: report.reportedAt,
    })),
  };
  return createResponse(responseData);
}
