import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { ZeitGetResponse } from '@zeitvertreib/types';

@Injectable({
    providedIn: 'root',
})
export class ZeitService {
    private partnerApiKey: string | null = null;

    constructor(
        private http: HttpClient,
        private authService: AuthService,
    ) { }

    setPartnerApiKey(key: string | null): void {
        this.partnerApiKey = key;
    }

    getPartnerApiKey(): string | null {
        return this.partnerApiKey;
    }

    private getHeaders(): HttpHeaders {
        let headers = new HttpHeaders();
        const token = this.authService.getSessionToken();

        if (this.partnerApiKey) {
            headers = headers.set('Authorization', `ApiKey ${this.partnerApiKey}`);
        } else if (token) {
            headers = headers.set('Authorization', `Bearer ${token}`);
        }

        return headers;
    }

    queryBySteamId(steamId: string): Observable<ZeitGetResponse> {
        return this.http.get<ZeitGetResponse>(`${environment.apiUrl}/zeit?steamid=${encodeURIComponent(steamId)}`, {
            headers: this.getHeaders(),
            withCredentials: true,
        });
    }

    queryByDiscordId(discordId: string): Observable<ZeitGetResponse> {
        return this.http.get<ZeitGetResponse>(`${environment.apiUrl}/zeit?discordid=${encodeURIComponent(discordId)}`, {
            headers: this.getHeaders(),
            withCredentials: true,
        });
    }
}
