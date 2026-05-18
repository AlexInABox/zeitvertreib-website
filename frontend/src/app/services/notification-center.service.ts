import { Injectable, OnDestroy, signal, inject, computed } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import type {
  GetNotificationsResponse,
  UserNotification,
  MarkNotificationsReadRequest,
  UserNotificationType,
} from '@zeitvertreib/types';

const LS_KEY = 'notification-center-hidden-types';

const ALL_TYPES: UserNotificationType[] = [
  'session_completed',
  'fakerank_billing',
  'fakerank_deleted',
  'spray_deleted',
];

@Injectable({ providedIn: 'root' })
export class NotificationCenterService implements OnDestroy {
  private authService = inject(AuthService);

  notifications = signal<UserNotification[]>([]);

  hiddenTypes = signal<UserNotificationType[]>(this.loadHiddenTypes());
  visibleTypes = computed(() => ALL_TYPES.filter((t) => !this.hiddenTypes().includes(t)));
  filteredUnreadCount = computed(() => this.notifications().filter((n) => n.readAt === null).length);

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private refreshTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.fetchNotifications();
        this.startPolling();
      } else {
        this.stopPolling();
        this.cancelRefreshTimeout();
        this.notifications.set([]);
      }
    });
  }

  private loadHiddenTypes(): UserNotificationType[] {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter((t): t is UserNotificationType => ALL_TYPES.includes(t as UserNotificationType));
        }
      }
    } catch {
      // ignore
    }
    return [];
  }

  toggleType(type: UserNotificationType): void {
    this.hiddenTypes.update((hidden) => {
      const idx = hidden.indexOf(type);
      const newHidden = idx === -1 ? [...hidden, type] : hidden.filter((t) => t !== type);

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LS_KEY, JSON.stringify(newHidden));
        }
      } catch {
        // ignore storage write failures so the toggle still works
      }
      return newHidden;
    });
    this.fetchNotifications();
  }

  isTypeVisible(type: UserNotificationType): boolean {
    return !this.hiddenTypes().includes(type);
  }

  fetchNotifications(): void {
    const visible = this.visibleTypes();
    let url = `${environment.apiUrl}/notifications`;
    if (visible.length < ALL_TYPES.length) {
      const params = new URLSearchParams({ types: visible.join(',') });
      url = `${url}?${params.toString()}`;
    }
    this.authService.authenticatedGet<GetNotificationsResponse>(url).subscribe({
      next: (response) => {
        this.notifications.set(response.notifications);
      },
      error: (err) => {
        console.error('[NotificationCenter] Error fetching notifications:', err);
      },
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => this.fetchNotifications(), 60_000);
  }

  private stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  refreshAfterAction(delayMs = 2000): void {
    this.cancelRefreshTimeout();
    this.refreshTimeout = setTimeout(() => {
      this.refreshTimeout = null;
      if (this.authService.isLoggedIn()) {
        this.fetchNotifications();
      }
    }, delayMs);
  }

  private cancelRefreshTimeout(): void {
    if (this.refreshTimeout !== null) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
  }

  markAllRead(): void {
    const now = Date.now();
    this.notifications.update((ns) => ns.map((n) => ({ ...n, readAt: now })));

    const body: MarkNotificationsReadRequest = {};
    this.authService
      .authenticatedPost<{ success: boolean }>(`${environment.apiUrl}/notifications/read`, body)
      .subscribe({
        error: (err) => {
          console.error('[NotificationCenter] Error marking notifications as read:', err);
          // Revert optimistic update by re-fetching
          this.fetchNotifications();
        },
      });
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.cancelRefreshTimeout();
  }
}
