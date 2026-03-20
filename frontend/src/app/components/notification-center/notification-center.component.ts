import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationCenterService } from '../../services/notification-center.service';
import type { UserNotificationType } from '@zeitvertreib/types';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification-center.component.html',
  styleUrls: ['./notification-center.component.css'],
})
export class NotificationCenterComponent implements OnInit, OnDestroy {
  notificationCenter = inject(NotificationCenterService);
  isPanelOpen = false;

  private boundClosePanel: (event: MouseEvent) => void = () => {};

  ngOnInit(): void {
    this.boundClosePanel = () => {
      this.isPanelOpen = false;
    };
    document.addEventListener('click', this.boundClosePanel);
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.boundClosePanel);
  }

  togglePanel(event: MouseEvent): void {
    event.stopPropagation();
    this.isPanelOpen = !this.isPanelOpen;
  }

  stopPropagation(event: MouseEvent): void {
    event.stopPropagation();
  }

  markAllRead(): void {
    this.notificationCenter.markAllRead();
  }

  getIcon(type: UserNotificationType): string {
    switch (type) {
      case 'session_completed':
        return '🎮';
      case 'fakerank_billing':
        return '💸';
      case 'fakerank_deleted':
        return '🗑️';
      case 'spray_deleted':
        return '🗑️';
      default:
        return '🔔';
    }
  }

  getRelativeTime(createdAt: number): string {
    const now = Date.now();
    const diff = now - createdAt;
    const minutes = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);

    if (minutes < 1) return 'Gerade eben';
    if (minutes < 60) return `vor ${minutes} Min.`;
    if (hours < 24) return `vor ${hours} Std.`;
    return `vor ${days} Tag${days !== 1 ? 'en' : ''}`;
  }
}
