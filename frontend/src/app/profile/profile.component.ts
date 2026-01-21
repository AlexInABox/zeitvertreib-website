import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService, SteamUser } from '../services/auth.service';
import { SessionsService, SessionInfo } from '../services/sessions.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile',
  imports: [CommonModule],
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

  constructor(
    private authService: AuthService,
    private sessionsService: SessionsService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.currentSessionToken = this.authService.getSessionToken();
    this.authSubscription = this.authService.currentUser$.subscribe((user: SteamUser | null) => {
      this.currentUser = user;
      if (!user) {
        this.router.navigate(['/login']);
      } else {
        this.loadSessions();
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
        this.revokingSession = null;
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
}
