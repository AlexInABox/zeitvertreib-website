import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { GetAdventCalendarResponse, RedeemAdventDoorRequest, RedeemAdventDoorResponse } from '@zeitvertreib/types';

@Injectable({
  providedIn: 'root',
})
export class AdventCalendarService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  private getAuthHeaders(): HttpHeaders {
    const sessionToken = this.authService.getSessionToken();
    let headers = new HttpHeaders();
    if (sessionToken) {
      headers = headers.set('Authorization', `Bearer ${sessionToken}`);
    }
    return headers;
  }

  getAdventCalendar(): Observable<GetAdventCalendarResponse> {
    const headers = this.getAuthHeaders();
    return this.http.get<GetAdventCalendarResponse>(`${this.apiUrl}/adventcalendar`, { headers });
  }

  redeemDoor(day: number): Observable<RedeemAdventDoorResponse> {
    const headers = this.getAuthHeaders();
    const body: RedeemAdventDoorRequest = { day };
    return this.http.post<RedeemAdventDoorResponse>(`${this.apiUrl}/adventcalendar/redeem`, body, { headers });
  }
}
