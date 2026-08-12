import { Component, OnInit, ChangeDetectionStrategy, input, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface DiscordInviteResponse {
  approximate_member_count: number;
  approximate_presence_count: number;
}

@Component({
  selector: 'app-discord-stats',
  standalone: true,
  imports: [],
  templateUrl: './discord-stats.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./discord-stats.component.css'],
})
export class DiscordStatsComponent implements OnInit {
  private http = inject(HttpClient);

  readonly variant = input<'full' | 'mini'>('full');

  discordMemberCount = 0;
  discordOnlineCount = 0;

  ngOnInit() {
    this.fetchDiscordStats();
  }

  private fetchDiscordStats() {
    this.http.get<DiscordInviteResponse>('https://discord.com/api/v9/invites/MhQ4Wp7GfS?with_counts=true').subscribe({
      next: (data) => {
        this.discordMemberCount = data.approximate_member_count;
        this.discordOnlineCount = data.approximate_presence_count;
      },
      error: (error) => {
        console.error('Error fetching Discord stats:', error);
      },
    });
  }
}
