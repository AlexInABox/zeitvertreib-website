import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

    constructor(private http: HttpClient) {
        this.checkAuthStatus();
    }

    checkAuthStatus(): void {
        this.http.get<{ user: SteamUser }>(`${environment.apiUrl}/auth/me`, { withCredentials: true })
            .pipe(
                catchError(() => of(null))
            )
            .subscribe(response => {
                this.currentUserSubject.next(response?.user || null);
            });
    }

    login(): void {
        window.location.href = `${environment.apiUrl}/auth/steam`;
    }

    logout(): Observable<any> {
        return this.http.post(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true });
    }

    isLoggedIn(): boolean {
        return this.currentUserSubject.value !== null;
    }

    getCurrentUser(): SteamUser | null {
        return this.currentUserSubject.value;
    }
}
