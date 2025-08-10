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

export interface FakerankUser {
  steamId: string;
  username: string;
  fakerank: string;
  fakerank_color: string;
  fakerankallowed: boolean;
  experience: number;
  // Current session info
  currentHealth: number | null;
  currentTeam: string | null;
  isCurrentlyOnline: boolean;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  // Legacy compatibility (can be removed if not needed)
  avatarFull?: string;
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
  data: FakerankUser[];
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
  private readonly API_BASE = environment.production
    ? 'https://zeitvertreib-website-backend.alexinabox.workers.dev'
    : 'http://localhost:8787';

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
  ): Observable<{ success: boolean }> {
    return this.http
      .post<{ success: boolean }>(
        `${this.API_BASE}/fakerank-admin/user`,
        { steamId, fakerank, fakerank_color },
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
}
