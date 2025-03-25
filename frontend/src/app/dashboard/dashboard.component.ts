import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';

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
    window.location.href = "http://localhost:3000/auth/login";
  }
  logout() {
    window.location.href = "http://localhost:3000/auth/logout";
  }
  stats() {
    window.location.href = "http://localhost:3000/stats";
  }
}