import { Component, OnInit, HostListener, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { AvatarModule } from 'primeng/avatar';
import { AuthService } from '../services/auth.service';
import { createMD5 } from 'hash-wasm';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

interface CaseFile {
  name: string;
  viewUrl: string;
  expiresIn: number;
  uploadedAt?: number;
  size?: number;
  type?: string;
}

interface CaseMetadata {
  id: string;
  caseId: string;
  createdAt: number;
  lastModified: number;
  fileCount: number;
  totalSize: number;
  // Optional metadata fields
  nickname?: string;
  description?: string;
  tags?: string[];
}

interface LinkedUser {
  steamId: string;
  username: string;
  avatarUrl: string;
  linkedAt: number;
  linkedByDiscordId: string;
}

interface SearchUser {
  steamId: string;
  username: string;
  avatarUrl: string;
}

@Component({
  selector: 'app-case-detail',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule, AvatarModule],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.css',
})
export class CaseDetailComponent implements OnInit, OnDestroy {
  caseId: string = '';
  caseName: string = '';
  files: CaseFile[] = [];
  filteredFiles: CaseFile[] = [];
  metadata: CaseMetadata | null = null;
  searchQuery = '';
  sortBy: 'name' | 'name-desc' | 'newest' | 'oldest' | 'largest' | 'smallest' = 'newest';
  sortDropdownOpen = false;
  isLoading = true;
  hasError = false;
  errorMessage = '';

  // Media viewer state
  viewerOpen = false;
  viewerFile: CaseFile | null = null;
  viewerMediaType: 'image' | 'video' | 'audio' | null = null;

  // Auth state
  isAuthenticated = false;
  isFakerankAdmin = false;

  // Metadata editing state
  isEditingMetadata = false;
  editedNickname = '';
  editedDescription = '';
  editedTags = '';
  isSavingMetadata = false;

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

  // User search and linking state
  linkedUsers: LinkedUser[] = [];
  searchResults: SearchUser[] = [];
  userSearchTerm = '';
  private userSearchSubject = new Subject<string>();
  private userSearchSubscription?: Subscription;
  isSearchingUsers = false;
  isLoadingLinkedUsers = false;

  sortOptions = [
    { label: 'Name (A-Z)', value: 'name' },
    { label: 'Name (Z-A)', value: 'name-desc' },
    { label: 'Neueste zuerst', value: 'newest' },
    { label: 'Älteste zuerst', value: 'oldest' },
    { label: 'Größte zuerst', value: 'largest' },
    { label: 'Kleinste zuerst', value: 'smallest' },
  ];

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private authService = inject(AuthService);


  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const dropdown = target.closest('.custom-dropdown');

    if (!dropdown && this.sortDropdownOpen) {
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
    // Check auth status
    this.authService.currentUser$.subscribe((user) => {
      this.isAuthenticated = !!user;
      this.isFakerankAdmin = this.authService.isFakerankAdmin();
    });

    // Set up debounced user search
    this.userSearchSubscription = this.userSearchSubject
      .pipe(debounceTime(500), distinctUntilChanged())
      .subscribe((term) => {
        if (term.trim().length >= 2) {
          this.searchUsers(term);
        } else {
          this.searchResults = [];
        }
      });

    this.route.paramMap.subscribe((params) => {
      this.caseId = params.get('id') || '';
      if (this.caseId) {
        this.caseName = decodeURIComponent(this.caseId);
        this.loadMetadata();
        this.loadFiles();
        // Only load linked users if user is admin
        if (this.isFakerankAdmin) {
          this.loadLinkedUsers();
        }
      }
    });
  }

  ngOnDestroy() {
    this.userSearchSubscription?.unsubscribe();
  }

  onUserSearchChange(term: string) {
    this.userSearchTerm = term;
    this.userSearchSubject.next(term);
  }

