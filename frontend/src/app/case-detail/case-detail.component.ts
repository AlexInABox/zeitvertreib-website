import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextarea } from 'primeng/inputtextarea';
import { AuthService } from '../services/auth.service';

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

@Component({
  selector: 'app-case-detail',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputTextarea,
  ],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.css',
})
export class CaseDetailComponent implements OnInit {
  caseId: string = '';
  caseName: string = '';
  files: CaseFile[] = [];
  filteredFiles: CaseFile[] = [];
  metadata: CaseMetadata | null = null;
  searchQuery = '';
  sortBy: 'name' | 'name-desc' | 'newest' | 'oldest' | 'largest' | 'smallest' =
    'newest';
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
  selectedFile: File | null = null;

  // Medal clip upload state
  uploadMode: 'file' | 'medal' = 'file';
  medalClipUrl = '';
  isFetchingMedalClip = false;
  medalDownloadProgress = 0;
  medalUploadProgress = 0;
  medalStatusMessage = '';
  medalUrlInvalid = false;

  sortOptions = [
    { label: 'Name (A-Z)', value: 'name' },
    { label: 'Name (Z-A)', value: 'name-desc' },
    { label: 'Neueste zuerst', value: 'newest' },
    { label: 'Älteste zuerst', value: 'oldest' },
    { label: 'Größte zuerst', value: 'largest' },
    { label: 'Kleinste zuerst', value: 'smallest' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private authService: AuthService,
  ) { }

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

    this.route.paramMap.subscribe((params) => {
      this.caseId = params.get('id') || '';
      if (this.caseId) {
        this.caseName = decodeURIComponent(this.caseId);
        this.loadMetadata();
        this.loadFiles();
      }
    });
  }

