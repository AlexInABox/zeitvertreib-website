import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SteamUser {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
}

export interface PlayerData {
  id: string;
  experience: number;  // Keep property name for DB compatibility, but represents ZV Coins
  playtime: number;
  roundsplayed: number;
  usedmedkits: number;
  usedcolas: number;
  pocketescapes: number;
  usedadrenaline: number;
  fakerank: string;
  snakehighscore: number;
  killcount: number;
  deathcount: number;
  fakerankallowed: boolean | number;
  fakerank_color: string;
  fakerankadmin: boolean | number;
  fakerank_until?: number;  // Unix timestamp for fakerank expiration
  fakerankadmin_until?: number;  // Unix timestamp for fakerank admin expiration
  redeemed_codes?: string;
}

export interface UserData {
  user: SteamUser;
  playerData: PlayerData | null;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<SteamUser | null>(null);
  private currentUserDataSubject = new BehaviorSubject<UserData | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  public currentUserData$ = this.currentUserDataSubject.asObservable();
  private sessionToken: string | null = null;

  constructor(private http: HttpClient) {
    this.loadTokenFromStorage();
    this.checkForTokenInUrl();
    this.checkAuthStatus();
  }

  private loadTokenFromStorage(): void {
    this.sessionToken = localStorage.getItem('sessionToken');
  }

  private checkForTokenInUrl(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const redirectPath = urlParams.get('redirect');

    if (token) {
      this.sessionToken = token;

      try {
        localStorage.setItem('sessionToken', token);
      } catch (error) {
        console.warn('[AUTH] Failed to store session token in localStorage (Safari ITP?)', error);
      }

      // Clean up URL and redirect if needed
      window.history.replaceState({}, document.title, window.location.pathname);

      if (redirectPath) {
        window.location.href = redirectPath;
      }
    }
  }

  private getAuthHeaders(): HttpHeaders {
    let headers = new HttpHeaders();
    if (this.sessionToken) {
      headers = headers.set('Authorization', `Bearer ${this.sessionToken}`);
    }
    return headers;
  }

  public getSessionToken(): string | null {
    return this.sessionToken;
  }

  public setSessionToken(token: string): void {
    this.sessionToken = token;
    try {
      localStorage.setItem('sessionToken', token);
    } catch (error) {
      // Ignore localStorage errors
    }
  }

  checkAuthStatus(): void {
    this.http
      .get<UserData>(`${environment.apiUrl}/auth/me`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(
        catchError((error) => {
          this.clearToken();
          return of(null);
        }),
      )
      .subscribe((response) => {
        if (response?.user) {
          this.currentUserSubject.next(response.user);
          this.currentUserDataSubject.next(response);
        } else {
          this.currentUserSubject.next(null);
          this.currentUserDataSubject.next(null);
        }
      });
  }

  private clearToken(): void {
    this.sessionToken = null;
    try {
      localStorage.removeItem('sessionToken');
    } catch (error) {
      // Ignore localStorage errors
    }
  }

  login(redirectPath: string = '/'): void {
    const encodedRedirectPath = encodeURIComponent(redirectPath);
    window.location.href = `${environment.apiUrl}/auth/steam?redirect=${encodedRedirectPath}`;
  }

  logout(): Observable<any> {
    return this.authenticatedPost(`${environment.apiUrl}/auth/logout`).pipe(
      catchError(() => of(null)),
    );
  }

  performLogout(): void {
    this.logout().subscribe(() => {
      this.clearToken();
      this.currentUserSubject.next(null);
      this.currentUserDataSubject.next(null);
    });
  }

  isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null;
  }

  getCurrentUser(): SteamUser | null {
    return this.currentUserSubject.value;
  }

  getCurrentUserData(): UserData | null {
    return this.currentUserDataSubject.value;
  }

  isFakerankAdmin(): boolean {
    const userData = this.currentUserDataSubject.value;
    const fakerankAdminUntil = userData?.playerData?.fakerankadmin_until;

    // Check if user has admin access based on unix timestamp
    if (!fakerankAdminUntil || fakerankAdminUntil === 0) {
      return false;
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    return currentTimestamp < fakerankAdminUntil;
  }

  // Get remaining fakerank admin access time in seconds
  getFakerankAdminTimeRemaining(): number {
    const userData = this.currentUserDataSubject.value;
    const fakerankAdminUntil = userData?.playerData?.fakerankadmin_until;

    if (!fakerankAdminUntil || fakerankAdminUntil === 0) {
      return 0;
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    return Math.max(0, fakerankAdminUntil - currentTimestamp);
  }

  // Get remaining fakerank access time in seconds
  getFakerankTimeRemaining(): number {
    const userData = this.currentUserDataSubject.value;
    const fakerankUntil = userData?.playerData?.fakerank_until;

    if (!fakerankUntil || fakerankUntil === 0) {
      return 0;
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    return Math.max(0, fakerankUntil - currentTimestamp);
  }

  // Check if user has fakerank access
  hasFakerankAccess(): boolean {
    return this.getFakerankTimeRemaining() > 0;
  }

  // Helper method for making authenticated API calls
  authenticatedGet<T>(url: string): Observable<T> {
    return this.http.get<T>(url, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  authenticatedPost<T>(url: string, body?: any): Observable<T> {
    return this.http.post<T>(url, body, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  authenticatedDelete<T>(url: string): Observable<T> {
    return this.http.delete<T>(url, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  // Helper method for binary responses like images
  authenticatedGetBlob(url: string): Observable<Blob> {
    return this.http.get(url, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
      responseType: 'blob',
    });
  }
}
