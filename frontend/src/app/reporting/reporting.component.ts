import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { FileUploader, FileUploadModule } from 'ng2-file-upload';
import type { GetReportsResponse, ReportFileUploadGetResponse } from '@zeitvertreib/types';
import { CaptchaComponent, CaptchaChangeEvent } from '../components/captcha/captcha.component';

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
  imports: [CommonModule, ButtonModule, FileUploadModule, CaptchaComponent],
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

  captchaUnlocked = false;
  captchaUnlocking = false;
  captchaGateError = '';
  captchaId = '';
  captchaAnswer = '';
  honeypot = '';
  captchaError = false;

  async unlockPage(): Promise<void> {
    if (this.captchaAnswer.length < 5 || !this.captchaId || this.captchaUnlocking) return;
    this.captchaUnlocking = true;
    this.captchaGateError = '';
    try {
      const response = await fetch(
        `${this.apiUrl}/captcha/check?captchaId=${encodeURIComponent(this.captchaId)}&captchaAnswer=${encodeURIComponent(this.captchaAnswer)}`,
      );
      if (response.ok) {
        this.captchaUnlocked = true;
      } else {
        const data = await response.json().catch(() => ({})) as { error?: string };
        this.captchaGateError = data.error ?? 'Falsches Captcha. Bitte erneut versuchen.';
        this.captchaError = true;
        setTimeout(() => { this.captchaError = false; }, 100);
      }
    } catch {
      this.captchaGateError = 'Netzwerkfehler. Bitte erneut versuchen.';
    } finally {
      this.captchaUnlocking = false;
    }
  }

  onCaptchaChange(event: CaptchaChangeEvent): void {
    this.captchaId = event.captchaId;
    this.captchaAnswer = event.captchaAnswer;
    this.honeypot = event.honeypot;
    this.captchaError = false;
    this.captchaGateError = '';
  }

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

    if (!this.captchaUnlocked || !this.captchaId || !this.captchaAnswer) {
      this.errorMessage = 'Bitte löse zuerst das Captcha.';
      return;
    }

    this.isUploading = true;
    this.errorMessage = '';

    for (const fileItem of this.files) {
      try {
        fileItem.status = 'uploading';
        const ext = fileItem.file.name.split('.').pop()?.toLowerCase() || '';
        const queryParams = new URLSearchParams();
        queryParams.set('reportId', String(this.selectedReport.id));
        queryParams.set('extension', ext);
        queryParams.set('captchaId', this.captchaId);
        queryParams.set('captchaAnswer', this.captchaAnswer);
        queryParams.set('honeypot', this.honeypot);

        const urlResponse = await fetch(
          `${this.apiUrl}/reports/upload?${queryParams.toString()}`,
        );

        if (!urlResponse.ok) {
          const errData = await urlResponse.json().catch(() => ({})) as { error?: string };
          const isCaptchaErr = urlResponse.status === 400 && typeof errData.error === 'string' && errData.error.toLowerCase().includes('captcha');
          fileItem.status = 'error';
          fileItem.errorMessage = isCaptchaErr ? 'Captcha abgelaufen. Bitte erneut lösen.' : 'Fehler beim Generieren der Upload-URL.';
          if (isCaptchaErr) {
            this.captchaUnlocked = false;
            this.captchaId = '';
            this.captchaAnswer = '';
            this.captchaError = true;
            setTimeout(() => { this.captchaError = false; }, 100);
            break; // No point uploading remaining files — captcha is consumed
          }
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
    // Only show the upload-done state if the captcha wasn't invalidated mid-upload
    this.uploadDone = this.captchaUnlocked;
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
