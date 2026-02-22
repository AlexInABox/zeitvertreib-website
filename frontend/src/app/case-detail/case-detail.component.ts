import { Component, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../services/auth.service';
import type {
  GetCaseMetadataGetResponse,
  CaseFileUploadGetResponse,
  UpdateCaseMetadataPutRequest,
} from '@zeitvertreib/types';
import { CASE_RULES } from '@zeitvertreib/types';

@Component({
  selector: 'app-case-detail',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule],
  templateUrl: './case-detail.component.html',
  styleUrls: ['./case-detail.component.css'],
})
export class CaseDetailComponent implements OnInit {
  caseId = '';
  caseData: GetCaseMetadataGetResponse | null = null;
  filteredFiles: GetCaseMetadataGetResponse['files'] = [];
  searchQuery = '';
  sortBy: 'name' | 'name-desc' | 'newest' | 'oldest' | 'largest' | 'smallest' = 'newest';
  sortDropdownOpen = false;
  isLoading = true;
  hasError = false;
  errorMessage = '';

  // Media viewer state
  viewerOpen = false;
  viewerFileUrl = '';
  viewerFileName = '';
  viewerMediaType: 'image' | 'video' | 'audio' | null = null;

  // Auth state
  isTeam = false;

  // Metadata editing state
  isEditingMetadata = false;
  editedTitle = '';
  editedDescription = '';
  editedRule: string | null = null;
  isSavingMetadata = false;

  // Available case rules
  readonly availableRules = CASE_RULES;

  // Upload state
  isUploading = false;
  uploadProgress = 0;
  uploadStatusMessage = '';
  uploadETA = '';
  uploadStartTime = 0;
  selectedFile: File | null = null;

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

  // Linked user management state
  newLinkedSteamId = '';
  isManagingLinkedUsers = false;
  linkedUserError = '';

  sortOptions = [
    { label: 'Name (A-Z)', value: 'name' },
    { label: 'Name (Z-A)', value: 'name-desc' },
    { label: 'Neueste zuerst', value: 'newest' },
    { label: 'Älteste zuerst', value: 'oldest' },
    { label: 'Größte zuerst', value: 'largest' },
    { label: 'Kleinste zuerst', value: 'smallest' },
  ];

