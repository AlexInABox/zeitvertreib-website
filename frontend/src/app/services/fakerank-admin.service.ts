import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type {
  UserFakerank,
  BlacklistItem,
  WhitelistItem,
  GetBlacklistResponse,
  GetWhitelistResponse,
  AddToBlacklistResponse,
  AddToWhitelistResponse,
  RemoveFromBlacklistResponse,
  RemoveFromWhitelistResponse,
  FakerankColor,
} from '@zeitvertreib/types';

// Re-export types for backwards compatibility
export type { UserFakerank, BlacklistItem, WhitelistItem, FakerankColor } from '@zeitvertreib/types';

// Player interface for template compatibility - allows string for fakerank_color (for hex colors)
export interface Player {
  id: string;
  steamId: string;
  personaname: string;
  username: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  avatarFull: string;
  fakerank: string | null;
  fakerank_color: string; // Can be FakerankColor or hex string
  fakerankallowed: boolean;
  experience: number;
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
  isCurrentlyOnline?: boolean;
  Team?: string;
}

export interface PaginatedFakeranks {
  data: Player[];
  totalItems: number;
  currentPage: number;
  totalPages: number;
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
  ) {}

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
    const message = error.error?.error || error.message || 'An unknown error occurred';
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
  getBlacklist(): Observable<GetBlacklistResponse> {
    return this.http
      .get<GetBlacklistResponse>(`${this.API_BASE}/fakerank-admin/blacklist`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  addToBlacklist(word: string): Observable<AddToBlacklistResponse> {
    return this.http
      .post<AddToBlacklistResponse>(
        `${this.API_BASE}/fakerank-admin/blacklist`,
        { word },
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  removeFromBlacklist(word: string): Observable<RemoveFromBlacklistResponse> {
    return this.http
      .delete<RemoveFromBlacklistResponse>(`${this.API_BASE}/fakerank-admin/blacklist`, {
        body: { word },
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  // Whitelist Management
  getWhitelist(): Observable<GetWhitelistResponse> {
    return this.http
      .get<GetWhitelistResponse>(`${this.API_BASE}/fakerank-admin/whitelist`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  addToWhitelist(word: string): Observable<AddToWhitelistResponse> {
    return this.http
      .post<AddToWhitelistResponse>(
        `${this.API_BASE}/fakerank-admin/whitelist`,
        { word },
        {
          headers: this.getAuthHeaders(),
          withCredentials: true,
        },
      )
      .pipe(catchError(this.handleError));
  }

  removeFromWhitelist(word: string): Observable<RemoveFromWhitelistResponse> {
    return this.http
      .delete<RemoveFromWhitelistResponse>(`${this.API_BASE}/fakerank-admin/whitelist`, {
        body: { word },
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  // All Fakeranks Management
  getAllFakeranks(limit: number = 50, offset: number = 0): Observable<PaginatedFakeranks> {
    const params = new HttpParams().set('limit', limit.toString()).set('offset', offset.toString());

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
            currentPage: Math.floor((response.pagination?.offset || 0) / (response.pagination?.limit || limit)) + 1,
            totalPages: Math.ceil((response.pagination?.total || 0) / (response.pagination?.limit || limit)),
            currentPlayersOnline: response.currentPlayersOnline || 0,
            uniquePlayerNames: response.uniquePlayerNames || 0,
          } as PaginatedFakeranks;
        }),
        catchError(this.handleError),
      );
  }

  // Public Playerlist - Current Round Players
  getCurrentRoundPlayers(): Observable<PlayerlistPlayer[]> {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiUrl = isLocalhost ? 'https://dev.zeitvertreib.vip/api/playerlist' : `${this.API_BASE}/playerlist`;

    return this.http.get<PlayerlistPlayer[]>(apiUrl).pipe(catchError(this.handleError));
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
