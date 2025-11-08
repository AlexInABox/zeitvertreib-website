import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { map, take, filter } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // If we have a session token, wait for the auth check to complete
  const hasToken = !!authService.getSessionToken();

  return authService.currentUser$.pipe(
    // Skip initial null only if we have a token (meaning auth check is in progress)
    filter((user, index) => {
      // If no token, accept first emission (null = not logged in)
      if (!hasToken) return true;
      // If we have a token, skip the initial null and wait for actual data
      return index > 0 || user !== null;
    }),
    take(1),
    map((user) => {
      if (user) {
        return true;
      } else {
        // Store the attempted URL for redirecting after login
        sessionStorage.setItem('redirectUrl', state.url);
        router.navigate(['/login']);
        return false;
      }
    }),
  );
};
