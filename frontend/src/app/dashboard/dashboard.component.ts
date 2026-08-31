import { Component, OnInit, OnDestroy, inject, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { AudioService } from '../services/audio.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { NotificationCenterService } from '../services/notification-center.service';
import { ThemeService } from '../services/theme.service';
import { EasterEggService } from '../services/easter-egg.service';
import { QuestsComponent } from '../components/quests/quests.component';
import { ZvcService } from '../services/zvc.service';
import { ButtonComponent, SpinnerComponent } from '@app/ui';
import { UserSidebarComponent } from './user-sidebar/user-sidebar.component';

// Widgets
import { SprayManagementComponent } from './widgets/spray-management/spray-management';
import { FakerankComponent } from './widgets/fakerank/fakerank';

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
  imports: [
    FormsModule,
    RouterModule,
    QuestsComponent,
    SprayManagementComponent,
    FakerankComponent,
    UserSidebarComponent,
    ButtonComponent,
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

  private http = inject(HttpClient);
  private themeService = inject(ThemeService);
  private easterEggService = inject(EasterEggService);
  private notificationCenter = inject(NotificationCenterService);
  private zvcService = inject(ZvcService);

  constructor() {
    this.generateRandomColors();
    this.loadUserStats();
  }

  ngOnInit(): void {
    this.isDonator = this.authService.isDonator();
    // Split layout: tells the global header to center over the functional column
    document.documentElement.classList.add('dashboard-layout');
  }

  ngOnDestroy(): void {
    document.documentElement.classList.remove('dashboard-layout');
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

  private loadUserStats(): void {
    this.isLoading = true;
    this.hasError = false;
    this.authService.authenticatedGet<{ stats: Statistics }>(`${environment.apiUrl}/stats`).subscribe({
      next: (response) => {
        if (response?.stats) this.userStatistics = { ...this.userStatistics, ...response.stats };
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

  refreshStats(): void {
    this.generateRandomColors();
    this.loadUserStats();
  }
}
