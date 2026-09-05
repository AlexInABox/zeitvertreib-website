import { Component, OnInit, OnDestroy, inject, ElementRef, ChangeDetectionStrategy, viewChild } from '@angular/core';
import { AudioService } from '../services/audio.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { NotificationCenterService } from '../services/notification-center.service';
import { ThemeService } from '../services/theme.service';
import { EasterEggService } from '../services/easter-egg.service';
import { SupportService } from '../services/support.service';
import { QuestsComponent } from '../components/quests/quests.component';
import { ZvcService } from '../services/zvc.service';
import { ButtonComponent, CardComponent, SpinnerComponent } from '@app/ui';
import { UserSidebarComponent } from './user-sidebar/user-sidebar.component';
import { Subscription, retry, timeout } from 'rxjs';

// Widgets
import { SprayManagementComponent } from './widgets/spray-management/spray-management';
import { FakerankComponent } from './widgets/fakerank/fakerank';
import { GamesComponent } from '../games/games';

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

/* --- testui3: deterministic "living pixel field" model -------------------
   A seeded mosaic keeps the animated hero identical on every render while
   still feeling organic (drift + ripple + per-pixel flicker). */
const M3_ROWS = 13;
const M3_COLS = 22;

/** Warm accent palette — Zeitvertreib fire tones. */
const M3_WARM = ['#ff3b00', '#ff4d1c', '#ff6a00', '#ff8a00', '#ffb02e', '#ffc84a', '#f43b3b'];
/** Dark field palette. */
const M3_DARK = ['#0c0b0a', '#12100d', '#181510', '#1e1a14', '#272119', '#151210'];

interface M3Cell {
  bg: string;
  base: number;
  delay: number;
  dur: number;
  hot: boolean;
}

