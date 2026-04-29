import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationCenterService } from '../../services/notification-center.service';
import type { UserNotificationType } from '@zeitvertreib/types';

const LS_KEY = 'notification-center-hidden-types';

const ALL_NOTIFICATION_TYPES: { type: UserNotificationType; label: string; icon: string }[] = [
  { type: 'session_completed', label: 'Spiel-Session', icon: '🎮' },
  { type: 'fakerank_billing', label: 'Fakerank-Abrechnung', icon: '💸' },
  { type: 'fakerank_deleted', label: 'Fakerank gelöscht', icon: '🗑️' },
  { type: 'spray_deleted', label: 'Spray gelöscht', icon: '🗑️' },
];

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
  isFilterPanelOpen = false;
  allTypes = ALL_NOTIFICATION_TYPES;
  hiddenTypes = signal<UserNotificationType[]>(this.loadHiddenTypes());

  filteredNotifications = computed(() => {
    const hidden = this.hiddenTypes();
    return this.notificationCenter.notifications().filter((n) => !hidden.includes(n.type));
  });

  filteredUnreadCount = computed(() => {
    return this.filteredNotifications().filter((n) => n.readAt === null).length;
  });

  private boundClosePanel: (event: MouseEvent) => void = () => {};

  private loadHiddenTypes(): UserNotificationType[] {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        return JSON.parse(stored) as UserNotificationType[];
      }
    } catch {
      // ignore
    }
    return [];
  }

  ngOnInit(): void {
    this.boundClosePanel = () => {
      this.isPanelOpen = false;
      this.isFilterPanelOpen = false;
    };
    document.addEventListener('click', this.boundClosePanel);
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.boundClosePanel);
  }

  togglePanel(event: MouseEvent): void {
    event.stopPropagation();
    this.isPanelOpen = !this.isPanelOpen;
    if (!this.isPanelOpen) {
      this.isFilterPanelOpen = false;
    }
  }

  stopPropagation(event: MouseEvent): void {
    event.stopPropagation();
  }

  toggleFilterPanel(event: MouseEvent): void {
    event.stopPropagation();
    this.isFilterPanelOpen = !this.isFilterPanelOpen;
  }

  toggleType(type: UserNotificationType): void {
    this.hiddenTypes.update((hidden) => {
      const idx = hidden.indexOf(type);
      const newHidden = idx === -1 ? [...hidden, type] : hidden.filter((t) => t !== type);
      localStorage.setItem(LS_KEY, JSON.stringify(newHidden));
      return newHidden;
    });
  }

  isTypeVisible(type: UserNotificationType): boolean {
    return !this.hiddenTypes().includes(type);
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
