import { Injectable, OnDestroy, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import type { GetNotificationsResponse, UserNotification, MarkNotificationsReadRequest } from '@zeitvertreib/types';

@Injectable({ providedIn: 'root' })
export class NotificationCenterService implements OnDestroy {
  private authService = inject(AuthService);
  private http = inject(HttpClient);

  notifications = signal<UserNotification[]>([]);
  unreadCount = computed(() => this.notifications().filter((n) => !n.read).length);

  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.fetchNotifications();
        this.startPolling();
      } else {
        this.stopPolling();
        this.notifications.set([]);
      }
    });
  }

  fetchNotifications(): void {
    this.authService
      .authenticatedGet<GetNotificationsResponse>(`${environment.apiUrl}/notifications`)
      .subscribe({
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
    setTimeout(() => this.fetchNotifications(), delayMs);
  }

  markAllRead(): void {
    // Optimistic update
    this.notifications.update((ns) => ns.map((n) => ({ ...n, read: true })));

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
  }
}
