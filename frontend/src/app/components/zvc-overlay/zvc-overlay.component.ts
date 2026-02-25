import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ViewChildren,
  QueryList,
  inject,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { Subscription } from 'rxjs';
import { ZvcService } from '../../services/zvc.service';
import { AuthService } from '../../services/auth.service';
import { EasterEggService } from '../../services/easter-egg.service';

type DigitColumn = {
  key: string;
  type: 'digit';
  value: number;
  duration: number;
};

type SeparatorColumn = {
  key: string;
  type: 'separator';
  value: string;
  duration: number;
};

type OdometerColumn = DigitColumn | SeparatorColumn;

@Component({
  selector: 'app-zvc-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zvc-overlay.component.html',
  styleUrls: ['./zvc-overlay.component.css'],
})
export class ZvcOverlayComponent implements OnInit, OnDestroy, AfterViewInit {
  columns: OdometerColumn[] = [];
  visible = false;

  // UI state for expansion and interactions
  expanded = false;
  persistExpanded = false; // toggled by click

  // Redeem code state
  redeemCode = '';
  codeRedemptionLoading = false;
  codeRedemptionMessage = '';
  codeRedemptionSuccess = false;

  // Transfer state
  transferRecipient = '';
  transferAmount: number | null = null;
  transferLoading = false;
  transferMessage = '';
  transferSuccess = false;

  @ViewChild('odometerContainer') odometerContainer!: ElementRef<HTMLElement>;
  @ViewChildren('ribbonRef') ribbons!: QueryList<ElementRef<HTMLElement>>;

  private currentValue = -1;
  private balanceSub: Subscription | null = null;
  private authSub: Subscription | null = null;

  private zvcService = inject(ZvcService);
  private authService = inject(AuthService);
  private ngZone = inject(NgZone);
  private easterEggService = inject(EasterEggService);

  // Hover collapse timer
  private collapseTimer: any = null;

  // --- UI interaction helpers ---
  onMouseEnter(): void {
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
    this.expanded = true;
  }

  onMouseLeave(): void {
    if (this.persistExpanded) return; // keep open after click
    // small delay to make it easier to interact
    this.collapseTimer = setTimeout(() => {
      this.expanded = false;
      this.collapseTimer = null;
    }, 250);
  }

  togglePersist(): void {
    this.persistExpanded = !this.persistExpanded;
    this.expanded = this.persistExpanded || this.expanded;
  }

  // --- Helpers for weekend/tax calculation ---
  isWeekendInBerlin(): boolean {
    try {
      const berlin = new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' });
      const d = new Date(berlin);
      const day = d.getDay();
      return day === 0 || day === 6;
    } catch (e) {
      return false;
    }
  }

  getTransferTax(amount: number): number {
    const rate = this.isWeekendInBerlin() ? 0 : 0.05;
    return Math.floor(amount * rate);
  }

  getTransferTotalCost(amount: number): number {
    return amount + this.getTransferTax(amount);
  }

  // --- Redeem code ---
  redeemCodeAction(): void {
    if (!this.redeemCode || this.redeemCode.trim() === '') return;

    const trimmed = this.redeemCode.trim();
    if (trimmed.toLowerCase() === 'chiikawa') {
      this.redeemCode = '';
      this.easterEggService.triggerChiikawa();
      return;
    }

    this.codeRedemptionLoading = true;
    this.codeRedemptionMessage = '';
    this.codeRedemptionSuccess = false;

    this.authService.authenticatedPost<any>(`${environment.apiUrl}/redeem-code`, { code: trimmed }).subscribe({
      next: (resp) => {
        this.codeRedemptionLoading = false;
        if (resp?.success) {
          this.codeRedemptionSuccess = true;
          this.codeRedemptionMessage = resp.message || 'Code eingelöst!';
          if (resp.newBalance !== undefined) {
            this.zvcService.setBalance(resp.newBalance);
          } else if (resp.credits) {
            this.zvcService.adjustBalance(resp.credits);
          }
          this.redeemCode = '';
        } else {
          this.codeRedemptionSuccess = false;
          this.codeRedemptionMessage = resp?.message || 'Code konnte nicht eingelöst werden';
        }
      },
      error: (err) => {
        this.codeRedemptionLoading = false;
        this.codeRedemptionSuccess = false;
        let msg = 'Fehler beim Einlösen des Codes';
        if (err?.error?.error) msg = err.error.error;
        else if (err?.message) msg = err.message;
        this.codeRedemptionMessage = msg;
      },
    });

    setTimeout(() => (this.codeRedemptionMessage = ''), 5000);
  }

