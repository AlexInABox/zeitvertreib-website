import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only show toast for actual unexpected errors (5xx errors, network errors, etc.)
      if (error.status >= 500 || error.status === 0) {
        const cfRay = error.headers.get('cf-ray');
        let detail = '';

        if (cfRay) {
          detail = `CF-Ray: ${cfRay}`;
        } else if (error.status === 0) {
          detail = 'Network error - please check your connection';
        }

        notificationService.error('Request failed', detail);
      }

      return throwError(() => error);
    }),
  );
};
