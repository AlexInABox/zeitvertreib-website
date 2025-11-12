import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

import { AnimateOnScrollModule } from 'primeng/animateonscroll';
import { ImageModule } from 'primeng/image';
import { PanelModule } from 'primeng/panel';
import { CardModule } from 'primeng/card';
import { GalleriaModule } from 'primeng/galleria';

interface Player {
  Name: string;
  UserId: string;
  Health: number;
  Team: string;
  DiscordId?: string;
  AvatarUrl?: string;
}

@Component({
  selector: 'app-home',
  imports: [
    CommonModule,
    AnimateOnScrollModule,
    ImageModule,
    PanelModule,
    CardModule,
    GalleriaModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit, OnDestroy {
  images: string[] = ['0.jpg', '1.jpg', '2.jpg', '3.jpg'];
  players: Player[] = [];
  isLoading = true;
  private intervalId: any;

  responsiveOptions: any[] = [
    {
      breakpoint: '1300px',
      numVisible: 2,
    },
    {
      breakpoint: '500px',
      numVisible: 1,
    },
  ];

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.fetchPlayerlist();
    // Refresh playerlist every 10 seconds
    this.intervalId = setInterval(() => {
      this.fetchPlayerlist();
    }, 10000);
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  fetchPlayerlist() {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiUrl = isLocalhost
      ? 'https://dev.zeitvertreib.vip/api/playerlist'
      : `${window.location.origin}/api/playerlist`;

    this.http.get<Player[]>(apiUrl)
      .subscribe({
        next: (data) => {
          this.players = data;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error fetching playerlist:', error);
          this.isLoading = false;
        }
      });
  }

  get alivePlayers(): Player[] {
    return this.players.filter(p => p.Team !== 'Dead');
  }

  get deadPlayers(): Player[] {
    return this.players.filter(p => p.Team === 'Dead');
  }

  get playerCount(): number {
    return this.players.length;
  }

  get aliveCount(): number {
    return this.alivePlayers.length;
  }
}
