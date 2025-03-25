import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';


@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  constructor() {
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