import { Injectable } from '@angular/core';
import { signal } from '@angular/core';

export interface Toast {
  id: number;
  severity: 'success' | 'error' | 'warn' | 'info';
  summary: string;
  detail?: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private toastIdCounter = 0;
  toasts = signal<Toast[]>([]);

  constructor() {}

  addToast(severity: 'success' | 'error' | 'warn' | 'info', summary: string, detail?: string): void {
    const toast: Toast = {
      id: ++this.toastIdCounter,
      severity,
      summary,
      detail,
    };

    this.toasts.update((toasts) => [...toasts, toast]);

    setTimeout(() => {
      this.removeToast(toast.id);
    }, 5000);
  }

  removeToast(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  success(summary: string, detail?: string): void {
    this.addToast('success', summary, detail);
  }

  error(summary: string, detail?: string): void {
    this.addToast('error', summary, detail);
  }

  warn(summary: string, detail?: string): void {
    this.addToast('warn', summary, detail);
  }

  info(summary: string, detail?: string): void {
    this.addToast('info', summary, detail);
  }
}
