import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';
import type { SteamUser, PlayerData, GetUserResponse } from '@zeitvertreib/types';

// Re-export types for backwards compatibility
export type { SteamUser, PlayerData, GetUserResponse } from '@zeitvertreib/types';

// UserData is now an alias for GetUserResponse for backwards compatibility
export type UserData = GetUserResponse;

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<SteamUser | null>(null);
  private currentUserDataSubject = new BehaviorSubject<GetUserResponse | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  public currentUserData$ = this.currentUserDataSubject.asObservable();
  private sessionToken: string | null = null;

  constructor(private http: HttpClient) {
    this.loadTokenFromStorage();
    this.checkForTokenInUrl();
    this.checkForLoginSecret();
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

  private checkForLoginSecret(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const loginSecret = urlParams.get('loginSecret');

    if (loginSecret) {
      // Attempt to login with the secret
      this.loginWithSecret(loginSecret);

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
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
      .get<GetUserResponse>(`${environment.apiUrl}/auth/me`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(
        catchError((_error) => {
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

  // Public method to refresh user data
  refreshUserData(): void {
    if (!this.sessionToken) {
      return;
    }

    this.http
      .get<GetUserResponse>(`${environment.apiUrl}/auth/me`, {
        headers: this.getAuthHeaders(),
        withCredentials: true,
      })
      .pipe(
        catchError((error) => {
          console.error('Error refreshing user data:', error);
          return of(null);
        }),
      )
      .subscribe((response) => {
        if (response?.user) {
          this.currentUserSubject.next(response.user);
          this.currentUserDataSubject.next(response);
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
    window.location.href = `${environment.apiUrl}/auth/discord?redirect=${encodedRedirectPath}`;
  }

  logout(): Observable<any> {
    return this.authenticatedPost(`${environment.apiUrl}/auth/logout`).pipe(catchError(() => of(null)));
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

  getCurrentUserData(): GetUserResponse | null {
    return this.currentUserDataSubject.value;
  }

  isFakerankAdmin(): boolean {
    const userData = this.currentUserDataSubject.value;
    // Use the isModerator field from backend instead of fakerankadmin_until
    return userData?.isModerator ?? false;
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

  // Check if user has an override fakerank (read-only)
  hasFakerankOverride(): boolean {
    const userData = this.currentUserDataSubject.value;
    const fakerankOverrideUntil = userData?.playerData?.fakerankoverride_until;

    if (!fakerankOverrideUntil || fakerankOverrideUntil === 0) {
      return false;
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    return currentTimestamp < fakerankOverrideUntil;
  }

  // Check if user is a donator
  isDonator(): boolean {
    const userData = this.currentUserDataSubject.value;
    return userData?.isDonator ?? false;
  }

  // Check if user is spray banned
  isSprayBanned(): boolean {
    const userData = this.currentUserDataSubject.value;
    return userData?.isSprayBanned ?? false;
  }

  // Get spray ban reason
  getSprayBanReason(): string | null {
    const userData = this.currentUserDataSubject.value;
    return userData?.sprayBanReason ?? null;
  }

  // Get username of moderator who banned the user
  getSprayBannedBy(): string | null {
    const userData = this.currentUserDataSubject.value;
    return userData?.sprayBannedBy ?? null;
  }

  isFakerankBanned(): boolean {
    const userData = this.currentUserDataSubject.value;
    return userData?.isFakerankBanned ?? false;
  }

  getFakerankBanReason(): string | null {
    const userData = this.currentUserDataSubject.value;
    return userData?.fakerankBanReason ?? null;
  }

  getFakerankBannedBy(): string | null {
    const userData = this.currentUserDataSubject.value;
    return userData?.fakerankBannedBy ?? null;
  }

  // Get remaining fakerank override time in seconds
  getFakerankOverrideTimeRemaining(): number {
    const userData = this.currentUserDataSubject.value;
    const fakerankOverrideUntil = userData?.playerData?.fakerankoverride_until;

    if (!fakerankOverrideUntil || fakerankOverrideUntil === 0) {
      return 0;
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    return Math.max(0, fakerankOverrideUntil - currentTimestamp);
  }

  // Check if user can edit their fakerank
  // Can edit if: has regular access OR has only override access (but not both)
  // If user has regular access, they can always edit (even with override)
  canEditFakerank(): boolean {
    const hasRegularAccess = this.hasFakerankAccess();
    const hasOverrideAccess = this.hasFakerankOverride();

    // Can edit if has regular access OR has override access (or both)
    return hasRegularAccess || hasOverrideAccess;
  }

  // Check if the fakerank is readonly (override only, no regular access)
  isFakerankReadOnly(): boolean {
    const hasRegularAccess = this.hasFakerankAccess();
    const hasOverrideAccess = this.hasFakerankOverride();

    // Read-only if has override but no regular access
    return hasOverrideAccess && !hasRegularAccess;
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

  authenticatedDelete<T>(url: string, body?: any): Observable<T> {
    return this.http.delete<T>(url, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
      body: body,
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

  // Login using a login secret
  private loginWithSecret(secret: string): void {
    this.http
      .get<{ success: boolean; sessionId: string; user: SteamUser }>(
        `${environment.apiUrl}/auth/login-with-secret?secret=${secret}`,
        {
          withCredentials: true,
        },
      )
      .pipe(
        catchError((error) => {
          console.error('[AUTH] Login with secret failed:', error);
          return of(null);
        }),
      )
      .subscribe((response) => {
        if (response?.success && response.sessionId) {
          this.sessionToken = response.sessionId;
          try {
            localStorage.setItem('sessionToken', response.sessionId);
          } catch (error) {
            console.warn('[AUTH] Failed to store session token in localStorage (Safari ITP?)', error);
          }

          this.currentUserSubject.next(response.user);
          this.checkAuthStatus(); // Refresh full user data
        }
      });
  }
}
