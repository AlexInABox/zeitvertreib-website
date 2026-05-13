import { Component, OnInit, Input, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../services/auth.service';
import { ZvcService } from '../../../services/zvc.service';
import type {
  LootboxPurchaseResponse,
  LootboxInfoResponse,
  LootboxReward,
  LootboxRarity,
} from '@zeitvertreib/types';

type LootboxSpinItem = {
  emoji: string;
  name: string;
  rarity: LootboxRarity;
};

@Component({
  selector: 'app-lootbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lootbox.html',
  styleUrls: ['./lootbox.css'],
})
export class LootboxComponent implements OnInit {
  @Input() balance = 0;
  @Output() balanceChange = new EventEmitter<number>();

  readonly lootboxCost = 100;
  lootboxVoucherCount = 0;
  lootboxSpinning = false;
  lootboxLoading = false;
  lootboxError = '';
  lootboxSuccess = '';
  lootboxResult: LootboxReward | null = null;
  lootboxSpinItems: LootboxSpinItem[] = [];
  lootboxAnimating = false;
  lootboxSnapping = false;
  lootboxAtRest = false;

  private authService = inject(AuthService);
  private zvcService = inject(ZvcService);

  private readonly lootboxAllItems: LootboxSpinItem[] = [
    { emoji: '🪙', name: '10 ZVC', rarity: 'common' },
    { emoji: '💵', name: '30 ZVC', rarity: 'common' },
    { emoji: '🪙', name: '10 ZVC', rarity: 'common' },
    { emoji: '💎', name: '55 ZVC', rarity: 'uncommon' },
    { emoji: '💰', name: '20 ZVC', rarity: 'common' },
    { emoji: '🔷', name: '75 ZVC', rarity: 'uncommon' },
    { emoji: '🪙', name: '10 ZVC', rarity: 'common' },
    { emoji: '✨', name: '120 ZVC', rarity: 'rare' },
    { emoji: '💰', name: '20 ZVC', rarity: 'common' },
    { emoji: '💵', name: '30 ZVC', rarity: 'common' },
    { emoji: '🌟', name: '200 ZVC', rarity: 'rare' },
    { emoji: '🪙', name: '10 ZVC', rarity: 'common' },
    { emoji: '🔥', name: '500 ZVC', rarity: 'epic' },
    { emoji: '💰', name: '20 ZVC', rarity: 'common' },
    { emoji: '💫', name: '1.000 ZVC', rarity: 'epic' },
    { emoji: '🎟️', name: 'Gratis-Lootbox', rarity: 'epic' },
    { emoji: '💎', name: '55 ZVC', rarity: 'uncommon' },
    { emoji: '🏆', name: '2.500 ZVC', rarity: 'legendary' },
    { emoji: '💵', name: '30 ZVC', rarity: 'common' },
    { emoji: '🌈', name: '5.000 ZVC', rarity: 'legendary' },
    { emoji: '🪙', name: '10 ZVC', rarity: 'common' },
  ];

  ngOnInit(): void {
    this.authService.authenticatedGet<LootboxInfoResponse>(`${environment.apiUrl}/lootbox`).subscribe({
      next: (res) => this.lootboxVoucherCount = res.voucherCount ?? 0,
      error: () => {},
    });
  }

  buildLootboxSpinStrip(landingItem: LootboxSpinItem): void {
    const strip: LootboxSpinItem[] = [];
    const baseIndex = this.lootboxAllItems.findIndex(item =>
      item.emoji === landingItem.emoji && item.name === landingItem.name && item.rarity === landingItem.rarity
    );
    const startIndex = baseIndex >= 0 ? baseIndex : 0;

    for (let i = 0; i < 40; i++) {
      strip.push(this.lootboxAllItems[(startIndex + i) % this.lootboxAllItems.length]!);
    }

    const highTier = this.lootboxAllItems.filter(i => i.rarity === 'epic' || i.rarity === 'legendary');
    const rareTier = this.lootboxAllItems.filter(i => i.rarity === 'rare');

    const pickNearMiss = () => {
      const src = Math.random() < 0.75 ? highTier : rareTier;
      return src[Math.floor(Math.random() * src.length)] || highTier[0]!;
    };

    strip[35] = pickNearMiss();
    strip[37] = pickNearMiss();
    strip[34] = pickNearMiss();
    strip[38] = pickNearMiss();
    strip[36] = landingItem;
    this.lootboxSpinItems = strip;
  }

  canAffordLootbox(): boolean {
    return this.balance >= this.lootboxCost;
  }

  useVoucherForLootbox(): void {
    this.buyLootbox(true);
  }

  buyLootbox(useVoucher = false): void {
    if (this.lootboxSpinning || this.lootboxLoading) return;

    if (useVoucher && this.lootboxVoucherCount < 1) {
      this.lootboxError = 'Kein Gutschein vorhanden!';
      setTimeout(() => this.lootboxError = '', 3000);
      return;
    } else if (!useVoucher && !this.canAffordLootbox()) {
      this.lootboxError = `Nicht genügend ZVC! Du brauchst ${this.lootboxCost} ZVC.`;
      setTimeout(() => this.lootboxError = '', 3000);
      return;
    }

    this.lootboxSpinning = true;
    this.lootboxLoading = true;
    this.lootboxError = '';
    this.lootboxSuccess = '';
    this.lootboxResult = null;
    this.lootboxAnimating = false;
    this.lootboxSnapping = false;
    this.lootboxAtRest = false;
    this.lootboxSpinItems = [];

    if (useVoucher) this.lootboxVoucherCount -= 1;
    else {
      this.balance -= this.lootboxCost;
      this.balanceChange.emit(this.balance);
      this.zvcService.setBalance(this.balance);
    }

    const duration = 9000, snap = 550, buffer = 800;
    this.zvcService.pausePolling(duration + snap + buffer);

    this.authService.authenticatedPost<LootboxPurchaseResponse>(`${environment.apiUrl}/lootbox`, { useVoucher }).subscribe({
      next: (res) => {
        this.lootboxLoading = false;
        this.buildLootboxSpinStrip(res.reward);
        this.lootboxAnimating = true;

        setTimeout(() => {
          this.lootboxAnimating = false;
          this.lootboxSnapping = true;
          setTimeout(() => {
            this.lootboxSnapping = false;
            this.lootboxAtRest = true;
            this.lootboxResult = res.reward;
            this.lootboxSpinning = false;
            this.lootboxSuccess = res.message;
            this.balance = res.newBalance;
            this.balanceChange.emit(this.balance);
            this.zvcService.setBalance(res.newBalance);
            this.lootboxVoucherCount = res.newVoucherCount;
            setTimeout(() => this.lootboxSuccess = '', 6000);
          }, snap);
        }, duration);
      },
      error: (err) => {
        this.lootboxLoading = false;
        this.lootboxSpinning = false;
        if (useVoucher) this.lootboxVoucherCount += 1;
        else {
          this.balance += this.lootboxCost;
          this.balanceChange.emit(this.balance);
          this.zvcService.setBalance(this.balance);
        }
        this.lootboxError = err?.error?.error || 'Fehler beim Öffnen der Lootbox';
        setTimeout(() => this.lootboxError = '', 4000);
      }
    });
  }
}
