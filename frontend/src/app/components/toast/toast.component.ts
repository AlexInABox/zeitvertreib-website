import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.css'],
})
export class ToastComponent {
  constructor(readonly notificationService: NotificationService) {}

  removeToast(id: number): void {
    this.notificationService.removeToast(id);
  }

  getIconEmoji(severity: string): string {
    const emojis: Record<string, string> = {
      success: '✅',
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
    };
    return emojis[severity] || 'ℹ️';
  }
}
