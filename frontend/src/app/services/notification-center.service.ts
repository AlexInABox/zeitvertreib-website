import { Injectable, OnDestroy, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import type { GetNotificationsResponse, UserNotification, MarkNotificationsReadRequest } from '@zeitvertreib/types';

@Injectable({ providedIn: 'root' })
export class NotificationCenterService implements OnDestroy {
  private authService = inject(AuthService);

  notifications = signal<UserNotification[]>([]);
  unreadCount = signal<number>(0);

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
        this.unreadCount.set(0);
      }
    });
  }

  fetchNotifications(): void {
    this.authService.authenticatedGet<GetNotificationsResponse>(`${environment.apiUrl}/notifications`).subscribe({
      next: (response) => {
        this.notifications.set(response.notifications);
        this.unreadCount.set(response.unreadCount);
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
    // Optimistic update
    this.notifications.update((ns) => ns.map((n) => ({ ...n, read: true })));
    this.unreadCount.set(0);

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
