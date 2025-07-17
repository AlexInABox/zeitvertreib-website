import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AuthService, SteamUser } from '../services/auth.service';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ButtonModule, CardModule],
  template: `
    <div class="flex items-center justify-center min-h-screen ">
      <div class="max-w-md w-full">
        <p-card>
          <ng-template #title>
            <div class="text-center">
              <img 
                src="/assets/logos/logo_full_1to1.svg" 
                alt="Zeitvertreib Logo" 
                class="mx-auto mb-4 w-24 h-24"
              >
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Willkommen bei Zeitvertreib</h1>
            </div>
          </ng-template>
          
          <div class="text-center">
            <p class="text-gray-600 dark:text-gray-300 mb-6">
              Bitte melde dich mit deinem Steam-Account an, um auf dein Dashboard und deine Statistiken zuzugreifen.
            </p>
            
            <p-button 
              label="Mit Steam anmelden" 
              icon="pi pi-user" 
              size="large"
              styleClass="w-full"
              (onClick)="login()"
            ></p-button>
          </div>
        </p-card>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
    }
  `]
})
export class LoginComponent implements OnInit, OnDestroy {
  private authSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  ngOnInit() {
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
    this.authSubscription?.unsubscribe();
  }

  login() {
    this.authService.login();
  }
}