  // --- Transfer ZVC ---
  transferZVC(): void {
    if (!this.transferRecipient || !this.transferAmount) return;

    const amount = Number(this.transferAmount);
    if (isNaN(amount) || amount <= 0) {
      this.transferMessage = 'Bitte gib einen gültigen Betrag ein';
      this.transferSuccess = false;
      setTimeout(() => (this.transferMessage = ''), 3000);
      return;
    }

    if (amount < 100) {
      this.transferMessage = 'Mindestbetrag für Transfers: 100 ZVC';
      this.transferSuccess = false;
      setTimeout(() => (this.transferMessage = ''), 3000);
      return;
    }

    if (amount > 50000) {
      this.transferMessage = 'Maximaler Transferbetrag: 50.000 ZVC';
      this.transferSuccess = false;
      setTimeout(() => (this.transferMessage = ''), 3000);
      return;
    }

    const currentBalance = this.zvcService.balance;
    const tax = this.getTransferTax(amount);
    const total = amount + tax;
    if (total > currentBalance) {
      this.transferMessage = `Nicht genügend ZVC! Benötigt: ${total} ZVC (${amount} + ${tax} Steuer)`;
      this.transferSuccess = false;
      setTimeout(() => (this.transferMessage = ''), 4000);
      return;
    }

    this.transferLoading = true;
    this.transferMessage = '';
    this.transferSuccess = false;

    this.authService
      .authenticatedPost<any>(`${environment.apiUrl}/transfer-zvc`, {
        recipient: this.transferRecipient.trim(),
        amount: amount,
      })
      .subscribe({
        next: (resp) => {
          this.transferLoading = false;
          if (resp?.success) {
            this.transferSuccess = true;
            this.transferMessage = resp.message || 'Transfer erfolgreich';
            if (resp.transfer?.senderNewBalance !== undefined) {
              this.zvcService.setBalance(resp.transfer.senderNewBalance);
            }
            this.transferRecipient = '';
            this.transferAmount = null;
            setTimeout(() => (this.transferMessage = ''), 5000);
          } else {
            this.transferSuccess = false;
            this.transferMessage = resp?.message || 'Transfer fehlgeschlagen';
          }
        },
        error: (err) => {
          this.transferLoading = false;
          this.transferSuccess = false;
          let msg = 'Fehler beim Senden der ZVC';
          if (err?.error?.error) msg = err.error.error;
          else if (err?.message) msg = err.message;
          this.transferMessage = msg;
          setTimeout(() => (this.transferMessage = ''), 5000);
        },
      });
  }

