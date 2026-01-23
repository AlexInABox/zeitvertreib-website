import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { TakeoutGetResponse, TakeoutPostRequest } from '@zeitvertreib/types';

@Injectable({
    providedIn: 'root',
})
export class TakeoutService {
    constructor(
        private http: HttpClient,
        private authService: AuthService,
    ) { }

    private getAuthHeaders(): HttpHeaders {
        let headers = new HttpHeaders();
        const sessionToken = this.authService.getSessionToken();
        if (sessionToken) {
            headers = headers.set('Authorization', `Bearer ${sessionToken}`);
        }
        return headers;
    }

    getTakeoutStatus(): Observable<TakeoutGetResponse> {
        return this.http.get<TakeoutGetResponse>(`${environment.apiUrl}/takeout`, {
            headers: this.getAuthHeaders(),
            withCredentials: true,
        });
    }

    requestTakeout(email: string): Observable<{ success: boolean; message: string }> {
        const body: TakeoutPostRequest = { email };
        return this.http.post<{ success: boolean; message: string }>(`${environment.apiUrl}/takeout`, body, {
            headers: this.getAuthHeaders(),
            withCredentials: true,
        });
    }
}
