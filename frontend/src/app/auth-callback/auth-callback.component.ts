import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, filter, take } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { IconComponent } from '../components/icon/icon.component';
import { JuleNavComponent } from '../components/jule-nav/jule-nav.component';
import { JuleFooterComponent } from '../components/jule-footer/jule-footer.component';

/** Transient landing page for the OAuth redirect back from the backend. */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [IconComponent, JuleNavComponent, JuleFooterComponent],
  template: `
    <div class="jule-canvas jule-canvas--fill">
      <app-jule-nav />

      <main class="jule-page">
        <section class="jule-panel auth-panel">
          <div class="jule-panel-body">
            @if (status === 'working') {
              <div class="jule-state jule-state--plain">
                <span class="jule-spinner" aria-hidden="true"></span>
                <h2>Anmeldung läuft</h2>
                <p>{{ message }}</p>
              </div>
            } @else {
              <div class="jule-state jule-state--plain">
                <app-icon class="jule-state-icon jule-state-icon--danger" name="exclamation-triangle" />
                <h2>Anmeldung fehlgeschlagen</h2>
                <p>{{ error }}</p>
                <div class="jule-cluster auth-actions">
                  <button type="button" class="jule-btn" (click)="retryAuth()">
                    <app-icon name="refresh" />
                    Erneut versuchen
                  </button>
                  <button type="button" class="jule-btn jule-btn--ghost" (click)="goHome()">Zur Startseite</button>
                </div>
              </div>
            }
          </div>
        </section>
      </main>

      <app-jule-footer />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .auth-panel {
      max-width: 34rem;
      margin: clamp(2rem, 10vh, 6rem) auto 0;
    }

    .auth-actions {
      justify-content: center;
      margin-top: 0.35rem;
    }
  `,
})
export class AuthCallbackComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  private authSubscription?: Subscription;
  private watchdog?: ReturnType<typeof setTimeout>;
  private finished = false;

  status: 'working' | 'error' = 'working';
  message = 'Wir warten auf die Bestätigung von Discord …';
  error = '';

  ngOnInit(): void {
    if (!this.authService.getSessionToken()) {
      this.fail('Es kam kein Anmelde-Token an. Starte die Anmeldung bitte erneut.');
      return;
    }

    this.authSubscription = this.authService.currentUser$
      .pipe(
        filter((user) => user !== null),
        take(1),
      )
      .subscribe(() => this.finish());

    // The service checks the session on startup; this covers a callback that
    // arrives after that first check has already run.
    this.authService.checkAuthStatus();

    this.watchdog = setTimeout(() => {
      if (!this.finished) {
        this.fail('Die Anmeldung hat zu lange gedauert. Bitte versuche es noch einmal.');
      }
    }, 12000);
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
    this.clearWatchdog();
  }

  retryAuth(): void {
    this.authService.login();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.clearWatchdog();
    this.message = 'Geschafft. Du wirst weitergeleitet …';
    this.router.navigate(['/dashboard']);
  }

  private fail(reason: string): void {
    this.finished = true;
    this.clearWatchdog();
    this.status = 'error';
    this.error = reason;
  }

  private clearWatchdog(): void {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = undefined;
    }
  }
}
