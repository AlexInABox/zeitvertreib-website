import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CaptchaComponent, CaptchaChangeEvent } from '../components/captcha/captcha.component';

@Component({
  selector: 'app-captcha-test',
  standalone: true,
  imports: [CommonModule, CaptchaComponent],
  template: `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.25rem;background:#0d0d1a;color:#fff;padding:2rem">
      <h2 style="margin:0">Captcha Test</h2>
      <app-captcha [captchaError]="captchaError" (captchaChange)="onChange($event)" (captchaEnter)="onEnter()"></app-captcha>
      <div *ngIf="last" style="font-family:monospace;font-size:.85rem;opacity:.6;text-align:center">
        id: {{ last.captchaId || '(empty)' }}<br>
        answer: {{ last.captchaAnswer || '(empty)' }}<br>
        honeypot: {{ last.honeypot || '(empty)' }}
      </div>
      <div *ngIf="submitted" style="color:#4ade80;font-weight:600">Enter gedrückt / bestätigt!</div>
      <button
        (click)="triggerError()"
        style="margin-top:.5rem;padding:.5rem 1.25rem;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);border-radius:8px;color:#fca5a5;cursor:pointer;font-size:.875rem"
      >
        Fehler simulieren (Shake + Refresh)
      </button>
    </div>
  `,
})
export class CaptchaTestComponent {
  last: CaptchaChangeEvent | null = null;
  submitted = false;
  captchaError = false;

  onChange(event: CaptchaChangeEvent): void {
    this.last = event;
    this.submitted = false;
    this.captchaError = false;
  }

  onEnter(): void {
    this.submitted = true;
  }

  triggerError(): void {
    this.captchaError = true;
    setTimeout(() => { this.captchaError = false; }, 100);
  }
}
