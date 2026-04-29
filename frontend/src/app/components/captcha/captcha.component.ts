import {
  Component,
  OnInit,
  OnChanges,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  inject,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CaptchaService } from '../../services/captcha.service';

export interface CaptchaChangeEvent {
  captchaId: string;
  captchaAnswer: string;
  honeypot: string;
}

@Component({
  selector: 'app-captcha',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './captcha.component.html',
  styleUrls: ['./captcha.component.css'],
})
export class CaptchaComponent implements OnInit, OnChanges, OnDestroy {
  @Input() captchaError = false;
  @Output() captchaChange = new EventEmitter<CaptchaChangeEvent>();
  @Output() captchaEnter = new EventEmitter<void>();

  answer = '';
  honeypotValue = '';
  safeSvg: SafeHtml = '';
  isSolved = false;
  isShaking = false;
  timePercent = 100;
  timeLabel = '5:00';

  private sanitizer = inject(DomSanitizer);
  captchaService = inject(CaptchaService);

  private fetchedAt = 0;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private shakeHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly TTL_MS = 5 * 60 * 1000;

  ngOnInit(): void {
    void this.doFetch();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const errorChange = changes['captchaError'];
    if (errorChange && !errorChange.firstChange && errorChange.currentValue === true) {
      void this.handleError();
    }
  }

  ngOnDestroy(): void {
    this.clearTimer();
    if (this.shakeHandle !== null) {
      clearTimeout(this.shakeHandle);
      this.shakeHandle = null;
    }
  }

  private async doFetch(): Promise<void> {
    this.clearTimer();
    this.isSolved = false;
    this.timePercent = 100;
    this.timeLabel = '5:00';
    await this.captchaService.fetchCaptcha();
    this.updateSafeSvg();
    if (!this.captchaService.loadError()) {
      this.fetchedAt = Date.now();
      this.startTimer();
    }
  }

  private startTimer(): void {
    this.timerHandle = setInterval(() => {
      const elapsed = Date.now() - this.fetchedAt;
      const remaining = Math.max(0, this.TTL_MS - elapsed);
      this.timePercent = Math.max(0, Math.round((remaining / this.TTL_MS) * 100));
      const totalSecs = Math.ceil(remaining / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      this.timeLabel = `${mins}:${secs.toString().padStart(2, '0')}`;
      if (remaining === 0) {
        this.clearTimer();
        void this.refresh();
      }
    }, 500);
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private updateSafeSvg(): void {
    const markup = this.captchaService.svgMarkup();
    this.safeSvg = markup ? this.sanitizer.bypassSecurityTrustHtml(markup) : '';
  }

  private emit(): void {
    this.captchaChange.emit({
      captchaId: this.captchaService.captchaId(),
      captchaAnswer: this.answer,
      honeypot: this.honeypotValue,
    });
  }

  onAnswerInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.answer = input.value.toUpperCase();
    input.value = this.answer;
    this.isSolved = this.answer.length === 5;
    this.emit();
  }

  onHoneypotInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.honeypotValue = input.value;
    this.emit();
  }

  async refresh(): Promise<void> {
    this.answer = '';
    this.isSolved = false;
    this.honeypotValue = '';
    this.captchaChange.emit({ captchaId: '', captchaAnswer: '', honeypot: '' });
    await this.doFetch();
  }

  private async handleError(): Promise<void> {
    this.isShaking = true;
    this.shakeHandle = setTimeout(() => {
      this.isShaking = false;
      this.shakeHandle = null;
    }, 600);
    this.answer = '';
    this.isSolved = false;
    this.honeypotValue = '';
    // Emit empty values so the parent immediately clears its stale captchaId/captchaAnswer
    this.captchaChange.emit({ captchaId: '', captchaAnswer: '', honeypot: '' });
    await this.doFetch();
  }

  onEnter(): void {
    if (this.answer.length === 5) {
      this.captchaEnter.emit();
    }
  }
}
