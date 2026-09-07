import { Component, OnDestroy, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { environment } from '../../environments/environment';

import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SupportService } from '../services/support.service';
import { M3NavComponent } from '../components/m3-nav/m3-nav.component';
import { M3FooterComponent } from '../components/m3-footer/m3-footer.component';
import { ButtonComponent, SpinnerComponent } from '@app/ui';
import { SHOWCASE_IMAGES } from '../utils/showcase';
import { retry, timeout } from 'rxjs';

interface Statistics {
  username: string;
  kills: number;
  deaths: number;
  experience?: number;
  playtime: number;
  avatarFull: string;
  roundsplayed: number;
  leaderboardposition: number | null;
  usedmedkits: number;
  usedcolas: number;
  pocketescapes: number;
  usedadrenaline: number;
  snakehighscore: number;
  lastkillers: Array<{ displayname: string; avatarmedium: string }>;
  lastkills: Array<{ displayname: string; avatarmedium: string }>;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterModule, M3NavComponent, M3FooterComponent, ButtonComponent, SpinnerComponent],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  userStatistics: Statistics = {
    username: 'LÄDT...',
    kills: 0,
    deaths: 0,
    experience: 0,
    playtime: 0,
    avatarFull: '',
    roundsplayed: 0,
    leaderboardposition: null,
    usedmedkits: 0,
    usedcolas: 0,
    pocketescapes: 0,
    usedadrenaline: 0,
    snakehighscore: 0,
    lastkillers: [],
    lastkills: [],
  };

  isLoading = true;
  hasError = false;
  errorMessage = '';
  isDonator = false;

  private authService = inject(AuthService);
  private supportService = inject(SupportService);

  constructor() {
    this.loadUserStats();
  }

  ngOnInit(): void {
    this.isDonator = this.authService.isDonator();
    // Immersive dashboard: hides the global header/site chrome while mounted.
    document.body.classList.add('m3-active');
  }

  ngOnDestroy(): void {
    document.body.classList.remove('m3-active');
  }

  // ---- derived stats ------------------------------------------------------

  get kdRatio(): string {
    const kills = this.userStatistics.kills || 0;
    const deaths = this.userStatistics.deaths || 0;
    if (!deaths) return kills > 0 ? '∞' : '0.00';
    return (kills / deaths).toFixed(2);
  }

  /** Leaderboard rank for the console badge ('—' when unranked). */
  get rank(): string {
    const pos = this.userStatistics.leaderboardposition;
    return pos && pos > 0 ? `#${pos}` : '—';
  }

  /** Compact playtime for the big stat number (avoids overlong "Xh Ym" strings). */
  get playtimeBig(): string {
    const seconds = this.userStatistics.playtime || 0;
    const hours = seconds / 3600;
    if (hours >= 100) return `${Math.round(hours)}h`;
    if (hours >= 1) return `${(Math.round(hours * 10) / 10).toString().replace('.', ',')}h`;
    return `${Math.max(1, Math.round(seconds / 60))}m`;
  }

  /** German thousands separator for mono readouts. */
  num(value: number | null | undefined): string {
    return (value ?? 0).toLocaleString('de-DE');
  }

  get recentKills(): Statistics['lastkills'] {
    return this.userStatistics.lastkills.slice(0, 6);
  }

  readonly fallbackImg = '/assets/logos/logo_full_color_1to1.avif';

  onImgFallback(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && img.src !== this.fallbackImg) {
      img.src = this.fallbackImg;
    }
  }

  // ---- gallery ------------------------------------------------------------

  galleryImages = SHOWCASE_IMAGES;

  activeImageIndex = 0;

  get activeImage(): string {
    return `/assets/showcase/full/${this.galleryImages[this.activeImageIndex]}`;
  }

  pickImage(index: number): void {
    this.activeImageIndex =
      ((index % this.galleryImages.length) + this.galleryImages.length) % this.galleryImages.length;
  }

  nextImage(): void {
    this.pickImage(this.activeImageIndex + 1);
  }

  prevImage(): void {
    this.pickImage(this.activeImageIndex - 1);
  }

  // ---- stats loading ------------------------------------------------------

  private loadUserStats(): void {
    this.isLoading = true;
    this.hasError = false;

    // Serve a short-lived cached copy instantly if we have one, so navigating
    // back to the dashboard doesn't wait on a slow /stats request again.
    const token = this.authService.getSessionToken();
    const cacheKey = token ? `zv_dash_stats_v1:${token}` : null;
    if (cacheKey) {
      const cached = this.readStatsCache(cacheKey);
      if (cached) {
        this.userStatistics = { ...this.userStatistics, ...cached };
        this.isLoading = false;
        return;
      }
    }

    this.authService
      .authenticatedGet<{ stats: Statistics }>(`${environment.apiUrl}/stats`)
      .pipe(timeout(25000), retry(1))
      .subscribe({
        next: (response) => {
          if (response?.stats) {
            this.userStatistics = { ...this.userStatistics, ...response.stats };
            if (cacheKey) this.writeStatsCache(cacheKey, response.stats);
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Fehler beim Laden:', error);
          this.hasError = true;
          this.errorMessage = 'Statistiken konnten nicht geladen werden';
          this.isLoading = false;
        },
      });
  }

  private readStatsCache(key: string): Statistics | null {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: Statistics };
      if (!parsed?.data || Date.now() - parsed.ts > 60_000) {
        sessionStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  private writeStatsCache(key: string, data: Statistics): void {
    try {
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // Ignore storage errors
    }
  }

  refreshStats(): void {
    this.loadUserStats();
  }

  /** Expand the support/donation panel (same as the navbar “Unterstützen”). */
  openSupport(): void {
    this.supportService.expand(true);
  }
}
