import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { AvatarModule } from 'primeng/avatar';
import { CommonModule, NgForOf } from '@angular/common';
import { AuthService } from '../services/auth.service';

interface PlayerEntry {
  displayname?: string;
  avatarmedium?: string;
}

interface Statistics {
  username?: string;
  kills?: number;
  deaths?: number;
  experience?: number;
  playtime?: number;
  avatarFull?: string;
  roundsplayed?: number;
  level?: number;
  leaderboardposition?: number | null;
  usedmedkits?: number;
  usedcolas?: number;
  pocketescapes?: number;
  usedadrenaline?: number;
  lastkillers?: PlayerEntry[];
  lastkills?: PlayerEntry[];
}

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule, ChartModule, AvatarModule, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  userStatistics: Statistics = {
    username: "LÄDT...",
    kills: 0,
    deaths: 0,
    experience: 0,
    playtime: 0,
    avatarFull: "",
    roundsplayed: 0,
    level: 0,
    leaderboardposition: null,
    usedmedkits: 0,
    usedcolas: 0,
    pocketescapes: 0,
    usedadrenaline: 0,
    lastkillers: [],
    lastkills: []
  };

  isLoading = true;
  hasError = false;
  errorMessage = '';

  constructor(private authService: AuthService) {
    this.loadUserStats();
  }

  // Safe getter methods for template usage
  get kdRatio(): string {
    const kills = this.userStatistics?.kills || 0;
    const deaths = this.userStatistics?.deaths || 0;

    if (!deaths || deaths === 0) {
      return kills > 0 ? '∞' : '0.00';
    }
    return (kills / deaths).toFixed(2);
  }

  get playtimeFormatted(): string {
    const playtime = this.userStatistics?.playtime || 0;
    const hours = Math.floor(playtime / 3600);
    const minutes = Math.floor((playtime % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  get leaderboardText(): string {
    return this.userStatistics?.leaderboardposition
      ? `Platz #${this.userStatistics.leaderboardposition}`
      : "NICHT GENÜGEND DATEN";
  }

  get hasKillers(): boolean {
    return Array.isArray(this.userStatistics?.lastkillers) && this.userStatistics.lastkillers.length > 0;
  }

  // Safe method to truncate display names
  truncateDisplayName(name?: string, maxLength = 15): string {
    if (!name) return 'Unbekannt';
    return name.length > maxLength ? `${name.substring(0, maxLength)}...` : name;
  }

  // Safe method to get avatar with fallback
  getAvatarUrl(avatarUrl?: string): string {
    return avatarUrl || '/assets/logos/logo_1to1.gif';
  }

  // Handle image loading errors
  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = '/assets/logos/logo_1to1.gif';
    }
  }

  // Track by function for better performance in *ngFor
  trackByKiller(index: number, killer?: PlayerEntry): string {
    return killer?.displayname || index.toString();
  }

  private loadUserStats(): void {
    this.isLoading = true;
    this.hasError = false;

    this.authService.authenticatedGet<{ stats: Statistics }>(`${environment.apiUrl}/stats`)
      .subscribe({
        next: response => {
          if (response?.stats) {
            this.userStatistics = {
              ...this.userStatistics, // Keep defaults for missing properties
              ...response.stats
            };
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Fehler beim Laden der Benutzerstatistiken:', error);
          this.hasError = true;
          this.errorMessage = 'Statistiken konnten nicht geladen werden';
          this.isLoading = false;
        }
      });
  }

  // Öffentliche Methode zum Aktualisieren der Statistiken (kann vom Template aufgerufen werden)
  refreshStats(): void {
    this.loadUserStats();
  }
}