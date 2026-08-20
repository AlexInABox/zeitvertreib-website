import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  NgZone,
  ChangeDetectionStrategy,
  inject,
  viewChild,
  effect,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { SupportService } from '../../services/support.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-support-overlay',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './support-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./support-overlay.component.css'],
})
export class SupportOverlayComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private supportService = inject(SupportService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ngZone = inject(NgZone);

  readonly confettiCanvasRef = viewChild<ElementRef<HTMLCanvasElement>>('confettiCanvas');

  // UI state for expansion
  expanded = false;
  persistExpanded = false;

  // Donation form state
  selectedAmount: number | null = 10;
  customAmount: number | null = null;
  customAmountInput = '';
  greeting = '';
  isSubmitting = false;
  errorMessage = '';
  acceptedTerms = false;
  showTerms = false;

  predefinedAmounts = [5, 10, 20, 50, 100];

  // Success & Cancelled states
  private _showSuccessMessage = false;
  get showSuccessMessage() {
    return this._showSuccessMessage;
  }
  set showSuccessMessage(val: boolean) {
    this._showSuccessMessage = val;
    if (val) {
      setTimeout(() => this.launchConfetti(), 0);
    } else {
      this.stopConfetti();
    }
  }

  showCancelledMessage = false;

  private confettiAnimId: number | null = null;
  private confettiParticles: any[] = [];
  private readonly COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f43', '#48dbfb', '#ff6bac'];

  private collapseTimer: any = null;
  private queryParamsSub?: Subscription;

  constructor() {
    // Sync with SupportService signals
    effect(() => {
      const isExp = this.supportService.expanded();
      const isPersist = this.supportService.persistExpanded();
      const sAmt = this.supportService.selectedAmount();

      this.expanded = isExp;
      this.persistExpanded = isPersist;
      if (sAmt !== undefined && sAmt !== this.selectedAmount) {
        this.selectAmount(sAmt);
      }
    });
  }

  ngOnInit(): void {
    this.queryParamsSub = this.route.queryParams.subscribe((params) => {
      if (params['status'] === 'returned') {
        this.showSuccessMessage = true;
        this.expanded = true;
        this.persistExpanded = true;
        this.router.navigate([], { queryParams: { status: null }, queryParamsHandling: 'merge' });
      } else if (params['status'] === 'cancelled') {
        this.showCancelledMessage = true;
        this.expanded = true;
        this.persistExpanded = true;
        this.router.navigate([], { queryParams: { status: null }, queryParamsHandling: 'merge' });
      }
    });
  }

  ngOnDestroy(): void {
    this.queryParamsSub?.unsubscribe();
    this.stopConfetti();
  }

  // --- Interaction Handlers ---
  onMouseEnter(): void {
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
    this.expanded = true;
  }

  onMouseLeave(): void {
    if (this.persistExpanded) return;
    this.collapseTimer = setTimeout(() => {
      this.expanded = false;
      this.collapseTimer = null;
    }, 700);
  }

  togglePersist(): void {
    this.persistExpanded = !this.persistExpanded;
    this.expanded = this.persistExpanded || this.expanded;
  }

  toggleTerms(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.showTerms = !this.showTerms;
  }

  selectAmount(amount: number | null): void {
    this.selectedAmount = amount;
    this.customAmount = null;
    this.customAmountInput = '';
    this.errorMessage = '';
  }

  onCustomAmountInputChange(event: any): void {
    const input = event.target as HTMLInputElement;
    let value = input.value;

    value = value.replace(/[^0-9.,]/g, '');

    const firstSeparatorIndex = value.search(/[.,]/);
    if (firstSeparatorIndex !== -1) {
      const before = value.substring(0, firstSeparatorIndex + 1);
      const after = value.substring(firstSeparatorIndex + 1).replace(/[.,]/g, '');
      value = before + after;
    }

    input.value = value;
    this.customAmountInput = value;

    const normalizedValue = value.replace(',', '.');
    const parsed = parseFloat(normalizedValue);
    this.customAmount = isNaN(parsed) ? null : parsed;

    this.selectedAmount = null;
    this.errorMessage = '';
  }

  get finalAmount(): number {
    if (this.selectedAmount !== null) {
      return this.selectedAmount;
    }
    return this.customAmount || 0;
  }

  get maxWords(): number {
    const amount = this.finalAmount;
    if (amount < 5) return 0;
    if (amount >= 15) return 50;
    if (amount >= 10) {
      return 10 + Math.floor(((amount - 10) / 5) * 40);
    }
    return 3 + Math.floor(((amount - 5) / 5) * 7);
  }

  get currentWords(): number {
    if (!this.greeting || !this.greeting.trim()) return 0;
    return this.greeting
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .reduce((sum, word) => sum + Math.ceil(word.length / 10), 0);
  }

  get isGreetingInvalid(): boolean {
    return this.currentWords > this.maxWords;
  }

  retry(): void {
    this.showCancelledMessage = false;
    this.errorMessage = '';
  }

  submitDonation(): void {
    const amount = this.finalAmount;

    if (amount < 5) {
      this.errorMessage = 'Der Mindestspendenbetrag beträgt 5€.';
      return;
    }

    if (this.isGreetingInvalid) {
      this.errorMessage = `Deine Grußbotschaft überschreitet das Limit von ${this.maxWords} Wörtern.`;
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const sessionToken = this.authService.getSessionToken();
    let headers = new HttpHeaders();
    if (sessionToken) {
      headers = headers.set('Authorization', `Bearer ${sessionToken}`);
    }

    const body = {
      amount,
      greeting: this.greeting ? this.greeting.trim() : '',
    };

    this.http
      .post<{ success: boolean; checkoutUrl: string }>(`${environment.apiUrl}/stripe/checkout`, body, { headers })
      .subscribe({
        next: (response) => {
          if (response.success && response.checkoutUrl) {
            window.location.href = response.checkoutUrl;
          } else {
            this.errorMessage = 'Checkout-Link konnte nicht generiert werden.';
            this.isSubmitting = false;
          }
        },
        error: (error) => {
          console.error('Error initiating Stripe checkout:', error);
          this.errorMessage =
            error?.error?.error || 'Fehler beim Erstellen der Spende. Bitte versuche es später erneut.';
          this.isSubmitting = false;
        },
      });
  }

  private launchConfetti(): void {
    const canvas = this.confettiCanvasRef()?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    canvas.width = canvas.offsetWidth || 300;
    canvas.height = canvas.offsetHeight || 250;

    this.confettiParticles = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 6 + 3,
      h: Math.random() * 3 + 2,
      color: this.COLORS[Math.floor(Math.random() * this.COLORS.length)],
      speed: Math.random() * 2.5 + 1.2,
      drift: (Math.random() - 0.5) * 1.0,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.12,
      opacity: 1,
    }));

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of this.confettiParticles) {
        p.y += p.speed;
        p.x += p.drift;
        p.angle += p.spin;
        if (p.y > canvas.height * 0.75) {
          p.opacity = Math.max(0, p.opacity - 0.02);
        }
        if (p.opacity <= 0) continue;
        alive = true;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive && this._showSuccessMessage) {
        this.confettiAnimId = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    this.ngZone.runOutsideAngular(() => {
      this.confettiAnimId = requestAnimationFrame(tick);
    });
  }

  private stopConfetti(): void {
    if (this.confettiAnimId !== null) {
      cancelAnimationFrame(this.confettiAnimId);
      this.confettiAnimId = null;
    }
  }
}
