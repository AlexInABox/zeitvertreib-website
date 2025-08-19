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
  experience: number;
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
    console.log('[AUTH] Initializing AuthService');
    this.loadTokenFromStorage();
    console.log('[AUTH] Token from storage:', this.sessionToken ? 'present' : 'none');
    this.checkForTokenInUrl();
    console.log('[AUTH] Final token after URL check:', this.sessionToken ? 'present' : 'none');
    this.checkAuthStatus();
  }

  private loadTokenFromStorage(): void {
    // Try localStorage first
    this.sessionToken = localStorage.getItem('sessionToken');
    console.log('[AUTH] localStorage token:', this.sessionToken ? 'present' : 'none');
    
    // Fallback to cookies for Safari compatibility
    if (!this.sessionToken) {
      this.sessionToken = this.getSessionTokenFromCookie();
      console.log('[AUTH] Cookie token:', this.sessionToken ? 'present' : 'none');
    }
  }

  private getSessionTokenFromCookie(): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'session') {
        return value;
      }
    }
    return null;
  }

  private checkForTokenInUrl(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const redirectPath = urlParams.get('redirect');

    console.log('[AUTH] URL token:', token ? 'present' : 'none');
    console.log('[AUTH] Redirect path:', redirectPath);

    if (token) {
      this.sessionToken = token;
      
      // Try to store in localStorage, but don't fail if it doesn't work (Safari)
      try {
        localStorage.setItem('sessionToken', token);
        console.log('[AUTH] Successfully stored token in localStorage');
      } catch (error) {
        console.warn('[AUTH] Failed to store session token in localStorage (Safari ITP?), relying on cookie fallback', error);
      }

      // Clean up URL and redirect if needed
      window.history.replaceState({}, document.title, window.location.pathname);

      if (redirectPath) {
        console.log('[AUTH] Redirecting to:', redirectPath);
        window.location.href = redirectPath;
      }
    } else {
      // If no token in URL, check if we have one in cookies (Safari fallback)
      const cookieToken = this.getSessionTokenFromCookie();
      if (cookieToken && !this.sessionToken) {
        console.log('[AUTH] Using cookie token as fallback');
        this.sessionToken = cookieToken;
        // Try to sync to localStorage for future use
        try {
          localStorage.setItem('sessionToken', cookieToken);
        } catch (error) {
          // Ignore localStorage errors in Safari
          console.warn('[AUTH] Could not sync cookie token to localStorage');
        }
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
      console.warn('[AUTH] Could not store token in localStorage');
    }
  }

  checkAuthStatus(): void {
    if (!this.sessionToken) {
      this.currentUserSubject.next(null);
      this.currentUserDataSubject.next(null);
      return;
    }

    this.http
      .get<UserData>(`${environment.apiUrl}/auth/me`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(
        catchError(() => {
          // If request fails, clear token
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
    
    // Also clear the session cookie
    document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/';
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
    const adminFlag = userData?.playerData?.fakerankadmin;
    return adminFlag === true || adminFlag === 1;
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
