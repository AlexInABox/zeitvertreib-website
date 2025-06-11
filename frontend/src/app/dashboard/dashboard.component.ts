import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { AvatarModule } from 'primeng/avatar';
import { CommonModule, NgForOf } from '@angular/common';
import { AuthService } from '../services/auth.service';

interface Statistics {
  username: string,
  kills: number,
  deaths: number,
  experience: number,
  playtime: number,
  avatarFull: string,
  roundsplayed: number,
  level: number,
  leaderboardposition: number,
  usedmedkits: number,
  usedcolas: number,
  pocketescapes: number,
  usedadrenaline: number,
  lastkillers: Array<{ displayname: string, avatarmedium: string }>,
  lastkills: Array<{ displayname: string, avatarmedium: string }>,
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
    leaderboardposition: 0,
    usedmedkits: 0,
    usedcolas: 0,
    pocketescapes: 0,
    usedadrenaline: 0,
    lastkillers: [
      {
        displayname: "rudeGuysxxXX",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayname: "ehehIdidIt!",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayname: "max.bambus",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayname: "Fear",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayname: "Waldbin",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
    ],
    lastkills: [
      {
        displayname: "rudeGuysxxXX",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayname: "ehehIdidIt!",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayname: "max.bambus",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayname: "Fear",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayname: "Waldbin",
        avatarmedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
    ]
  };

  constructor(private authService: AuthService) {
    this.loadUserStats();
  }

  private loadUserStats(): void {
    this.authService.authenticatedGet<{ stats: Statistics }>(`${environment.apiUrl}/stats`)
      .subscribe({
        next: response => {
          if (response?.stats) {
            this.userStatistics = { ...response.stats };
          }
        },
        error: (error) => {
          console.error('Fehler beim Laden der Benutzerstatistiken:', error);
          // Hier könnte eine Fehlermeldung für den Benutzer angezeigt werden
        }
      });
  }

  // Öffentliche Methode zum Aktualisieren der Statistiken (kann vom Template aufgerufen werden)
  refreshStats(): void {
    this.userStatistics.username = "LÄDT...";
    this.loadUserStats();
  }
}