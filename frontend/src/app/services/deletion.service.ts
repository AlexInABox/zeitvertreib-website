import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { DeletionGetResponse, DeletionPostRequest } from '@zeitvertreib/types';

@Injectable({
  providedIn: 'root',
})
export class DeletionService {
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

  getDeletionStatus(): Observable<DeletionGetResponse> {
    return this.http.get<DeletionGetResponse>(`${environment.apiUrl}/deletion`, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  setDeletion(enabledAt: number): Observable<{ success: boolean; enabledAt: number }> {
    const body: DeletionPostRequest = { enabledAt };
    return this.http.post<{ success: boolean; enabledAt: number }>(`${environment.apiUrl}/deletion`, body, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }
}
