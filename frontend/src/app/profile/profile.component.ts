import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, SteamUser } from '../services/auth.service';
import { SessionsService, SessionInfo } from '../services/sessions.service';
import { TakeoutService } from '../services/takeout.service';
import { DeletionService } from '../services/deletion.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit, OnDestroy {
  currentUser: SteamUser | null = null;
  sessions: SessionInfo[] = [];
  loadingSessions = true;
  revokingSession: string | null = null;
  showIps = false;
  private authSubscription?: Subscription;
  private currentSessionToken: string | null = null;

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

  private readonly THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private authService: AuthService,
    private sessionsService: SessionsService,
    private takeoutService: TakeoutService,
    private deletionService: DeletionService,
    private router: Router,
  ) { }

  ngOnInit() {
    this.currentSessionToken = this.authService.getSessionToken();
    this.authSubscription = this.authService.currentUser$.subscribe((user: SteamUser | null) => {
      this.currentUser = user;
      if (!user) {
        this.router.navigate(['/login']);
      } else {
        this.loadSessions();
        this.loadTakeoutStatus();
        this.loadDeletionStatus();
      }
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }

  loadSessions() {
    this.loadingSessions = true;
    this.sessionsService.getSessions().subscribe({
      next: (response) => {
        this.sessions = response.sessions.sort((a, b) => b.lastLoginAt - a.lastLoginAt);
        this.loadingSessions = false;
      },
      error: () => {
        this.sessions = [];
        this.loadingSessions = false;
      },
    });
  }

  isCurrentSession(sessionId: string): boolean {
    return sessionId === this.currentSessionToken;
  }

  revokeSession(sessionId: string) {
    this.revokingSession = sessionId;
    this.sessionsService.deleteSessions([sessionId]).subscribe({
      next: () => {
        this.sessions = this.sessions.filter((s) => s.id !== sessionId);
        const isCurrent = this.isCurrentSession(sessionId);
        this.revokingSession = null;
        if (isCurrent) {
          this.authService.performLogout();
          this.router.navigate(['/login']);
        }
      },
      error: () => {
        this.revokingSession = null;
      },
    });
  }

  getDeviceIcon(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return '📱';
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return '📱';
    }
    return '💻';
  }

  getBrowserName(userAgent: string): string {
    const ua = userAgent.toLowerCase();
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('edg')) return 'Edge';
    if (ua.includes('chrome')) return 'Chrome';
    if (ua.includes('safari')) return 'Safari';
    if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
    if (ua === 'unknown') return 'Unbekannt';
    return 'Browser';
  }

  toggleIps() {
    this.showIps = !this.showIps;
  }

  getIpDisplay(ip: string): string {
    if (ip === 'Unknown' || !ip) return 'Unbekannte IP';
    if (this.showIps) return ip;
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
    // IPv6 or other format
    return ip.substring(0, 8) + '***';
  }

  getRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Gerade eben';
    if (minutes < 60) return `vor ${minutes} Min.`;
    if (hours < 24) return `vor ${hours} Std.`;
    if (days < 7) return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
    if (days < 30) return `vor ${Math.floor(days / 7)} Woche${Math.floor(days / 7) > 1 ? 'n' : ''}`;
    return `vor ${Math.floor(days / 30)} Monat${Math.floor(days / 30) > 1 ? 'en' : ''}`;
  }

  isStale(lastLoginAt: number): boolean {
    const daysSinceLastLogin = (Date.now() - lastLoginAt) / 86400000;
    return daysSinceLastLogin > 7;
  }

  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  logout() {
    this.authService.performLogout();
    this.router.navigate(['/']);
  }

  // Takeout methods
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

  getNextTakeoutDate(): Date | null {
    if (this.lastTakeoutAt === 0) return null;
    return new Date(this.lastTakeoutAt + this.THIRTY_DAYS_MS);
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

  // Deletion methods
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

  getUserId(): string {
    return this.currentUser?.steamId || 'FEHLER. KEINE USER ID. KONTAKTIERE DEN SUPPORT.';
  }
}
