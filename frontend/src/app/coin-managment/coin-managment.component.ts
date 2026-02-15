import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

interface CoinUser {
  steamId: string;
  username: string;
  avatarUrl: string;
  coins: number;
  luck: number; // percent (0 or 50)
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

@Component({
  selector: 'app-coin-managment',
  standalone: true,
  imports: [CommonModule, RouterModule, AvatarModule, ButtonModule, DialogModule, FormsModule],
  templateUrl: './coin-managment.component.html',
  styleUrls: ['./coin-managment.component.css'],
})
export class CoinManagmentComponent implements OnInit, OnDestroy {
  users: CoinUser[] = [];
  reducedLuckUsers: Set<string> = new Set();
  editDialogVisible = false;
  selectedUser: CoinUser | null = null;
  selectedLuckOption: 'normal' | 'reduced' = 'normal';
  awardDialogVisible = false;
  awardAmount: number = 0;
  showDiscordOptions = false;
  sendDiscordNotification = false;
  discordMessage = '';
  isLoading = false;
  isLoadingPlayers = true;
  errorMessage = '';

  // copy-to-clipboard state
  copiedSteamId: string | null = null;
  private _copyTimer: any = null;

  // sorting state
  sortField: 'username' | 'coins' | 'luck' | null = null;
  sortDirection: 'asc' | 'desc' = 'asc';
  private originalUsersOrder: CoinUser[] = [];

  // search state
  searchTerm: string = '';
  private searchTermSubject = new Subject<string>();
  private searchSubscription?: Subscription;
  debouncedSearchTerm: string = '';

  // pagination state
  currentPage = 1;
  pageSize = 50;
  totalCount = 0;
  totalPages = 0;

  constructor(
    @Inject(HttpClient) private http: HttpClient,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    this.loadPlayers();
    this.loadReducedLuckList();
    
    // Set up debounced search
    this.searchSubscription = this.searchTermSubject
      .pipe(
        debounceTime(1000),
        distinctUntilChanged()
      )
      .subscribe((term) => {
        this.debouncedSearchTerm = term;
        // Trigger backend search and reset to page 1
        this.loadPlayers(1, term);
      });
  }

  ngOnDestroy() {
    this.searchSubscription?.unsubscribe();
  }

  onSearchChange(term: string) {
    this.searchTerm = term;
    this.searchTermSubject.next(term);
  }