  loadMetadata() {
    this.http
      .get<CaseMetadata>(
        `${environment.apiUrl}/cases/metadata?case=${this.caseId}`,
      )
      .subscribe({
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
      .get<{ files: CaseFile[]; expiresIn: number }>(
        `${environment.apiUrl}/cases/files?case=${this.caseId}`,
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
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
      filtered = this.files.filter((file) =>
        file.name.toLowerCase().includes(query),
      );
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

  changeSortOrder(
    sortBy: 'name' | 'name-desc' | 'newest' | 'oldest' | 'largest' | 'smallest',
  ) {
    this.sortBy = sortBy;
    this.sortDropdownOpen = false;
    this.filterFiles();
  }

  toggleSortDropdown() {
    this.sortDropdownOpen = !this.sortDropdownOpen;
  }

  getSortLabel(): string {
    return (
      this.sortOptions.find((opt) => opt.value === this.sortBy)?.label ||
      'Sortieren'
    );
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
    const totalBytes = this.files.reduce(
      (sum, file) => sum + (file.size || 0),
      0,
    );
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
    if (this.editedDescription)
      metadataPayload.description = this.editedDescription;
    if (tags.length > 0) metadataPayload.tags = tags;

    this.http
      .put(
        `${environment.apiUrl}/cases/metadata?case=${this.caseId}`,
        metadataPayload,
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
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

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
    }
  }

  async uploadFile() {
    if (!this.selectedFile) {
      alert('Bitte wähle eine Datei aus');
      return;
    }

    this.isUploading = true;
    this.uploadProgress = 0;

    try {
      // Get file extension
      const fileExtension =
        this.selectedFile.name.split('.').pop()?.toLowerCase() || '';

      // Request upload URL from backend
      const uploadUrlResponse = await this.http
        .get<{
          url: string;
          method: string;
          filename: string;
          fileUrl: string;
          expiresIn: number;
        }>(
          `${environment.apiUrl}/cases/upload?case=${this.caseId}&extension=${fileExtension}`,
        )
        .toPromise();

      if (!uploadUrlResponse) {
        throw new Error('Failed to get upload URL');
      }

      // Upload file to S3 using the presigned URL with progress tracking
      await new Promise<void>((resolve, reject) => {
        this.http
          .put(uploadUrlResponse.url, this.selectedFile, {
            headers: new HttpHeaders({
              'Content-Type':
                this.selectedFile!.type || 'application/octet-stream',
            }),
            reportProgress: true,
            observe: 'events',
          })
          .subscribe({
            next: (event) => {
              if (event.type === 1) {
                // HttpEventType.UploadProgress
                // Calculate upload percentage
                if (event.total) {
                  this.uploadProgress = Math.round(
                    (event.loaded / event.total) * 100,
                  );
                }
              } else if (event.type === 4) {
                // HttpEventType.Response
                resolve();
              }
            },
            error: (error) => reject(error),
          });
      });

      // Reset upload state
      this.isUploading = false;
      this.uploadProgress = 0;
      this.selectedFile = null;

      // Reset file input
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }

      // Reload files and metadata
      this.loadFiles();
      this.loadMetadata();

      alert('Datei erfolgreich hochgeladen!');
    } catch (error) {
      this.isUploading = false;
      this.uploadProgress = 0;
      console.error('Upload failed:', error);
      alert('Fehler beim Hochladen der Datei');
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
        alert(
          'Bitte gib eine gültige URL ein (muss mit http:// oder https:// beginnen)',
        );
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
      const fileExtension = fileNameWithExt.includes('.')
        ? fileNameWithExt.split('.').pop()!.toLowerCase()
        : 'mp4';

      const mimeType =
        fileExtension === 'mp4'
          ? 'video/mp4'
          : fileExtension === 'webm'
            ? 'video/webm'
            : 'video/mp4';

      // Generate filename with timestamp and proper extension
      const filename = `medal-clip-${Date.now()}.${fileExtension}`;

      // Step 2: Download the video with progress tracking using CORS proxy
      this.medalStatusMessage = 'Video wird heruntergeladen...';
      const proxiedUrl = `https://corsproxy.io/?url=${encodeURIComponent(bypassData.src)}`;
      const videoResponse = await fetch(proxiedUrl);

      if (!videoResponse.ok) {
        throw new Error('Fehler beim Herunterladen des Videos');
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
          this.medalDownloadProgress = Math.round(
            (receivedLength / total) * 100,
          );
        }
      }

      // Combine chunks into a single Uint8Array
      const videoData = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        videoData.set(chunk, position);
        position += chunk.length;
      }

      // Create a File object from the video data with proper extension
      const videoBlob = new Blob([videoData], { type: mimeType });
      const videoFile = new File([videoBlob], filename, { type: mimeType });

      // Step 3: Upload to case storage with progress tracking
      this.medalStatusMessage = 'Video wird hochgeladen...';

      // Get presigned upload URL with extension parameter
      const uploadUrlResponse = await this.http
        .get<{
          url: string;
        }>(`${environment.apiUrl}/cases/upload?case=${this.caseId}&extension=${fileExtension}`, { withCredentials: true })
        .toPromise();

      if (!uploadUrlResponse?.url) {
        throw new Error('Fehler beim Abrufen der Upload-URL');
      }

      // Upload file to S3 using the presigned URL with progress tracking
      await new Promise<void>((resolve, reject) => {
        this.http
          .put(uploadUrlResponse.url, videoFile, {
            headers: new HttpHeaders({
              'Content-Type': mimeType,
            }),
            reportProgress: true,
            observe: 'events',
          })
          .subscribe({
            next: (event) => {
              if (event.type === 1) {
                // HttpEventType.UploadProgress
                if (event.total) {
                  this.medalUploadProgress = Math.round(
                    (event.loaded / event.total) * 100,
                  );
                }
              } else if (event.type === 4) {
                // HttpEventType.Response
                resolve();
              }
            },
            error: (error) => reject(error),
          });
      });

      // Reset state
      this.isFetchingMedalClip = false;
      this.medalDownloadProgress = 0;
      this.medalUploadProgress = 0;
      this.medalClipUrl = '';
      this.medalStatusMessage = '';

      // Reload files and metadata
      this.loadFiles();
      this.loadMetadata();

      alert('Medal Clip erfolgreich hochgeladen!');
    } catch (error) {
      this.isFetchingMedalClip = false;
      this.medalDownloadProgress = 0;
      this.medalUploadProgress = 0;
      this.medalStatusMessage = '';
      console.error('Medal clip upload failed:', error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Fehler beim Hochladen des Medal Clips';
      alert(errorMessage);
    }
  }
}