function m3Mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildM3Mosaic(rows: number, cols: number): M3Cell[] {
  const rand = m3Mulberry32(0x5eedcafe);
  const cells: M3Cell[] = [];
  const pick = <T>(arr: T[]): T => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Diagonal field: fire accumulates toward the bottom-right corner,
      // with a soft ripple so it reads as a landscape, not noise.
      const diag = (c / (cols - 1)) * 0.62 + (r / (rows - 1)) * 0.38;
      const ripple =
        Math.sin(c * 0.9 + r * 0.55) * 0.08 + Math.sin((c + r) * 0.42 + 1.7) * 0.07;
      const noise = rand() * 0.34 - 0.17;
      const warmth = Math.min(1, Math.max(0, diag + ripple * 0.7 + noise));

      const warm = rand() < warmth;
      const hot = warm && rand() < 0.05 && r > 3;

      cells.push({
        bg: hot ? pick(M3_WARM) : warm ? pick(M3_WARM) : pick(M3_DARK),
        base: warm ? 0.82 + rand() * 0.18 : 0.5 + rand() * 0.32,
        delay: -rand() * 9,
        dur: 2.4 + rand() * 5.5,
        hot,
      });
    }
  }
  return cells;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    FormsModule,
    RouterModule,
    QuestsComponent,
    SprayManagementComponent,
    FakerankComponent,
    UserSidebarComponent,
    GamesComponent,
    ButtonComponent,
    CardComponent,
    SpinnerComponent,
  ],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);

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
  randomColors: string[] = [];
  isDonator = false;
  testUiActive = false;
  testUi2Active = false;
  testUi3Active = false;
  pendingOpenGames = false;
  readonly m3Cols = M3_COLS;
  readonly m3Rows = M3_ROWS;
  readonly m3Cells: M3Cell[] = buildM3Mosaic(M3_ROWS, M3_COLS);
  private testUiSubscription?: Subscription;
  private testUi2Subscription?: Subscription;
  private testUi3Subscription?: Subscription;
  private readonly onOpenGames = (): void => this.requestOpenGames();

  readonly pager = viewChild<ElementRef<HTMLElement>>('pager');
  canGoNext = true;
  canGoPrev = false;
  private pagerScrollTimer?: any;

  private http = inject(HttpClient);
  private themeService = inject(ThemeService);
  private easterEggService = inject(EasterEggService);
  private notificationCenter = inject(NotificationCenterService);
  private zvcService = inject(ZvcService);
  private router = inject(Router);
  private supportService = inject(SupportService);

  constructor() {
    this.generateRandomColors();
    this.loadUserStats();
  }

  ngOnInit(): void {
    this.isDonator = this.authService.isDonator();
    this.testUiSubscription = this.easterEggService.testUiTrigger$.subscribe((isActive) => {
      this.testUiActive = isActive;
    });
    this.testUi2Subscription = this.easterEggService.testUi2Trigger$.subscribe((isActive) => {
      this.testUi2Active = isActive;
    });
    this.testUi3Subscription = this.easterEggService.testUi3Trigger$.subscribe((isActive) => {
      this.testUi3Active = isActive;
    });
    // Listen for the header's "Spiele" click so it scrolls to the games panel in testui
    window.addEventListener('testui-open-games', this.onOpenGames);
    // Split layout: tells the global header to center over the functional column
    document.documentElement.classList.add('dashboard-layout');
  }

  ngOnDestroy(): void {
    this.testUiSubscription?.unsubscribe();
    this.testUi2Subscription?.unsubscribe();
    this.testUi3Subscription?.unsubscribe();
    window.removeEventListener('testui-open-games', this.onOpenGames);
    document.documentElement.classList.remove('dashboard-layout');
    window.clearTimeout(this.pagerScrollTimer);
  }

  generateRandomColors(): void {
    this.randomColors = [this.getRandomColor(), this.getRandomColor(), this.getRandomColor()];
    this.applyRandomColors();
  }

  private getRandomColor(): string {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(Math.random() * 40) + 60;
    const lightness = Math.floor(Math.random() * 30) + 45;
    return this.hslToHex(hue, saturation, lightness);
  }

  private hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color)
        .toString(16)
        .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  private applyRandomColors(): void {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--random-color-1', this.randomColors[0] ?? '#000000');
      root.style.setProperty('--random-color-2', this.randomColors[1] ?? '#000000');
      root.style.setProperty('--random-color-3', this.randomColors[2] ?? '#000000');
    }
  }

  get kdRatio(): string {
    const kills = this.userStatistics.kills || 0;
    const deaths = this.userStatistics.deaths || 0;
    if (!deaths) return kills > 0 ? '∞' : '0.00';
    return (kills / deaths).toFixed(2);
  }

  get playtimeFormatted(): string {
    const playtime = this.userStatistics.playtime || 0;
    const hours = Math.floor(playtime / 3600);
    const minutes = Math.floor((playtime % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  // ---- testui2 helpers ----------------------------------------------------

  /** Compact playtime for the big stat number (avoids overlong "Xh Ym" strings). */
  get t2PlaytimeBig(): string {
    const seconds = this.userStatistics.playtime || 0;
    const hours = seconds / 3600;
    if (hours >= 100) return `${Math.round(hours)}h`;
    if (hours >= 1) return `${(Math.round(hours * 10) / 10).toString().replace('.', ',')}h`;
    return `${Math.max(1, Math.round(seconds / 60))}m`;
  }

  get t2PlaytimeNote(): string {
    return (this.userStatistics.playtime || 0) >= 3600 ? 'Stunden im Spiel' : 'Minuten im Spiel';
  }

  get t2Rank(): string {
    const pos = this.userStatistics.leaderboardposition;
    return pos && pos > 0 ? `#${pos}` : '—';
  }

  /** testui2 light/dark mode. */
  get t2IsDark(): boolean {
    return this.themeService.isDark();
  }

  t2ToggleTheme(): void {
    this.themeService.toggleDarkMode();
  }

  /** German thousands separator for mono readouts. */
  t2Num(value: number | null | undefined): string {
    return (value ?? 0).toLocaleString('de-DE');
  }

  get t2FallbackImg(): string {
    return '/assets/logos/logo_full_color_1to1.avif';
  }

  get t2RecentKills(): Statistics['lastkills'] {
    return this.userStatistics.lastkills.slice(0, 6);
  }

  t2GalleryImages: string[] = [
    '0.avif', '1.avif', '2.avif', '3.avif', '4.avif', '5.avif', '6.avif', '7.avif',
    '8.gif', '9.avif', '10.avif', '11.avif', '13.avif', '14.avif', '15.avif',
    '16.avif', '17.avif', '18.avif', '19.avif', '20.avif', '21.avif', '22.avif',
    '23.gif', '24.avif',
  ];
  t2ActiveIndex = 0;

  get t2ActiveStage(): string {
    return `/assets/showcase/full/${this.t2GalleryImages[this.t2ActiveIndex]}`;
  }

  t2Pick(index: number): void {
    this.t2ActiveIndex = ((index % this.t2GalleryImages.length) + this.t2GalleryImages.length) % this.t2GalleryImages.length;
  }

  t2Next(): void {
    this.t2Pick(this.t2ActiveIndex + 1);
  }

  t2Prev(): void {
    this.t2Pick(this.t2ActiveIndex - 1);
  }

  t2ScrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  t2ImgFallback(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && img.src !== this.t2FallbackImg) {
      img.src = this.t2FallbackImg;
    }
  }

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
      .pipe(
        timeout(25000),
        retry(1),
      )
      .subscribe({
        next: (response) => {
          if (response?.stats) {
            this.userStatistics = { ...this.userStatistics, ...response.stats };
            if (cacheKey) this.writeStatsCache(cacheKey, response.stats);
          }
          this.isLoading = false;
          const openGamesRequested =
            this.pendingOpenGames || this.router.url.includes('screen=games');
          if (openGamesRequested) {
            this.pendingOpenGames = false;
            // Scroll instantly once the pager has rendered so no dashboard flash is visible.
            setTimeout(() => this.scrollToGamesPanel(true), 0);
          }
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
    this.generateRandomColors();
    this.loadUserStats();
  }

  onPagerScroll(): void {
    // Debounce: only sync the arrows once the scroll has settled, otherwise the
    // smooth animation keeps toggling them back mid-flight.
    window.clearTimeout(this.pagerScrollTimer);
    this.pagerScrollTimer = window.setTimeout(() => this.syncPagerArrows(), 160);
  }

  private syncPagerArrows(): void {
    const el = this.pager()?.nativeElement;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const pos = el.scrollLeft;
    this.canGoPrev = pos > 12;
    this.canGoNext = pos < maxScroll - 12;
  }

  goNext(): void {
    const el = this.pager()?.nativeElement;
    if (!el) return;
    el.scrollTo({ left: el.scrollLeft + el.clientWidth, behavior: 'smooth' });
    // Flip the arrows immediately so the back arrow is ready without an extra click.
    this.canGoNext = false;
    this.canGoPrev = true;
  }

  goPrev(): void {
    const el = this.pager()?.nativeElement;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, el.scrollLeft - el.clientWidth), behavior: 'smooth' });
    this.canGoPrev = false;
    this.canGoNext = true;
  }

  /**
   * Scroll to the games panel. Use `instant = true` for programmatic requests so
   * the user never sees a brief dashboard frame or an animation.
   */
  scrollToGamesPanel(instant = false): void {
    const el = this.pager()?.nativeElement;
    if (!el || !this.testUiActive) return;

    const target = Math.max(el.clientWidth, window.innerWidth);
    const behavior: ScrollBehavior = instant ? 'auto' : 'smooth';

    if (instant) {
      el.scrollTo({ left: target, behavior });
      this.canGoPrev = true;
      this.canGoNext = false;
      return;
    }

    const attempt = (remaining: number): void => {
      if (remaining <= 0) return;
      el.scrollTo({ left: target, behavior });
      setTimeout(() => {
        if (Math.abs(el.scrollLeft - target) > 8) {
          attempt(remaining - 1);
        } else {
          this.canGoPrev = true;
          this.canGoNext = false;
        }
      }, 120);
    };
    attempt(6);
  }

  /** Open the games screen — scrolls the pager in testUI, navigates otherwise. */
  openQuickGames(): void {
    if (typeof document !== 'undefined' && document.body.classList.contains('testui')) {
      window.dispatchEvent(new CustomEvent('testui-open-games'));
    } else {
      void this.router.navigate(['/games']);
    }
  }

  /** Expand the support/donation panel (same as the navbar “Unterstützen”). */
  openSupport(): void {
    this.supportService.expand(true);
  }

  /**
   * Requests the games screen. If the pager is not rendered yet (e.g. stats are
   * still loading after navigating to the dashboard), defer until it is ready.
   */
  private requestOpenGames(): void {
    if (!this.testUiActive) {
      this.pendingOpenGames = false;
      return;
    }
    const el = this.pager()?.nativeElement;
    if (el) {
      this.pendingOpenGames = false;
      this.scrollToGamesPanel();
    } else {
      this.pendingOpenGames = true;
    }
  }
}