  loadPlayers(page: number = 1, searchTerm?: string) {
    this.isLoadingPlayers = true;
    this.currentPage = page;
    const headers = this.getAuthHeaders();
    
    // Use provided searchTerm or fall back to current debouncedSearchTerm
    const search = searchTerm !== undefined ? searchTerm : this.debouncedSearchTerm;
    let url = `${environment.apiUrl}/coin-management/players?page=${page}&pageSize=${this.pageSize}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }
    
    this.http.get<{ players: CoinUser[]; pagination: PaginationInfo }>(url, { headers }).subscribe({
      next: (response) => {
        this.users = response.players;
        this.originalUsersOrder = [...response.players]; // store original order
        this.currentPage = response.pagination.page;
        this.pageSize = response.pagination.pageSize;
        this.totalCount = response.pagination.totalCount;
        this.totalPages = response.pagination.totalPages;
        this.applySorting();
        this.isLoadingPlayers = false;
      },
      error: (error) => {
        console.error('Error loading players:', error);
        this.errorMessage = 'Fehler beim Laden der Spielerliste';
        this.isLoadingPlayers = false;
      },
    });
  }

  loadReducedLuckList() {
    const headers = this.getAuthHeaders();
    this.http.get<{ reducedLuckUsers: string[] }>(`${environment.apiUrl}/reduced-luck`, { headers }).subscribe({
      next: (response) => {
        this.reducedLuckUsers = new Set(response.reducedLuckUsers);
        this.updateUserLuckValues();
      },
      error: (error) => {
        console.error('Error loading reduced luck list:', error);
        this.errorMessage = 'Fehler beim Laden der Glücksliste';
      },
    });
  }

  updateUserLuckValues() {
    this.users = this.users.map((user) => ({
      ...user,
      luck: this.reducedLuckUsers.has(user.steamId) ? 0 : 50,
    }));
    // Also update the original order so sorting/reset works correctly
    this.originalUsersOrder = this.originalUsersOrder.map((user) => ({
      ...user,
      luck: this.reducedLuckUsers.has(user.steamId) ? 0 : 50,
    }));
    this.applySorting();
  }

  trackById(_i: number, u: CoinUser) {
    return u.steamId;
  }

  // Removed: filteredUsers - now using server-side filtering

  editUser(u: CoinUser) {
    this.selectedUser = u;
    this.selectedLuckOption = u.luck === 0 ? 'reduced' : 'normal';
    this.editDialogVisible = true;
    this.errorMessage = '';
  }

  sortBy(field: 'username' | 'coins' | 'luck') {
    if (this.sortField === field) {
      // cycle through: asc → desc → null (unsorted)
      if (this.sortDirection === 'asc') {
        this.sortDirection = 'desc';
      } else if (this.sortDirection === 'desc') {
        // reset to unsorted
        this.sortField = null;
        this.sortDirection = 'asc';
      }
    } else {
      // new field, start with ascending
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.applySorting();
  }

  private applySorting() {
    if (!this.sortField) {
      // restore original order
      this.users = [...this.originalUsersOrder];
      return;
    }

    this.users.sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      switch (this.sortField) {
        case 'username':
          valA = a.username.toLowerCase();
          valB = b.username.toLowerCase();
          break;
        case 'coins':
          valA = a.coins;
          valB = b.coins;
          break;
        case 'luck':
          valA = a.luck;
          valB = b.luck;
          break;
        default:
          return 0;
      }

      let comparison = 0;
      if (valA < valB) comparison = -1;
      if (valA > valB) comparison = 1;

      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  copySteamId(steamId: string) {
    // try the clipboard API, fall back to creating a temporary textarea
    const copyText = async (text: string) => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(ta);
        return Promise.resolve();
      } catch (e) {
        document.body.removeChild(ta);
        return Promise.reject(e);
      }
    };

    copyText(steamId)
      .then(() => {
        this.copiedSteamId = steamId;
        if (this._copyTimer) {
          clearTimeout(this._copyTimer);
        }
        this._copyTimer = setTimeout(() => {
          if (this.copiedSteamId === steamId) this.copiedSteamId = null;
          this._copyTimer = null;
        }, 1600);
      })
      .catch((err) => {
        console.error('Copy failed', err);
        this.errorMessage = 'Kopieren fehlgeschlagen';
        setTimeout(() => (this.errorMessage = ''), 1600);
      });
  }

  saveLuckChange() {
    if (!this.selectedUser) return;

    this.isLoading = true;
    this.errorMessage = '';

    const hasReducedLuck = this.selectedLuckOption === 'reduced';
    const headers = this.getAuthHeaders();

    this.http
      .post<{ success: boolean; message: string; reducedLuckUsers: string[] }>(
        `${environment.apiUrl}/reduced-luck`,
        {
          steamId: this.selectedUser.steamId,
          hasReducedLuck: hasReducedLuck,
        },
        { headers },
      )
      .subscribe({
        next: (response) => {
          this.reducedLuckUsers = new Set(response.reducedLuckUsers);
          this.updateUserLuckValues();
          this.editDialogVisible = false;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error updating luck:', error);
          this.errorMessage = error?.error?.error || 'Fehler beim Aktualisieren des Glücks';
          this.isLoading = false;
        },
      });
  }

  awardCoins(u: CoinUser) {
    this.selectedUser = u;
    this.awardAmount = 0;
    this.showDiscordOptions = false;
    this.sendDiscordNotification = false;
    this.discordMessage = '';
    this.awardDialogVisible = true;
    this.errorMessage = '';
  }

  saveAward() {
    if (!this.selectedUser || this.awardAmount === 0) return;

    this.isLoading = true;
    this.errorMessage = '';

    const headers = this.getAuthHeaders();

    const requestBody: any = {
      steamId: this.selectedUser.steamId,
      amount: this.awardAmount,
    };

    // Include Discord notification if enabled
    if (this.sendDiscordNotification && this.discordMessage.trim()) {
      requestBody.discordNotification = {
        enabled: true,
        message: this.discordMessage.trim(),
      };
    }

    this.http
      .post<{
        success: boolean;
        newBalance: number;
      }>(`${environment.apiUrl}/coin-management/award`, requestBody, { headers })
      .subscribe({
        next: (response) => {
          const user = this.users.find((u) => u.steamId === this.selectedUser?.steamId);
          if (user) {
            user.coins = response.newBalance;
          }
          // Also update in original order
          const originalUser = this.originalUsersOrder.find((u) => u.steamId === this.selectedUser?.steamId);
          if (originalUser) {
            originalUser.coins = response.newBalance;
          }
          this.applySorting();
          this.awardDialogVisible = false;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error awarding coins:', error);
          this.errorMessage = error?.error?.error || 'Fehler beim Vergeben von Coins';
          this.isLoading = false;
        },
      });
  }

  // Pagination methods
  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.loadPlayers(page);
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.loadPlayers(this.currentPage + 1);
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.loadPlayers(this.currentPage - 1);
    }
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);
    
    // Adjust start if we're near the end
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  }

  get displayedRecordsEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalCount);
  }

  private getAuthHeaders(): HttpHeaders {
    const sessionToken = this.authService.getSessionToken();
    let headers = new HttpHeaders();
    if (sessionToken) {
      headers = headers.set('Authorization', `Bearer ${sessionToken}`);
    }
    return headers;
  }
}
