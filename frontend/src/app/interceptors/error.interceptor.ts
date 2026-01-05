import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NotificationService } from '../services/notification.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(private notificationService: NotificationService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
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

          this.notificationService.error('Request failed', detail);
        }

        return throwError(() => error);
      }),
    );
  }
}
