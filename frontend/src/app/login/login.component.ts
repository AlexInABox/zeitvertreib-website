import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { AuthService, SteamUser } from '../services/auth.service';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ButtonModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit, OnDestroy {
  private authSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit() {
    // If user is already logged in, redirect to intended destination or dashboard
    this.authSubscription = this.authService.currentUser$.subscribe(
      (user: SteamUser | null) => {
        if (user) {
          const redirectUrl = sessionStorage.getItem('redirectUrl');
          if (redirectUrl) {
            sessionStorage.removeItem('redirectUrl');
            this.router.navigate([redirectUrl]);
          } else {
            this.router.navigate(['/dashboard']);
          }
        }
      },
    );
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }

  login() {
    const redirectUrl = sessionStorage.getItem('redirectUrl');
    if (redirectUrl) {
      sessionStorage.removeItem('redirectUrl');
      this.authService.login(redirectUrl);
    } else {
      this.authService.login();
    }
  }
}
