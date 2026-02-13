import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-domain-warning',
  imports: [CommonModule],
  templateUrl: './domain-warning.component.html',
  styleUrl: './domain-warning.component.css',
})
export class DomainWarningComponent implements OnInit {
  showWarning = false;
  clickCount = 0;
  private readonly STORAGE_KEY = 'domain-warning-dismissed';
  private readonly PRODUCTION_DOMAIN = 'zeitvertreib.vip';

  ngOnInit(): void {
    this.checkDomain();
  }

  private checkDomain(): void {
    const hostname = window.location.hostname;
    const isDevelopment = hostname === 'dev.zeitvertreib.vip' || hostname === 'localhost';

    if (isDevelopment) {
      const dismissed = sessionStorage.getItem(this.STORAGE_KEY);
      this.showWarning = !dismissed;
    }
  }

  switchToProduction(): void {
    window.location.href = `https://${this.PRODUCTION_DOMAIN}`;
  }

  dismissWarning(): void {
    this.clickCount++;
    if (this.clickCount < 2) return;

    sessionStorage.setItem(this.STORAGE_KEY, 'true');
    this.showWarning = false;
  }
}
