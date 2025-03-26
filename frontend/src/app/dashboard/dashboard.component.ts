import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { CardModule } from 'primeng/card';
import { HttpClient } from '@angular/common/http';
import { ChartModule } from 'primeng/chart';
import { AvatarModule } from 'primeng/avatar';
import { CommonModule, NgForOf } from '@angular/common';

interface Statistics {
  username: string,
  kills: number,
  deaths: number,
  experience: number,
  playtime: number,
  leaderboardPositionHistory: Array<number>,
  avatarFull: string,
  roundsPlayed: number,
  level: number,
  usedMedkits: number,
  usedColas: number,
  escapedPocketDimensions: number,
  usedAdrenaline: number,
  lastKillers: Array<{ displayName: string, avatarMedium: string }>,
}

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule, ChartModule, AvatarModule, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  userStatistics: Statistics = {
    username: "LOADING...",
    kills: 0,
    deaths: 0,
    experience: 0,
    playtime: 0,
    leaderboardPositionHistory: [0, 0, 0, 0, 0],
    avatarFull: "",
    roundsPlayed: 0,
    level: 0,
    usedMedkits: 0,
    usedColas: 0,
    escapedPocketDimensions: 0,
    usedAdrenaline: 0,
    lastKillers: [
      {
        displayName: "rudeGuysxxXX",
        avatarMedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayName: "ehehIdidIt!",
        avatarMedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayName: "max.bambus",
        avatarMedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayName: "Fear",
        avatarMedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
      {
        displayName: "Waldbin",
        avatarMedium: "https://avatars.steamstatic.com/adffdb027bcea56c8ec6e77266865293eccb481c_medium.jpg"
      },
    ]
  };
  leaderboardHistoryData: any;
  leaderboardHistoryOptions: any;






  constructor(private http: HttpClient) {
    this.http.get<{ stats: Statistics }>(`${environment.apiUrl}/stats`, {
      observe: 'response',
      withCredentials: true
    }).subscribe({
      next: response => {
        if (response.status === 200 && response.body) {
          this.userStatistics = { ...response.body.stats };
        }
      },
      error: () => {

      }
    });
  }
  initChart() {
    console.log(this.userStatistics.leaderboardPositionHistory);
    this.leaderboardHistoryData = {
      labels: ['January', 'February', 'March', 'April', 'May'],
      datasets: [
        {
          label: 'Leaderboard Position',
          data: this.userStatistics.leaderboardPositionHistory,
          fill: false,
          borderColor: "#007bff", // Bright blue
          backgroundColor: "#007bff",
          pointBorderColor: "#ffffff",
          pointBackgroundColor: "#007bff",
          tension: 0.4
        },
      ]
    };

    this.leaderboardHistoryOptions = {
      maintainAspectRatio: false,
      aspectRatio: 0.6,
      plugins: {
        legend: {
          labels: {
            color: "#ffffff" // White for better contrast
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#ffffff" // White for visibility
          },
          grid: {
            color: "rgba(255, 255, 255, 0.2)", // Faint white grid
            drawBorder: false
          }
        },
        y: {
          ticks: {
            color: "#ffffff"
          },
          grid: {
            color: "rgba(255, 255, 255, 0.2)",
            drawBorder: false
          },
          reverse: true // Flip the Y-axis
        }
      }
    };
  }

}