  ngOnInit(): void {
    this.authSub = this.authService.currentUser$.subscribe((user) => {
      this.visible = !!user;
      if (!user) {
        this.columns = [];
        this.currentValue = -1;
      }
    });

    this.balanceSub = this.zvcService.balance$.subscribe((balance) => {
      if (balance !== this.currentValue) {
        this.updateValue(balance);
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.currentValue >= 0) {
      this.updateValue(this.currentValue);
    }
  }

  ngOnDestroy(): void {
    this.balanceSub?.unsubscribe();
    this.authSub?.unsubscribe();
  }

  trackByKey(_index: number, col: OdometerColumn): string {
    return col.key;
  }

  /**
   * Measure a single digit's rendered height, round to integer, then stamp
   * that value onto every digit, slot, ribbon, and viewport so the entire
   * odometer lives on an integer-pixel grid.
   */
  private calibrateGrid(): number {
    const container = this.odometerContainer?.nativeElement;
    if (!container) return 16;

    // Measure one rendered digit
    const sample = container.querySelector('.odo-digit') as HTMLElement | null;
    if (!sample) return 16;
    const h = Math.round(sample.getBoundingClientRect().height);
    if (h < 1) return 16;

    // Stamp integer pixel height onto every relevant element
    const hPx = `${h}px`;
    container.style.height = hPx;

    container.querySelectorAll<HTMLElement>('.odo-digit-col').forEach((el) => {
      el.style.height = hPx;
    });
    container.querySelectorAll<HTMLElement>('.odo-ribbon').forEach((el) => {
      el.style.height = `${h * 10}px`;
    });
    container.querySelectorAll<HTMLElement>('.odo-digit').forEach((el) => {
      el.style.height = hPx;
      el.style.lineHeight = hPx;
    });
    container.querySelectorAll<HTMLElement>('.odo-separator').forEach((el) => {
      el.style.height = hPx;
      el.style.lineHeight = hPx;
    });

    return h;
  }

  private updateValue(target: number): void {
    const prevValue = this.currentValue;
    const prevDigits = prevValue >= 0 ? this.formatNumber(prevValue).filter((c) => c !== '.') : [];
    this.currentValue = target;

    const chars = this.formatNumber(target);

    // Build digit/sep columns
    const newColumns: OdometerColumn[] = [];
    let digitIndex = 0;
    const totalDigits = chars.filter((c) => c !== '.' && c !== '-').length;
    for (const ch of chars) {
      if (ch === '.' || ch === '-') {
        newColumns.push({ key: `sep-${digitIndex}`, type: 'separator', value: ch, duration: 0 });
      } else {
        const val = parseInt(ch, 10);
        const posFromRight = totalDigits - 1 - digitIndex;
        const duration = 600 + posFromRight * 80;
        newColumns.push({ key: `d-${digitIndex}`, type: 'digit', value: val, duration });
        digitIndex++;
      }
    }

    // Prepare old digit values aligned to the right for a natural roll
    const oldDigitsAligned: number[] = [];
    const oldDigitsOnly = prevDigits;
    const newDigitsOnly = newColumns.filter((c) => c.type === 'digit');
    const pad = Math.max(0, newDigitsOnly.length - oldDigitsOnly.length);
    for (let i = 0; i < pad; i++) oldDigitsAligned.push(0);
    for (const d of oldDigitsOnly) oldDigitsAligned.push(parseInt(d, 10));

    // Assign the new columns immediately so Angular renders them
    this.columns = newColumns;

    // After DOM update, calibrate the pixel grid then animate
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        // Force every element onto an integer-pixel grid
        const digitHeight = this.calibrateGrid();
        const ribbonEls = this.ribbons.toArray();

        for (let i = 0, digitIdx = 0; i < this.columns.length; i++) {
          const col = this.columns[i];
          if (col.type === 'separator') continue;

          const ribbonEl = ribbonEls[digitIdx]?.nativeElement as HTMLElement | undefined;
          digitIdx++;
          if (!ribbonEl) continue;

          // Integer-only maths — no fractional pixels possible
          const prevVal = oldDigitsAligned[digitIdx - 1] ?? 0;
          const startY = -(prevVal * digitHeight);
          const endY = -(col.value * digitHeight);

          // Snap to start position (no transition)
          ribbonEl.style.transition = 'none';
          ribbonEl.style.transform = `translate3d(0,${startY}px,0)`;
          // Force layout so the browser commits the start position
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          ribbonEl.offsetHeight;

          // Animate to end position
          ribbonEl.style.transition = `transform ${col.duration}ms cubic-bezier(0.23, 1, 0.32, 1)`;
          ribbonEl.style.transform = `translate3d(0,${endY}px,0)`;

          // On completion, lock the final position without transition
          const onEnd = () => {
            ribbonEl.style.transition = 'none';
            ribbonEl.style.transform = `translate3d(0,${endY}px,0)`;
            ribbonEl.removeEventListener('transitionend', onEnd);
          };
          ribbonEl.addEventListener('transitionend', onEnd);
        }
      });
    });
  }

  private formatNumber(n: number): string[] {
    const isNegative = n < 0;
    const abs = Math.abs(Math.floor(n));
    const s = abs.toString();
    const parts: string[] = [];
    const len = s.length;
    for (let i = 0; i < len; i++) {
      if (i > 0 && (len - i) % 3 === 0) parts.push('.');
      parts.push(s[i]);
    }
    if (isNegative) {
      parts.unshift('-');
    }
    return parts;
  }
}
