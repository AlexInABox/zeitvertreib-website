import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { FileUploader, FileUploadModule } from 'ng2-file-upload';
import type { GetReportsResponse, ReportFileUploadGetResponse } from '@zeitvertreib/types';

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
  imports: [CommonModule, ButtonModule, FileUploadModule],
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

  fileUploader = new FileUploader({ url: '', autoUpload: false });

  private readonly apiUrl = environment.apiUrl;
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
    this.files = [];
    this.isUploading = false;
    this.uploadDone = false;
    this.errorMessage = '';
  }

  backToList(): void {
    this.selectedReport = null;
    this.files = [];
    this.isUploading = false;
    this.uploadDone = false;
    this.errorMessage = '';
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

      this.fileUploader.onBeforeUploadItem = (item) => {
        item.url = presignedUrl;
        item.method = 'PUT';
        item.withCredentials = false;
        item.headers = [];
      };

      this.fileUploader.onProgressItem = (_item, progress) => {
        fileItem.progress = progress;
      };

      this.fileUploader.onSuccessItem = () => {
        this.cleanupUploaderCallbacks();
        resolve();
      };

      this.fileUploader.onErrorItem = (_item, response, status) => {
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
