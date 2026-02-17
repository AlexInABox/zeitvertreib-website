import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, SteamUser } from '../services/auth.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { SessionsService, SessionInfo } from '../services/sessions.service';
import { TakeoutService } from '../services/takeout.service';
import { DeletionService } from '../services/deletion.service';
import { BirthdayService } from '../services/birthday.service';
import { Subscription } from 'rxjs';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
})
export class ProfileComponent implements OnInit, OnDestroy {
  currentUser: SteamUser | null = null;
  sessions: SessionInfo[] = [];
  loadingSessions = true;
  revokingSession: string | null = null;
  showIps = false;
  private authSubscription?: Subscription;
  private currentSessionToken: string | null = null;
  viewedSteamId: string | null = null;
  // True when this component is rendered for the admin/manage route (/manage/:id)
  isManageView = false;
  private routeSubscription?: Subscription;
  viewedUser: {
    steamId: string;
    username?: string;
    avatarUrl?: string;
    coins?: number;
    discordId?: string | null;
    discordAvatarUrl?: string | null;
    firstSeen?: number;
    lastSeen?: number;
    sprays?: any[];
    sprayBanned?: boolean;
    cases?: any[];
    coinRestriction?: any;
    moderation?: any;
  } | null = null;
  loadingViewedUser = false;

  // Spray edit state
  editingSprayId: number | null = null;
  editingSprayName = '';

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

  // Birthday state
  birthdayDay: number | null = null;
  birthdayMonth: number | null = null;
  birthdayYear: number | null = null;
  birthdayLastUpdated: number | null = null;
  loadingBirthday = true;
  birthdayLoading = false;
  birthdayError = '';
  isEditingBirthday = false;
  editDay: number | null = null;
  editMonth: number | null = null;
  editYear: number | null = null;
  showDeleteConfirm = false;

  private readonly THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  // Router is injected via `inject()` so standalone/component-level DI is stable
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  constructor(
    private authService: AuthService,
    private sessionsService: SessionsService,
    private takeoutService: TakeoutService,
    private deletionService: DeletionService,
    private birthdayService: BirthdayService,
    private http: HttpClient,
  ) {}

