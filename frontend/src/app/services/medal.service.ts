import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import {
  MedalIntegrityError,
  isMedalBypassResponse,
  calculateETA,
  calculateMd5,
  normalizeEtag,
  normalizeHeaderValue,
  calculateCrc32cChunked,
  crc32cToBase64,
} from '../utils/medal.utils';

export interface MedalDownloadCallbacks {
  onStatusMessage: (msg: string) => void;
  onDownloadProgress: (progress: number) => void;
  onETA: (eta: string) => void;
  onStartTime: (time: number) => void;
}

export interface MedalDownloadResult {
  file: File;
  extension: string;
  mimeType: string;
}

@Injectable({ providedIn: 'root' })
export class MedalService {
  private readonly maxFileSize = 100 * 1024 * 1024; // 100 MB
  private readonly allowedVideoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
  private readonly mimeTypeMap: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
  };
  private readonly allowedMedalHosts = ['medal.tv', 'cdn.medal.tv', 'medal-content.com', 'cdn.medal-content.com'];

  async resolveMedalSourceUrl(targetUrl: string): Promise<string> {
    const bypassUrl = `${environment.medalBypassApiUrl}${encodeURIComponent(targetUrl)}`;
    const bypassResponse = await fetch(bypassUrl);
    if (!bypassResponse.ok) {
      throw new Error('Fehler beim Abrufen des Medal Clips');
    }

    const bypassData: unknown = await bypassResponse.json();
    if (!isMedalBypassResponse(bypassData)) {
      throw new Error('Ungültige Antwort vom Medal Bypass Service');
    }
    if (!bypassData.valid) {
      throw new Error(bypassData.reasoning || 'Ungültige Medal.tv URL');
    }
    if (!bypassData.src) {
      throw new Error('Keine Video-URL erhalten');
    }

    let srcUrl: URL;
    try {
      srcUrl = new URL(bypassData.src);
    } catch {
      throw new Error('Ungültige Video-URL vom Medal Bypass Service');
    }
    if (
      srcUrl.protocol !== 'https:' ||
      !this.allowedMedalHosts.some((host) => srcUrl.hostname === host || srcUrl.hostname.endsWith(`.${host}`))
    ) {
      throw new Error('Video-URL stammt nicht von einem erlaubten Medal-Host');
    }

    return bypassData.src;
  }

  async downloadMedalClipFromCorsProxy(
    targetUrl: string,
    callbacks: MedalDownloadCallbacks,
  ): Promise<MedalDownloadResult> {
    const normalizedTargetUrl = targetUrl.trim();
    const corsProxyUrl = `${environment.medalCorsProxyUrl}${encodeURIComponent(normalizedTargetUrl)}`;
    const response = await fetch(corsProxyUrl);
    if (!response.ok) {
      throw new Error('Fehler beim Abrufen des Medal Clips');
    }

    const pathName = new URL(normalizedTargetUrl).pathname;
    const fileNameWithExt = pathName.split('/').pop() || 'clip.mp4';
    let fileExtension = 'mp4';
    if (fileNameWithExt.includes('.')) {
      const extractedExtension = fileNameWithExt.split('.').pop();
      if (extractedExtension) {
        fileExtension = extractedExtension.toLowerCase();
      }
    }
    if (!this.allowedVideoExtensions.includes(fileExtension)) {
      throw new Error(
        `Ungültiges Dateiformat ".${fileExtension}". Erlaubt sind: ${this.allowedVideoExtensions.join(', ')}.`,
      );
    }
    const mimeType = this.mimeTypeMap[fileExtension] ?? 'video/mp4';

    const downloadStartTime = Date.now();
    callbacks.onStartTime(downloadStartTime);
    callbacks.onStatusMessage('Video wird heruntergeladen...');

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    if (total > this.maxFileSize) {
      throw new Error('Das Video ist zu groß (max. 100 MB).');
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Fehler beim Lesen des Videos');
    }

    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
      const readResult = await reader.read();
      if (readResult.done) break;
      chunks.push(readResult.value);
      receivedLength += readResult.value.length;
      if (receivedLength > this.maxFileSize) {
        reader.cancel();
        throw new Error('Das Video ist zu groß (max. 100 MB).');
      }
      if (total > 0) {
        const progress = Math.round((receivedLength / total) * 100);
        callbacks.onDownloadProgress(progress);
        callbacks.onETA(calculateETA(downloadStartTime, progress));
        callbacks.onStatusMessage(`Video wird heruntergeladen... (${progress}%)`);
      }
    }

    const etagHeader = response.headers.get('etag');
    const checksumHeader = response.headers.get('x-amz-checksum-crc32c');

    if (etagHeader) {
      const expectedEtag = normalizeEtag(etagHeader);
      const isMd5Etag = /^[a-f0-9]{32}$/i.test(expectedEtag);
      if (isMd5Etag) {
        const actualMd5 = await calculateMd5(chunks);
        if (expectedEtag.toLowerCase() !== actualMd5.toLowerCase()) {
          throw new MedalIntegrityError(
            'Die Integritätsprüfung des Medal Clips ist fehlgeschlagen: ETag stimmt nicht mit dem MD5-Hash überein.',
          );
        }
      }
    }

    if (checksumHeader) {
      const expectedChecksum = normalizeHeaderValue(checksumHeader);
      const actualChecksum = crc32cToBase64(calculateCrc32cChunked(chunks));
      if (expectedChecksum !== actualChecksum) {
        throw new MedalIntegrityError(
          'Die Integritätsprüfung des Medal Clips ist fehlgeschlagen: x-amz-checksum-crc32c stimmt nicht mit dem heruntergeladenen Inhalt überein.',
        );
      }
    }

    const videoFile = new File(chunks as BlobPart[], fileNameWithExt, { type: mimeType });
    return {
      file: videoFile,
      extension: fileExtension,
      mimeType,
    };
  }
}
