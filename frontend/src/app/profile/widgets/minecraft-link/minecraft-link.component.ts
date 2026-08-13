import { Component, OnInit, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MinecraftLinkService } from '../../../services/minecraft-link.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-minecraft-link',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './minecraft-link.component.html',
  styleUrls: ['./minecraft-link.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class MinecraftLinkComponent implements OnInit {
  private minecraftLinkService = inject(MinecraftLinkService);
  private authService = inject(AuthService);

  userId = input<string | undefined>();

  loadingMinecraftLink = true;
  minecraftLinked = false;
  minecraftUuid = '';
  minecraftLinkCode = '';
  minecraftLinkLoading = false;
  minecraftUnlinkLoading = false;
  minecraftLinkError = '';
  minecraftLinkSuccess = '';
  copiedUuid = false;

  ngOnInit() {
    this.loadMinecraftLinkStatus();
  }

  loadMinecraftLinkStatus() {
    this.loadingMinecraftLink = true;
    this.minecraftLinkError = '';
    this.minecraftLinkSuccess = '';

    const uid = this.userId() || this.authService.getCurrentUser()?.steamId;
    if (!uid) {
      this.minecraftLinked = false;
      this.minecraftUuid = '';
      this.loadingMinecraftLink = false;
      return;
    }

    this.minecraftLinkService.getMinecraftLinkByUserId(uid).subscribe({
      next: (response) => {
        this.minecraftLinked = true;
        this.minecraftUuid = response.minecraftUuid;
        this.loadingMinecraftLink = false;
      },
      error: (error) => {
        this.minecraftLinked = false;
        this.minecraftUuid = '';
        this.loadingMinecraftLink = false;
        if (error.status !== 404) {
          this.minecraftLinkError = 'Minecraft-Linkstatus konnte nicht geladen werden.';
        }
      },
    });
  }

  submitMinecraftLinkCode() {
    if (this.minecraftLinkLoading || this.minecraftUnlinkLoading) return;

    const normalizedCode = this.normalizeMinecraftLinkCode(this.minecraftLinkCode);
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizedCode)) {
      this.minecraftLinkError = 'Bitte gib einen gültigen Code im Format XXXX-XXXX ein.';
      this.minecraftLinkSuccess = '';
      return;
    }

    this.minecraftLinkLoading = true;
    this.minecraftLinkError = '';
    this.minecraftLinkSuccess = '';

    this.minecraftLinkService.redeemLinkCode(normalizedCode).subscribe({
      next: (response) => {
        this.minecraftLinkLoading = false;
        this.minecraftLinked = true;
        this.minecraftUuid = response.minecraftUuid;
        this.minecraftLinkCode = '';
        this.minecraftLinkSuccess = 'Minecraft-Account erfolgreich verlinkt.';
      },
      error: (error) => {
        this.minecraftLinkLoading = false;
        if (error?.error?.error) {
          this.minecraftLinkError = error.error.error;
          return;
        }
        if (error.status === 404) {
          this.minecraftLinkError = 'Code nicht gefunden.';
          return;
        }
        this.minecraftLinkError = 'Verknüpfung fehlgeschlagen. Bitte versuche es später erneut.';
      },
    });
  }

  unlinkMinecraft() {
    if (this.minecraftUnlinkLoading || this.minecraftLinkLoading) return;

    this.minecraftUnlinkLoading = true;
    this.minecraftLinkError = '';
    this.minecraftLinkSuccess = '';

    this.minecraftLinkService.unlinkMinecraft().subscribe({
      next: () => {
        this.minecraftUnlinkLoading = false;
        this.minecraftLinked = false;
        this.minecraftUuid = '';
        this.minecraftLinkCode = '';
        this.minecraftLinkSuccess = 'Minecraft-Verknüpfung wurde entfernt.';
      },
      error: () => {
        this.minecraftUnlinkLoading = false;
        this.minecraftLinkError = 'Entknüpfung fehlgeschlagen. Bitte versuche es später erneut.';
      },
    });
  }

  onMinecraftCodeInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const formattedCode = this.normalizeMinecraftLinkCode(input?.value || '', true);
    this.minecraftLinkCode = formattedCode;
    if (input && input.value !== formattedCode) {
      input.value = formattedCode;
    }
  }

  copyUuid() {
    if (!this.minecraftUuid) return;
    navigator.clipboard.writeText(this.minecraftUuid);
    this.copiedUuid = true;
    setTimeout(() => (this.copiedUuid = false), 2000);
  }

  private normalizeMinecraftLinkCode(rawValue: string, keepManualTrailingDash = false): string {
    const upperValue = (rawValue || '').toUpperCase();
    const hasDashInRawValue = upperValue.includes('-');
    const allowedCharactersOnly = upperValue.replace(/[^A-Z0-9-]/g, '');
    const alphanumericOnly = allowedCharactersOnly.replace(/-/g, '').slice(0, 8);

    const firstPart = alphanumericOnly.slice(0, 4);
    const secondPart = alphanumericOnly.slice(4, 8);

    if (secondPart.length > 0) {
      return `${firstPart}-${secondPart}`;
    }
    if (keepManualTrailingDash && hasDashInRawValue && alphanumericOnly.length >= 4) {
      return `${firstPart}-`;
    }
    return firstPart;
  }
}
