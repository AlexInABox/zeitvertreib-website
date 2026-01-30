import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { BirthdayGetResponse, BirthdayPostRequest } from '@zeitvertreib/types';

@Injectable({
  providedIn: 'root',
})
export class BirthdayService {
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

  getBirthday(): Observable<BirthdayGetResponse> {
    return this.http.get<BirthdayGetResponse>(`${environment.apiUrl}/birthday`, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  setBirthday(day: number, month: number, year?: number): Observable<{ success: boolean }> {
    const body: BirthdayPostRequest = { day, month, ...(year !== undefined && { year }) };
    return this.http.post<{ success: boolean }>(`${environment.apiUrl}/birthday`, body, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  deleteBirthday(): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${environment.apiUrl}/birthday`, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }
}
