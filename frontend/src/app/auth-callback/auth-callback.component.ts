import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="auth-callback-container">
      <div class="auth-callback-content">
        <h2>Completing Authentication...</h2>
        <p>{{ message }}</p>
        <div class="loading-spinner" *ngIf="!error"></div>
        <div class="error-message" *ngIf="error">
          <p>{{ error }}</p>
          <button (click)="retryAuth()" class="retry-button">Try Again</button>
          <button (click)="goHome()" class="home-button">Go Home</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .auth-callback-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background-color: #f5f5f5;
      }

      .auth-callback-content {
        text-align: center;
        background: white;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        max-width: 500px;
      }

      .loading-spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 2s linear infinite;
        margin: 20px auto;
      }

      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      .error-message {
        color: #e74c3c;
        margin-top: 20px;
      }

      .retry-button,
      .home-button {
        margin: 10px;
        padding: 10px 20px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }

      .retry-button {
        background-color: #3498db;
        color: white;
      }

      .home-button {
        background-color: #95a5a6;
        color: white;
      }
    `,
  ],
})
export class AuthCallbackComponent implements OnInit {
  message = 'Processing your login...';
  error: string | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.handleAuthCallback();
  }

  private async handleAuthCallback() {
    try {
      // Give the auth service a moment to process URL parameters
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check if we now have a session token
      const token = this.authService.getSessionToken();

      if (token) {
        this.message = 'Authentication successful! Redirecting...';

        // Force auth status check
        this.authService.checkAuthStatus();

        // Wait a bit for the auth check to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check for redirect parameter
        const urlParams = new URLSearchParams(window.location.search);
        const redirectPath = urlParams.get('redirect');

        if (redirectPath) {
          this.router.navigate([redirectPath]);
        } else {
          this.router.navigate(['/dashboard']);
        }
      } else {
        // Try to extract token manually as a fallback
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');

        if (urlToken) {
          this.authService.setSessionToken(urlToken);
          this.message = 'Authentication successful! Redirecting...';

          await new Promise((resolve) => setTimeout(resolve, 1000));
          this.router.navigate(['/dashboard']);
        } else {
          throw new Error('No authentication token found');
        }
      }
    } catch (error) {
      console.error('[AUTH-CALLBACK] Authentication callback failed:', error);
      this.error = 'Authentication failed. This might be due to browser security settings.';
      this.message = '';
    }
  }

  retryAuth() {
    this.authService.login();
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
