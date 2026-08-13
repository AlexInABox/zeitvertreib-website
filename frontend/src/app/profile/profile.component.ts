import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService, SteamUser } from '../services/auth.service';
import { environment } from '../../environments/environment';

import { ProfileHeroComponent } from './widgets/profile-hero/profile-hero.component';
import { MinecraftLinkComponent } from './widgets/minecraft-link/minecraft-link.component';
import { BirthdayCardComponent } from './widgets/birthday-card/birthday-card.component';
import { ActiveSessionsComponent } from './widgets/active-sessions/active-sessions.component';
import { DataManagementComponent } from './widgets/data-management/data-management.component';
import { ModerationSummaryComponent } from './widgets/moderation-summary/moderation-summary.component';
import { UserCasesComponent } from './widgets/user-cases/user-cases.component';
import { SpraysListComponent } from './widgets/sprays-list/sprays-list.component';
import { CoinRestrictionComponent } from './widgets/coin-restriction/coin-restriction.component';

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [
    CommonModule,
    RouterModule,
    ProfileHeroComponent,
    MinecraftLinkComponent,
    BirthdayCardComponent,
    ActiveSessionsComponent,
    DataManagementComponent,
    ModerationSummaryComponent,
    UserCasesComponent,
    SpraysListComponent,
    CoinRestrictionComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  encapsulation: ViewEncapsulation.None,
})
export class ProfileComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  currentUser: SteamUser | null = null;
  viewedSteamId: string | null = null;
  isManageView = false;
  loadingViewedUser = false;

  private authSubscription?: Subscription;
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
    createdCases?: any[];
    coinRestriction?: any;
    moderation?: any;
  } | null = null;

  ngOnInit() {
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      this.viewedSteamId = id;
      this.isManageView =
        !!this.route.snapshot.routeConfig?.path?.startsWith('manage') || this.router.url.startsWith('/manage');

      if (id) {
        this.fetchViewedUser(id);
      } else {
        this.viewedUser = null;
      }
    });

    this.authSubscription = this.authService.currentUser$.subscribe((user: SteamUser | null) => {
      this.currentUser = user;
      if (!user && !this.viewedSteamId) {
        this.router.navigate(['/login']);
      } else if (user && this.viewedSteamId) {
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
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.routeSubscription?.unsubscribe();
  }

  logout() {
    this.authService.performLogout();
    this.router.navigate(['/']);
  }

  onSprayDeleted(sprayId: number) {
    if (this.viewedUser?.sprays) {
      this.viewedUser.sprays = this.viewedUser.sprays.filter((s) => s.id !== sprayId);
    }
  }

  onSprayUpdated(event: { id: number; name: string }) {
    if (this.viewedUser?.sprays) {
      this.viewedUser.sprays = this.viewedUser.sprays.map((s) => (s.id === event.id ? { ...s, name: event.name } : s));
    }
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
    const profileDetailsUrl = `${environment.apiUrl}/profile-details?steamId=${encodeURIComponent(steamId)}`;

    this.http.get<any>(profileDetailsUrl, { headers, withCredentials: true }).subscribe({
      next: (res) => {
        this.viewedUser = {
          ...this.viewedUser!,
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
          createdCases: res.createdCases || [],
          coinRestriction: res.coinRestriction,
          moderation: res.moderation,
        };
        this.loadingViewedUser = false;
      },
      error: (err) => {
        console.error('Error fetching profile details:', err);
        this.fetchViewedUserFallback(steamId);
      },
    });
  }

  private fetchViewedUserFallback(steamId: string) {
    this.viewedUser = { steamId };
    const headers = this.buildAuthHeaders();
    const url = `${environment.apiUrl}/user-management/players?page=1&pageSize=1&search=${encodeURIComponent(steamId)}`;

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
      error: () => {},
    });

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
}
