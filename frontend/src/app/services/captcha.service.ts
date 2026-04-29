import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import type { CaptchaResponse } from '@zeitvertreib/types';

@Injectable({
  providedIn: 'root',
})
export class CaptchaService {
  private readonly apiUrl = environment.apiUrl;

  captchaId = signal<string>('');
  svgMarkup = signal<string>('');
  isLoading = signal<boolean>(false);
  loadError = signal<string>('');

  async fetchCaptcha(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set('');
    this.captchaId.set('');
    this.svgMarkup.set('');

    try {
      const response = await fetch(`${this.apiUrl}/captcha`);
      if (!response.ok) {
        this.loadError.set('Captcha konnte nicht geladen werden.');
        return;
      }
      const data: CaptchaResponse = await response.json();
      this.captchaId.set(data.id);
      this.svgMarkup.set(data.svg);
    } catch {
      this.loadError.set('Netzwerkfehler beim Laden des Captchas.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
