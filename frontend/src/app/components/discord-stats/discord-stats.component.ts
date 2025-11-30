import { Component, Input, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

interface DiscordInviteResponse {
  approximate_member_count: number;
  approximate_presence_count: number;
}

@Component({
  selector: 'app-discord-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './discord-stats.component.html',
  styleUrl: './discord-stats.component.css',
})
export class DiscordStatsComponent implements OnInit {
  @Input() variant: 'full' | 'mini' = 'full';

  discordMemberCount = 0;
  discordOnlineCount = 0;

  constructor(private http: HttpClient) {}

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
