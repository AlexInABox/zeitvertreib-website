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

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private currentUserSubject = new BehaviorSubject<SteamUser | null>(null);
    public currentUser$ = this.currentUserSubject.asObservable();
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
        if (token) {
            this.sessionToken = token;
            localStorage.setItem('sessionToken', token);
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

    checkAuthStatus(): void {
        if (!this.sessionToken) {
            this.currentUserSubject.next(null);
            return;
        }

        this.http.get<{ user: SteamUser }>(`${environment.apiUrl}/auth/me`, {
            headers: this.getAuthHeaders(),
            withCredentials: true
        })
            .pipe(
                catchError(() => {
                    // If request fails, clear token
                    this.clearToken();
                    return of(null);
                })
            )
            .subscribe(response => {
                this.currentUserSubject.next(response?.user || null);
            });
    }

    private clearToken(): void {
        this.sessionToken = null;
        localStorage.removeItem('sessionToken');
    }

    login(): void {
        window.location.href = `${environment.apiUrl}/auth/steam`;
    }

    logout(): Observable<any> {
        return this.http.post(`${environment.apiUrl}/auth/logout`, {}, {
            headers: this.getAuthHeaders(),
            withCredentials: true
        }).pipe(
            catchError(() => of(null))
        );
    }

    performLogout(): void {
        this.logout().subscribe(() => {
            this.clearToken();
            this.currentUserSubject.next(null);
        });
    }

    isLoggedIn(): boolean {
        return this.currentUserSubject.value !== null;
    }

    getCurrentUser(): SteamUser | null {
        return this.currentUserSubject.value;
    }
}
