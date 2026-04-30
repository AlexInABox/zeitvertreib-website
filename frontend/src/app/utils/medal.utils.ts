import { createMD5 } from 'hash-wasm';
import type { MedalBypassResponse } from '@zeitvertreib/types';

export class MedalIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MedalIntegrityError';
  }
}

const CRC32C_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0x82f63b78;
      } else {
        crc >>>= 1;
      }
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

export function normalizeEtag(etag: string): string {
  let normalized = etag.trim();
  if (normalized.startsWith('W/')) {
    normalized = normalized.slice(2).trim();
  }
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.toLowerCase();
}

export function normalizeHeaderValue(value: string): string {
  let normalized = value.trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}

export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function calculateCrc32c(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const tableIndex = (crc ^ bytes[index]) & 0xff;
    crc = (crc >>> 8) ^ CRC32C_TABLE[tableIndex];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function crc32cToBase64(checksum: number): string {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, checksum >>> 0, false);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function calculateMd5(chunks: Uint8Array[]): Promise<string> {
  const hasher = await createMD5();
  hasher.init();
  for (const chunk of chunks) {
    hasher.update(chunk);
  }
  return hasher.digest();
}

export function isValidUrl(urlString: string): boolean {
  if (!urlString?.trim()) return false;
  try {
    const url = new URL(urlString.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isMedalBypassResponse(value: unknown): value is MedalBypassResponse {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj['valid'] === true) return typeof obj['src'] === 'string';
  if (obj['valid'] === false) return typeof obj['reasoning'] === 'string';
  return false;
}

export function calculateETA(startTime: number, progress: number): string {
  if (progress === 0) return 'Berechne...';
  const elapsed = Date.now() - startTime;
  const total = (elapsed / progress) * 100;
  const remaining = total - elapsed;
  const seconds = Math.ceil(remaining / 1000);
  if (seconds < 10) return '<10s';
  const roundedSeconds = Math.ceil(seconds / 10) * 10;
  if (roundedSeconds < 60) return `~${roundedSeconds}s`;
  const minutes = Math.floor(roundedSeconds / 60);
  const secs = roundedSeconds % 60;
  if (secs === 0) return `~${minutes}m`;
  return `~${minutes}m ${secs}s`;
}
