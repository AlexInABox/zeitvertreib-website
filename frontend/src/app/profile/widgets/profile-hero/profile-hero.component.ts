import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile-hero',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-hero.component.html',
  styleUrls: ['./profile-hero.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ProfileHeroComponent {
  user = input<any>();
  isManageView = input<boolean>(false);
  isSelf = input<boolean>(false);

  onLogout = output<void>();

  copiedSteamId = false;

  copySteamId() {
    const steamId = this.user()?.steamId;
    if (!steamId) return;
    navigator.clipboard.writeText(steamId);
    this.copiedSteamId = true;
    setTimeout(() => (this.copiedSteamId = false), 2000);
  }

  getDateDisplay(timestamp?: number): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  logout() {
    this.onLogout.emit();
  }
}
