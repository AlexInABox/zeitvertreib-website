import { Component, OnInit, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TakeoutService } from '../../../services/takeout.service';
import { DeletionService } from '../../../services/deletion.service';

@Component({
  selector: 'app-data-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './data-management.component.html',
  styleUrls: ['./data-management.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class DataManagementComponent implements OnInit {
  private takeoutService = inject(TakeoutService);
  private deletionService = inject(DeletionService);

  userId = input<string | undefined>();

  // Takeout state
  lastTakeoutAt = 0;
  loadingTakeout = true;
  showTakeoutModal = false;
  takeoutEmail = '';
  takeoutLoading = false;
  takeoutError = '';
  takeoutSuccess = false;

  // Deletion state
  deletionEnabledAt = 0;
  loadingDeletion = true;
  showDeletionModal = false;
  deletionLoading = false;

  copiedUserId = false;

  private readonly THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  ngOnInit() {
    this.loadTakeoutStatus();
    this.loadDeletionStatus();
  }

  loadTakeoutStatus() {
    this.loadingTakeout = true;
    this.takeoutService.getTakeoutStatus().subscribe({
      next: (response) => {
        this.lastTakeoutAt = response.lastRequestedAt;
        this.loadingTakeout = false;
      },
      error: () => {
        this.lastTakeoutAt = 0;
        this.loadingTakeout = false;
      },
    });
  }

  isTakeoutDisabled(): boolean {
    if (this.loadingTakeout) return true;
    if (this.lastTakeoutAt === 0) return false;
    return Date.now() - this.lastTakeoutAt < this.THIRTY_DAYS_MS;
  }

  getDaysUntilNextTakeout(): number {
    if (this.lastTakeoutAt === 0) return 0;
    const nextDate = this.lastTakeoutAt + this.THIRTY_DAYS_MS;
    const diff = nextDate - Date.now();
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return Math.max(0, days);
  }

  openTakeoutModal() {
    this.showTakeoutModal = true;
    this.takeoutEmail = '';
    this.takeoutError = '';
    this.takeoutSuccess = false;
  }

  closeTakeoutModal() {
    this.showTakeoutModal = false;
    this.takeoutEmail = '';
    this.takeoutError = '';
  }

  submitTakeout() {
    if (!this.takeoutEmail || this.takeoutLoading) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.takeoutEmail)) {
      this.takeoutError = 'Bitte gib eine gültige E-Mail-Adresse ein';
      return;
    }

    this.takeoutLoading = true;
    this.takeoutError = '';

    this.takeoutService.requestTakeout(this.takeoutEmail).subscribe({
      next: () => {
        this.takeoutSuccess = true;
        this.takeoutLoading = false;
        this.lastTakeoutAt = Date.now();
        setTimeout(() => this.closeTakeoutModal(), 3000);
      },
      error: (error) => {
        this.takeoutLoading = false;
        if (error.status === 429) {
          this.takeoutError = 'Du kannst nur alle 30 Tage einen Export anfordern';
        } else {
          this.takeoutError = 'Fehler beim Senden der Anfrage. Bitte versuche es später erneut.';
        }
      },
    });
  }

  loadDeletionStatus() {
    this.loadingDeletion = true;
    this.deletionService.getDeletionStatus().subscribe({
      next: (response) => {
        this.deletionEnabledAt = response.enabledAt;
        this.loadingDeletion = false;
      },
      error: () => {
        this.deletionEnabledAt = 0;
        this.loadingDeletion = false;
      },
    });
  }

  isDeletionEnabled(): boolean {
    return this.deletionEnabledAt > 0;
  }

  openDeletionModal() {
    this.showDeletionModal = true;
  }

  closeDeletionModal() {
    this.showDeletionModal = false;
  }

  confirmEnableDeletion() {
    if (this.deletionLoading) return;
    this.deletionLoading = true;

    this.deletionService.setDeletion(Date.now()).subscribe({
      next: (response) => {
        this.deletionEnabledAt = response.enabledAt;
        this.deletionLoading = false;
        this.closeDeletionModal();
      },
      error: () => {
        this.deletionLoading = false;
      },
    });
  }

  disableDeletion() {
    if (this.deletionLoading) return;
    this.deletionLoading = true;

    this.deletionService.setDeletion(0).subscribe({
      next: () => {
        this.deletionEnabledAt = 0;
        this.deletionLoading = false;
      },
      error: () => {
        this.deletionLoading = false;
      },
    });
  }

  copyUserId() {
    const id = this.userId();
    if (!id) return;
    navigator.clipboard.writeText(id);
    this.copiedUserId = true;
    setTimeout(() => (this.copiedUserId = false), 2000);
  }

  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
