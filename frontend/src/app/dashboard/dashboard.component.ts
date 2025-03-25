import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { CardModule } from 'primeng/card';
import { HttpClient } from '@angular/common/http';

interface Statistics {
  username: string,
  kills: number,
  deaths: number,
  experience: number,
  playtime: number
}

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  userStatistics: Statistics = {
    username: "LOADING...",
    kills: 0,
    deaths: 0,
    experience: 0,
    playtime: 0
  };
  constructor(private http: HttpClient) {
    this.http.get(`${environment.apiUrl}/stats`, { observe: 'response', withCredentials: true })
      .subscribe({
        next: response => {
          if (response.status === 200) {
            this.userStatistics = {
              username: ((((response.body as any)).stats as Statistics)).username,
              kills: ((((response.body as any)).stats as Statistics)).kills,
              deaths: ((((response.body as any)).stats as Statistics)).deaths,
              experience: ((((response.body as any)).stats as Statistics)).experience,
              playtime: ((((response.body as any)).stats as Statistics)).playtime
            }
          }
        },
        error: (e) => {
          console.log(e);
          this.userStatistics = {
            username: "ERROR",
            kills: -1,
            deaths: -1,
            experience: -1,
            playtime: -1
          }
        }
      });
  }
  login() {
    window.location.href = `${environment.apiUrl}/auth/login`;
  }
  logout() {
    window.location.href = `${environment.apiUrl}/auth/logout`;
  }
  stats() {
    window.location.href = `${environment.apiUrl}/stats`;
  }
}