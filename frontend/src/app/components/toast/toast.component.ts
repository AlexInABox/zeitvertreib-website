import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';
import { IconComponent, IconName } from '../icon/icon.component';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './toast.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./toast.component.css'],
})
export class ToastComponent {
  readonly notificationService = inject(NotificationService);

  removeToast(id: number): void {
    this.notificationService.removeToast(id);
  }

  getIconEmoji(severity: string): IconName {
    const icons: Record<string, IconName> = {
      success: 'check-circle',
      error: 'exclamation-circle',
      warn: 'exclamation-triangle',
      info: 'info',
    };
    return icons[severity] || 'info';
  }
}
