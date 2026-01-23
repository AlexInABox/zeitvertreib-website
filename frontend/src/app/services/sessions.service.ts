import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { SessionsInfoGetResponse, SessionsInfoDeleteRequest } from '@zeitvertreib/types';

export interface SessionInfo {
  id: string;
  createdAt: number;
  lastLoginAt: number;
  expiresAt: number;
  userAgent: string;
  ipAddress: string;
}

@Injectable({
  providedIn: 'root',
})
export class SessionsService {
  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  private getAuthHeaders(): HttpHeaders {
    let headers = new HttpHeaders();
    const sessionToken = this.authService.getSessionToken();
    if (sessionToken) {
      headers = headers.set('Authorization', `Bearer ${sessionToken}`);
    }
    return headers;
  }

  getSessions(): Observable<SessionsInfoGetResponse> {
    return this.http.get<SessionsInfoGetResponse>(`${environment.apiUrl}/sessions`, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  deleteSessions(ids: string[]): Observable<{ success: boolean }> {
    const body: SessionsInfoDeleteRequest = { id: ids };
    return this.http.delete<{ success: boolean }>(`${environment.apiUrl}/sessions`, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
      body,
    });
  }
}
