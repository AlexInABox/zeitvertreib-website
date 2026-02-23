import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ZeitService } from '../services/zeit.service';
import type { ZeitGetResponse, FakerankColor, CaseCategory } from '@zeitvertreib/types';

@Component({
  standalone: true,
  selector: 'app-zeit',
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './zeit.component.html',
  styleUrls: ['./zeit.component.css'],
})
export class ZeitComponent implements OnInit, OnDestroy {
  // Search state
  searchInput = '';
  searchType: 'steamid' | 'discordid' = 'steamid';
  isLoading = false;
  errorMessage = '';

  // Auth state
  isTeamMember = false;
  isLoggedIn = false;
  private authSubscription?: Subscription;
  private userDataSubscription?: Subscription;

  // Partner API key
  showApiKeyInput = false;
  partnerApiKey = '';
  apiKeyApplied = false;

  // Result state
  userData: ZeitGetResponse | null = null;

  // Fakerank color map for display
  fakerankColorMap: Record<FakerankColor, string> = {
    pink: '#FF69B4',
    red: '#FF0000',
    brown: '#8B4513',
    silver: '#C0C0C0',
    default: '#FFFFFF',
    light_green: '#90EE90',
    crimson: '#DC143C',
    cyan: '#00FFFF',
    aqua: '#00CED1',
    deep_pink: '#FF1493',
    tomato: '#FF6347',
    yellow: '#FFFF00',
    magenta: '#FF00FF',
    blue_green: '#0D98BA',
    orange: '#FFA500',
    lime: '#00FF00',
    green: '#008000',
    emerald: '#50C878',
    carmine: '#960018',
    nickel: '#727472',
    mint: '#3EB489',
    army_green: '#4B5320',
    pumpkin: '#FF7518',
  };

  constructor(
    private authService: AuthService,
    private zeitService: ZeitService,
  ) {}

  ngOnInit() {
    this.authSubscription = this.authService.currentUser$.subscribe((user: any) => {
      this.isLoggedIn = !!user;
    });

    this.userDataSubscription = this.authService.currentUserData$.subscribe(() => {
      this.isTeamMember = this.authService.isTeam();
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.userDataSubscription?.unsubscribe();
  }

  get canQuery(): boolean {
    return this.isTeamMember || this.apiKeyApplied;
  }

  get searchInputValid(): boolean {
    return this.searchInput.trim().length > 0;
  }

  toggleApiKeyInput(): void {
    this.showApiKeyInput = !this.showApiKeyInput;
  }

  applyApiKey(): void {
    if (this.partnerApiKey.trim().length > 0) {
      this.zeitService.setPartnerApiKey(this.partnerApiKey.trim());
      this.apiKeyApplied = true;
    }
  }

  removeApiKey(): void {
    this.partnerApiKey = '';
    this.apiKeyApplied = false;
    this.zeitService.setPartnerApiKey(null);
  }

  performSearch(): void {
    if (!this.canQuery || !this.searchInputValid) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.userData = null;

    const query$ =
      this.searchType === 'steamid'
        ? this.zeitService.queryBySteamId(this.searchInput.trim())
        : this.zeitService.queryByDiscordId(this.searchInput.trim());

    query$.subscribe({
      next: (data: ZeitGetResponse) => {
        this.userData = data;
        this.isLoading = false;
      },
      error: (err: any) => {
        this.isLoading = false;
        if (err.status === 401) {
          this.errorMessage = 'Nicht autorisiert. Bitte melde dich an oder verwende einen gültigen API-Key.';
        } else if (err.status === 403) {
          this.errorMessage = 'Zugriff verweigert. Du hast keine Berechtigung für diese Abfrage.';
        } else if (err.status === 404) {
          this.errorMessage = 'Benutzer nicht gefunden.';
        } else if (err.status === 400) {
          this.errorMessage = 'Ungültige SteamID oder Discord-ID.';
        } else {
          this.errorMessage = 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
        }
      },
    });
  }

  resetSearch(): void {
    this.userData = null;
    this.searchInput = '';
    this.errorMessage = '';
  }

  getFakerankColorHex(color: FakerankColor): string {
    return this.fakerankColorMap[color] || '#FFFFFF';
  }

  formatPlaytime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  formatNumber(value: number): string {
    return value.toLocaleString('de-DE');
  }

  formatTimestamp(ts: number): string {
    if (!ts) return '—';
    const date = new Date(ts);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
