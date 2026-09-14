import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';

import { AuthService, SteamUser } from '../services/auth.service';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { IconComponent } from '../components/icon/icon.component';
import { M3NavComponent } from '../components/m3-nav/m3-nav.component';
import { M3FooterComponent } from '../components/m3-footer/m3-footer.component';

@Component({
  selector: 'app-login',
  imports: [IconComponent, M3NavComponent, M3FooterComponent],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);

  private authSubscription?: Subscription;

  ngOnInit() {
    // Immersive m3 chrome: hides the global header/site footer while mounted.
    document.body.classList.add('m3-active');

    // If user is already logged in, redirect to intended destination or dashboard
    this.authSubscription = this.authService.currentUser$.subscribe((user: SteamUser | null) => {
      if (user) {
        const redirectUrl = sessionStorage.getItem('redirectUrl');
        if (redirectUrl) {
          sessionStorage.removeItem('redirectUrl');
          this.router.navigate([redirectUrl]);
        } else {
          this.router.navigate(['/dashboard']);
        }
      }
    });
  }

  ngOnDestroy() {
    document.body.classList.remove('m3-active');
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
