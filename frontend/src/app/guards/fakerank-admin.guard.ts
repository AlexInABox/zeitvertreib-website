import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const fakerankAdminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentUserData$.pipe(
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
