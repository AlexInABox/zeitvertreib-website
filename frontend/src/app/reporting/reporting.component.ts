import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { FileUploader, FileUploadModule } from 'ng2-file-upload';
import type { GetReportsResponse, ReportFileUploadGetResponse } from '@zeitvertreib/types';
import {
  MedalIntegrityError,
  isMedalBypassResponse,
  isValidUrl,
  calculateETA,
  calculateMd5,
  normalizeEtag,
  normalizeHeaderValue,
  calculateCrc32cChunked,
  crc32cToBase64,
} from '../utils/medal.utils';

type Report = GetReportsResponse['reports'][number];

interface FileUploadItem {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMessage?: string;
}

@Component({
  selector: 'app-reporting',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, FileUploadModule],
  templateUrl: './reporting.component.html',
  styleUrls: ['./reporting.component.css'],
})
export class ReportingComponent implements OnInit {
  reports: Report[] = [];
  isLoading = true;
  loadError = '';

  selectedReport: Report | null = null;
  files: FileUploadItem[] = [];
  isUploading = false;
  uploadDone = false;
  errorMessage = '';

  // Medal clip upload state
  uploadMode: 'file' | 'medal' = 'file';
  medalClipUrl = '';
  isFetchingMedalClip = false;
  medalDownloadProgress = 0;
  medalUploadProgress = 0;
  medalStatusMessage = '';
  medalETA = '';
  medalStartTime = 0;
  medalUrlInvalid = false;
  medalRetryPromptMessage = '';

  fileUploader = new FileUploader({ url: '', autoUpload: false });

