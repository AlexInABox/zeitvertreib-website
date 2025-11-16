import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface UserFakerank {
  steamId: string;
  fakerank: string | null;
  fakerank_color: string | null;
  username: string;
  avatarFull: string;
}

export interface Player {
  id: string;
  steamId: string; // Add for compatibility with template
  personaname: string;
  username: string; // Add for compatibility with template
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  avatarFull: string; // Add for compatibility with template
  fakerank: string;
  fakerank_color: string;
  fakerankallowed: boolean;
  experience: number; // Keep property name for DB compatibility, but represents ZV Coins
  playtime: number;
  roundsplayed: number;
  usedmedkits: number;
  usedcolas: number;
  pocketescapes: number;
  usedadrenaline: number;
  snakehighscore: number;
  killcount: number;
  deathcount: number;
  fakerankadmin: boolean;
  isCurrentlyOnline?: boolean; // Add for compatibility with template
  Team?: string; // Add for playerlist compatibility
}

export interface BlacklistItem {
  id: number;
  word: string;
  createdAt: string;
}

export interface WhitelistItem {
  id: number;
  word: string;
  createdAt: string;
}

export interface PaginatedFakeranks {
  data: Player[];
  totalItems: number;
  currentPage: number;
  totalPages: number;
  // Playerlist metadata
  currentPlayersOnline: number;
  uniquePlayerNames: number;
}

@Injectable({
  providedIn: 'root',
})
export class FakerankAdminService {
  private readonly API_BASE = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) { }

  private getAuthHeaders(): HttpHeaders {
    // Get session token from AuthService
    const token = this.authService.getSessionToken();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private handleError(error: any): Observable<never> {
    console.error('FakerankAdminService error:', error);
    const message =
      error.error?.error || error.message || 'An unknown error occurred';
    return throwError(() => new Error(message));
  }

  // User Fakerank Management
  getUserFakerank(steamId: string): Observable<UserFakerank> {
    const params = new HttpParams().set('steamId', steamId);
    return this.http
      .get<UserFakerank>(`${this.API_BASE}/fakerank-admin/user`, {
        params,
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  setUserFakerank(
    steamId: string,
    fakerank: string,
    fakerank_color: string = 'default',
    isOverride: boolean = false,
    overrideDurationHours: number = 24,
  ): Observable<{ success: boolean }> {
    return this.http
      .post<{ success: boolean }>(
        `${this.API_BASE}/fakerank-admin/user`,
        {
          steamId,
          fakerank,
          fakerank_color,
          isOverride,
          overrideDurationHours,
        },
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  removeUserFakerank(steamId: string): Observable<{ success: boolean }> {
    return this.http
      .post<{ success: boolean }>(
        `${this.API_BASE}/fakerank-admin/user`,
        { steamId, fakerank: null },
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  // Blacklist Management
  getBlacklist(): Observable<{
    blacklistedWords: BlacklistItem[];
    count: number;
  }> {
    return this.http
      .get<{ blacklistedWords: BlacklistItem[]; count: number }>(
        `${this.API_BASE}/fakerank-admin/blacklist`,
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  addToBlacklist(word: string): Observable<{ success: boolean; id: number }> {
    return this.http
      .post<{ success: boolean; id: number }>(
        `${this.API_BASE}/fakerank-admin/blacklist`,
        { word },
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  removeFromBlacklist(word: string): Observable<{ success: boolean }> {
    return this.http
      .delete<{ success: boolean }>(
        `${this.API_BASE}/fakerank-admin/blacklist`,
        {
          body: { word },
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  // Whitelist Management
  getWhitelist(): Observable<{
    whitelistedWords: WhitelistItem[];
    count: number;
  }> {
    return this.http
      .get<{ whitelistedWords: WhitelistItem[]; count: number }>(
        `${this.API_BASE}/fakerank-admin/whitelist`,
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  addToWhitelist(word: string): Observable<{ success: boolean; id: number }> {
    return this.http
      .post<{ success: boolean; id: number }>(
        `${this.API_BASE}/fakerank-admin/whitelist`,
        { word },
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  removeFromWhitelist(word: string): Observable<{ success: boolean }> {
    return this.http
      .delete<{ success: boolean }>(
        `${this.API_BASE}/fakerank-admin/whitelist`,
        {
          body: { word },
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  // All Fakeranks Management
  getAllFakeranks(
    limit: number = 50,
    offset: number = 0,
  ): Observable<PaginatedFakeranks> {
    const params = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    return this.http
      .get<any>(`${this.API_BASE}/fakerank-admin/all-fakeranks`, {
        params,
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(
        map((response) => {
          // Transform backend response to match PaginatedFakeranks interface
          return {
            data: response.users || [],
            totalItems: response.pagination?.total || 0,
            currentPage:
              Math.floor(
                (response.pagination?.offset || 0) /
                (response.pagination?.limit || limit),
              ) + 1,
            totalPages: Math.ceil(
              (response.pagination?.total || 0) /
              (response.pagination?.limit || limit),
            ),
            currentPlayersOnline: response.currentPlayersOnline || 0,
            uniquePlayerNames: response.uniquePlayerNames || 0,
          } as PaginatedFakeranks;
        }),
        catchError(this.handleError),
      );
  }

  // Public Playerlist - Current Round Players
  getCurrentRoundPlayers(): Observable<PlayerlistPlayer[]> {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    const apiUrl = isLocalhost
      ? 'https://dev.zeitvertreib.vip/api/playerlist'
      : `${this.API_BASE}/playerlist`;

    return this.http
      .get<PlayerlistPlayer[]>(apiUrl)
      .pipe(catchError(this.handleError));
  }
}

export interface PlayerlistPlayer {
  Name: string;
  UserId: string;
  Team: string;
  DiscordId?: string;
  AvatarUrl?: string;
  Fakerank?: string;
  FakerankColor?: string;
}
