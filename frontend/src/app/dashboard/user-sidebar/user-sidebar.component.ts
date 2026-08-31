import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DiscordStatsComponent } from '../../components/discord-stats/discord-stats.component';
import { BirthdayCardComponent } from './birthday-card/birthday-card.component';

@Component({
  selector: 'app-user-sidebar',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterModule, DiscordStatsComponent, BirthdayCardComponent],
  templateUrl: './user-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./user-sidebar.component.css'],
})
export class UserSidebarComponent {
  readonly userStatistics = input<any>();

  get kdRatio(): string {
    const kills = this.userStatistics()?.kills || 0;
    const deaths = this.userStatistics()?.deaths || 0;

    if (!deaths || deaths === 0) {
      return kills > 0 ? '∞' : '0.00';
    }
    return (kills / deaths).toFixed(2);
  }

  get playtimeFormatted(): string {
    const playtime = this.userStatistics()?.playtime || 0;
    const hours = Math.floor(playtime / 3600);
    const minutes = Math.floor((playtime % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  getAvatarUrl(avatarUrl?: string): string {
    return avatarUrl || '/assets/logos/logo_full_color_1to1.avif';
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = '/assets/logos/logo_full_color_1to1.avif';
  }
}
