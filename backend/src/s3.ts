import { AwsClient } from 'aws4fetch';

export const SPRAY_BUCKET = 'zeitvertreib-sprays';
export const CASES_BUCKET = 'zeitvertreib-tickets';
export const REPORTS_BUCKET = 'zeitvertreib-reports';

export const SPRAY_FOLDER_LOCALHOST = 'sprays_localhost';
export const CSAM_FOLDER = 'CSAM_REPORT';

/**
 * Resolve the S3 (Cloudflare R2) endpoint from the environment, without a trailing slash.
 */
export function getS3Endpoint(env: Env): string {
  return env.S3_ENDPOINT.replace(/\/+$/, '');
}

/**
 * Create a signed S3 client for the configured store.
 */
export function createS3Client(env: Env): AwsClient {
  return new AwsClient({
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
    service: 's3',
    region: 'auto',
  });
}

/**
 * Full URL for an object in the configured S3 store.
 */
export function getS3ObjectUrl(env: Env, bucket: string, key: string): string {
  return `${getS3Endpoint(env)}/${bucket}/${key}`;
}

/**
 * Determine the spray folder based on the request origin. Production sprays live
 * at the bucket root; localhost sprays use a separate folder.
 */
export function getSprayFolder(origin: string | null): string {
  if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    return SPRAY_FOLDER_LOCALHOST;
  }
  return '';
}

/**
 * Object key prefix (without extension) for a spray, honoring the origin-specific folder.
 */
export function getSprayObjectKey(id: number, origin: string | null): string {
  const folder = getSprayFolder(origin);
  return folder ? `${folder}/${id}` : `${id}`;
}
