import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './support.component.html',
  styleUrls: ['./support.component.css'],
})
export class SupportComponent implements OnInit {
  @ViewChild('confettiCanvas') confettiCanvasRef!: ElementRef<HTMLCanvasElement>;

  selectedAmount: number | null = 10; // default 10€
  customAmount: number | null = null;
  greeting = '';
  isSubmitting = false;
  errorMessage = '';

  private _showSuccessMessage = false;
  get showSuccessMessage() {
    return this._showSuccessMessage;
  }
  set showSuccessMessage(val: boolean) {
    this._showSuccessMessage = val;
    if (val) {
      // Wait one tick for the canvas to render before firing confetti
      setTimeout(() => this.launchConfetti(), 0);
    } else {
      this.stopConfetti();
    }
  }

  showCancelledMessage = false;

  private confettiAnimId: number | null = null;
  private confettiParticles: any[] = [];

  private readonly COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f43', '#48dbfb', '#ff6bac'];

  // Predefined options
  predefinedAmounts = [5, 10, 20, 50, 100];

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['status'] === 'returned') {
        this.showSuccessMessage = true;
        this.router.navigate([], { queryParams: { status: null }, queryParamsHandling: 'merge' });
      } else if (params['status'] === 'cancelled') {
        this.showCancelledMessage = true;
        this.router.navigate([], { queryParams: { status: null }, queryParamsHandling: 'merge' });
      }
    });
  }

  retry(): void {
    this.showCancelledMessage = false;
    this.errorMessage = '';
  }

  private launchConfetti(): void {
    const canvas = this.confettiCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    canvas.width = canvas.offsetWidth || 400;
    canvas.height = canvas.offsetHeight || 300;

    this.confettiParticles = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 8 + 4,
      h: Math.random() * 4 + 2,
      color: this.COLORS[Math.floor(Math.random() * this.COLORS.length)],
      speed: Math.random() * 3 + 1.5,
      drift: (Math.random() - 0.5) * 1.2,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.15,
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
          p.opacity = Math.max(0, p.opacity - 0.015);
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

  selectAmount(amount: number): void {
    this.selectedAmount = amount;
    this.customAmount = null;
    this.errorMessage = '';
  }

  onCustomAmountChange(): void {
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
      .post<{ success: boolean; checkoutUrl: string }>(`${environment.apiUrl}/mollie/checkout`, body, { headers })
      .subscribe({
        next: (response) => {
          if (response.success && response.checkoutUrl) {
            // Redirect the user to Mollie Checkout
            window.location.href = response.checkoutUrl;
          } else {
            this.errorMessage = 'Checkout-Link konnte nicht generiert werden.';
            this.isSubmitting = false;
          }
        },
        error: (error) => {
          console.error('Error initiating Mollie checkout:', error);
          this.errorMessage =
            error?.error?.error || 'Fehler beim Erstellen der Spende. Bitte versuche es später erneut.';
          this.isSubmitting = false;
        },
      });
  }
}
