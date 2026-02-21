import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../services/auth.service';
import type {
  CaseListItem,
  ListCasesGetResponse,
  ListCasesBySteamIdGetResponse,
  CreateCasePostResponse,
} from '@zeitvertreib/types';

type SearchMode = 'all' | 'steamId' | 'discordId' | 'caseId';

@Component({
  selector: 'app-case-management',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
  templateUrl: './case-management.component.html',
  styleUrls: ['./case-management.component.css'],
})
export class CaseManagementComponent implements OnInit, OnDestroy {
  cases: CaseListItem[] = [];
  filteredCases: CaseListItem[] = [];

  // Search state
  searchMode: SearchMode = 'all';
  searchQuery = '';
  steamIdQuery = '';
  steamIdResults: CaseListItem[] | null = null;
  discordIdQuery = '';
  discordIdResults: CaseListItem[] | null = null;
  caseIdQuery = '';
  caseIdError = '';
  isSearching = false;
  searchError = '';

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

  private steamIdSubject = new Subject<string>();
  private discordIdSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

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
    // Debounced Steam-ID search: waits 600 ms after the user stops typing
    this.steamIdSubject
      .pipe(debounceTime(600), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((query) => {
        this.executeSteamIdSearch(query);
      });

    // Debounced Discord-ID search: mirrors Steam-ID behaviour, uses isSearching
    this.discordIdSubject
      .pipe(debounceTime(600), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((query) => {
        this.executeDiscordIdSearch(query);
      });

    this.authService.currentUserData$.subscribe(() => {
      this.isTeam = this.authService.isTeam();
      if (this.isTeam) {
        this.loadCases();
      } else {
        this.isLoading = false;
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Search mode helpers ────────────────────────────────────────────────────

  setSearchMode(mode: SearchMode) {
    if (this.searchMode === mode) return;
    this.searchMode = mode;
    this.searchQuery = '';
    this.steamIdQuery = '';
    this.steamIdResults = null;
    this.discordIdQuery = '';
    this.discordIdResults = null;
    this.caseIdQuery = '';
    this.caseIdError = '';
    this.isSearching = false;
    this.searchError = '';
    this.page = 1;

    if (mode === 'all') {
      this.loadCases();
    }
    // steamId / discordId / caseId modes: wait for user to type
  }

  get displayedCases(): CaseListItem[] {
    if (this.searchMode === 'steamId') {
      return this.steamIdResults ?? [];
    }
    if (this.searchMode === 'discordId') {
      return this.discordIdResults ?? [];
    }
    if (this.searchMode === 'caseId') {
      return [];
    }
    return this.filteredCases;
  }

  get showPagination(): boolean {
    return this.searchMode === 'all' && this.totalPages > 1;
  }

  get discordIdResultCount(): number {
    return this.discordIdResults?.length ?? 0;
  }

  get steamIdResultCount(): number {
    return this.steamIdResults?.length ?? 0;
  }

  // ── Case-ID lookup ────────────────────────────────────────────────────────

  submitCaseIdSearch() {
    this.caseIdError = '';
    const raw = this.caseIdQuery.trim().toLowerCase();
    if (!raw) {
      this.caseIdError = 'Bitte eine Fall-ID eingeben';
      return;
    }
    if (raw.length > 10) {
      this.caseIdError = 'Fall-ID darf maximal 10 Zeichen enthalten';
      return;
    }
    if (!/^[a-z0-9]+$/.test(raw)) {
      this.caseIdError = 'Fall-ID darf nur alphanumerisch (a-z, 0-9) sein';
      return;
    }
    this.router.navigate(['/cases', raw.padEnd(10, '0')]);
  }

  onCaseIdKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.submitCaseIdSearch();
    }
  }

  // ── Discord-ID search ─────────────────────────────────────────────────────

  onDiscordIdQueryChange() {
    const query = this.discordIdQuery.trim();
    if (!query) {
      this.discordIdResults = null;
      this.isSearching = false;
      this.searchError = '';
      return;
    }
    this.isSearching = true;
    this.searchError = '';
    this.discordIdSubject.next(query);
  }

  clearDiscordIdSearch() {
    this.discordIdQuery = '';
    this.discordIdResults = null;
    this.isSearching = false;
    this.searchError = '';
  }

  private executeDiscordIdSearch(discordId: string) {
    if (!discordId) {
      this.isSearching = false;
      this.discordIdResults = null;
      return;
    }

    const params = new URLSearchParams({
      createdByDiscordId: discordId,
      page: '1',
      limit: '100',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    this.http
      .get<ListCasesGetResponse>(`${environment.apiUrl}/cases?${params.toString()}`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          this.discordIdResults = response.cases;
          this.isSearching = false;
        },
        error: (error) => {
          console.error('Error searching by Discord ID:', error);
          this.searchError = error.error?.error || 'Fehler bei der Suche nach Discord-ID';
          this.isSearching = false;
          this.discordIdResults = [];
        },
      });
  }

  // ── Steam-ID search ────────────────────────────────────────────────────────

  onSteamIdQueryChange() {
    const query = this.steamIdQuery.trim();
    if (!query) {
      this.steamIdResults = null;
      this.isSearching = false;
      this.searchError = '';
      return;
    }
    this.isSearching = true;
    this.searchError = '';
    this.steamIdSubject.next(query);
  }

  clearSteamIdSearch() {
    this.steamIdQuery = '';
    this.steamIdResults = null;
    this.isSearching = false;
    this.searchError = '';
  }

  private executeSteamIdSearch(steamId: string) {
    if (!steamId) {
      this.isSearching = false;
      this.steamIdResults = null;
      return;
    }

    const params = new URLSearchParams({ steamId });
    this.http
      .get<ListCasesBySteamIdGetResponse>(`${environment.apiUrl}/cases?${params.toString()}`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .subscribe({
        next: (response) => {
          this.steamIdResults = response.cases;
          this.isSearching = false;
        },
        error: (error) => {
          console.error('Error searching by Steam ID:', error);
          this.searchError = error.error?.error || 'Fehler bei der Suche nach Steam-ID';
          this.isSearching = false;
          this.steamIdResults = [];
        },
      });
  }

  // ── Main data loading ──────────────────────────────────────────────────────

  loadCases(resetPage = false) {
    if (resetPage) {
      this.page = 1;
    }
    this.isLoading = true;
    this.hasError = false;

    const paramsObj: Record<string, string> = {
      page: String(this.page),
      limit: String(this.limit),
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
    };

    const params = new URLSearchParams(paramsObj);

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
      this.lookupError = 'Fall-ID darf maximal 10 Zeichen enthalten';
      return;
    }
    if (!/^[a-z0-9]+$/.test(raw)) {
      this.lookupError = 'Fall-ID darf nur alphanumerisch (a-z, 0-9) sein';
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
