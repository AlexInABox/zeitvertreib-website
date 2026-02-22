import { Injectable, inject, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import type { ZvcGetResponse } from '@zeitvertreib/types';

@Injectable({ providedIn: 'root' })
export class ZvcService implements OnDestroy {
  private balanceSubject = new BehaviorSubject<number>(0);

  /** Observable stream of the current ZVC balance. */
  public balance$ = this.balanceSubject.asObservable();

  /** Whether the initial balance has been loaded at least once. */
  public loaded = false;

  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private pauseUntil: number = 0;
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private currentSteamId: string | null = null;

  constructor() {
    // Subscribe to auth state – start/stop polling when login status changes
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.currentSteamId = user.steamId;
        console.log('[ZvcService] User logged in, steamId:', user.steamId);
        this.fetchBalance();
        this.startPolling();
      } else {
        this.currentSteamId = null;
        console.log('[ZvcService] User logged out, stopping polling');
        this.stopPolling();
        this.balanceSubject.next(0);
        this.loaded = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /** Get the current balance synchronously. */
  get balance(): number {
    return this.balanceSubject.value;
  }

  /** Directly set a new balance value (e.g. after a game payout). */
  setBalance(value: number): void {
    console.log('[ZvcService] setBalance called with:', value);
    this.balanceSubject.next(value);
    this.loaded = true;
  }

  /** Add or subtract from the current balance. */
  adjustBalance(delta: number): void {
    this.balanceSubject.next(this.balanceSubject.value + delta);
  }

  /** Pause periodic balance fetching for a set duration (e.g. during game animations). */
  pausePolling(durationMs: number): void {
    this.pauseUntil = Date.now() + durationMs;
    console.log('[ZvcService] pausePolling for', durationMs, 'ms until', new Date(this.pauseUntil).toISOString());
  }

  /** Fetch balance from the GET /zvc endpoint. */
  fetchBalance(): void {
    if (!this.currentSteamId) {
      console.log('[ZvcService] fetchBalance skipped — no steamId');
      return;
    }

    if (Date.now() < this.pauseUntil) {
      console.log('[ZvcService] fetchBalance skipped — polling paused until', new Date(this.pauseUntil).toISOString());
      return;
    }

    const url = `${environment.apiUrl}/zvc`;
    console.log('[ZvcService] fetchBalance → GET', url, 'userId=', this.currentSteamId);

    this.http
      .get<ZvcGetResponse>(url, {
        params: { userId: this.currentSteamId },
      })
      .subscribe({
        next: (response) => {
          console.log('[ZvcService] fetchBalance response:', JSON.stringify(response));
          if (response?.users?.length > 0) {
            const zvc = response.users[0].zvc ?? 0;
            console.log('[ZvcService] resolved ZVC balance:', zvc);
            this.balanceSubject.next(zvc);
            this.loaded = true;
          } else {
            console.warn('[ZvcService] fetchBalance — no users in response');
          }
        },
        error: (err) => {
          console.error('[ZvcService] fetchBalance failed:', err);
        },
      });
  }

  private startPolling(): void {
    this.stopPolling();
    this.refreshInterval = setInterval(() => {
      this.fetchBalance();
    }, 15_000);
  }

  private stopPolling(): void {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}
