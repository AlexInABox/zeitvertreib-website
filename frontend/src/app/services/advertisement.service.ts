import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { AdvertisementGetResponse, AdvertisementPostRequest } from '@zeitvertreib/types';

@Injectable({
  providedIn: 'root',
})
export class AdvertisementService {
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

  getAdvertisements(month: number, year: number): Observable<AdvertisementGetResponse> {
    const headers = this.getAuthHeaders();
    return this.http.get<AdvertisementGetResponse>(
      `${this.apiUrl}/advertisement?month=${month}&year=${year}`,
      { headers },
    );
  }

  createAdvertisement(body: AdvertisementPostRequest): Observable<{
    success: boolean;
    campaignId: number;
    message: string;
    cost: number;
    daysBooked: number;
  }> {
    const headers = this.getAuthHeaders();
    return this.http.post<{
      success: boolean;
      campaignId: number;
      message: string;
      cost: number;
      daysBooked: number;
    }>(`${this.apiUrl}/advertisement`, body, { headers });
  }
}