  ngOnInit() {
    // Watch for optional :id param (viewing other users)
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      this.viewedSteamId = id;

      // Detect if we are rendered via the admin manage route (/manage/:id)
      // Prefer explicit routeConfig check, fallback to URL check.
      this.isManageView =
        !!this.route.snapshot.routeConfig?.path?.startsWith('manage') || this.router.url.startsWith('/manage');

      if (id) {
        this.fetchViewedUser(id);
      } else {
        this.viewedUser = null;
      }
    });
    this.currentSessionToken = this.authService.getSessionToken();
    this.authSubscription = this.authService.currentUser$.subscribe((user: SteamUser | null) => {
      this.currentUser = user;
      if (!user) {
        this.router.navigate(['/login']);
      } else {
        this.loadSessions();
        this.loadTakeoutStatus();
        this.loadDeletionStatus();
        this.loadBirthday();

        // If we're viewing our own profile but username/avatar were missing earlier, fill them now
        if (this.viewedSteamId) {
          const normalizedParam = this.viewedSteamId.endsWith('@steam')
            ? this.viewedSteamId
            : `${this.viewedSteamId}@steam`;
          const currentId = user.steamId
            ? user.steamId.endsWith('@steam')
              ? user.steamId
              : `${user.steamId}@steam`
            : null;
          if (currentId && normalizedParam === currentId) {
            this.viewedUser = {
              ...this.viewedUser!,
              username: user.username,
              avatarUrl: user.avatarUrl,
            };
          }
        }
      }
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.routeSubscription?.unsubscribe();
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

  private buildAuthHeaders(): HttpHeaders {
    let headers = new HttpHeaders();
    const token = this.authService.getSessionToken();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    return headers;
  }

  private fetchViewedUser(steamId: string) {
    this.viewedUser = { steamId };
    this.loadingViewedUser = true;

    // If viewing the logged-in user, pre-fill name/avatar from AuthService so local dev shows correct info
    const normalizedParam = steamId.endsWith('@steam') ? steamId : `${steamId}@steam`;
    const currentId = this.currentUser?.steamId
      ? this.currentUser.steamId.endsWith('@steam')
        ? this.currentUser.steamId
        : `${this.currentUser.steamId}@steam`
      : null;
    if (currentId && normalizedParam === currentId) {
      this.viewedUser = {
        ...this.viewedUser,
        username: this.currentUser?.username,
        avatarUrl: this.currentUser?.avatarUrl,
      };
    }

    const headers = this.buildAuthHeaders();

    // Fetch enriched profile details from backend
    const profileDetailsUrl = `${environment.apiUrl}/profile-details?steamId=${encodeURIComponent(steamId)}`;

    this.http.get<any>(profileDetailsUrl, { headers, withCredentials: true }).subscribe({
      next: (res) => {
        this.viewedUser = {
          ...this.viewedUser!,
          // keep pre-filled username/avatar if backend doesn't return them
          username: res.username || this.viewedUser?.username,
          avatarUrl: res.avatarUrl || this.viewedUser?.avatarUrl,
          coins: res.coins,
          discordId: res.discordId,
          discordAvatarUrl: res.discordAvatarUrl,
          firstSeen: res.firstSeen,
          lastSeen: res.lastSeen,
          sprays: res.sprays || [],
          sprayBanned: res.sprayBanned,
          cases: res.cases || [],
          coinRestriction: res.coinRestriction,
          moderation: res.moderation,
        };
        this.loadingViewedUser = false;
      },
      error: (err) => {
        console.error('Error fetching profile details:', err);
        // Fallback to old method if /profile-details endpoint doesn't exist yet
        this.fetchViewedUserFallback(steamId);
      },
    });
  }

  private fetchViewedUserFallback(steamId: string) {
    this.viewedUser = { steamId };

    const headers = this.buildAuthHeaders();

    // Try coin-management players endpoint (supports search by steamId)
    const url = `${environment.apiUrl}/coin-management/players?page=1&pageSize=1&search=${encodeURIComponent(steamId)}`;

    this.http.get<{ players: any[] }>(url, { headers, withCredentials: true }).subscribe({
      next: (res) => {
        const p = res.players?.[0];
        if (p) {
          this.viewedUser = {
            ...this.viewedUser!,
            username: p.username,
            avatarUrl: p.avatarUrl,
            coins: p.coins,
          };
        }
      },
      error: () => {
        // ignore - we'll still try playerlist
      },
    });

    // Try playerlist to obtain Discord info (public endpoint)
    this.http.get<any[]>(`${environment.apiUrl}/playerlist`).subscribe({
      next: (list) => {
        if (!Array.isArray(list)) return;
        const match = list.find((it) => {
          const uid = (it.UserId || it.userId || it.userid)?.toString();
          return uid === steamId || uid === `${steamId}@steam` || uid?.includes(steamId);
        });
        if (match) {
          this.viewedUser = {
            ...this.viewedUser!,
            discordId: match.DiscordId || match.discordId || null,
            discordAvatarUrl: match.AvatarUrl || match.avatarUrl || null,
          };
        }
        this.loadingViewedUser = false;
      },
      error: () => {
        this.loadingViewedUser = false;
      },
    });
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

  // Birthday methods
  loadBirthday() {
    this.loadingBirthday = true;
    this.birthdayService.getBirthday().subscribe({
      next: (response) => {
        // Always read lastUpdated from response, even when birthday is null (deleted)
        this.birthdayLastUpdated = response.lastUpdated ?? null;

        if (response.birthday) {
          this.birthdayDay = response.birthday.day;
          this.birthdayMonth = response.birthday.month;
          this.birthdayYear = response.birthday.year ?? null;
        } else {
          this.birthdayDay = null;
          this.birthdayMonth = null;
          this.birthdayYear = null;
        }
        this.loadingBirthday = false;
      },
      error: () => {
        this.birthdayDay = null;
        this.birthdayMonth = null;
        this.birthdayYear = null;
        this.birthdayLastUpdated = null;
        this.loadingBirthday = false;
      },
    });
  }

  hasBirthday(): boolean {
    return this.birthdayDay !== null && this.birthdayMonth !== null;
  }

  isBirthdayEditDisabled(): boolean {
    if (!this.birthdayLastUpdated) return false;
    return Date.now() - this.birthdayLastUpdated < this.THIRTY_DAYS_MS;
  }

  getDaysUntilBirthdayEdit(): number {
    if (!this.birthdayLastUpdated) return 0;
    const nextEditDate = this.birthdayLastUpdated + this.THIRTY_DAYS_MS;
    const diff = nextEditDate - Date.now();
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
    return Math.max(0, days);
  }

  getBirthdayDisplay(): string {
    if (!this.hasBirthday()) return '';
    const dayStr = String(this.birthdayDay).padStart(2, '0');
    const monthStr = String(this.birthdayMonth).padStart(2, '0');
    if (this.birthdayYear) {
      return `${dayStr}. ${this.getMonthName(this.birthdayMonth!)} ${this.birthdayYear}`;
    }
    return `${dayStr}. ${this.getMonthName(this.birthdayMonth!)}`;
  }

  getMonthName(month: number): string {
    const months = [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember',
    ];
    return months[month - 1] || '';
  }

  startEditBirthday() {
    this.isEditingBirthday = true;
    this.editDay = this.birthdayDay;
    this.editMonth = this.birthdayMonth;
    this.editYear = this.birthdayYear;
    this.birthdayError = '';
    this.showDeleteConfirm = false;
  }

  cancelEditBirthday() {
    this.isEditingBirthday = false;
    this.editDay = null;
    this.editMonth = null;
    this.editYear = null;
    this.birthdayError = '';
    this.showDeleteConfirm = false;
  }

  saveBirthday() {
    if (this.birthdayLoading) return;

    if (!this.editDay || !this.editMonth) {
      this.birthdayError = 'Bitte gib Tag und Monat ein';
      return;
    }

    if (this.editDay < 1 || this.editDay > 31) {
      this.birthdayError = 'Tag muss zwischen 1 und 31 liegen';
      return;
    }

    if (this.editMonth < 1 || this.editMonth > 12) {
      this.birthdayError = 'Monat muss zwischen 1 und 12 liegen';
      return;
    }

    const currentYear = new Date().getFullYear();
    if (this.editYear) {
      if (this.editYear < currentYear - 100 || this.editYear > currentYear) {
        this.birthdayError = `Jahr muss zwischen ${currentYear - 100} und ${currentYear} liegen`;
        return;
      }

      // Check if user is at least 18 years old
      const today = new Date();
      const birthDate = new Date(this.editYear, this.editMonth - 1, this.editDay);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 18) {
        this.birthdayError = 'Du musst mindestens 18 Jahre alt sein';
        return;
      }
    }

    this.birthdayLoading = true;
    this.birthdayError = '';

    this.birthdayService.setBirthday(this.editDay, this.editMonth, this.editYear ?? undefined).subscribe({
      next: () => {
        this.birthdayDay = this.editDay;
        this.birthdayMonth = this.editMonth;
        this.birthdayYear = this.editYear ?? null;
        this.birthdayLastUpdated = Date.now();
        this.birthdayLoading = false;
        this.isEditingBirthday = false;
      },
      error: (error) => {
        this.birthdayLoading = false;
        if (error.status === 429) {
          this.birthdayError = 'Dein Geburtstag kann nur alle 30 Tage aktualisiert werden';
        } else if (error.status === 400) {
          this.birthdayError = 'Ungültiges Datum';
        } else {
          this.birthdayError = 'Fehler beim Speichern. Bitte versuche es später erneut.';
        }
      },
    });
  }

  showDeleteBirthdayConfirm() {
    this.showDeleteConfirm = true;
  }

  cancelDeleteBirthday() {
    this.showDeleteConfirm = false;
  }

  deleteBirthday() {
    if (this.birthdayLoading) return;

    this.birthdayLoading = true;
    this.birthdayService.deleteBirthday().subscribe({
      next: () => {
        this.birthdayDay = null;
        this.birthdayMonth = null;
        this.birthdayYear = null;
        this.birthdayLastUpdated = null;
        this.birthdayLoading = false;
        this.isEditingBirthday = false;
        this.showDeleteConfirm = false;
      },
      error: () => {
        this.birthdayLoading = false;
        this.birthdayError = 'Fehler beim Löschen. Bitte versuche es später erneut.';
      },
    });
  }

  isUnder18(): boolean {
    if (!this.editYear || !this.editMonth || !this.editDay) return false;
    const today = new Date();
    const birthDate = new Date(this.editYear, this.editMonth - 1, this.editDay);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age < 18;
  }

  getDaysInMonth(month: number, year?: number): number {
    const y = year || 2000; // Use leap year by default to allow Feb 29
    return new Date(y, month, 0).getDate();
  }

  // Admin methods
  deleteSpray(sprayId: number) {
    if (!confirm('Wirklich löschen?')) return;

    const headers = this.buildAuthHeaders();
    const url = `${environment.apiUrl}/profile-details/spray?steamId=${encodeURIComponent(
      this.viewedSteamId!,
    )}&sprayId=${sprayId}`;

    this.http.delete(url, { headers, withCredentials: true }).subscribe({
      next: () => {
        if (this.viewedUser?.sprays) {
          this.viewedUser.sprays = this.viewedUser.sprays.filter((s) => s.id !== sprayId);
        }
      },
      error: (err) => {
        alert('Fehler beim Löschen des Sprays');
        console.error('Error deleting spray:', err);
      },
    });
  }

  // Spray editing (admin)
  startEditSpray(spray: any) {
    this.editingSprayId = spray.id;
    this.editingSprayName = spray.name || '';
  }

  cancelEditSpray() {
    this.editingSprayId = null;
    this.editingSprayName = '';
  }

  saveSprayEdit(sprayId: number) {
    if (!this.viewedSteamId) return;
    const name = this.editingSprayName.trim();
    if (!name) return alert('Name darf nicht leer sein');

    const headers = this.buildAuthHeaders();
    const url = `${environment.apiUrl}/profile-details/spray`;

    this.http.patch(url, { steamId: this.viewedSteamId, sprayId, name }, { headers, withCredentials: true }).subscribe({
      next: (res: any) => {
        if (this.viewedUser?.sprays) {
          this.viewedUser.sprays = this.viewedUser.sprays.map((s) => (s.id === sprayId ? { ...s, name } : s));
        }
        this.cancelEditSpray();
      },
      error: (err) => {
        alert('Fehler beim Speichern der Änderungen');
        console.error('Error updating spray:', err);
      },
    });
  }

  setCoinRestriction(restrictedUntil: number, reason: string) {
    if (!this.viewedSteamId) return;

    const headers = this.buildAuthHeaders();
    const url = `${environment.apiUrl}/profile-details/coin-restriction`;

    this.http.post(url, { steamId: this.viewedSteamId, restrictedUntil, reason }, { headers, withCredentials: true }).subscribe({
      next: () => {
        alert('Coin-Beschränkung gespeichert');
        // Reload user data
        this.fetchViewedUser(this.viewedSteamId!);
      },
      error: (err) => {
        alert('Fehler beim Speichern der Coin-Beschränkung');
        console.error('Error setting coin restriction:', err);
      },
    });
  }

  linkCase(caseId: string) {
    if (!this.viewedSteamId) return;

    const headers = this.buildAuthHeaders();

    this.http
      .post(`${environment.apiUrl}/cases/link-user`, { caseId, steamId: this.viewedSteamId }, { headers, withCredentials: true })
      .subscribe({
        next: () => {
          alert('Case verlinkt');
          // Reload user data
          this.fetchViewedUser(this.viewedSteamId!);
        },
        error: (err) => {
          alert('Fehler beim Verlinken des Cases');
          console.error('Error linking case:', err);
        },
      });
  }

  getDateDisplay(timestamp?: number): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
