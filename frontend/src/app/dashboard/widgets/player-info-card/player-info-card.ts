import { Component, Input } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { DiscordStatsComponent } from '../../../components/discord-stats/discord-stats.component';

@Component({
  selector: 'app-player-info-card',
  standalone: true,
  imports: [CommonModule, DecimalPipe, DiscordStatsComponent],
  templateUrl: './player-info-card.html',
  styleUrls: ['./player-info-card.css'],
})
export class PlayerInfoCardComponent {
  @Input() userStatistics: any;

  get playtimeFormatted(): string {
    const playtime = this.userStatistics?.playtime || 0;
    const hours = Math.floor(playtime / 3600);
    const minutes = Math.floor((playtime % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  get leaderboardText(): string {
    return this.userStatistics?.leaderboardposition
      ? `Platz #${this.userStatistics.leaderboardposition}`
      : 'NICHT GENÜGEND DATEN';
  }

  getAvatarUrl(avatarUrl?: string): string {
    return avatarUrl || '/assets/logos/logo_full_color_1to1.png';
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/assets/logos/logo_full_color_1to1.png';
  }
}
