import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../services/auth.service';

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

interface CaseFolder {
  name: string;
  metadata: CaseMetadata;
}

@Component({
  selector: 'app-case-management',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
  templateUrl: './case-management.component.html',
  styleUrls: ['./case-management.component.css'],
})
export class CaseManagementComponent implements OnInit {
  caseFolders: CaseFolder[] = [];
  filteredCaseFolders: CaseFolder[] = [];
  searchQuery = '';
  sortBy: 'newest' | 'oldest' | 'mostFiles' | 'largest' = 'newest';
  sortDropdownOpen = false;
  isLoading = true;
  hasError = false;
  errorMessage = '';

  // Public lookup state
  isTeam = false;
  lookupCaseId = '';
  lookupError = '';
  isLookingUp = false;

  sortOptions = [
    { label: 'Neueste zuerst', value: 'newest' },
    { label: 'Älteste zuerst', value: 'oldest' },
    { label: 'Meiste Dateien', value: 'mostFiles' },
    { label: 'Größte zuerst', value: 'largest' },
  ];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
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
    // Subscribe to user data changes
    this.authService.currentUserData$.subscribe((userData) => {
      this.isTeam = this.authService.isTeam();

      if (this.isTeam) {
        this.loadCaseFolders();
      } else {
        this.isLoading = false;
      }
    });
  }

  loadCaseFolders() {
    this.isLoading = true;
    this.hasError = false;

    this.http
      .get<{ folders: string[] }>(`${environment.apiUrl}/cases`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: async (response) => {
          // Fetch metadata for each case
          const casesWithMetadata = await Promise.all(
            response.folders.map(async (folderName) => {
              const caseId = folderName.replace('case-', '');
              try {
                const metadata = await this.http
                  .get<CaseMetadata>(`${environment.apiUrl}/cases/metadata?case=${caseId}`, { withCredentials: true })
                  .toPromise();

                return {
                  name: folderName,
                  metadata: metadata!,
                };
              } catch (error) {
                console.error(`Error fetching metadata for ${caseId}:`, error);
                // Return with default metadata if fetch fails
                return {
                  name: folderName,
                  metadata: {
                    id: folderName,
                    caseId: caseId,
                    createdAt: 0,
                    lastModified: 0,
                    fileCount: 0,
                    totalSize: 0,
                  },
                };
              }
            }),
          );

          this.caseFolders = casesWithMetadata;
          // Apply initial sorting (newest first)
          this.filterCases();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading case folders:', error);
          this.hasError = true;
          this.errorMessage = error.error?.error || 'Failed to load case folders';
          this.isLoading = false;
        },
      });
  }

  createNewCase() {
    this.http
      .post<{
        folderName: string;
      }>(
        `${environment.apiUrl}/cases`,
        {},
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .subscribe({
        next: (response) => {
          // Create a new case with initial metadata
          const now = Date.now();
          this.caseFolders.unshift({
            name: response.folderName,
            metadata: {
              id: response.folderName,
              caseId: response.folderName.replace('case-', ''),
              createdAt: now,
              lastModified: now,
              fileCount: 0,
              totalSize: 0,
            },
          });
          this.filterCases();
        },
        error: (error) => {
          console.error('Error creating case folder:', error);
          alert('Failed to create case folder: ' + (error.error?.error || 'Unknown error'));
        },
      });
  }

  openCase(caseFolder: CaseFolder) {
    const caseId = caseFolder.name.replace('case-', '');
    this.router.navigate(['/cases', caseId]);
  }

  formatCaseName(name: string): string {
    // Convert "case-123" to "Fall #123"
    const caseNumber = name.replace('case-', '');
    return `Fall #${caseNumber}`;
  }

  getRecentCasesCount(): number {
    // Count cases created in the last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return this.caseFolders.filter((caseFolder) => caseFolder.metadata.createdAt > sevenDaysAgo).length;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(timestamp: number): string {
    if (!timestamp) return 'Unbekannt';

    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));

    // Just now
    if (diffMinutes < 1) return 'Gerade eben';

    // Minutes ago
    if (diffMinutes < 60) return `Vor ${diffMinutes} Min.`;

    // Hours ago
    if (diffHours < 24) return `Vor ${diffHours} Std.`;

    // Days ago
    if (diffDays === 0) return 'Heute';
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;

    // Specific date for older items
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  formatRelativeDate(timestamp: number): string {
    return this.formatDate(timestamp);
  }

  getTotalFilesCount(): number {
    return this.caseFolders.reduce((sum, caseFolder) => sum + caseFolder.metadata.fileCount, 0);
  }

  getTotalStorageSize(): string {
    const totalBytes = this.caseFolders.reduce((sum, caseFolder) => sum + caseFolder.metadata.totalSize, 0);
    return this.formatFileSize(totalBytes);
  }

  filterCases() {
    let filtered: CaseFolder[];

    if (!this.searchQuery.trim()) {
      filtered = [...this.caseFolders];
    } else {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = this.caseFolders.filter((caseFolder) => {
        const caseId = caseFolder.name.replace('case-', '').toLowerCase();
        const caseName = this.formatCaseName(caseFolder.name).toLowerCase();
        const nickname = caseFolder.metadata.nickname?.toLowerCase() || '';
        const tags = caseFolder.metadata.tags?.map((tag) => tag.toLowerCase()).join(' ') || '';

        return caseId.includes(query) || caseName.includes(query) || nickname.includes(query) || tags.includes(query);
      });
    }

    // Apply sorting
    this.filteredCaseFolders = this.sortCases(filtered);
  }

  sortCases(cases: CaseFolder[]): CaseFolder[] {
    const sorted = [...cases];

    switch (this.sortBy) {
      case 'newest':
        return sorted.sort((a, b) => b.metadata.createdAt - a.metadata.createdAt);
      case 'oldest':
        return sorted.sort((a, b) => a.metadata.createdAt - b.metadata.createdAt);
      case 'mostFiles':
        return sorted.sort((a, b) => b.metadata.fileCount - a.metadata.fileCount);
      case 'largest':
        return sorted.sort((a, b) => b.metadata.totalSize - a.metadata.totalSize);
      default:
        return sorted;
    }
  }

  changeSortOrder(sortBy: 'newest' | 'oldest' | 'mostFiles' | 'largest') {
    this.sortBy = sortBy;
    this.sortDropdownOpen = false;
    this.filterCases();
  }

  toggleSortDropdown() {
    this.sortDropdownOpen = !this.sortDropdownOpen;
  }

  lookupCase() {
    // Reset error
    this.lookupError = '';

    // Validate input
    const caseId = this.lookupCaseId.trim().toLowerCase();
    if (!caseId) {
      this.lookupError = 'Bitte gib eine Fall-ID ein';
      return;
    }

    // Validate format (5 lowercase letters or numbers)
    if (!/^[a-z0-9]{5}$/.test(caseId)) {
      this.lookupError = 'Fall-ID muss aus 5 Zeichen (a-z, 0-9) bestehen';
      return;
    }

    // Check if case exists by fetching metadata
    this.isLookingUp = true;
    this.http.get<CaseMetadata>(`${environment.apiUrl}/cases/metadata?case=${caseId}`).subscribe({
      next: () => {
        // Case exists, navigate to it
        this.router.navigate(['/cases', caseId]);
      },
      error: (error) => {
        this.isLookingUp = false;
        if (error.status === 404) {
          this.lookupError = 'Fall nicht gefunden';
        } else {
          this.lookupError = 'Fehler beim Überprüfen des Falls';
        }
      },
    });
  }

  onLookupKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.lookupCase();
    }
  }

  closeSortDropdown() {
    this.sortDropdownOpen = false;
  }

  getSortLabel(): string {
    return this.sortOptions.find((opt) => opt.value === this.sortBy)?.label || 'Sortieren';
  }

  clearSearch() {
    this.searchQuery = '';
    this.filterCases();
  }
}
