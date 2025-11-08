import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../services/auth.service';

interface CaseFile {
  name: string;
  viewUrl: string;
  expiresIn: number;
  size?: number;
  type?: string;
  lastModified?: number;
}

interface CaseMetadata {
  id: string;
  caseId: string;
  createdAt: number;
  lastModified: number;
  fileCount: number;
  totalSize: number;
}

@Component({
  selector: 'app-case-detail',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
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
  sortBy: 'name' | 'newest' | 'oldest' | 'largest' | 'smallest' = 'name';
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

  sortOptions = [
    { label: 'Name (A-Z)', value: 'name' },
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
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const dropdown = target.closest('.custom-dropdown');

    if (!dropdown && this.sortDropdownOpen) {
      this.sortDropdownOpen = false;
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
      case 'newest':
        return sorted.sort(
          (a, b) => (b.lastModified || 0) - (a.lastModified || 0),
        );
      case 'oldest':
        return sorted.sort(
          (a, b) => (a.lastModified || 0) - (b.lastModified || 0),
        );
      case 'largest':
        return sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
      case 'smallest':
        return sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
      default:
        return sorted;
    }
  }

  changeSortOrder(
    sortBy: 'name' | 'newest' | 'oldest' | 'largest' | 'smallest',
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
}
