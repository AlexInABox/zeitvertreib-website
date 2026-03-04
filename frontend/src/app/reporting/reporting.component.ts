import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { CreateReportPostResponse, ReportFileUploadGetResponse, CedModLastReportResponse } from '@zeitvertreib/types';

interface FileUpload {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMessage?: string;
}

interface SteamProfile {
  steamId: string;
  username?: string;
  avatarUrl?: string;
}

@Component({
  selector: 'app-reporting',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
  templateUrl: './reporting.component.html',
  styleUrls: ['./reporting.component.css'],
})
export class ReportingComponent implements OnInit, OnDestroy {
  // Form state
  steamId = '';
  reportedSteamId = '';
  description = '';
  files: FileUpload[] = [];

  // UI state
  currentView: 'form' | 'uploading' | 'success' = 'form';
  isSubmitting = false;
  errorMessage = '';
  reportToken = '';

  // File preview (unused since lookup removed)
  // keep for compatibility but will remain empty
  fileUrls: Map<string, string> = new Map();

  // CedMod auto-fill
  isLookingUp = false;
  lookupCedModError = '';
  steamIdAutoFilled = false;

  // Steam profile resolution
  steamIdProfile: SteamProfile | null = null;
  reportedSteamIdProfile: SteamProfile | null = null;
  isFetchingSteamProfile = false;
  isFetchingReportedProfile = false;
  editingSteamId = false;
  editingReportedSteamId = false;

