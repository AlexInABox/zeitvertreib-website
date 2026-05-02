import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { FileUploader, FileUploadModule } from 'ng2-file-upload';
import type { GetReportsResponse, ReportFileUploadGetResponse } from '@zeitvertreib/types';
import { MedalIntegrityError, isValidUrl, calculateETA } from '../utils/medal.utils';
import { MedalService } from '../services/medal.service';

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
  private readonly maxFileSize = 100 * 1024 * 1024; // 100 MB
  private readonly allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'avi', 'mkv'];
  private readonly medalService = inject(MedalService);

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
      const medalSourceUrl = await this.medalService.resolveMedalSourceUrl(this.medalClipUrl);
      const medalFile = await this.medalService.downloadMedalClipFromCorsProxy(medalSourceUrl, {
        onStatusMessage: (msg) => { this.medalStatusMessage = msg; },
        onDownloadProgress: (progress) => { this.medalDownloadProgress = progress; },
        onETA: (eta) => { this.medalETA = eta; },
        onStartTime: (time) => { this.medalStartTime = time; },
      });

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
