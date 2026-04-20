import { Component, OnInit, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../services/auth.service';
import { FileUploader, FileUploadModule } from 'ng2-file-upload';
import { md5 } from 'hash-wasm';
import type {
  GetCaseMetadataGetResponse,
  CaseFileUploadGetResponse,
  UpdateCaseMetadataPutRequest,
  CaseCategory,
  SearchReportsBySteamIdGetResponse,
} from '@zeitvertreib/types';

const MEDAL_CORS_PROXY_URL = 'https://cors.zeitvertreib.vip/?url=';

class MedalIntegrityError extends Error {
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

function normalizeEtag(etag: string): string {
  let normalized = etag.trim();
  if (normalized.startsWith('W/')) {
    normalized = normalized.slice(2).trim();
  }
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.toLowerCase();
}

function normalizeHeaderValue(value: string): string {
  let normalized = value.trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function calculateCrc32c(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const tableIndex = (crc ^ bytes[index]) & 0xff;
    crc = (crc >>> 8) ^ CRC32C_TABLE[tableIndex];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32cToBase64(checksum: number): string {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, checksum >>> 0, false);

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

@Component({
  selector: 'app-case-detail',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule, FileUploadModule],
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
  editedCategory: CaseCategory = 'Sonstiges';
  isSavingMetadata = false;

  // Available case categories
  readonly availableCategories: CaseCategory[] = [
    'Beleidigungen',
    'Supportflucht',
    'Team-Trolling',
    'Soundboard',
    'Report-Abuse',
    'Camping',
    'Rollenflucht',
    'Bug-Abusing',
    'Diebstahl',
    'Teaming',
    'Gefesselte Klassen',
    'Ban-Evasion',
    'Rundenende',
    'Sonstiges',
  ];

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

  // Linked report management state
  newLinkedReportId = '';
  isLinkingReport = false;
  reportLinkError = '';
  reportLinkSuccess = '';

  // Report search by Steam ID
  reportSearchSteamId = '';
  isSearchingReports = false;
  reportSearchResults: SearchReportsBySteamIdGetResponse['reports'] = [];
  reportSearchDropdownOpen = false;
  reportSearchError = '';

  sortOptions = [
    { label: 'Name (A-Z)', value: 'name' },
    { label: 'Name (Z-A)', value: 'name-desc' },
    { label: 'Neueste zuerst', value: 'newest' },
    { label: 'Älteste zuerst', value: 'oldest' },
    { label: 'Größte zuerst', value: 'largest' },
    { label: 'Kleinste zuerst', value: 'smallest' },
  ];

  // ng2-file-upload uploader for reliable S3 presigned URL uploads
  fileUploader = new FileUploader({
    url: '',
    method: 'PUT',
    disableMultipart: true,
    autoUpload: false,
    removeAfterUpload: true,
  });

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
    if (!target.closest('.report-search-section') && this.reportSearchDropdownOpen) {
      this.reportSearchDropdownOpen = false;
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

  copyReportIdToClipboard(reportId: number, event?: Event) {
    if (event) event.stopPropagation();
    navigator.clipboard.writeText(String(reportId));
  }

  navigateToUserProfile(steamId: string) {
    if (this.isTeam) {
      this.router.navigate(['/zeit'], { queryParams: { steamId } });
    }
  }

  navigateToCreatorProfile(discordId: string) {
    if (this.isTeam) {
      this.router.navigate(['/zeit'], { queryParams: { discordId } });
    }
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

  isImageFile(filename: string): boolean {
    const ext = this.getFileExtension(filename);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  }

  isVideoFile(filename: string): boolean {
    const ext = this.getFileExtension(filename);
    return ['mp4', 'webm', 'mov'].includes(ext);
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
    this.editedCategory = this.caseData?.category ?? 'Sonstiges';
    this.isEditingMetadata = true;
  }

  cancelEditingMetadata() {
    this.isEditingMetadata = false;
    this.editedTitle = this.caseData?.title || '';
    this.editedDescription = this.caseData?.description || '';
    this.editedCategory = this.caseData?.category ?? 'Sonstiges';
  }

  saveMetadata() {
    this.isSavingMetadata = true;
    const payload: UpdateCaseMetadataPutRequest = {
      category: this.editedCategory,
    };
    if (this.editedTitle.trim()) payload.title = this.editedTitle.trim();
    if (this.editedDescription.trim()) payload.description = this.editedDescription.trim();

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
    const payload: UpdateCaseMetadataPutRequest = {
      category: this.caseData!.category,
      linkedSteamIds: [...existing, steamId],
    };

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

  setReportSearchSteamId(steamId: string): void {
    this.reportSearchSteamId = steamId;
    this.reportSearchDropdownOpen = false;
    this.reportSearchResults = [];
    this.reportSearchError = '';
  }

  async searchReportsBySteamId(): Promise<void> {
    const raw = this.reportSearchSteamId.trim();
    if (!raw) {
      this.reportSearchError = 'Bitte wähle oder gib eine Steam-ID ein';
      return;
    }

    this.isSearchingReports = true;
    this.reportSearchDropdownOpen = false;
    this.reportSearchError = '';
    this.reportSearchResults = [];

    try {
      const data = await firstValueFrom(
        this.http.get<SearchReportsBySteamIdGetResponse>(
          `${environment.apiUrl}/reports/search?steamId=${encodeURIComponent(raw)}`,
          { headers: this.getAuthHeaders(), withCredentials: true },
        ),
      );

      const alreadyLinked = this.caseData?.linkedReportIds ?? [];
      this.reportSearchResults = (data?.reports ?? []).filter((r) => !alreadyLinked.includes(r.id));
      if (this.reportSearchResults.length > 0) {
        this.reportSearchDropdownOpen = true;
      } else {
        this.reportSearchError = 'Keine (nicht verknüpften) Reports für diese Steam-ID gefunden';
      }
    } catch (error: any) {
      this.reportSearchError = error?.error?.error || 'Fehler beim Suchen der Reports';
    } finally {
      this.isSearchingReports = false;
    }
  }

  selectReportFromSearch(reportId: number): void {
    this.reportSearchDropdownOpen = false;
    this.newLinkedReportId = String(reportId);
    this.linkReport();
  }

  removeLinkedReport(reportId: number, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.isLinkingReport = true;
    this.reportLinkError = '';
    this.reportLinkSuccess = '';
    this.http
      .delete(`${environment.apiUrl}/cases/link?caseId=${this.caseId}&reportId=${reportId}`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: () => {
          this.isLinkingReport = false;
          this.loadCaseData();
        },
        error: (error) => {
          this.isLinkingReport = false;
          this.reportLinkError = error.error?.error || 'Fehler beim Entfernen des Reports';
        },
      });
  }

  linkReport() {
    this.reportLinkError = '';
    this.reportLinkSuccess = '';
    const raw = this.newLinkedReportId.trim();
    if (!raw) {
      this.reportLinkError = 'Bitte gib eine Report-ID ein';
      return;
    }
    const reportId = parseInt(raw, 10);
    if (isNaN(reportId) || reportId <= 0) {
      this.reportLinkError = 'Report-ID muss eine positive Zahl sein';
      return;
    }
    if ((this.caseData?.linkedReportIds ?? []).includes(reportId)) {
      this.reportLinkError = 'Report ist bereits mit diesem Fall verknüpft';
      return;
    }

    this.isLinkingReport = true;
    this.http
      .post(
        `${environment.apiUrl}/cases/link?caseId=${this.caseId}&reportId=${reportId}`,
        {},
        { headers: this.getAuthHeaders(), withCredentials: true },
      )
      .subscribe({
        next: () => {
          this.isLinkingReport = false;
          this.newLinkedReportId = '';
          this.reportLinkSuccess = `Report #${reportId} wurde erfolgreich verknüpft`;
          this.loadCaseData();
        },
        error: (error) => {
          this.isLinkingReport = false;
          this.reportLinkError = error.error?.error || 'Fehler beim Verknüpfen des Reports';
        },
      });
  }

  removeLinkedUser(steamId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const remaining = (this.caseData?.linkedUsers ?? []).filter((u) => u.steamId !== steamId).map((u) => u.steamId);

    this.isManagingLinkedUsers = true;
    const payload: UpdateCaseMetadataPutRequest = { category: this.caseData!.category, linkedSteamIds: remaining };

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

      await this.uploadFileToPresignedUrl(this.selectedFile, uploadInfo.url, contentType, {
        onProgress: (progress) => {
          this.uploadProgress = progress;
          this.uploadETA = this.calculateETA(this.uploadStartTime, progress);
          this.uploadStatusMessage = `Datei wird hochgeladen... (${progress}%)`;
        },
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
      while (true) {
        try {
          const medalSourceUrl = await this.resolveMedalSourceUrl(this.medalClipUrl);
          const medalFile = await this.downloadMedalClipFromCorsProxy(medalSourceUrl);

          this.medalDownloadProgress = 100;
          this.medalUploadProgress = 0;
          this.medalStatusMessage = 'Upload-URL wird angefordert...';

          const uploadInfo = await this.http
            .get<CaseFileUploadGetResponse>(
              `${environment.apiUrl}/cases/upload?case=${this.caseId}&extension=${medalFile.extension}`,
              { headers: this.getAuthHeaders(), withCredentials: true },
            )
            .toPromise();

          if (!uploadInfo?.url) throw new Error('Fehler beim Abrufen der Upload-URL');

          this.medalStatusMessage = 'Video wird hochgeladen...';
          this.medalStartTime = Date.now();

          await this.uploadFileToPresignedUrl(medalFile.file, uploadInfo.url, medalFile.mimeType, {
            onProgress: (progress) => {
              this.medalUploadProgress = progress;
              this.medalETA = this.calculateETA(this.medalStartTime, progress);
              this.medalStatusMessage = `Video wird hochgeladen... (${progress}%)`;
            },
          });

          this.isFetchingMedalClip = false;
          this.medalDownloadProgress = 0;
          this.medalUploadProgress = 0;
          this.medalClipUrl = '';
          this.medalStatusMessage = '';
          this.medalETA = '';

          this.loadCaseData();
          alert('Medal Clip erfolgreich hochgeladen!');
          return;
        } catch (error) {
          if (error instanceof MedalIntegrityError) {
            const retry = window.confirm(`${error.message}\n\nMöchtest du es erneut versuchen?`);
            if (retry) {
              this.medalDownloadProgress = 0;
              this.medalUploadProgress = 0;
              this.medalStatusMessage = 'Erneuter Download wird vorbereitet...';
              this.medalETA = '';
              this.medalStartTime = Date.now();
              continue;
            }

            this.isFetchingMedalClip = false;
            this.medalDownloadProgress = 0;
            this.medalUploadProgress = 0;
            this.medalStatusMessage = '';
            this.medalETA = '';
            return;
          }

          throw error;
        }
      }
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

  private async downloadMedalClipFromCorsProxy(
    targetUrl: string,
  ): Promise<{ file: File; extension: string; mimeType: string }> {
    const normalizedTargetUrl = targetUrl.trim();
    const corsProxyUrl = `${MEDAL_CORS_PROXY_URL}${encodeURIComponent(normalizedTargetUrl)}`;
    const response = await fetch(corsProxyUrl);
    if (!response.ok) {
      throw new Error('Fehler beim Abrufen des Medal Clips');
    }

    const pathName = new URL(normalizedTargetUrl).pathname;
    const fileNameWithExt = pathName.split('/').pop() || 'clip.mp4';
    const fileExtension = fileNameWithExt.includes('.') ? fileNameWithExt.split('.').pop()!.toLowerCase() : 'mp4';
    const mimeType = fileExtension === 'webm' ? 'video/webm' : 'video/mp4';

    this.medalStatusMessage = 'Video wird heruntergeladen...';
    this.medalStartTime = Date.now();

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
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
      if (total > 0) {
        this.medalDownloadProgress = Math.round((receivedLength / total) * 100);
        this.medalETA = this.calculateETA(this.medalStartTime, this.medalDownloadProgress);
        this.medalStatusMessage = `Video wird heruntergeladen... (${this.medalDownloadProgress}%)`;
      }
    }

    const downloadedBytes = concatUint8Arrays(chunks);
    const etagHeader = response.headers.get('etag');
    const checksumHeader = response.headers.get('x-amz-checksum-crc32c');

    if (etagHeader) {
      const expectedEtag = normalizeEtag(etagHeader);
      const actualMd5 = await md5(downloadedBytes);
      if (expectedEtag !== actualMd5.toLowerCase()) {
        throw new MedalIntegrityError(
          'Die Integritätsprüfung des Medal Clips ist fehlgeschlagen: ETag stimmt nicht mit dem MD5-Hash überein.',
        );
      }
    }

    if (checksumHeader) {
      const expectedChecksum = normalizeHeaderValue(checksumHeader);
      const actualChecksum = crc32cToBase64(calculateCrc32c(downloadedBytes));
      if (expectedChecksum !== actualChecksum) {
        throw new MedalIntegrityError(
          'Die Integritätsprüfung des Medal Clips ist fehlgeschlagen: x-amz-checksum-crc32c stimmt nicht mit dem heruntergeladenen Inhalt überein.',
        );
      }
    }

    const videoFile = new File([downloadedBytes as unknown as BlobPart], fileNameWithExt, { type: mimeType });
    return {
      file: videoFile,
      extension: fileExtension,
      mimeType,
    };
  }

  private async resolveMedalSourceUrl(targetUrl: string): Promise<string> {
    const bypassUrl = `https://medalbypass.vercel.app/api/clip?url=${encodeURIComponent(targetUrl)}`;
    const bypassResponse = await fetch(bypassUrl);
    if (!bypassResponse.ok) {
      throw new Error('Fehler beim Abrufen des Medal Clips');
    }

    const bypassData = (await bypassResponse.json()) as { valid: boolean; src?: string; reasoning?: string };
    if (!bypassData.valid) {
      throw new Error(bypassData.reasoning || 'Ungültige Medal.tv URL');
    }
    if (!bypassData.src) {
      throw new Error('Keine Video-URL erhalten');
    }

    return bypassData.src;
  }

  /**
   * Uploads a File to a presigned S3 URL using ng2-file-upload's FileUploader
   * for reliable, corruption-free uploads with progress tracking.
   */
  private uploadFileToPresignedUrl(
    file: File,
    presignedUrl: string,
    contentType: string,
    callbacks: { onProgress: (progress: number) => void },
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Clear any previous items from the queue
      this.fileUploader.clearQueue();

      // Configure the uploader for this specific upload
      this.fileUploader.options.url = presignedUrl;
      this.fileUploader.options.method = 'PUT';
      this.fileUploader.options.disableMultipart = true;
      this.fileUploader.options.headers = [{ name: 'Content-Type', value: contentType }];

      // Set up callbacks
      this.fileUploader.onBeforeUploadItem = (item) => {
        item.url = presignedUrl;
        item.method = 'PUT';
        item.withCredentials = false;
        item.headers = [{ name: 'Content-Type', value: contentType }];
      };

      this.fileUploader.onProgressItem = (_item, progress) => {
        callbacks.onProgress(progress);
      };

      this.fileUploader.onSuccessItem = () => {
        this.cleanupUploaderCallbacks();
        resolve();
      };

      this.fileUploader.onErrorItem = (_item, response, status) => {
        this.cleanupUploaderCallbacks();
        reject(new Error(`Upload fehlgeschlagen: ${status} ${response}`));
      };

      // Add file to queue and trigger upload
      this.fileUploader.addToQueue([file]);
      this.fileUploader.uploadAll();
    });
  }

  private cleanupUploaderCallbacks() {
    this.fileUploader.onBeforeUploadItem = () => {};
    this.fileUploader.onProgressItem = () => {};
    this.fileUploader.onSuccessItem = () => {};
    this.fileUploader.onErrorItem = () => {};
  }
}