  private readonly apiUrl = environment.apiUrl;
  private readonly maxFiles = 5;
  private readonly maxFileSize = 100 * 1024 * 1024; // 100 MB
  private readonly allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'avi', 'mkv'];

  private authSub?: Subscription;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    // Auto-fill own Steam ID if user is logged in
    this.authSub = this.authService.currentUser$.subscribe((user) => {
      if (user && user.steamId && !this.steamId) {
        const normalized = this.normalizeSteamId(user.steamId);
        this.steamId = normalized;
        this.steamIdAutoFilled = true;
        this.editingSteamId = false;
        void this.fetchSteamProfile(normalized, 'own');
      } else if (!user) {
        this.steamIdAutoFilled = false;
        this.steamIdProfile = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
  }

  // ---- File handling ----

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const newFiles = Array.from(input.files);
    for (const file of newFiles) {
      if (this.files.length >= this.maxFiles) {
        this.errorMessage = `Maximal ${this.maxFiles} Dateien erlaubt.`;
        break;
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!this.allowedExtensions.includes(ext)) {
        this.errorMessage = `Datei "${file.name}" hat eine nicht erlaubte Endung. Erlaubt: ${this.allowedExtensions.join(', ')}`;
        continue;
      }

      if (file.size > this.maxFileSize) {
        this.errorMessage = `Datei "${file.name}" ist zu groß (max. 100 MB).`;
        continue;
      }

      this.files.push({ file, progress: 0, status: 'pending' });
    }

    // Reset the input so the same file can be re-selected
    input.value = '';
  }

  removeFile(index: number): void {
    this.files.splice(index, 1);
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

  // ---- Form validation ----

  // ---- Steam ID normalization & profile ----

  normalizeSteamId(id: string): string {
    return id.replace(/@steam/gi, '').trim();
  }

  onSteamIdChange(value: string): void {
    const normalized = this.normalizeSteamId(value);
    this.steamId = normalized || value;
    if (/^\d{17}$/.test(normalized)) {
      this.editingSteamId = false;
      this.steamIdProfile = null;
      void this.fetchSteamProfile(normalized, 'own');
    } else {
      this.steamIdProfile = null;
    }
  }

  onReportedSteamIdChange(value: string): void {
    const normalized = this.normalizeSteamId(value);
    this.reportedSteamId = normalized || value;
    if (/^\d{17}$/.test(normalized)) {
      this.editingReportedSteamId = false;
      this.reportedSteamIdProfile = null;
      void this.fetchSteamProfile(normalized, 'reported');
    } else {
      this.reportedSteamIdProfile = null;
    }
  }

  resolveFromInput(target: 'own' | 'reported'): void {
    const raw = target === 'own' ? this.steamId : this.reportedSteamId;
    const normalized = this.normalizeSteamId(raw);
    if (!/^\d{17}$/.test(normalized)) return;
    if (target === 'own') {
      if (this.steamIdProfile) return; // already resolved
      this.steamId = normalized;
      this.editingSteamId = false;
      this.steamIdProfile = null;
      void this.fetchSteamProfile(normalized, 'own');
    } else {
      if (this.reportedSteamIdProfile) return;
      this.reportedSteamId = normalized;
      this.editingReportedSteamId = false;
      this.reportedSteamIdProfile = null;
      void this.fetchSteamProfile(normalized, 'reported');
    }
  }

  async fetchSteamProfile(steamId: string, target: 'own' | 'reported'): Promise<void> {
    if (target === 'own') this.isFetchingSteamProfile = true;
    else this.isFetchingReportedProfile = true;

    try {
      const token = this.authService.getSessionToken();
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${this.apiUrl}/profile-details?steamId=${encodeURIComponent(steamId)}`, {
        headers,
        credentials: 'include',
      });

      const profile: SteamProfile = { steamId };
      if (response.ok) {
        const data = await response.json();
        if (data.username) profile.username = data.username;
        if (data.avatarUrl) profile.avatarUrl = data.avatarUrl;
      }

      if (target === 'own') this.steamIdProfile = profile;
      else this.reportedSteamIdProfile = profile;
    } catch {
      const profile: SteamProfile = { steamId };
      if (target === 'own') this.steamIdProfile = profile;
      else this.reportedSteamIdProfile = profile;
    } finally {
      if (target === 'own') this.isFetchingSteamProfile = false;
      else this.isFetchingReportedProfile = false;
    }
  }

  startEditSteamId(): void {
    this.editingSteamId = true;
    this.steamIdProfile = null;
  }

  startEditReportedSteamId(): void {
    this.editingReportedSteamId = true;
    this.reportedSteamIdProfile = null;
  }

  // ---- Form validation ----

  get isFormValid(): boolean {
    return this.isSteamIdValid && this.isReportedSteamIdValid;
  }

  get isSteamIdValid(): boolean {
    return /^\d{17}$/.test(this.normalizeSteamId(this.steamId));
  }

  get isReportedSteamIdValid(): boolean {
    return /^\d{17}$/.test(this.normalizeSteamId(this.reportedSteamId));
  }

  // ---- CedMod auto-fill ----

  async lookupFromCedMod(): Promise<void> {
    if (!this.isSteamIdValid) {
      this.lookupCedModError = 'Gib zuerst eine gültige eigene Steam-ID ein.';
      return;
    }

    this.isLookingUp = true;
    this.lookupCedModError = '';

    try {
      const response = await fetch(
        `${this.apiUrl}/reports/cedmod-lookup?steamId=${encodeURIComponent(this.steamId.trim())}`,
      );

      if (!response.ok) {
        this.lookupCedModError = 'Fehler beim Abrufen des letzten In-Game-Reports.';
        return;
      }

      const data: CedModLastReportResponse = await response.json();

      if (!data.found || !data.reportedSteamId) {
        this.lookupCedModError = 'Kein In-Game-Report für diese Steam-ID gefunden.';
        return;
      }

      const normalizedReported = this.normalizeSteamId(data.reportedSteamId);
      this.reportedSteamId = normalizedReported;
      this.editingReportedSteamId = false;
      this.reportedSteamIdProfile = null;
      void this.fetchSteamProfile(normalizedReported, 'reported');
    } catch {
      this.lookupCedModError = 'Netzwerkfehler beim Abrufen des CedMod-Reports.';
    } finally {
      this.isLookingUp = false;
    }
  }

  // ---- Submit report ----

  async submitReport(): Promise<void> {
    this.errorMessage = '';

    if (!this.isSteamIdValid) {
      this.errorMessage = 'Bitte gib eine gültige Steam-ID ein (17 Ziffern).';
      return;
    }

    if (!this.isReportedSteamIdValid) {
      this.errorMessage = 'Bitte gib eine gültige Steam-ID des gemeldeten Spielers ein (17 Ziffern).';
      return;
    }

    this.isSubmitting = true;

    try {
      // Step 1: Create the report
      const response = await fetch(`${this.apiUrl}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steamId: this.normalizeSteamId(this.steamId),
          reportedSteamId: this.normalizeSteamId(this.reportedSteamId),
          description: '-',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        this.errorMessage = errorData.error || 'Fehler beim Erstellen des Reports.';
        this.isSubmitting = false;
        return;
      }

      const data: CreateReportPostResponse = await response.json();
      this.reportToken = data.reportToken;

      // Step 2: Upload files if any
      if (this.files.length > 0) {
        this.currentView = 'uploading';
        await this.uploadAllFiles();
      }

      this.currentView = 'success';
    } catch (error) {
      this.errorMessage = 'Netzwerkfehler. Bitte versuche es erneut.';
    } finally {
      this.isSubmitting = false;
    }
  }

  private async uploadAllFiles(): Promise<void> {
    for (const fileUpload of this.files) {
      try {
        fileUpload.status = 'uploading';
        const ext = fileUpload.file.name.split('.').pop()?.toLowerCase() || '';

        // Get presigned URL
        const uploadUrlResponse = await fetch(
          `${this.apiUrl}/reports/upload?report=${this.reportToken}&extension=${ext}`,
        );

        if (!uploadUrlResponse.ok) {
          fileUpload.status = 'error';
          fileUpload.errorMessage = 'Fehler beim Generieren der Upload-URL.';
          continue;
        }

        const uploadData: ReportFileUploadGetResponse = await uploadUrlResponse.json();

        // Upload file with progress tracking via XMLHttpRequest
        await this.uploadFileWithProgress(fileUpload, uploadData.url);
        fileUpload.status = 'done';
        fileUpload.progress = 100;
      } catch (error) {
        fileUpload.status = 'error';
        fileUpload.errorMessage = 'Upload fehlgeschlagen.';
      }
    }
  }

  private uploadFileWithProgress(fileUpload: FileUpload, presignedUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignedUrl, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          fileUpload.progress = Math.round((event.loaded / event.total) * 100);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(fileUpload.file);
    });
  }

  // ---- Token lookup ----

  showForm(): void {
    this.currentView = 'form';
    this.errorMessage = '';
    this.lookupCedModError = '';
    this.files = [];
    this.reportToken = '';
    this.steamIdProfile = null;
    this.reportedSteamIdProfile = null;
    this.editingSteamId = false;
    this.editingReportedSteamId = false;
    this.steamId = '';
    this.reportedSteamId = '';
    this.description = '';

    // Re-apply logged-in user's Steam ID
    const user = this.authService.getCurrentUser();
    if (user && user.steamId) {
      const normalized = this.normalizeSteamId(user.steamId);
      this.steamId = normalized;
      this.steamIdAutoFilled = true;
      this.editingSteamId = false;
      void this.fetchSteamProfile(normalized, 'own');
    }
  }

  isImageFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
  }

  isVideoFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
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
