import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../services/auth.service';
import type { CaseListItem, ListCasesGetResponse, CreateCasePostResponse } from '@zeitvertreib/types';

@Component({
  selector: 'app-case-management',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
  templateUrl: './case-management.component.html',
  styleUrls: ['./case-management.component.css'],
})
export class CaseManagementComponent implements OnInit {
  cases: CaseListItem[] = [];
  filteredCases: CaseListItem[] = [];
  searchQuery = '';
  sortBy: 'createdAt' | 'lastUpdatedAt' = 'createdAt';
  sortOrder: 'asc' | 'desc' = 'desc';
  sortDropdownOpen = false;

  // Pagination
  page = 1;
  limit = 20;
  totalCount = 0;
  totalPages = 0;
  hasNextPage = false;
  hasPreviousPage = false;

  isLoading = true;
  hasError = false;
  errorMessage = '';

  isTeam = false;
  lookupCaseId = '';
  lookupError = '';
  isLookingUp = false;

  sortOptions: { label: string; sortBy: 'createdAt' | 'lastUpdatedAt'; sortOrder: 'asc' | 'desc' }[] = [
    { label: 'Neueste zuerst', sortBy: 'createdAt', sortOrder: 'desc' },
    { label: 'Älteste zuerst', sortBy: 'createdAt', sortOrder: 'asc' },
    { label: 'Kürzlich aktualisiert', sortBy: 'lastUpdatedAt', sortOrder: 'desc' },
    { label: 'Zuletzt aktualisiert (alt)', sortBy: 'lastUpdatedAt', sortOrder: 'asc' },
  ];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router,
  ) { }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.custom-dropdown') && this.sortDropdownOpen) {
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
    this.authService.currentUserData$.subscribe(() => {
      this.isTeam = this.authService.isTeam();
      if (this.isTeam) {
        this.loadCases();
      } else {
        this.isLoading = false;
      }
    });
  }

  loadCases(resetPage = false) {
    if (resetPage) {
      this.page = 1;
    }
    this.isLoading = true;
    this.hasError = false;

    const params = new URLSearchParams({
      page: String(this.page),
      limit: String(this.limit),
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
    });

    this.http
      .get<ListCasesGetResponse>(`${environment.apiUrl}/cases?${params.toString()}`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          this.cases = response.cases;
          this.totalCount = response.pagination.totalCount;
          this.totalPages = response.pagination.totalPages;
          this.hasNextPage = response.pagination.hasNextPage;
          this.hasPreviousPage = response.pagination.hasPreviousPage;
          this.filterCases();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading cases:', error);
          this.hasError = true;
          this.errorMessage = error.error?.error || 'Fehler beim Laden der Fälle';
          this.isLoading = false;
        },
      });
  }

  createNewCase() {
    this.http
      .post<CreateCasePostResponse>(
        `${environment.apiUrl}/cases`,
        {},
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .subscribe({
        next: (response) => {
          this.router.navigate(['/cases', response.caseId]);
        },
        error: (error) => {
          console.error('Error creating case:', error);
          alert('Fehler beim Erstellen des Falls: ' + (error.error?.error || 'Unbekannter Fehler'));
        },
      });
  }

  openCase(item: CaseListItem) {
    this.router.navigate(['/cases', item.caseId]);
  }

  formatCaseName(caseId: string): string {
    return `Fall #${caseId}`;
  }

  getRecentCasesCount(): number {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return this.cases.filter((c) => c.createdAt > sevenDaysAgo).length;
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
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMinutes < 1) return 'Gerade eben';
    if (diffMinutes < 60) return `Vor ${diffMinutes} Min.`;
    if (diffHours < 24) return `Vor ${diffHours} Std.`;
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  filterCases() {
    if (!this.searchQuery.trim()) {
      this.filteredCases = [...this.cases];
      return;
    }
    const query = this.searchQuery.toLowerCase().trim();
    this.filteredCases = this.cases.filter((c) => {
      return (
        c.caseId.toLowerCase().includes(query) ||
        (c.title || '').toLowerCase().includes(query) ||
        (c.description || '').toLowerCase().includes(query)
      );
    });
  }

  changeSortOrder(sortBy: 'createdAt' | 'lastUpdatedAt', sortOrder: 'asc' | 'desc') {
    this.sortBy = sortBy;
    this.sortOrder = sortOrder;
    this.sortDropdownOpen = false;
    this.loadCases(true);
  }

  toggleSortDropdown() {
    this.sortDropdownOpen = !this.sortDropdownOpen;
  }

  getSortLabel(): string {
    const opt = this.sortOptions.find((o) => o.sortBy === this.sortBy && o.sortOrder === this.sortOrder);
    return opt?.label || 'Sortieren';
  }

  nextPage() {
    if (this.hasNextPage) {
      this.page++;
      this.loadCases();
    }
  }

  prevPage() {
    if (this.hasPreviousPage) {
      this.page--;
      this.loadCases();
    }
  }

  lookupCase() {
    this.lookupError = '';
    const raw = this.lookupCaseId.trim().toLowerCase();
    if (!raw) {
      this.lookupError = 'Bitte gib eine Fall-ID ein';
      return;
    }
    if (raw.length > 10) {
      this.lookupError = 'Fall-ID darf maximal 10 Hex-Zeichen enthalten';
      return;
    }
    if (!/^[a-f0-9]+$/.test(raw)) {
      this.lookupError = 'Fall-ID darf nur Hex-Zeichen (0-9, a-f) enthalten';
      return;
    }
    const caseId = raw.padEnd(10, '0');
    this.isLookingUp = true;
    this.router.navigate(['/cases', caseId]);
  }

  onLookupKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.lookupCase();
    }
  }

  clearSearch() {
    this.searchQuery = '';
    this.filterCases();
  }

  closeSortDropdown() {
    this.sortDropdownOpen = false;
  }
}