  private readonly apiUrl = environment.apiUrl;
  private readonly medalCorsProxyUrl = environment.medalCorsProxyUrl;
  private readonly medalBypassApiUrl = environment.medalBypassApiUrl;
  private readonly maxFileSize = 100 * 1024 * 1024; // 100 MB
  private readonly allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'avi', 'mkv'];

  ngOnInit(): void {
    void this.loadReports();
  }

  async loadReports(): Promise<void> {
    this.isLoading = true;
    this.loadError = '';
    try {
      const response = await fetch(`${this.apiUrl}/reports`);
      if (!response.ok) {
        this.loadError = 'Fehler beim Laden der Reports.';
        return;
      }
      const data: GetReportsResponse = await response.json();
      this.reports = data.reports;
    } catch {
      this.loadError = 'Netzwerkfehler beim Laden der Reports.';
    } finally {
      this.isLoading = false;
    }
  }

  selectReport(report: Report): void {
    this.selectedReport = report;
    this.resetUploadState();
  }

  backToList(): void {
    this.selectedReport = null;
    this.resetUploadState();
  }

  private resetUploadState(): void {
    this.files = [];
    this.isUploading = false;
    this.uploadDone = false;
    this.errorMessage = '';
    this.uploadMode = 'file';
    this.medalClipUrl = '';
    this.isFetchingMedalClip = false;
    this.medalDownloadProgress = 0;
    this.medalUploadProgress = 0;
    this.medalStatusMessage = '';
    this.medalETA = '';
    this.medalUrlInvalid = false;
    this.medalRetryPromptMessage = '';
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ?? (event as DragEvent).dataTransfer?.files;
    if (!files || files.length === 0) return;
    this.errorMessage = '';

    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (!this.allowedExtensions.includes(ext)) {
      this.errorMessage = `"${file.name}" hat eine nicht erlaubte Endung.`;
      input.value = '';
      return;
    }

    if (file.size > this.maxFileSize) {
      this.errorMessage = `"${file.name}" ist zu groß (max. 100 MB).`;
      input.value = '';
      return;
    }

    this.files = [{ file, progress: 0, status: 'pending' }];
    input.value = '';
  }

  removeFile(index: number): void {
    this.files.splice(index, 1);
  }

  async uploadAll(): Promise<void> {
    if (!this.selectedReport || this.files.length === 0) return;

    this.isUploading = true;
    this.errorMessage = '';

    for (const fileItem of this.files) {
      try {
        fileItem.status = 'uploading';
        const ext = fileItem.file.name.split('.').pop()?.toLowerCase() || '';

        const urlResponse = await fetch(
          `${this.apiUrl}/reports/upload?reportId=${this.selectedReport.id}&extension=${encodeURIComponent(ext)}`,
        );

        if (!urlResponse.ok) {
          fileItem.status = 'error';
          fileItem.errorMessage = 'Fehler beim Generieren der Upload-URL.';
          continue;
        }

        const uploadData: ReportFileUploadGetResponse = await urlResponse.json();
        await this.uploadFileToPresignedUrl(fileItem, uploadData.url);
        fileItem.status = 'done';
        fileItem.progress = 100;
      } catch {
        fileItem.status = 'error';
        fileItem.errorMessage = 'Upload fehlgeschlagen.';
      }
    }

    this.isUploading = false;
    this.uploadDone = true;
  }

  private uploadFileToPresignedUrl(fileItem: FileUploadItem, presignedUrl: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.fileUploader.clearQueue();
      this.fileUploader.options.url = presignedUrl;
      this.fileUploader.options.method = 'PUT';
      this.fileUploader.options.disableMultipart = true;
      this.fileUploader.options.headers = [];

      this.fileUploader.onBeforeUploadItem = (item: any) => {
        item.url = presignedUrl;
        item.method = 'PUT';
        item.withCredentials = false;
        item.headers = [];
      };

      this.fileUploader.onProgressItem = (_item: any, progress: any) => {
        fileItem.progress = progress;
      };

      this.fileUploader.onSuccessItem = () => {
        this.cleanupUploaderCallbacks();
        resolve();
      };

      this.fileUploader.onErrorItem = (_item: any, response: any, status: any) => {
        this.cleanupUploaderCallbacks();
        reject(new Error(`Upload fehlgeschlagen: ${status} ${response}`));
      };

      this.fileUploader.addToQueue([fileItem.file]);
      this.fileUploader.uploadAll();
    });
  }

  private cleanupUploaderCallbacks(): void {
    this.fileUploader.onBeforeUploadItem = () => {};
    this.fileUploader.onProgressItem = () => {};
    this.fileUploader.onSuccessItem = () => {};
    this.fileUploader.onErrorItem = () => {};
  }

  onMedalUrlChange(): void {
    this.medalUrlInvalid = this.medalClipUrl.trim() ? !isValidUrl(this.medalClipUrl) : false;
  }

  async uploadMedalClip(): Promise<void> {
    if (!this.selectedReport) return;
    if (!this.medalClipUrl.trim()) {
      this.errorMessage = 'Bitte gib eine URL ein';
      return;
    }
    if (!isValidUrl(this.medalClipUrl)) {
      this.errorMessage = 'Bitte gib eine gültige URL ein';
      return;
    }

    this.errorMessage = '';
    this.medalRetryPromptMessage = '';
    this.isFetchingMedalClip = true;
    this.medalDownloadProgress = 0;
    this.medalUploadProgress = 0;
    this.medalStatusMessage = 'Medal Clip wird abgerufen...';
    this.medalETA = '';
    this.medalStartTime = Date.now();

    try {
      const medalSourceUrl = await this.resolveMedalSourceUrl(this.medalClipUrl);
      const medalFile = await this.downloadMedalClipFromCorsProxy(medalSourceUrl);

      this.medalDownloadProgress = 100;
      this.medalUploadProgress = 0;
      this.medalStatusMessage = 'Upload-URL wird angefordert...';

      const urlResponse = await fetch(
        `${this.apiUrl}/reports/upload?reportId=${this.selectedReport.id}&extension=${encodeURIComponent(medalFile.extension)}`,
      );

      if (!urlResponse.ok) throw new Error('Fehler beim Generieren der Upload-URL.');

      const uploadData: ReportFileUploadGetResponse = await urlResponse.json();

      this.medalStatusMessage = 'Video wird hochgeladen...';
      this.medalStartTime = Date.now();

      await this.uploadMedalFileToPresignedUrl(medalFile.file, uploadData.url, medalFile.mimeType);

      this.isFetchingMedalClip = false;
      this.medalDownloadProgress = 0;
      this.medalUploadProgress = 0;
      this.medalClipUrl = '';
      this.medalStatusMessage = '';
      this.medalETA = '';
      this.uploadDone = true;
    } catch (error) {
      this.isFetchingMedalClip = false;
      this.medalDownloadProgress = 0;
      this.medalUploadProgress = 0;
      this.medalStatusMessage = '';
      this.medalETA = '';
      if (error instanceof MedalIntegrityError) {
        this.medalRetryPromptMessage = error.message;
        return;
      }
      console.error('Medal clip upload failed:', error);
      this.errorMessage = error instanceof Error ? error.message : 'Fehler beim Hochladen des Medal Clips';
    }
  }

  retryMedalClip(): void {
    this.medalRetryPromptMessage = '';
    void this.uploadMedalClip();
  }

  cancelMedalRetry(): void {
    this.medalRetryPromptMessage = '';
  }

  private async resolveMedalSourceUrl(targetUrl: string): Promise<string> {
    const bypassUrl = `${this.medalBypassApiUrl}${encodeURIComponent(targetUrl)}`;
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

    const allowedMedalHosts = ['medal.tv', 'cdn.medal.tv', 'medal-content.com', 'cdn.medal-content.com'];
    let srcUrl: URL;
    try {
      srcUrl = new URL(bypassData.src);
    } catch {
      throw new Error('Ungültige Video-URL vom Medal Bypass Service');
    }
    if (
      srcUrl.protocol !== 'https:' ||
      !allowedMedalHosts.some((host) => srcUrl.hostname === host || srcUrl.hostname.endsWith(`.${host}`))
    ) {
      throw new Error('Video-URL stammt nicht von einem erlaubten Medal-Host');
    }

    return bypassData.src;
  }

  private async downloadMedalClipFromCorsProxy(
    targetUrl: string,
  ): Promise<{ file: File; extension: string; mimeType: string }> {
    const normalizedTargetUrl = targetUrl.trim();
    const corsProxyUrl = `${this.medalCorsProxyUrl}${encodeURIComponent(normalizedTargetUrl)}`;
    const response = await fetch(corsProxyUrl);
    if (!response.ok) {
      throw new Error('Fehler beim Abrufen des Medal Clips');
    }

    const allowedVideoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const pathName = new URL(normalizedTargetUrl).pathname;
    const fileNameWithExt = pathName.split('/').pop() || 'clip.mp4';
    let fileExtension = 'mp4';
    if (fileNameWithExt.includes('.')) {
      const extractedExtension = fileNameWithExt.split('.').pop();
      if (extractedExtension) {
        fileExtension = extractedExtension.toLowerCase();
      }
    }
    if (!allowedVideoExtensions.includes(fileExtension)) {
      throw new Error(
        `Ungültiges Dateiformat ".${fileExtension}". Erlaubt sind: ${allowedVideoExtensions.join(', ')}.`,
      );
    }
    const mimeType = fileExtension === 'webm' ? 'video/webm' : 'video/mp4';

    this.medalStatusMessage = 'Video wird heruntergeladen...';
    this.medalStartTime = Date.now();

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    if (total > this.maxFileSize) {
      throw new Error(`Das Video ist zu groß (max. 100 MB).`);
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
        throw new Error(`Das Video ist zu groß (max. 100 MB).`);
      }
      if (total > 0) {
        this.medalDownloadProgress = Math.round((receivedLength / total) * 100);
        this.medalETA = calculateETA(this.medalStartTime, this.medalDownloadProgress);
        this.medalStatusMessage = `Video wird heruntergeladen... (${this.medalDownloadProgress}%)`;
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

  private uploadMedalFileToPresignedUrl(file: File, presignedUrl: string, contentType: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.fileUploader.clearQueue();
      this.fileUploader.options.url = presignedUrl;
      this.fileUploader.options.method = 'PUT';
      this.fileUploader.options.disableMultipart = true;
      this.fileUploader.options.headers = [{ name: 'Content-Type', value: contentType }];

      this.fileUploader.onBeforeUploadItem = (item: any) => {
        item.url = presignedUrl;
        item.method = 'PUT';
        item.withCredentials = false;
        item.headers = [{ name: 'Content-Type', value: contentType }];
      };

      this.fileUploader.onProgressItem = (_item: any, progress: any) => {
        this.medalUploadProgress = progress;
        this.medalETA = calculateETA(this.medalStartTime, progress);
        this.medalStatusMessage = `Video wird hochgeladen... (${progress}%)`;
      };

      this.fileUploader.onSuccessItem = () => {
        this.cleanupUploaderCallbacks();
        resolve();
      };

      this.fileUploader.onErrorItem = (_item: any, response: any, status: any) => {
        this.cleanupUploaderCallbacks();
        reject(new Error(`Upload fehlgeschlagen: ${status} ${response}`));
      };

      this.fileUploader.addToQueue([file]);
      this.fileUploader.uploadAll();
    });
  }

  getFileIcon(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'pi pi-image';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'pi pi-video';
    return 'pi pi-file';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  get allUploadsSuccessful(): boolean {
    if (this.uploadMode === 'medal') return true;
    return this.files.length > 0 && this.files.every((f) => f.status === 'done');
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