  private http = inject(HttpClient);
  private authService = inject(AuthService);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-dropdown') && this.sortDropdownOpen) {
      this.sortDropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.viewerOpen) {
      this.closeViewer();
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getSessionToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  ngOnInit() {
    this.authService.currentUserData$.subscribe(() => {
      this.isTeam = this.authService.isTeam();
    });

    this.route.paramMap.subscribe((params) => {
      this.caseId = params.get('id') || '';
      if (this.caseId) {
        this.loadCaseData();
      }
    });
  }

  loadCaseData() {
    this.isLoading = true;
    this.hasError = false;

    this.http.get<GetCaseMetadataGetResponse>(`${environment.apiUrl}/cases/metadata?case=${this.caseId}`).subscribe({
      next: (data) => {
        this.caseData = data;
        this.editedTitle = data.title || '';
        this.editedDescription = data.description || '';
        this.filterFiles();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading case:', error);
        this.hasError = true;
        this.errorMessage = error.error?.error || 'Fehler beim Laden des Falls';
        this.isLoading = false;
      },
    });
  }

  filterFiles() {
    const files = this.caseData?.files ?? [];
    let filtered = [...files];

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(query));
    }

    this.filteredFiles = this.sortFileList(filtered);
  }

  sortFileList(files: GetCaseMetadataGetResponse['files']): GetCaseMetadataGetResponse['files'] {
    const sorted = [...files];
    switch (this.sortBy) {
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'newest':
        return sorted.sort((a, b) => b.createdAt - a.createdAt);
      case 'oldest':
        return sorted.sort((a, b) => a.createdAt - b.createdAt);
      case 'largest':
        return sorted.sort((a, b) => b.size - a.size);
      case 'smallest':
        return sorted.sort((a, b) => a.size - b.size);
      default:
        return sorted;
    }
  }

  changeSortOrder(sortBy: 'name' | 'name-desc' | 'newest' | 'oldest' | 'largest' | 'smallest') {
    this.sortBy = sortBy;
    this.sortDropdownOpen = false;
    this.filterFiles();
  }

  toggleSortDropdown() {
    this.sortDropdownOpen = !this.sortDropdownOpen;
  }

  getSortLabel(): string {
    return this.sortOptions.find((opt) => opt.value === this.sortBy)?.label || 'Sortieren';
  }

  clearSearch() {
    this.searchQuery = '';
    this.filterFiles();
  }

  getFileUrl(filename: string): string {
    const file = this.caseData?.files.find((f) => f.name === filename);
    return file?.url || '';
  }

  goBack() {
    this.router.navigate(['/cases']);
  }

  copySteamIdToClipboard(steamId: string) {
    navigator.clipboard.writeText(steamId).then(
      () => {
        console.log('Steam ID copied to clipboard:', steamId);
      },
      () => {
        console.error('Failed to copy Steam ID');
      },
    );
  }

  validateSteamIdFormat(steamId: string): { valid: boolean; normalized?: string; error?: string } {
    const raw = steamId.trim();

    if (!raw) {
      return { valid: false, error: 'Steam ID darf nicht leer sein' };
    }

    // Remove all @steam suffixes (catches duplication like @steam@steam)
    const base = raw.replace(/@steam/g, '');

    // Check if exactly 17 decimal digits
    if (!/^\d{17}$/.test(base)) {
      return { valid: false, error: 'Steam ID muss genau 17 Dezimalziffern sein' };
    }

    // Verify within valid Steam64 ID range
    const MIN_STEAM64 = 76561197960265728n; // 0x0110000100000000
    const MAX_STEAM64 = 76561202255233023n; // 0x01100001FFFFFFFF
    const steamId64 = BigInt(base);

    if (steamId64 < MIN_STEAM64 || steamId64 > MAX_STEAM64) {
      return { valid: false, error: 'Steam ID liegt außerhalb des gültigen Bereichs' };
    }

    return { valid: true, normalized: `${base}@steam` };
  }

  getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  getFileIcon(filename: string): string {
    const ext = this.getFileExtension(filename);
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'pi-image';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'pi-video';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return 'pi-volume-up';
    if (['pdf'].includes(ext)) return 'pi-file-pdf';
    if (['txt', 'md'].includes(ext)) return 'pi-file-edit';
    if (['zip', 'tar', 'gz'].includes(ext)) return 'pi-box';
    return 'pi-file';
  }

  getFileType(filename: string): string {
    const ext = this.getFileExtension(filename);
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'Bild';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'Video';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return 'Audio';
    if (['pdf'].includes(ext)) return 'PDF Dokument';
    if (['txt', 'md'].includes(ext)) return 'Text Dokument';
    if (['zip', 'tar', 'gz'].includes(ext)) return 'Archiv';
    return ext.toUpperCase() + ' Datei';
  }

  formatFileSize(bytes: number | undefined): string {
    if (!bytes) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(timestamp: number | undefined): string {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatTimeAgo(timestamp: number | undefined): string {
    if (!timestamp) return '—';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'gerade eben';
    if (minutes < 60) return `vor ${minutes} Minute${minutes === 1 ? '' : 'n'}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `vor ${hours} Stunde${hours === 1 ? '' : 'n'}`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
    return this.formatDate(timestamp);
  }

  getTotalSize(): string {
    const total = this.caseData?.files.reduce((sum, f) => sum + f.size, 0) ?? 0;
    return this.formatFileSize(total);
  }

  formatCaseName(caseId: string): string {
    return `Fall #${caseId}`;
  }

  isViewableFile(filename: string): boolean {
    const ext = this.getFileExtension(filename);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg'].includes(ext);
  }

  getMediaType(filename: string): 'image' | 'video' | 'audio' | null {
    const ext = this.getFileExtension(filename);
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg'].includes(ext)) return 'audio';
    return null;
  }

  openViewer(filename: string, event?: Event) {
    if (event) event.preventDefault();
    const file = this.caseData?.files.find((f) => f.name === filename);
    if (!file) return;
    if (this.isViewableFile(filename)) {
      this.viewerFileUrl = file.url;
      this.viewerFileName = filename;
      this.viewerMediaType = this.getMediaType(filename);
      this.viewerOpen = true;
      document.body.style.overflow = 'hidden';
    } else {
      window.open(file.url, '_blank');
    }
  }

  closeViewer() {
    this.viewerOpen = false;
    this.viewerFileUrl = '';
    this.viewerFileName = '';
    this.viewerMediaType = null;
    document.body.style.overflow = '';
  }

  startEditingMetadata() {
    this.editedTitle = this.caseData?.title || '';
    this.editedDescription = this.caseData?.description || '';
    this.editedRule = this.caseData?.rule || null;
    this.isEditingMetadata = true;
  }

  cancelEditingMetadata() {
    this.isEditingMetadata = false;
    this.editedTitle = this.caseData?.title || '';
    this.editedDescription = this.caseData?.description || '';
    this.editedRule = this.caseData?.rule || null;
  }

  saveMetadata() {
    this.isSavingMetadata = true;
    const payload: UpdateCaseMetadataPutRequest = {};
    if (this.editedTitle.trim()) payload.title = this.editedTitle.trim();
    if (this.editedDescription.trim()) payload.description = this.editedDescription.trim();
    if (this.editedRule !== undefined) payload.rule = this.editedRule;

    this.http
      .put(`${environment.apiUrl}/cases/metadata?case=${this.caseId}`, payload, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: () => {
          this.isSavingMetadata = false;
          this.isEditingMetadata = false;
          this.loadCaseData();
        },
        error: (error) => {
          this.isSavingMetadata = false;
          console.error('Failed to save metadata:', error);
          alert('Fehler beim Speichern der Metadaten');
        },
      });
  }

  addLinkedUser() {
    this.linkedUserError = '';
    const raw = this.newLinkedSteamId.trim();
    if (!raw) {
      this.linkedUserError = 'Bitte gib eine Steam-ID ein';
      return;
    }

    // Validate Steam ID format
    const validation = this.validateSteamIdFormat(raw);
    if (!validation.valid) {
      this.linkedUserError = validation.error || 'Ungültiges Steam-ID-Format';
      return;
    }

    const steamId = validation.normalized || (raw.endsWith('@steam') ? raw : `${raw}@steam`);
    const existing = (this.caseData?.linkedUsers ?? []).map((u) => u.steamId);
    if (existing.includes(steamId)) {
      this.linkedUserError = 'Benutzer ist bereits verlinkt';
      return;
    }

    this.isManagingLinkedUsers = true;
    const payload: UpdateCaseMetadataPutRequest = { linkedSteamIds: [...existing, steamId] };

    this.http
      .put(`${environment.apiUrl}/cases/metadata?case=${this.caseId}`, payload, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: () => {
          this.isManagingLinkedUsers = false;
          this.newLinkedSteamId = '';
          this.loadCaseData();
        },
        error: (error) => {
          this.isManagingLinkedUsers = false;
          console.error('Failed to add linked user:', error);
          this.linkedUserError = error.error?.error || 'Fehler beim Hinzufügen des Benutzers';
        },
      });
  }

  removeLinkedUser(steamId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const remaining = (this.caseData?.linkedUsers ?? []).filter((u) => u.steamId !== steamId).map((u) => u.steamId);

    this.isManagingLinkedUsers = true;
    const payload: UpdateCaseMetadataPutRequest = { linkedSteamIds: remaining };

    this.http
      .put(`${environment.apiUrl}/cases/metadata?case=${this.caseId}`, payload, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: () => {
          this.isManagingLinkedUsers = false;
          this.loadCaseData();
        },
        error: (error) => {
          this.isManagingLinkedUsers = false;
          console.error('Failed to remove linked user:', error);
          alert('Fehler beim Entfernen des Benutzers');
        },
      });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  private calculateETA(startTime: number, progress: number): string {
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

  async uploadFile() {
    if (!this.selectedFile) {
      alert('Bitte wähle eine Datei aus');
      return;
    }

    this.isUploading = true;
    this.uploadProgress = 0;
    this.uploadStatusMessage = 'Upload-URL wird angefordert...';
    this.uploadETA = '';
    this.uploadStartTime = Date.now();

    try {
      const fileExtension = this.selectedFile.name.split('.').pop()?.toLowerCase() || '';
      const contentType = this.selectedFile.type || 'application/octet-stream';

      const uploadInfo = await this.http
        .get<CaseFileUploadGetResponse>(
          `${environment.apiUrl}/cases/upload?case=${this.caseId}&extension=${fileExtension}`,
          { headers: this.getAuthHeaders(), withCredentials: true },
        )
        .toPromise();

      if (!uploadInfo) throw new Error('Keine Upload-URL erhalten');

      this.uploadStatusMessage = 'Datei wird hochgeladen...';
      this.uploadStartTime = Date.now();

      const file = this.selectedFile;
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadInfo.url, true);
        xhr.setRequestHeader('Content-Type', contentType);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            this.uploadProgress = Math.round((event.loaded / event.total) * 100);
            this.uploadETA = this.calculateETA(this.uploadStartTime, this.uploadProgress);
            this.uploadStatusMessage = `Datei wird hochgeladen... (${this.uploadProgress}%)`;
          }
        };

        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload fehlgeschlagen: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'));
        xhr.send(file);
      });

      this.isUploading = false;
      this.uploadProgress = 0;
      this.uploadStatusMessage = '';
      this.uploadETA = '';
      this.selectedFile = null;

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      this.loadCaseData();
      alert('Datei erfolgreich hochgeladen!');
    } catch (error) {
      this.isUploading = false;
      this.uploadProgress = 0;
      this.uploadStatusMessage = '';
      this.uploadETA = '';
      console.error('Upload failed:', error);
      alert(error instanceof Error ? error.message : 'Fehler beim Hochladen der Datei');
    }
  }

  isValidUrl(urlString: string): boolean {
    if (!urlString?.trim()) return false;
    try {
      const url = new URL(urlString.trim());
      return url.protocol.startsWith('http');
    } catch {
      return false;
    }
  }

  onMedalUrlChange() {
    this.medalUrlInvalid = this.medalClipUrl.trim() ? !this.isValidUrl(this.medalClipUrl) : false;
  }

  async uploadMedalClip() {
    if (!this.medalClipUrl.trim()) {
      alert('Bitte gib eine URL ein');
      return;
    }
    if (!this.isValidUrl(this.medalClipUrl)) {
      alert('Bitte gib eine gültige URL ein');
      return;
    }

    this.isFetchingMedalClip = true;
    this.medalDownloadProgress = 0;
    this.medalUploadProgress = 0;
    this.medalStatusMessage = 'Medal Clip wird abgerufen...';
    this.medalETA = '';
    this.medalStartTime = Date.now();

    try {
      const bypassUrl = `https://medalbypass.vercel.app/api/clip?url=${encodeURIComponent(this.medalClipUrl)}`;
      const bypassResponse = await fetch(bypassUrl);
      if (!bypassResponse.ok) throw new Error('Fehler beim Abrufen des Medal Clips');

      const bypassData = (await bypassResponse.json()) as { valid: boolean; src?: string; reasoning?: string };
      if (!bypassData.valid) throw new Error(bypassData.reasoning || 'Ungültige Medal.tv URL');
      if (!bypassData.src) throw new Error('Keine Video-URL erhalten');

      const urlPath = bypassData.src.split('?')[0];
      const fileNameWithExt = urlPath.split('/').pop() ?? 'clip.mp4';
      const fileExtension = fileNameWithExt.includes('.') ? fileNameWithExt.split('.').pop()!.toLowerCase() : 'mp4';
      const mimeType = fileExtension === 'webm' ? 'video/webm' : 'video/mp4';

      this.medalStatusMessage = 'Video wird heruntergeladen...';
      this.medalStartTime = Date.now();

      const corsProxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(bypassData.src)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(bypassData.src)}`,
        bypassData.src,
      ];

      let videoResponse: Response | null = null;
      for (const proxyUrl of corsProxies) {
        try {
          const resp = await fetch(proxyUrl);
          if (resp.ok) {
            videoResponse = resp;
            break;
          }
        } catch {
          continue;
        }
      }

      if (!videoResponse) throw new Error('Fehler beim Herunterladen des Videos');

      const contentLength = videoResponse.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      const reader = videoResponse.body?.getReader();
      if (!reader) throw new Error('Fehler beim Lesen des Videos');

      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const readResult = await reader.read();
        if (readResult.done) break;
        chunks.push(readResult.value);
        receivedLength += readResult.value.length;
        if (total > 0) {
          this.medalDownloadProgress = Math.round((receivedLength / total) * 100);
          this.medalETA = this.calculateETA(this.medalStartTime, this.medalDownloadProgress);
          this.medalStatusMessage = `Video wird heruntergeladen... (${this.medalDownloadProgress}%)`;
        }
      }

      const videoData = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        videoData.set(chunk, position);
        position += chunk.length;
      }

      this.medalDownloadProgress = 100;
      this.medalUploadProgress = 0;
      this.medalStatusMessage = 'Upload-URL wird angefordert...';

      const uploadInfo = await this.http
        .get<CaseFileUploadGetResponse>(
          `${environment.apiUrl}/cases/upload?case=${this.caseId}&extension=${fileExtension}`,
          { headers: this.getAuthHeaders(), withCredentials: true },
        )
        .toPromise();

      if (!uploadInfo?.url) throw new Error('Fehler beim Abrufen der Upload-URL');

      this.medalStatusMessage = 'Video wird hochgeladen...';
      this.medalStartTime = Date.now();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadInfo.url, true);
        xhr.setRequestHeader('Content-Type', mimeType);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            this.medalUploadProgress = Math.round((event.loaded / event.total) * 100);
            this.medalETA = this.calculateETA(this.medalStartTime, this.medalUploadProgress);
            this.medalStatusMessage = `Video wird hochgeladen... (${this.medalUploadProgress}%)`;
          }
        };

        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload fehlgeschlagen: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'));
        xhr.send(videoData);
      });

      this.isFetchingMedalClip = false;
      this.medalDownloadProgress = 0;
      this.medalUploadProgress = 0;
      this.medalClipUrl = '';
      this.medalStatusMessage = '';
      this.medalETA = '';

      this.loadCaseData();
      alert('Medal Clip erfolgreich hochgeladen!');
    } catch (error) {
      this.isFetchingMedalClip = false;
      this.medalDownloadProgress = 0;
      this.medalUploadProgress = 0;
      this.medalStatusMessage = '';
      this.medalETA = '';
      console.error('Medal clip upload failed:', error);
      alert(error instanceof Error ? error.message : 'Fehler beim Hochladen des Medal Clips');
    }
  }
}
