import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';
import { catchError, map, of } from 'rxjs';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const http = inject(HttpClient);

  const sessionToken = authService.getSessionToken();
  if (!sessionToken) {
    router.navigate(['/login']);
    return false;
  }

  let headers = new HttpHeaders();
  headers = headers.set('Authorization', `Bearer ${sessionToken}`);

  return http.get<{ hasAccess: boolean }>(`${environment.apiUrl}/coin-management/access`, { headers }).pipe(
    map((response) => {
      if (response.hasAccess) {
        return true;
      } else {
        router.navigate(['/']);
        return false;
      }
    }),
    catchError(() => {
      router.navigate(['/']);
      return of(false);
    }),
  );
};