  loadMetadata() {
    this.http.get<CaseMetadata>(`${environment.apiUrl}/cases/metadata?case=${this.caseId}`).subscribe({
      next: (metadata) => {
        this.metadata = metadata;
        // Load metadata into edit fields
        this.editedNickname = metadata.nickname || '';
        this.editedDescription = metadata.description || '';
        this.editedTags = metadata.tags?.join(', ') || '';
      },
      error: (error) => {
        console.error('Failed to load case metadata:', error);
        // Don't show error to user, metadata is optional
      },
    });
  }

  loadFiles() {
    this.isLoading = true;
    this.hasError = false;

    this.http
      .get<{ files: CaseFile[]; expiresIn: number }>(`${environment.apiUrl}/cases/files?case=${this.caseId}`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          this.files = response.files;
          this.filterFiles();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading files:', error);
          this.hasError = true;
          this.errorMessage = error.error?.error || 'Failed to load files';
          this.isLoading = false;
        },
      });
  }

  filterFiles() {
    let filtered: CaseFile[];

    if (!this.searchQuery.trim()) {
      filtered = [...this.files];
    } else {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = this.files.filter((file) => file.name.toLowerCase().includes(query));
    }

    this.filteredFiles = this.sortFiles(filtered);
  }

  sortFiles(files: CaseFile[]): CaseFile[] {
    const sorted = [...files];

    switch (this.sortBy) {
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'newest':
        return sorted.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
      case 'oldest':
        return sorted.sort((a, b) => (a.uploadedAt || 0) - (b.uploadedAt || 0));
      case 'largest':
        return sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
      case 'smallest':
        return sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
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

  getFileExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ext;
  }

  getFileIcon(filename: string): string {
    const ext = this.getFileExtension(filename);

    // Images
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
      return 'pi-image';
    }
    // Videos
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
      return 'pi-video';
    }
    // Audio
    if (['mp3', 'wav', 'ogg'].includes(ext)) {
      return 'pi-volume-up';
    }
    // Documents
    if (['pdf'].includes(ext)) {
      return 'pi-file-pdf';
    }
    if (['txt', 'md'].includes(ext)) {
      return 'pi-file-edit';
    }
    // Archives
    if (['zip', 'tar', 'gz'].includes(ext)) {
      return 'pi-box';
    }

    return 'pi-file';
  }

  getFileType(filename: string): string {
    const ext = this.getFileExtension(filename);

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
      return 'Bild';
    }
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
      return 'Video';
    }
    if (['mp3', 'wav', 'ogg'].includes(ext)) {
      return 'Audio';
    }
    if (['pdf'].includes(ext)) {
      return 'PDF Dokument';
    }
    if (['txt', 'md'].includes(ext)) {
      return 'Text Dokument';
    }
    if (['zip', 'tar', 'gz'].includes(ext)) {
      return 'Archiv';
    }

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

    const date = new Date(timestamp);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getTotalSize(): string {
    const totalBytes = this.files.reduce((sum, file) => sum + (file.size || 0), 0);
    return this.formatFileSize(totalBytes);
  }

  formatCaseName(caseId: string): string {
    return `Fall #${caseId}`;
  }

  getFileUrl(file: CaseFile): string {
    return file.viewUrl;
  }

  goBack() {
    this.router.navigate(['/cases']);
  }

  isViewableFile(filename: string): boolean {
    const ext = this.getFileExtension(filename);
    const viewableExtensions = [
      // Images
      'jpg',
      'jpeg',
      'png',
      'gif',
      'webp',
      'bmp',
      'svg',
      // Videos
      'mp4',
      'webm',
      'mov',
      // Audio
      'mp3',
      'wav',
      'ogg',
    ];
    return viewableExtensions.includes(ext);
  }

  getMediaType(filename: string): 'image' | 'video' | 'audio' | null {
    const ext = this.getFileExtension(filename);

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
      return 'image';
    }
    if (['mp4', 'webm', 'mov'].includes(ext)) {
      return 'video';
    }
    if (['mp3', 'wav', 'ogg'].includes(ext)) {
      return 'audio';
    }

    return null;
  }

  openViewer(file: CaseFile, event?: Event) {
    if (event) {
      event.preventDefault();
    }

    if (this.isViewableFile(file.name)) {
      this.viewerFile = file;
      this.viewerMediaType = this.getMediaType(file.name);
      this.viewerOpen = true;
      // Prevent body scroll when viewer is open
      document.body.style.overflow = 'hidden';
    } else {
      // For non-viewable files, trigger download
      window.open(file.viewUrl, '_blank');
    }
  }

  closeViewer() {
    this.viewerOpen = false;
    this.viewerFile = null;
    this.viewerMediaType = null;
    // Restore body scroll
    document.body.style.overflow = '';
  }

  downloadFile(file: CaseFile) {
    window.open(file.viewUrl, '_blank');
  }

  startEditingMetadata() {
    this.isEditingMetadata = true;
  }

  cancelEditingMetadata() {
    this.isEditingMetadata = false;
    // Reset to current metadata
    this.editedNickname = this.metadata?.nickname || '';
    this.editedDescription = this.metadata?.description || '';
    this.editedTags = this.metadata?.tags?.join(', ') || '';
  }

  saveMetadata() {
    this.isSavingMetadata = true;

    // Parse tags from comma-separated string
    const tags = this.editedTags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const metadataPayload: any = {};

    if (this.editedNickname) metadataPayload.nickname = this.editedNickname;
    if (this.editedDescription) metadataPayload.description = this.editedDescription;
    if (tags.length > 0) metadataPayload.tags = tags;

    this.http
      .put(`${environment.apiUrl}/cases/metadata?case=${this.caseId}`, metadataPayload, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: () => {
          this.isSavingMetadata = false;
          this.isEditingMetadata = false;
          // Reload metadata to get updated values
          this.loadMetadata();
        },
        error: (error) => {
          this.isSavingMetadata = false;
          console.error('Failed to save metadata:', error);
          alert('Fehler beim Speichern der Metadaten');
        },
      });
  }

  // User search and linking methods
  loadLinkedUsers() {
    this.isLoadingLinkedUsers = true;
    this.http
      .get<{ users: LinkedUser[] }>(`${environment.apiUrl}/cases/linked-users?caseId=${this.caseId}`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          this.linkedUsers = response.users;
          this.isLoadingLinkedUsers = false;
        },
        error: (error) => {
          console.error('Error loading linked users:', error);
          this.isLoadingLinkedUsers = false;
        },
      });
  }

  searchUsers(term: string) {
    this.isSearchingUsers = true;
    const headers = this.getAuthHeaders();
    this.http
      .get<{ users: SearchUser[] }>(
        `${environment.apiUrl}/cases/search-users?search=${encodeURIComponent(term)}`,
        { headers, withCredentials: true },
      )
      .subscribe({
        next: (response) => {
          this.searchResults = response.users;
          this.isSearchingUsers = false;
        },
        error: (error) => {
          console.error('Error searching users:', error);
          this.searchResults = [];
          this.isSearchingUsers = false;
        },
      });
  }

  linkUserToCase(user: SearchUser) {
    const headers = this.getAuthHeaders();
    this.http
      .post(
        `${environment.apiUrl}/cases/link-user`,
        {
          caseId: this.caseId,
          steamId: user.steamId,
        },
        { headers, withCredentials: true },
      )
      .subscribe({
        next: () => {
          // Reload linked users
          this.loadLinkedUsers();
          // Clear search
          this.userSearchTerm = '';
          this.searchResults = [];
          alert('Benutzer erfolgreich verlinkt');
        },
        error: (error) => {
          console.error('Error linking user:', error);
          alert('Fehler beim Verlinken des Benutzers');
        },
      });
  }

  unlinkUserFromCase(steamId: string) {
    if (!confirm('Möchtest du diesen Benutzer wirklich entfernen?')) {
      return;
    }

    const headers = this.getAuthHeaders();
    this.http
      .delete(`${environment.apiUrl}/cases/unlink-user?caseId=${this.caseId}&steamId=${encodeURIComponent(steamId)}`, {
        headers,
        withCredentials: true,
      })
      .subscribe({
        next: () => {
          this.loadLinkedUsers();
          alert('Benutzer erfolgreich entfernt');
        },
        error: (error) => {
          console.error('Error unlinking user:', error);
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

  private async calculateFileHash(file: File, onProgress?: (progress: number) => void): Promise<string> {
    const chunkSize = 2097152; // 2MB chunks
    const chunks = Math.ceil(file.size / chunkSize);
    const md5 = await createMD5();
    md5.init();

    for (let currentChunk = 0; currentChunk < chunks; currentChunk++) {
      const start = currentChunk * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      const buffer = await chunk.arrayBuffer();
      md5.update(new Uint8Array(buffer));

      // Report progress
      if (onProgress) {
        const progress = Math.round(((currentChunk + 1) / chunks) * 100);
        onProgress(progress);
      }
    }

    return md5.digest('hex');
  }

  private async calculateBufferHash(buffer: ArrayBuffer, onProgress?: (progress: number) => void): Promise<string> {
    const data = new Uint8Array(buffer);
    const chunkSize = 2097152; // 2MB chunks
    const chunks = Math.ceil(data.length / chunkSize);
    const md5 = await createMD5();
    md5.init();

    for (let currentChunk = 0; currentChunk < chunks; currentChunk++) {
      const start = currentChunk * chunkSize;
      const end = Math.min(start + chunkSize, data.length);
      md5.update(data.slice(start, end));

      // Report progress
      if (onProgress) {
        const progress = Math.round(((currentChunk + 1) / chunks) * 100);
        onProgress(progress);
      }
    }

    return md5.digest('hex');
  }

  private hexToBase64(hex: string): string {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private async verifyUpload(filename: string, expectedHash: string, maxRetries = 3): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Small delay before checking (allow S3 to process)
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const response = await this.http
          .get<{
            filename: string;
            hash: string;
            size: number;
            lastModified: number;
          }>(`${environment.apiUrl}/cases/file/hash?case=${this.caseId}&filename=${encodeURIComponent(filename)}`)
          .toPromise();

        if (response?.hash === expectedHash) {
          return true;
        }

        console.warn(`Hash mismatch on attempt ${attempt + 1}: expected ${expectedHash}, got ${response?.hash}`);
      } catch (error) {
        console.error(`Hash verification attempt ${attempt + 1} failed:`, error);
      }
    }

    return false;
  }

  private calculateETA(startTime: number, progress: number): string {
    if (progress === 0) return 'Berechne...';
    const elapsed = Date.now() - startTime;
    const total = (elapsed / progress) * 100;
    const remaining = total - elapsed;
    const seconds = Math.ceil(remaining / 1000);

    if (seconds < 10) return '<10s';

    // Round to nearest 10 seconds
    const roundedSeconds = Math.ceil(seconds / 10) * 10;

    if (roundedSeconds < 60) return `~${roundedSeconds}s`;
    const minutes = Math.floor(roundedSeconds / 60);
    const secs = roundedSeconds % 60;
    if (secs === 0) return `~${minutes}m`;
    return `~${minutes}m ${secs}s`;
  }

  async uploadFile(retryCount = 0) {
    if (!this.selectedFile) {
      alert('Bitte wähle eine Datei aus');
      return;
    }

    const maxRetries = 3;

    this.isUploading = true;
    this.uploadProgress = 0;
    this.uploadStatusMessage = 'Datei wird geladen...';
    this.uploadETA = '';
    this.uploadStartTime = Date.now();

    try {
      // Read the entire file into memory ONCE to ensure consistency
      this.uploadStatusMessage = 'Datei wird in Speicher geladen...';
      const fileBuffer = await this.selectedFile.arrayBuffer();
      const fileData = new Uint8Array(fileBuffer);
      const contentType = this.selectedFile.type || 'application/octet-stream';

      // Calculate hash from the buffer (not from file) with progress tracking
      const hashStartTime = Date.now();
      this.uploadStatusMessage = 'Datei wird gehashed...';
      const localHash = await this.calculateBufferHash(fileBuffer, (progress) => {
        this.uploadProgress = progress;
        this.uploadETA = this.calculateETA(hashStartTime, progress);
        this.uploadStatusMessage = `Datei wird gehashed... (${progress}%)`;
      });
      console.log('Local file hash:', localHash);

      // Convert hash to base64 for Content-MD5 header
      const contentMD5 = this.hexToBase64(localHash);

      // Get file extension
      const fileExtension = this.selectedFile.name.split('.').pop()?.toLowerCase() || '';

      this.uploadStatusMessage = 'Upload-URL wird angefordert...';
      this.uploadProgress = 0;
      this.uploadETA = '';

      // Request upload URL from backend
      const uploadUrlResponse = await this.http
        .get<{
          url: string;
          method: string;
          filename: string;
          fileUrl: string;
          expiresIn: number;
        }>(`${environment.apiUrl}/cases/upload?case=${this.caseId}&extension=${fileExtension}`)
        .toPromise();

      if (!uploadUrlResponse) {
        throw new Error('Failed to get upload URL');
      }

      this.uploadStatusMessage = 'Datei wird hochgeladen...';
      this.uploadStartTime = Date.now();

      // Upload using fetch with explicit Content-Length and Content-MD5 for integrity
      // This is more reliable than HttpClient for binary uploads to S3
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrlResponse.url, true);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.setRequestHeader('Content-MD5', contentMD5);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            this.uploadProgress = Math.round((event.loaded / event.total) * 100);
            this.uploadETA = this.calculateETA(this.uploadStartTime, this.uploadProgress);
            this.uploadStatusMessage = `Datei wird hochgeladen... (${this.uploadProgress}%)`;
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload aborted'));

        // Send the exact buffer we hashed
        xhr.send(fileData);
      });

      // Verify upload by comparing hashes
      this.uploadStatusMessage = 'Upload wird verifiziert...';
      this.uploadProgress = 100;
      this.uploadETA = '';
      console.log('Verifying upload...');

      const isVerified = await this.verifyUpload(uploadUrlResponse.filename, localHash);

      if (!isVerified) {
        if (retryCount < maxRetries) {
          console.warn(`Upload verification failed, retrying... (${retryCount + 1}/${maxRetries})`);
          this.uploadStatusMessage = `Verifizierung fehlgeschlagen - Erneuter Versuch ${retryCount + 1}/${maxRetries}...`;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          // Keep the same file and retry
          await this.uploadFile(retryCount + 1);
          return;
        } else {
          throw new Error(
            'Upload-Überprüfung fehlgeschlagen: Die hochgeladene Datei stimmt nicht mit der Originaldatei überein. Bitte versuche es erneut.',
          );
        }
      }

      console.log('Upload verified successfully!');
      this.uploadStatusMessage = 'Upload erfolgreich!';

      // Reset upload state
      this.isUploading = false;
      this.uploadProgress = 0;
      this.uploadStatusMessage = '';
      this.uploadETA = '';
      this.selectedFile = null;

      // Reset file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }

      // Reload files and metadata
      this.loadFiles();
      this.loadMetadata();

      alert('Datei erfolgreich hochgeladen und verifiziert!');
    } catch (error) {
      this.isUploading = false;
      this.uploadProgress = 0;
      this.uploadStatusMessage = '';
      this.uploadETA = '';
      console.error('Upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Fehler beim Hochladen der Datei';
      alert(errorMessage);
    }
  }

  async deleteFile(file: CaseFile) {
    if (!confirm(`Möchten Sie die Datei "${file.name}" wirklich löschen?`)) {
      return;
    }

    try {
      const token = this.authService.getSessionToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${environment.apiUrl}/cases/file?case=${this.caseId}&filename=${encodeURIComponent(file.name)}`,
        {
          method: 'DELETE',
          headers: headers,
          credentials: 'include',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      // Reload files and metadata
      this.loadFiles();
      this.loadMetadata();

      alert('Datei erfolgreich gelöscht!');
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Fehler beim Löschen der Datei');
    }
  }

  isValidUrl(urlString: string): boolean {
    if (!urlString || !urlString.trim()) {
      return false;
    }

    try {
      const url = new URL(urlString.trim());
      return url.protocol.startsWith('http');
    } catch (error) {
      return false;
    }
  }

  onMedalUrlChange() {
    if (this.medalClipUrl.trim()) {
      this.medalUrlInvalid = !this.isValidUrl(this.medalClipUrl);
    } else {
      this.medalUrlInvalid = false;
    }
  }

  async uploadMedalClip() {
    if (!this.medalClipUrl.trim()) {
      alert('Bitte gib eine URL ein');
      return;
    }

    // Validate that it's a proper URL
    try {
      const url = new URL(this.medalClipUrl.trim());
      // Check if it has a protocol (http/https)
      if (!url.protocol.startsWith('http')) {
        alert('Bitte gib eine gültige URL ein (muss mit http:// oder https:// beginnen)');
        return;
      }
    } catch (error) {
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
      // Step 1: Query the Medal bypass API
      const bypassUrl = `https://medalbypass.vercel.app/api/clip?url=${encodeURIComponent(this.medalClipUrl)}`;
      const bypassResponse = await fetch(bypassUrl);

      if (!bypassResponse.ok) {
        throw new Error('Fehler beim Abrufen des Medal Clips');
      }

      const bypassData = (await bypassResponse.json()) as {
        valid: boolean;
        src?: string;
        reasoning?: string;
      };

      if (!bypassData.valid) {
        throw new Error(bypassData.reasoning || 'Ungültige Medal.tv URL');
      }

      if (!bypassData.src) {
        throw new Error('Keine Video-URL erhalten');
      }

      // Extract file extension from the Medal.tv URL
      const urlPath = bypassData.src.split('?')[0]; // Remove query parameters
      const pathParts = urlPath.split('/');
      const fileNameWithExt = pathParts[pathParts.length - 1]; // Get last part (filename)
      const fileExtension = fileNameWithExt.includes('.') ? fileNameWithExt.split('.').pop()!.toLowerCase() : 'mp4';

      const mimeType = fileExtension === 'mp4' ? 'video/mp4' : fileExtension === 'webm' ? 'video/webm' : 'video/mp4';

      // Generate filename with timestamp and proper extension
      const filename = `medal-clip-${Date.now()}.${fileExtension}`;

      // Step 2: Download the video with progress tracking using CORS proxy
      this.medalStatusMessage = 'Video wird heruntergeladen...';
      this.medalDownloadProgress = 0;
      this.medalUploadProgress = 0;
      this.medalStartTime = Date.now();
      this.medalETA = '';

      // Try multiple CORS proxy services in case one fails
      const corsProxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(bypassData.src)}`,
        `https://corsproxy.io/?url=${encodeURIComponent(bypassData.src)}`,
        bypassData.src, // Try direct fetch as last resort
      ];

      let videoResponse: Response | null = null;
      let lastError: Error | null = null;

      for (const proxyUrl of corsProxies) {
        try {
          const response = await fetch(proxyUrl);
          if (response.ok) {
            videoResponse = response;
            break;
          }
        } catch (error) {
          lastError = error as Error;
          continue;
        }
      }

      if (!videoResponse) {
        throw new Error(
          lastError?.message || 'Fehler beim Herunterladen des Videos - alle Proxy-Dienste fehlgeschlagen',
        );
      }

      const contentLength = videoResponse.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      const reader = videoResponse.body?.getReader();
      if (!reader) {
        throw new Error('Fehler beim Lesen des Videos');
      }

      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        if (total > 0) {
          this.medalDownloadProgress = Math.round((receivedLength / total) * 100);
          this.medalETA = this.calculateETA(this.medalStartTime, this.medalDownloadProgress);
          this.medalStatusMessage = `Video wird heruntergeladen... (${this.medalDownloadProgress}%)`;
        }
      }

      // Combine chunks into a single Uint8Array
      const videoData = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        videoData.set(chunk, position);
        position += chunk.length;
      }

      // Step 3: Hash the downloaded video from the buffer directly
      this.medalStatusMessage = 'Video wird gehashed...';
      this.medalDownloadProgress = 100;
      this.medalUploadProgress = 0;
      this.medalETA = '';

      const hashStartTime = Date.now();
      const localHash = await this.calculateBufferHash(videoData.buffer, (progress) => {
        this.medalUploadProgress = progress;
        this.medalETA = this.calculateETA(hashStartTime, progress);
        this.medalStatusMessage = `Video wird gehashed... (${progress}%)`;
      });
      console.log('Local Medal video hash:', localHash);

      // Convert hash to base64 for Content-MD5 header
      const contentMD5 = this.hexToBase64(localHash);

      // Step 4: Upload to case storage with progress tracking
      this.medalStatusMessage = 'Video wird hochgeladen...';
      this.medalStartTime = Date.now();

      // Get presigned upload URL with extension parameter
      const uploadUrlResponse = await this.http
        .get<{
          url: string;
          filename: string;
        }>(`${environment.apiUrl}/cases/upload?case=${this.caseId}&extension=${fileExtension}`, {
          withCredentials: true,
        })
        .toPromise();

      if (!uploadUrlResponse?.url) {
        throw new Error('Fehler beim Abrufen der Upload-URL');
      }

      // Upload using XMLHttpRequest with explicit Content-MD5 for integrity
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrlResponse.url, true);
        xhr.setRequestHeader('Content-Type', mimeType);
        xhr.setRequestHeader('Content-MD5', contentMD5);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            this.medalUploadProgress = Math.round((event.loaded / event.total) * 100);
            this.medalETA = this.calculateETA(this.medalStartTime, this.medalUploadProgress);
            this.medalStatusMessage = `Video wird hochgeladen... (${this.medalUploadProgress}%)`;
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload aborted'));

        // Send the exact buffer we hashed
        xhr.send(videoData);
      });

      // Verify upload by comparing hashes
      this.medalStatusMessage = 'Upload wird verifiziert...';
      this.medalUploadProgress = 100;
      this.medalETA = '';
      console.log('Verifying Medal clip upload...');

      const isVerified = await this.verifyUpload(uploadUrlResponse.filename, localHash);

      if (!isVerified) {
        throw new Error(
          'Upload-Überprüfung fehlgeschlagen: Die hochgeladene Datei stimmt nicht mit der Originaldatei überein.',
        );
      }

      console.log('Medal clip upload verified successfully!');
      this.medalStatusMessage = 'Upload erfolgreich!';

      // Reset state
      this.isFetchingMedalClip = false;
      this.medalDownloadProgress = 0;
      this.medalUploadProgress = 0;
      this.medalClipUrl = '';
      this.medalStatusMessage = '';
      this.medalETA = ''; // Reload files and metadata
      this.loadFiles();
      this.loadMetadata();

      alert('Medal Clip erfolgreich hochgeladen und verifiziert!');
    } catch (error) {
      this.isFetchingMedalClip = false;
      this.medalDownloadProgress = 0;
      this.medalUploadProgress = 0;
      this.medalStatusMessage = '';
      this.medalETA = '';
      console.error('Medal clip upload failed:', error);

      const errorMessage = error instanceof Error ? error.message : 'Fehler beim Hochladen des Medal Clips';
      alert(errorMessage);
    }
  }
}
