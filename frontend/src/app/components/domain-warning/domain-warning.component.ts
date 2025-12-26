import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-domain-warning',
  imports: [CommonModule],
  templateUrl: './domain-warning.component.html',
  styleUrl: './domain-warning.component.css',
})
export class DomainWarningComponent implements OnInit, OnDestroy {
  showWarning = false;
  allowDismiss = false;
  secondsLeft = 10;
  private readonly STORAGE_KEY = 'domain-warning-dismissed';
  private readonly PRODUCTION_DOMAIN = 'zeitvertreib.vip';
  private intervalId: number | null = null;

  ngOnInit(): void {
    this.checkDomain();
    if (this.showWarning) {
      this.startDismissCountdown();
    }
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private checkDomain(): void {
    const hostname = window.location.hostname;
    const isDevelopment = hostname === 'dev.zeitvertreib.vip' || hostname === 'localhost';

    if (isDevelopment) {
      const dismissed = sessionStorage.getItem(this.STORAGE_KEY);
      this.showWarning = !dismissed;
    }
  }

  private startDismissCountdown(): void {
    this.allowDismiss = false;
    this.secondsLeft = 3;
    this.intervalId = window.setInterval(() => {
      this.secondsLeft -= 1;
      if (this.secondsLeft <= 0) {
        this.allowDismiss = true;
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
      }
    }, 1000) as unknown as number;
  }

  switchToProduction(): void {
    window.location.href = `https://${this.PRODUCTION_DOMAIN}`;
  }

  dismissWarning(): void {
    if (!this.allowDismiss) return;
    sessionStorage.setItem(this.STORAGE_KEY, 'true');
    this.showWarning = false;
  }
}
