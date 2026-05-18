import { Component, Input } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-stats-overview',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './stats-overview.html',
  styleUrls: ['./stats-overview.css'],
})
export class StatsOverviewComponent {
  @Input() userStatistics: any;

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
}
