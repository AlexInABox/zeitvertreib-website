import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, filter, take } from 'rxjs/operators';

export const fakerankAdminGuard: CanActivateFn = (_route, _state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // If we have a session token, wait for the auth check to complete
  // Otherwise, the initial null is the final state
  const hasToken = !!authService.getSessionToken();

  return authService.currentUserData$.pipe(
    // Skip initial null only if we have a token (meaning auth check is in progress)
    filter((userData, index) => {
      // If no token, accept first emission (null = not logged in)
      if (!hasToken) return true;
      // If we have a token, skip the initial null and wait for actual data
      return index > 0 || userData !== null;
    }),
    take(1),
    map((userData) => {
      // Check if user is logged in
      if (!userData?.user) {
        router.navigate(['/login']);
        return false;
      }

      // Check if user has fakerank admin privileges using timestamp-based system
      if (!authService.isFakerankAdmin()) {
        router.navigate(['/dashboard']);
        return false;
      }

      return true;
    }),
  );
};
