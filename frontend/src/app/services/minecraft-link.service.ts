import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type {
  MinecraftStatsResponse,
  MinecraftLinkCodeRedeemRequest,
  MinecraftLinkCodeRedeemResponse,
  MinecraftLinkDeleteResponse,
} from '@zeitvertreib/types';

@Injectable({
  providedIn: 'root',
})
export class MinecraftLinkService {
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

  getMinecraftLinkByUserId(userId: string): Observable<MinecraftStatsResponse> {
    return this.http.get<MinecraftStatsResponse>(
      `${environment.apiUrl}/minecraft/stats?userid=${encodeURIComponent(userId)}`,
    );
  }

  redeemLinkCode(code: string): Observable<MinecraftLinkCodeRedeemResponse> {
    const body: MinecraftLinkCodeRedeemRequest = { code };
    return this.http.post<MinecraftLinkCodeRedeemResponse>(`${environment.apiUrl}/minecraft/link`, body, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }

  unlinkMinecraft(): Observable<MinecraftLinkDeleteResponse> {
    return this.http.delete<MinecraftLinkDeleteResponse>(`${environment.apiUrl}/minecraft/link`, {
      headers: this.getAuthHeaders(),
      withCredentials: true,
    });
  }
}
