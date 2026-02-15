import { Component, OnInit, OnDestroy, inject, ElementRef } from '@angular/core';
import { AudioService } from '../services/audio.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { ZvcService } from '../services/zvc.service';
import type {
  ChickenCrossInfoResponse,
  ChickenCrossGetResponse,
  ChickenCrossPostRequest,
  ChickenCrossPostResponse,
  ChickenCrossActiveResponse,
  RouletteGetInfoResponse,
  RoulettePostRequest,
  RoulettePostResponse,
  RouletteBetType,
} from '@zeitvertreib/types';

interface Statistics {
  username: string;
  kills: number;
  deaths: number;
  experience?: number; // Keep property name for DB compatibility, but represents ZV Coins
  playtime: number;
  avatarFull: string;
  roundsplayed: number;
  leaderboardposition: number | null;
  usedmedkits: number;
  usedcolas: number;
  pocketescapes: number;
  usedadrenaline: number;
  snakehighscore: number;
  fakerank_until?: number;
  fakerankadmin_until?: number;
  fakerankoverride_until?: number;
  lastkillers: Array<{ displayname: string; avatarmedium: string }>;
  lastkills: Array<{ displayname: string; avatarmedium: string }>;
}

interface SlotWinLogEntry {
  id: number;
  timestamp: number;
  winType: 'jackpot' | 'big_win' | 'small_win' | 'mini_win' | 'loss';
  payout: number;
  symbols: [string, string, string];
  netChange: number;
}

interface LuckyWheelSpinLogEntry {
  id: number;
  timestamp: number;
  multiplier: number;
  payout: number;
  bet: number;
  message: string;
}

interface LuckyWheelInfo {
  minBet: number;
  maxBet: number;
  payoutTable: Array<{
    multiplier: number;
    weight: number;
  }>;
  description: string;
}

interface LuckyWheelResult {
  multiplier: number;
  payout: number;
  newBalance: number;
  message: string;
  payoutTable: Array<{
    multiplier: number;
    weight: number;
  }>;
}

@Component({
  selector: 'app-games',
  imports: [CommonModule, FormsModule],
  templateUrl: './games.html',
  styleUrls: ['./games.css'],
})
export class GamesComponent implements OnInit, OnDestroy {
  // Roulette wheel constants - European roulette sequence (clockwise from 0)
  static readonly ROULETTE_WHEEL_SEQUENCE = [
    0, 26, 3, 35, 12, 28, 7, 29, 18, 22, 9, 31, 14, 20, 1, 33, 16, 24, 5, 10, 23, 8, 30, 11, 36, 13, 27, 6, 34, 17, 25,
    2, 21, 4, 19, 15, 32,
  ];
  static readonly RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

  // Expose Math to template
  Math = Math;

  userStatistics: Statistics = {
    username: 'LÄDT...',
    kills: 0,
    deaths: 0,
    experience: 0,
    playtime: 0,
    avatarFull: '',
    roundsplayed: 0,
    leaderboardposition: null,
    usedmedkits: 0,
    usedcolas: 0,
    pocketescapes: 0,
    usedadrenaline: 0,
    snakehighscore: 0,
    lastkillers: [],
    lastkills: [],
  };

  // Slot machine properties
  slotMachineLoading = false;
  slotMachineError = '';
  slotMachineMessage = '';
  isSpinning = false;
  showWinningAnimation = false;
  currentWinType: 'jackpot' | 'big_win' | 'small_win' | 'mini_win' | 'loss' = 'loss';
  slotMachineInfo: {
    cost: number;
    payoutTable: Array<{
      symbol: string;
      name: string;
      condition: string;
      payout: number;
      tier: string;
      description: string;
    }>;
    symbols: string[];
    description: string;
  } | null = null;
  showPayoutInfo = false;
  autoSpinEnabled = false;

  // Win log properties
  slotWinLog: SlotWinLogEntry[] = [];
  private readonly MAX_WIN_LOG_ENTRIES = 100;
  private readonly WIN_LOG_STORAGE_KEY = 'slotMachineWinLog';
  hideLosses: boolean = true;
  luckyWheelSpinLog: LuckyWheelSpinLogEntry[] = [];
  private readonly WHEEL_LOG_STORAGE_KEY = 'luckyWheelSpinLog';
  hideWheelLosses = true;

  // Lucky Wheel properties
  luckyWheelInfo: LuckyWheelInfo | null = null;
  luckyWheelBet: number = 100;
  luckyWheelBetInput: string = '100';
  luckyWheelLoading = false;
  luckyWheelError = '';
  luckyWheelMessage = '';
  isWheelSpinning = false;
  wheelRotation = 0;
  showWheelResult = false;
  lastWheelMultiplier: number | null = null;
  lastWheelPayout: number | null = null;
  winningSegmentIndex: number | null = null;
  autoWheelSpinEnabled = false;
  private cachedWheelSegments: Array<{
    color: string;
    multiplier: number;
  }> | null = null;

  // Chicken Cross properties
  chickenCrossInfo: ChickenCrossInfoResponse | null = null;
  chickenCrossBet: number = 100;
  chickenCrossBetInput: string = '100';
  chickenCrossLoading = false;
  chickenCrossError = '';
  chickenCrossGame: ChickenCrossGetResponse | null = null;
  chickenCrossIsMoving = false;
  chickenCrossIsAnimating = false;
  chickenCrossLostAnimation = false;
  chickenCrossDeadGame: ChickenCrossGetResponse | null = null;
  chickenCrossHistory: Array<{
    seed: number;
    initialWager: number;
    finalPayout: number;
    multiplier: number;
    state: 'LOST' | 'CASHED_OUT';
    timestamp: number;
  }> = [];
  private readonly CHICKEN_CROSS_LOG_STORAGE_KEY = 'chickenCrossHistory';
  hideChickenLosses = true;

  // Roulette properties
  rouletteInfo: RouletteGetInfoResponse | null = null;
  rouletteBet: number = 100;
  rouletteBetInput: string = '100';
  rouletteLoading = false;
  rouletteError = '';
  rouletteMessage = '';
  isRouletteSpinning = false;
  rouletteSpinResult: number | null = null;
  rouletteSpinColor: 'red' | 'black' | 'green' | null = null;
  rouletteBetType: RouletteBetType = 'red';
  rouletteBetValue: number = 1;
  showRouletteResult = false;
  rouletteWon = false;
  roulettePayout: number | null = null;
  rouletteRotation = 0;
  screenRotation = 0;
  screenSpinActive = false;
  screenResetting = false;
  private rouletteResultTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private rouletteClearResultTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // volume for sound effects
  audioVolume = 0.5; // 0.0 - 1.0

  // Pre-computed SVG wheel segments
  rouletteWheelSegments: Array<{ path: string; color: string }> = this.generateRouletteWheelSegments();

  rouletteSpinLog: Array<{
    id: number;
    timestamp: number;
    betType: string;
    betValue?: string | number;
    spinResult: number;
    won: boolean;
    payout: number;
    betAmount: number;
  }> = [];
  private readonly ROULETTE_LOG_STORAGE_KEY = 'rouletteSpinLog';
  hideRouletteLosses = true;

  private http = inject(HttpClient);
  private audioService = inject(AudioService);
  private elementRef = inject(ElementRef);
  private themeService = inject(ThemeService);
  private zvcService = inject(ZvcService);

  constructor(public authService: AuthService) {
    this.loadUserStats();
    this.loadSlotMachineInfo();
    this.loadLuckyWheelInfo();
    this.loadChickenCrossInfo();
    this.loadChickenCrossActive();
    this.loadRouletteInfo();
    this.loadWinLog();
    this.loadLuckyWheelSpinLog();
    this.loadChickenCrossHistory();

    // Register roulette sounds
    this.audioService.register('roulette.spin', '/assets/sounds/roulette-spin.mp3', {
      loop: true,
      volume: this.audioVolume,
    });
    this.audioService.register('roulette.win', '/assets/sounds/win.mp3', { volume: this.audioVolume });
    this.audioService.register('roulette.lose', '/assets/sounds/lose.mp3', { volume: this.audioVolume });

    // Lucky Wheel spin sound
    this.audioService.register('luckywheel.spin', '/assets/sounds/wheel.mp3', { loop: true, volume: this.audioVolume });
    this.audioService.register('luckywheel.win', '/assets/sounds/win.mp3', { volume: this.audioVolume });
    this.audioService.register('luckywheel.lose', '/assets/sounds/lose.mp3', { volume: this.audioVolume });

    // Slot machine spin sound
    this.audioService.register('slot.spin', '/assets/sounds/slot.mp3', { loop: true, volume: this.audioVolume });
    this.audioService.register('slot.win', '/assets/sounds/win.mp3', { volume: this.audioVolume });
    this.audioService.register('slot.lose', '/assets/sounds/lose.mp3', { volume: this.audioVolume });
  }

  ngOnInit(): void {
    // Initialize slot machine with question marks
    setTimeout(() => {
      this.initializeSlotMachine();
    }, 100);
  }

  ngOnDestroy(): void {
    // Clean up any active timeouts
    if (this.rouletteResultTimeoutId !== null) {
      clearTimeout(this.rouletteResultTimeoutId);
    }
    if (this.rouletteClearResultTimeoutId !== null) {
      clearTimeout(this.rouletteClearResultTimeoutId);
    }
  }

  private loadUserStats(): void {
    this.authService.authenticatedGet<{ stats: Statistics }>(`${environment.apiUrl}/stats`).subscribe({
      next: (response) => {
        if (response?.stats) {
          this.userStatistics = {
            ...this.userStatistics,
            ...response.stats,
          };
          this.zvcService.setBalance(this.userStatistics.experience || 0);
        }
      },
      error: (error) => {
        console.error('Fehler beim Laden der Benutzerstatistiken:', error);
      },
    });
  }

  // ===== SLOT MACHINE METHODS =====

  private generateRouletteWheelSegments(): Array<{ path: string; color: string }> {
    const segments: Array<{ path: string; color: string }> = [];
    const total = 37;
    const cx = 100;
    const cy = 100;
    const r = 100;

    for (let i = 0; i < total; i++) {
      const num = GamesComponent.ROULETTE_WHEEL_SEQUENCE[i];
      const startAngleDeg = (i / total) * 360;
      const endAngleDeg = ((i + 1) / total) * 360;

      const startAngle = (startAngleDeg * Math.PI) / 180 - Math.PI / 2;
      const endAngle = (endAngleDeg * Math.PI) / 180 - Math.PI / 2;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);

      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;

      let color: string;
      if (num === 0) {
        color = '#10b981';
      } else if (GamesComponent.RED_NUMBERS.includes(num)) {
        color = '#ef4444';
      } else {
        color = '#1f2937';
      }

      segments.push({ path, color });
    }

    return segments;
  }

  initializeSlotMachine(): void {
    const questionMark = '❓';
    const slots = document.querySelectorAll('.symbols');

    slots.forEach((slot) => {
      const symbolsDiv = slot as HTMLElement;
      symbolsDiv.innerHTML = ''; // Clear existing content
      for (let i = 0; i < 100; i++) {
        const symbol = document.createElement('span');
        symbol.textContent = questionMark;
        symbol.style.fontSize = '120px';
        symbol.style.lineHeight = '150px';
        symbol.style.height = '150px';
        symbol.style.display = 'block';
        symbolsDiv.appendChild(symbol);
      }
    });
  }

  spin(
    slotSymbols: string[],
    targetSymbol1: string,
    targetSymbol2: string,
    targetSymbol3: string,
    onComplete: () => void,
  ): void {
    const slots = document.querySelectorAll('.slot');

    slots.forEach((slot, index) => {
      const symbolsDiv = slot.querySelector('.symbols') as HTMLElement;
      if (!symbolsDiv) return;

      symbolsDiv.innerHTML = '';

      // Ensure we have at least one question mark at the start, then slotSymbols
      const questionMark = '❓';
      slotSymbols.forEach((sym) => {
        const symbol = document.createElement('span');
        symbol.textContent = sym;
        symbol.style.fontSize = '120px';
        symbol.style.lineHeight = '150px';
        symbol.style.height = '150px';
        symbol.style.display = 'block';
        symbolsDiv.appendChild(symbol);
      });

      let targetSymbol = targetSymbol1;
      if (index === 1) targetSymbol = targetSymbol2;
      else if (index === 2) targetSymbol = targetSymbol3;

      const targetIndex = slotSymbols.indexOf(targetSymbol);
      if (targetIndex === -1) return;

      // Calculate random number of spins (at least 3 full cycles)
      const cycles = 3 + Math.random() * 2;
      const symbolHeight = 150;
      const topValue = -(symbolHeight * (targetIndex + 1 + cycles * slotSymbols.length) + 75 / 2);

      // Delay each slot slightly for flair
      const delay = index * 0.15;
      setTimeout(() => {
        symbolsDiv.style.transition = 'top 10s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
        symbolsDiv.style.top = `${topValue}px`;
      }, delay * 1000);
    });

    // Call onComplete after animation finishes
    setTimeout(onComplete, 10000);

    // Log the final displayed symbols (for debugging)
    setTimeout(() => {
      this.displayedSymbols(slotSymbols);
    }, 10000);
  }

  displayedSymbols(slotSymbols: string[]): void {
    const slots = document.querySelectorAll('.slot');
    const displayedSymbols: string[] = [];

    slots.forEach((slot) => {
      const symbolsDiv = slot.querySelector('.symbols') as HTMLElement;
      if (!symbolsDiv) return;

      const symbolHeight = 150;
      const topValue = Math.abs(parseFloat(symbolsDiv.style.top));

      // Account for the question mark at the beginning
      const symbolIndex = (Math.floor(topValue / symbolHeight) - 1) % slotSymbols.length;
      const displayedSymbol = slotSymbols[symbolIndex];
      if (displayedSymbol) {
        displayedSymbols.push(displayedSymbol);
      }
    });

    console.log('🎰 Slot Machine Results:', displayedSymbols);
  }

  loadSlotMachineInfo(): void {
    this.authService
      .authenticatedGet<{
        cost: number;
        payoutTable: Array<{
          symbol: string;
          name: string;
          condition: string;
          payout: number;
          tier: string;
          description: string;
        }>;
        symbols: string[];
        description: string;
      }>(`${environment.apiUrl}/slotmachine/info`)
      .subscribe({
        next: (response) => {
          this.slotMachineInfo = response;
        },
        error: (error) => {
          console.error('Error loading slot machine info:', error);
        },
      });
  }

  private loadWinLog(): void {
    try {
      const stored = localStorage.getItem(this.WIN_LOG_STORAGE_KEY);
      if (stored) {
        this.slotWinLog = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading win log from localStorage:', error);
      this.slotWinLog = [];
    }
  }

  private saveWinLog(): void {
    try {
      localStorage.setItem(this.WIN_LOG_STORAGE_KEY, JSON.stringify(this.slotWinLog));
    } catch (error) {
      console.error('Error saving win log to localStorage:', error);
    }
  }

  private addToWinLog(
    winType: 'jackpot' | 'big_win' | 'small_win' | 'mini_win' | 'loss',
    payout: number,
    symbols: [string, string, string],
    netChange: number,
  ): void {
    const entry: SlotWinLogEntry = {
      id: Date.now(),
      timestamp: Date.now(),
      winType,
      payout,
      symbols,
      netChange,
    };

    this.slotWinLog.unshift(entry);

    if (this.slotWinLog.length > this.MAX_WIN_LOG_ENTRIES) {
      this.slotWinLog = this.slotWinLog.slice(0, this.MAX_WIN_LOG_ENTRIES);
    }

    this.saveWinLog();
  }

  private loadLuckyWheelSpinLog(): void {
    try {
      const stored = localStorage.getItem(this.WHEEL_LOG_STORAGE_KEY);
      if (stored) {
        this.luckyWheelSpinLog = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading lucky wheel spins from localStorage:', error);
      this.luckyWheelSpinLog = [];
    }
  }

  private saveLuckyWheelSpinLog(): void {
    try {
      localStorage.setItem(this.WHEEL_LOG_STORAGE_KEY, JSON.stringify(this.luckyWheelSpinLog));
    } catch (error) {
      console.error('Error saving lucky wheel spins to localStorage:', error);
    }
  }

  private addLuckyWheelSpinToLog(multiplier: number, payout: number, bet: number, message: string): void {
    const entry: LuckyWheelSpinLogEntry = {
      id: Date.now(),
      timestamp: Date.now(),
      multiplier,
      payout,
      bet,
      message,
    };

    this.luckyWheelSpinLog.unshift(entry);
    if (this.luckyWheelSpinLog.length > this.MAX_WIN_LOG_ENTRIES) {
      this.luckyWheelSpinLog = this.luckyWheelSpinLog.slice(0, this.MAX_WIN_LOG_ENTRIES);
    }

    this.saveLuckyWheelSpinLog();
  }

  getTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
    if (hours > 0) return hours === 1 ? 'vor 1 Stunde' : `vor ${hours} Stunden`;
    if (minutes > 0) return minutes === 1 ? 'vor 1 Minute' : `vor ${minutes} Minuten`;
    return 'Gerade eben';
  }

  getWinTypeInfo(winType: string): {
    emoji: string;
    color: string;
    label: string;
  } {
    switch (winType) {
      case 'jackpot':
        return { emoji: '', color: '#fbbf24', label: 'JACKPOT' };
      case 'big_win':
        return { emoji: '', color: '#f97316', label: 'Großgewinn' };
      case 'small_win':
        return { emoji: '', color: '#22d3ee', label: 'Gewinn' };
      case 'mini_win':
        return { emoji: '', color: '#4ade80', label: 'Mini' };
      case 'loss':
        return { emoji: '', color: '#d6f54dff', label: 'Verlust' };
      default:
        return { emoji: '', color: '#9ca3af', label: 'Unbekannt' };
    }
  }

  getFilteredWinLog(): SlotWinLogEntry[] {
    if (this.hideLosses) {
      return this.slotWinLog.filter((entry) => entry.winType !== 'loss');
    }
    return this.slotWinLog;
  }

  getFilteredWheelSpinLog(): LuckyWheelSpinLogEntry[] {
    if (this.hideWheelLosses) {
      return this.luckyWheelSpinLog.filter((entry) => entry.multiplier >= 1.0);
    }
    return this.luckyWheelSpinLog;
  }

  getWheelSpinTypeInfo(entry: LuckyWheelSpinLogEntry): {
    emoji: string;
    color: string;
    label: string;
  } {
    if (entry.multiplier >= 1.0) {
      return { emoji: '✨', color: '#34d399', label: 'GEWINN' };
    }
    return { emoji: '💀', color: '#f87171', label: 'VERLOREN' };
  }

  toggleHideLosses(): void {
    this.hideLosses = !this.hideLosses;
  }

  toggleAutoWheelSpin(): void {
    this.autoWheelSpinEnabled = !this.autoWheelSpinEnabled;

    if (this.autoWheelSpinEnabled) {
      this.spinLuckyWheel();
    }
  }

  checkForAutoWheelSpin(): void {
    setTimeout(() => {
      if (this.autoWheelSpinEnabled) {
        this.spinLuckyWheel();
      }
    }, 500);
  }

  togglePayoutInfo(): void {
    this.showPayoutInfo = !this.showPayoutInfo;
  }

  canAffordSlotMachine(): boolean {
    const cost = this.slotMachineInfo?.cost || 10;
    const currentBalance = this.userStatistics.experience || 0;
    return currentBalance >= cost;
  }

  testSlotMachine(): void {
    if (this.isSpinning) {
      return;
    }

    const cost = this.slotMachineInfo?.cost || 10;

    const currentBalance = this.userStatistics.experience || 0;
    if (currentBalance < cost) {
      this.slotMachineError = `Nicht genügend ZVC! Du brauchst mindestens ${cost} ZVC.`;
      setTimeout(() => {
        this.slotMachineError = '';
      }, 3000);
      return;
    }

    this.isSpinning = true;
    this.slotMachineLoading = true;
    this.slotMachineError = '';
    this.slotMachineMessage = '';
    this.showWinningAnimation = false;

    // Pause ZVC polling during 10s slot animation
    this.zvcService.pausePolling(10500);

    this.userStatistics.experience = (this.userStatistics.experience || 0) - cost;
    this.zvcService.setBalance(this.userStatistics.experience);

    this.authService
      .authenticatedPost<{
        result: [string, string, string];
        emojis: string[];
        winType: 'jackpot' | 'big_win' | 'small_win' | 'mini_win' | 'loss';
        payout: number;
        netChange: number;
        message: string;
      }>(`${environment.apiUrl}/slotmachine`, {})
      .subscribe({
        next: (response) => {
          const [slot1, slot2, slot3] = response.result;
          const { winType, payout, netChange, message } = response;

          const mySymbols = [
            '🍒',
            '🍋',
            '🍉',
            '🍇',
            '🔔',
            '⭐',
            '💎',
            '🌈',
            '🔥',
            '🪙',
            '💰',
            '💫',
            '🎇',
            '🌟',
            '🥭',
            '🍍',
          ];

          void this.audioService.play('slot.spin');

          this.spin(mySymbols, slot1, slot2, slot3, () => {
            this.audioService.stop('slot.spin');

            if (payout > 0) {
              void this.audioService.play('slot.win');
            } else {
              void this.audioService.play('slot.lose');
            }

            this.addToWinLog(winType, payout, [slot1, slot2, slot3], netChange);
          });

          setTimeout(() => {
            this.isSpinning = false;
            this.slotMachineLoading = false;
            this.currentWinType = winType;

            if (payout > 0) {
              this.userStatistics.experience = (this.userStatistics.experience || 0) + payout;
              this.zvcService.setBalance(this.userStatistics.experience);
            }
          }, 10000);
        },
        error: (error) => {
          this.audioService.stop('slot.spin');

          this.isSpinning = false;
          this.slotMachineLoading = false;
          const cost = this.slotMachineInfo?.cost || 10;
          this.userStatistics.experience = (this.userStatistics.experience || 0) + cost;
          this.zvcService.setBalance(this.userStatistics.experience);
          this.slotMachineError = error?.error?.error || 'Fehler beim Spielen der Slotmaschine';

          setTimeout(() => {
            this.slotMachineError = '';
          }, 3000);
        },
      });
  }

  toggleAutoSpin(): void {
    this.autoSpinEnabled = !this.autoSpinEnabled;

    if (this.autoSpinEnabled) {
      this.testSlotMachine();
    }
  }

  trackByWinLogId(index: number, entry: SlotWinLogEntry): number {
    return entry.id;
  }

  trackByWheelSpinId(index: number, entry: LuckyWheelSpinLogEntry): number {
    return entry.id;
  }

  // ===== LUCKY WHEEL METHODS =====

  loadLuckyWheelInfo(): void {
    this.luckyWheelError = '';
    this.authService.authenticatedGet<LuckyWheelInfo>(`${environment.apiUrl}/luckywheel/info`).subscribe({
      next: (response) => {
        this.luckyWheelInfo = response;
        this.luckyWheelError = '';
        const defaultBet = typeof response.minBet === 'number' ? response.minBet : this.luckyWheelBet;
        this.luckyWheelBet = this.clampLuckyWheelBet(defaultBet || 0);
        this.syncLuckyWheelBetInput();
      },
      error: (error) => {
        console.error('Error loading lucky wheel info:', error);
        this.luckyWheelError = 'Fehler beim Laden des Glücksrads. Bitte versuche es erneut.';
      },
    });
  }

  canAffordLuckyWheel(): boolean {
    const bet = this.getPendingLuckyWheelBet();
    return (this.userStatistics.experience || 0) >= bet;
  }

  adjustLuckyWheelBet(amount: number): void {
    if (!this.luckyWheelInfo) return;

    this.commitLuckyWheelBetInput();

    const newBet = (this.luckyWheelBet || this.luckyWheelInfo.minBet) + amount;

    this.luckyWheelBet = this.clampLuckyWheelBet(newBet);
    this.syncLuckyWheelBetInput();
  }

  onLuckyWheelBetInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let sanitized = input.value.replace(/[^0-9]/g, '');

    sanitized = sanitized.replace(/^0+/, '') || '0';

    if (this.luckyWheelInfo) {
      const numValue = parseInt(sanitized, 10);
      if (!isNaN(numValue) && numValue > this.luckyWheelInfo.maxBet) {
        sanitized = this.luckyWheelInfo.maxBet.toString();
      }
    }

    this.luckyWheelBetInput = sanitized;
    input.value = sanitized;
  }

  onLuckyWheelBetKeydown(event: KeyboardEvent): void {
    const controlKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }

    if (controlKeys.includes(event.key)) {
      return;
    }

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  commitLuckyWheelBetInput(): void {
    if (!this.luckyWheelInfo) {
      const parsed = parseInt(this.luckyWheelBetInput, 10);
      if (Number.isNaN(parsed)) {
        this.luckyWheelBet = Math.max(0, this.luckyWheelBet || 0);
      } else {
        this.luckyWheelBet = Math.max(0, Math.round(parsed));
      }
      this.luckyWheelBetInput = (this.luckyWheelBet || 0).toString();
      return;
    }

    const parsed = parseInt(this.luckyWheelBetInput, 10);
    if (Number.isNaN(parsed)) {
      this.luckyWheelBet = this.luckyWheelInfo.minBet;
    } else {
      this.luckyWheelBet = this.clampLuckyWheelBet(parsed);
    }
    this.syncLuckyWheelBetInput();
  }

  private syncLuckyWheelBetInput(): void {
    const fallback = this.luckyWheelInfo?.minBet ?? 0;
    const bet = this.luckyWheelBet ?? fallback;
    this.luckyWheelBetInput = Math.max(0, bet).toString();
  }

  private clampLuckyWheelBet(value: number): number {
    const rounded = Math.round(value);
    if (!this.luckyWheelInfo) {
      return Math.max(0, rounded);
    }
    return Math.max(this.luckyWheelInfo.minBet, Math.min(this.luckyWheelInfo.maxBet, rounded));
  }

  private getPendingLuckyWheelBet(): number {
    if (!this.luckyWheelInfo) {
      const parsed = parseInt(this.luckyWheelBetInput, 10);
      return Number.isNaN(parsed) ? Math.max(0, this.luckyWheelBet || 0) : Math.max(0, Math.round(parsed));
    }

    const parsed = parseInt(this.luckyWheelBetInput, 10);
    if (Number.isNaN(parsed)) {
      return this.clampLuckyWheelBet(this.luckyWheelBet || this.luckyWheelInfo.minBet);
    }
    return this.clampLuckyWheelBet(parsed);
  }

  spinLuckyWheel(): void {
    if (!this.luckyWheelInfo || this.isWheelSpinning) return;

    this.commitLuckyWheelBetInput();
    const bet = this.luckyWheelBet || 0;

    if (bet < this.luckyWheelInfo.minBet || bet > this.luckyWheelInfo.maxBet) {
      this.luckyWheelError = `Einsatz muss zwischen ${this.luckyWheelInfo.minBet} und ${this.luckyWheelInfo.maxBet} ZVC liegen.`;
      setTimeout(() => {
        this.luckyWheelError = '';
      }, 3000);
      return;
    }

    if (!this.canAffordLuckyWheel()) {
      this.luckyWheelError = `Nicht genügend ZVC! Du brauchst mindestens ${bet} ZVC.`;
      setTimeout(() => {
        this.luckyWheelError = '';
      }, 3000);
      return;
    }

    this.isWheelSpinning = true;
    void this.audioService.play('luckywheel.spin');
    this.luckyWheelLoading = true;
    this.luckyWheelError = '';
    this.luckyWheelMessage = '';
    this.showWheelResult = false;
    this.winningSegmentIndex = null;

    // Pause ZVC polling during 4s wheel animation
    this.zvcService.pausePolling(4500);

    this.userStatistics.experience = (this.userStatistics.experience || 0) - bet;
    this.zvcService.setBalance(this.userStatistics.experience);

    this.authService
      .authenticatedPost<LuckyWheelResult>(`${environment.apiUrl}/luckywheel`, {
        bet,
      })
      .subscribe({
        next: (response) => {
          this.lastWheelMultiplier = response.multiplier;
          this.lastWheelPayout = response.payout;

          const segments = this.getWheelSegments();
          const matchingIndices: number[] = [];
          segments.forEach((seg, idx) => {
            if (seg.multiplier === response.multiplier) {
              matchingIndices.push(idx);
            }
          });

          const fallbackIndex = segments.findIndex((seg) => seg.multiplier === response.multiplier);

          const targetSegmentIndex = (
            matchingIndices.length
              ? matchingIndices[Math.floor(Math.random() * matchingIndices.length)]
              : fallbackIndex !== -1
                ? fallbackIndex
                : 0
          )!;

          const totalSegments = segments.length || 1;
          const degreesPerSegment = 360 / totalSegments;

          const rawSegmentCenterAngle = targetSegmentIndex * degreesPerSegment + degreesPerSegment / 2 - 90;
          const segmentCenterAngle = this.normalizeAngle(rawSegmentCenterAngle);

          const pointerAngle = 270;

          const currentAngle = this.normalizeAngle(this.wheelRotation);

          let rotationToPointer = pointerAngle - segmentCenterAngle - currentAngle;
          rotationToPointer = this.normalizeAngle(rotationToPointer);

          const minFullRotations = 5;
          const extraRotations = Math.floor(Math.random() * 3);
          const spinDegrees = (minFullRotations + extraRotations) * 360 + rotationToPointer;

          this.wheelRotation += spinDegrees;

          const resolvedSegmentIndex = targetSegmentIndex;

          setTimeout(() => {
            this.audioService.stop('luckywheel.spin');

            if (response.payout > 0) {
              void this.audioService.play('luckywheel.win');
            } else {
              void this.audioService.play('luckywheel.lose');
            }

            this.isWheelSpinning = false;
            this.luckyWheelLoading = false;
            this.showWheelResult = true;
            this.winningSegmentIndex = resolvedSegmentIndex;

            if (response.payout > 0) {
              this.userStatistics.experience = (this.userStatistics.experience || 0) + response.payout;
              this.zvcService.setBalance(this.userStatistics.experience);
            }

            this.luckyWheelMessage = response.message;
            this.addLuckyWheelSpinToLog(response.multiplier, response.payout, bet, response.message);

            this.showWheelResult = false;
            this.luckyWheelMessage = '';
            this.winningSegmentIndex = null;

            this.checkForAutoWheelSpin();
          }, 4000);
        },
        error: (error) => {
          this.audioService.stop('luckywheel.spin');
          this.isWheelSpinning = false;
          this.luckyWheelLoading = false;

          this.userStatistics.experience = (this.userStatistics.experience || 0) + bet;
          this.zvcService.setBalance(this.userStatistics.experience);

          this.luckyWheelError = error?.error?.error || 'Fehler beim Drehen des Glücksrads';

          setTimeout(() => {
            this.luckyWheelError = '';
          }, 3000);
        },
      });
  }

  getTotalSegments(): number {
    if (!this.luckyWheelInfo) return 1;
    return this.luckyWheelInfo.payoutTable.reduce((sum, entry) => sum + entry.weight, 0);
  }

  private normalizeAngle(angle: number): number {
    return ((angle % 360) + 360) % 360;
  }

  getMultiplierSegmentIndex(multiplier: number): number {
    if (!this.luckyWheelInfo) return 0;

    let index = 0;
    for (const entry of this.luckyWheelInfo.payoutTable) {
      if (entry.multiplier === multiplier) {
        return index + Math.floor(entry.weight / 2);
      }
      index += entry.weight;
    }
    return 0;
  }

  getWheelSegments(): Array<{ color: string; multiplier: number }> {
    if (this.cachedWheelSegments) {
      return this.cachedWheelSegments;
    }

    if (!this.luckyWheelInfo) return [];

    const segments: Array<{ color: string; multiplier: number }> = [];

    const sortedTable = [...this.luckyWheelInfo.payoutTable].sort((a, b) => a.multiplier - b.multiplier);

    this.luckyWheelInfo.payoutTable.forEach((entry) => {
      const sortedIndex = sortedTable.findIndex((e) => e.multiplier === entry.multiplier);
      const color = this.getColorFromPaletteIndex(sortedIndex, sortedTable.length);
      for (let i = 0; i < entry.weight; i++) {
        segments.push({ color, multiplier: entry.multiplier });
      }
    });

    this.cachedWheelSegments = this.seededShuffle(segments);
    return this.cachedWheelSegments;
  }

  seededShuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    const seed = new Date()
      .toDateString()
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);

    let random = seed;
    const next = () => {
      random = (random * 1103515245 + 12345) & 0x7fffffff;
      return random / 0x7fffffff;
    };

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  }

  getColorFromPaletteIndex(index: number, total: number): string {
    const palette = [
      '#6b7280', // Grey (lowest)
      '#f59e0b', // Orange
      '#8b5cf6', // Purple
      '#3b82f6', // Blue
      '#10b981', // Green
      '#ec4899', // Pink/Magenta (highest)
    ];

    if (total === 1) return palette[palette.length - 1];

    const paletteIndex = Math.floor((index / (total - 1)) * (palette.length - 1));
    return palette[paletteIndex];
  }

  getMultiplierColor(multiplier: number): string {
    if (!this.luckyWheelInfo) return '#3b82f6';

    const sortedTable = [...this.luckyWheelInfo.payoutTable].sort((a, b) => a.multiplier - b.multiplier);
    const sortedIndex = sortedTable.findIndex((e) => e.multiplier === multiplier);

    return this.getColorFromPaletteIndex(sortedIndex, sortedTable.length);
  }

  // ===== CHICKEN CROSS METHODS =====

  loadChickenCrossInfo(): void {
    this.authService.authenticatedGet<ChickenCrossInfoResponse>(`${environment.apiUrl}/chickencross/info`).subscribe({
      next: (response) => {
        this.chickenCrossInfo = response;
        this.chickenCrossBet = response.minBet;
        this.chickenCrossBetInput = response.minBet.toString();
      },
      error: (error) => {
        console.error('Error loading chicken cross info:', error);
        this.chickenCrossError = 'Fehler beim Laden des Spiels.';
      },
    });
  }

  private chickenSeededRandom(seed: number, step: number): number {
    const combined = seed * 10000 + step;
    let x = Math.sin(combined) * 10000;
    return x - Math.floor(x);
  }

  getChickenMultiplierForStep(seed: number, step: number): number {
    const baseMultiplier = Math.pow(1.08, step);
    const variance = this.chickenSeededRandom(seed, step * 1000);
    const withVariance = baseMultiplier * (1 + variance * 0.03);
    return Math.round(withVariance * 100) / 100;
  }

  getNextChickenSteps(): Array<{ step: number; multiplier: number }> {
    if (!this.chickenCrossGame) return [];
    const currentStep = this.chickenCrossGame.step;
    const seed = this.chickenCrossGame.seed;
    const steps: Array<{ step: number; multiplier: number }> = [];
    for (let i = 1; i <= 4; i++) {
      const nextStep = currentStep + i;
      steps.push({
        step: nextStep,
        multiplier: this.getChickenMultiplierForStep(seed, nextStep),
      });
    }
    return steps;
  }

  getDeadChickenNextSteps(): Array<{ step: number; multiplier: number }> {
    if (!this.chickenCrossDeadGame) return [];
    const currentStep = this.chickenCrossDeadGame.step;
    const seed = this.chickenCrossDeadGame.seed;
    const steps: Array<{ step: number; multiplier: number }> = [];
    for (let i = 1; i <= 4; i++) {
      const nextStep = currentStep + i;
      steps.push({
        step: nextStep,
        multiplier: this.getChickenMultiplierForStep(seed, nextStep),
      });
    }
    return steps;
  }

  scrollChickenRoadToCenter(): void {
    setTimeout(() => {
      const road = document.querySelector('.chicken-road') as HTMLElement;
      const currentLane = document.querySelector('.chicken-lane.chicken-current') as HTMLElement;
      if (road && currentLane) {
        const roadRect = road.getBoundingClientRect();
        const laneRect = currentLane.getBoundingClientRect();
        const scrollLeft = currentLane.offsetLeft - roadRect.width / 2 + laneRect.width / 2;
        road.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      }
    }, 50);
  }

  resetChickenRoadScroll(): void {
    setTimeout(() => {
      const road = document.querySelector('.chicken-road') as HTMLElement;
      if (road) {
        road.scrollTo({ left: 0, behavior: 'smooth' });
      }
    }, 50);
  }

  loadChickenCrossActive(): void {
    this.authService
      .authenticatedGet<ChickenCrossActiveResponse>(`${environment.apiUrl}/chickencross/active`)
      .subscribe({
        next: (response) => {
          if (response.activeGameSeed) {
            this.loadChickenCrossGame(response.activeGameSeed);
          } else {
            this.resetChickenRoadScroll();
          }
        },
        error: (error) => {
          console.error('Error loading active chicken cross game:', error);
          this.resetChickenRoadScroll();
        },
      });
  }

  loadChickenCrossGame(seed: number): void {
    this.authService
      .authenticatedGet<ChickenCrossGetResponse>(`${environment.apiUrl}/chickencross?seed=${seed}`)
      .subscribe({
        next: (response) => {
          if (response.state === 'ACTIVE') {
            this.chickenCrossGame = response;
            this.scrollChickenRoadToCenter();
          }
        },
        error: (error) => {
          console.error('Error loading chicken cross game:', error);
        },
      });
  }

  getChickenHistoryTypeInfo(entry: (typeof this.chickenCrossHistory)[0]): {
    emoji: string;
    color: string;
    label: string;
  } {
    if (entry.state === 'CASHED_OUT') {
      if (entry.multiplier >= 5) return { emoji: '🎉', color: '#ec4899', label: 'MEGA!' };
      return { emoji: '✨', color: '#34d399', label: 'GEWINN' };
    }
    return { emoji: '💀', color: '#f87171', label: 'VERLOREN' };
  }

  loadChickenCrossHistory(): void {
    try {
      const stored = localStorage.getItem(this.CHICKEN_CROSS_LOG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          Array.isArray(parsed) &&
          parsed.some((entry: any) => entry.steps !== undefined && entry.multiplier === undefined)
        ) {
          localStorage.removeItem(this.CHICKEN_CROSS_LOG_STORAGE_KEY);
          this.chickenCrossHistory = [];
        } else {
          this.chickenCrossHistory = parsed;
        }
      }
    } catch {
      this.chickenCrossHistory = [];
    }
  }

  saveChickenCrossHistory(): void {
    try {
      const toStore = this.chickenCrossHistory.slice(0, this.MAX_WIN_LOG_ENTRIES);
      localStorage.setItem(this.CHICKEN_CROSS_LOG_STORAGE_KEY, JSON.stringify(toStore));
    } catch {
      console.error('Failed to save chicken cross history');
    }
  }

  addChickenCrossToHistory(
    seed: number,
    initialWager: number,
    finalPayout: number,
    multiplier: number,
    state: 'LOST' | 'CASHED_OUT',
  ): void {
    this.chickenCrossHistory.unshift({
      seed,
      initialWager,
      finalPayout,
      multiplier,
      state,
      timestamp: Date.now(),
    });
    if (this.chickenCrossHistory.length > this.MAX_WIN_LOG_ENTRIES) {
      this.chickenCrossHistory.pop();
    }
    this.saveChickenCrossHistory();
  }

  getFilteredChickenHistory(): typeof this.chickenCrossHistory {
    if (this.hideChickenLosses) {
      return this.chickenCrossHistory.filter((entry) => entry.state === 'CASHED_OUT');
    }
    return this.chickenCrossHistory;
  }

  trackByChickenHistoryId(index: number, entry: (typeof this.chickenCrossHistory)[0]): number {
    return entry.seed;
  }

  canAffordChickenCross(): boolean {
    const bet = this.getPendingChickenCrossBet();
    return (this.userStatistics.experience || 0) >= bet;
  }

  hasActiveChickenCrossGame(): boolean {
    return this.chickenCrossGame !== null;
  }

  onChickenCrossBetInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let sanitized = input.value.replace(/[^0-9]/g, '');
    sanitized = sanitized.replace(/^0+/, '') || '0';

    if (this.chickenCrossInfo) {
      const numValue = parseInt(sanitized, 10);
      if (!isNaN(numValue) && numValue > this.chickenCrossInfo.maxBet) {
        sanitized = this.chickenCrossInfo.maxBet.toString();
      }
    }

    this.chickenCrossBetInput = sanitized;
    input.value = sanitized;
  }

  onChickenCrossBetKeydown(event: KeyboardEvent): void {
    const controlKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }
    if (controlKeys.includes(event.key)) {
      return;
    }
    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  commitChickenCrossBetInput(): void {
    if (!this.chickenCrossInfo) {
      const parsed = parseInt(this.chickenCrossBetInput, 10);
      this.chickenCrossBet = Number.isNaN(parsed) ? 100 : Math.max(0, Math.round(parsed));
      this.chickenCrossBetInput = this.chickenCrossBet.toString();
      return;
    }

    const parsed = parseInt(this.chickenCrossBetInput, 10);
    if (Number.isNaN(parsed)) {
      this.chickenCrossBet = this.chickenCrossInfo.minBet;
    } else {
      this.chickenCrossBet = Math.max(
        this.chickenCrossInfo.minBet,
        Math.min(this.chickenCrossInfo.maxBet, Math.round(parsed)),
      );
    }
    this.chickenCrossBetInput = this.chickenCrossBet.toString();
  }

  private getPendingChickenCrossBet(): number {
    if (!this.chickenCrossInfo) {
      const parsed = parseInt(this.chickenCrossBetInput, 10);
      return Number.isNaN(parsed) ? 100 : Math.max(0, Math.round(parsed));
    }

    const parsed = parseInt(this.chickenCrossBetInput, 10);
    if (Number.isNaN(parsed)) {
      return this.chickenCrossInfo.minBet;
    }
    return Math.max(this.chickenCrossInfo.minBet, Math.min(this.chickenCrossInfo.maxBet, Math.round(parsed)));
  }

  adjustChickenCrossBet(amount: number): void {
    if (!this.chickenCrossInfo) return;
    this.commitChickenCrossBetInput();
    const newBet = (this.chickenCrossBet || this.chickenCrossInfo.minBet) + amount;
    this.chickenCrossBet = Math.max(this.chickenCrossInfo.minBet, Math.min(this.chickenCrossInfo.maxBet, newBet));
    this.chickenCrossBetInput = this.chickenCrossBet.toString();
  }

  startChickenCrossGame(): void {
    if (!this.chickenCrossInfo || this.chickenCrossLoading || this.hasActiveChickenCrossGame()) return;

    this.commitChickenCrossBetInput();
    const bet = this.chickenCrossBet;

    if (bet < this.chickenCrossInfo.minBet || bet > this.chickenCrossInfo.maxBet) {
      this.chickenCrossError = `Einsatz muss zwischen ${this.chickenCrossInfo.minBet} und ${this.chickenCrossInfo.maxBet} ZVC liegen.`;
      setTimeout(() => (this.chickenCrossError = ''), 3000);
      return;
    }

    if (!this.canAffordChickenCross()) {
      this.chickenCrossError = `Nicht genügend ZVC! Du brauchst mindestens ${bet} ZVC.`;
      setTimeout(() => (this.chickenCrossError = ''), 3000);
      return;
    }

    this.chickenCrossLoading = true;
    this.chickenCrossError = '';
    this.chickenCrossDeadGame = null;

    this.userStatistics.experience = (this.userStatistics.experience || 0) - bet;
    this.zvcService.setBalance(this.userStatistics.experience);

    const requestBody: ChickenCrossPostRequest = {
      intent: 'MOVE',
      bet: bet,
    };

    this.authService
      .authenticatedPost<ChickenCrossPostResponse>(`${environment.apiUrl}/chickencross`, requestBody)
      .subscribe({
        next: (response) => {
          this.chickenCrossLoading = false;
          this.chickenCrossGame = {
            seed: response.seed,
            initialWager: bet,
            currentPayout: response.currentPayout,
            step: 0,
            state: response.state,
            lastUpdatedAt: Date.now(),
          };
          this.scrollChickenRoadToCenter();
        },
        error: (error) => {
          this.chickenCrossLoading = false;
          this.userStatistics.experience = (this.userStatistics.experience || 0) + bet;
          this.zvcService.setBalance(this.userStatistics.experience);
          this.chickenCrossError = error?.error?.error || 'Fehler beim Starten des Spiels.';
          setTimeout(() => (this.chickenCrossError = ''), 3000);
        },
      });
  }

  chickenCrossMove(): void {
    if (
      !this.chickenCrossGame ||
      this.chickenCrossIsMoving ||
      this.chickenCrossIsAnimating ||
      this.chickenCrossGame.state !== 'ACTIVE'
    )
      return;

    this.chickenCrossIsMoving = true;
    this.chickenCrossIsAnimating = true;
    this.chickenCrossError = '';

    // Pause ZVC polling during chicken cross move (600ms + potential 1000ms lost animation)
    this.zvcService.pausePolling(2000);

    this.chickenCrossGame = {
      ...this.chickenCrossGame,
      step: this.chickenCrossGame.step + 1,
    };
    this.scrollChickenRoadToCenter();

    const requestBody: ChickenCrossPostRequest = {
      intent: 'MOVE',
      seed: this.chickenCrossGame.seed,
    };

    this.authService
      .authenticatedPost<ChickenCrossPostResponse>(`${environment.apiUrl}/chickencross`, requestBody)
      .subscribe({
        next: (response) => {
          setTimeout(() => {
            this.chickenCrossIsMoving = false;

            if (response.state === 'LOST') {
              this.chickenCrossGame = {
                ...this.chickenCrossGame!,
                state: 'LOST' as const,
              };
              this.chickenCrossLostAnimation = true;

              setTimeout(() => {
                const lostAtStep = this.chickenCrossGame!.step;
                const lostMultiplier = this.getChickenMultiplierForStep(this.chickenCrossGame!.seed, lostAtStep);
                this.addChickenCrossToHistory(
                  this.chickenCrossGame!.seed,
                  this.chickenCrossGame!.initialWager,
                  0,
                  lostMultiplier,
                  'LOST',
                );

                this.chickenCrossDeadGame = { ...this.chickenCrossGame! };
                this.chickenCrossGame = null;
                this.chickenCrossLostAnimation = false;
                this.chickenCrossIsAnimating = false;
              }, 1000);
            } else {
              this.chickenCrossGame = {
                ...this.chickenCrossGame!,
                currentPayout: response.currentPayout,
                state: response.state,
              };
              this.chickenCrossIsAnimating = false;
            }
          }, 600);
        },
        error: (error) => {
          this.chickenCrossGame = {
            ...this.chickenCrossGame!,
            step: this.chickenCrossGame!.step - 1,
          };
          this.chickenCrossIsMoving = false;
          this.chickenCrossIsAnimating = false;
          this.chickenCrossError = error?.error?.error || 'Fehler beim Bewegen.';
          setTimeout(() => (this.chickenCrossError = ''), 3000);
        },
      });
  }

  chickenCrossCashout(): void {
    if (!this.chickenCrossGame || this.chickenCrossLoading || this.chickenCrossGame.state !== 'ACTIVE') return;

    this.chickenCrossLoading = true;
    this.chickenCrossError = '';

    // Pause ZVC polling briefly during cashout
    this.zvcService.pausePolling(1000);

    const requestBody: ChickenCrossPostRequest = {
      intent: 'CASHOUT',
      seed: this.chickenCrossGame.seed,
    };

    this.authService
      .authenticatedPost<ChickenCrossPostResponse>(`${environment.apiUrl}/chickencross`, requestBody)
      .subscribe({
        next: (response) => {
          this.chickenCrossLoading = false;

          this.userStatistics.experience = (this.userStatistics.experience || 0) + response.currentPayout;
          this.zvcService.setBalance(this.userStatistics.experience);

          const multiplier = response.currentPayout / this.chickenCrossGame!.initialWager;

          if (this.chickenCrossGame!.step > 0) {
            this.addChickenCrossToHistory(
              this.chickenCrossGame!.seed,
              this.chickenCrossGame!.initialWager,
              response.currentPayout,
              multiplier,
              'CASHED_OUT',
            );
          }

          this.chickenCrossGame = null;
          this.resetChickenRoadScroll();
        },
        error: (error) => {
          this.chickenCrossLoading = false;
          this.chickenCrossError = error?.error?.error || 'Fehler beim Auszahlen.';
          setTimeout(() => (this.chickenCrossError = ''), 3000);
        },
      });
  }

  getChickenMultiplier(): string {
    if (!this.chickenCrossGame) return '1.00';
    const multiplier = this.chickenCrossGame.currentPayout / this.chickenCrossGame.initialWager;
    return multiplier.toFixed(2);
  }

  // ===== ROULETTE METHODS =====

  loadRouletteInfo(): void {
    this.rouletteError = '';
    this.authService.authenticatedGet<RouletteGetInfoResponse>(`${environment.apiUrl}/roulette/info`).subscribe({
      next: (response) => {
        this.rouletteInfo = response;
        this.rouletteError = '';
        const defaultBet = typeof response.minBet === 'number' ? response.minBet : this.rouletteBet;
        this.rouletteBet = this.clampRouletteBet(defaultBet || 0);
        this.syncRouletteBetInput();
        this.loadRouletteSpinLog();
      },
      error: (error) => {
        console.error('Error loading roulette info:', error);
        this.rouletteError = 'Fehler beim Laden des Roulettes. Bitte versuche es erneut.';
      },
    });
  }

  canAffordRoulette(): boolean {
    const bet = this.getPendingRouletteBet();
    return (this.userStatistics.experience || 0) >= bet;
  }

  onRouletteNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = parseInt(input.value, 10);

    if (isNaN(value)) {
      this.rouletteBetValue = 1;
      return;
    }

    if (value < 1) {
      value = 1;
    } else if (value > 36) {
      value = 36;
    }

    this.rouletteBetValue = value;
    input.value = value.toString();
  }

  adjustRouletteBet(amount: number): void {
    if (!this.rouletteInfo) return;

    this.commitRouletteBetInput();

    const newBet = (this.rouletteBet || this.rouletteInfo.minBet) + amount;

    this.rouletteBet = this.clampRouletteBet(newBet);
    this.syncRouletteBetInput();
  }

  onRouletteBetInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let sanitized = input.value.replace(/[^0-9]/g, '');

    sanitized = sanitized.replace(/^0+/, '') || '0';

    if (this.rouletteInfo) {
      const numValue = parseInt(sanitized, 10);
      if (!isNaN(numValue) && numValue > this.rouletteInfo.maxBet) {
        sanitized = this.rouletteInfo.maxBet.toString();
      }
    }

    this.rouletteBetInput = sanitized;
    input.value = sanitized;
  }

  onRouletteBetKeydown(event: KeyboardEvent): void {
    const controlKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }

    if (controlKeys.includes(event.key)) {
      return;
    }

    if (!/^[0-9]$/.test(event.key)) {
      event.preventDefault();
    }
  }

  commitRouletteBetInput(): void {
    if (!this.rouletteInfo) {
      const parsed = parseInt(this.rouletteBetInput, 10);
      if (Number.isNaN(parsed)) {
        this.rouletteBet = Math.max(0, this.rouletteBet || 0);
      } else {
        this.rouletteBet = Math.max(0, Math.round(parsed));
      }
      this.rouletteBetInput = (this.rouletteBet || 0).toString();
      return;
    }

    const parsed = parseInt(this.rouletteBetInput, 10);
    if (Number.isNaN(parsed)) {
      this.rouletteBet = this.rouletteInfo.minBet;
    } else {
      this.rouletteBet = this.clampRouletteBet(parsed);
    }
    this.syncRouletteBetInput();
  }

  private syncRouletteBetInput(): void {
    const fallback = this.rouletteInfo?.minBet ?? 0;
    const bet = this.rouletteBet ?? fallback;
    this.rouletteBetInput = Math.max(0, bet).toString();
  }

  private clampRouletteBet(value: number): number {
    const rounded = Math.round(value);
    if (!this.rouletteInfo) {
      return Math.max(0, rounded);
    }
    return Math.max(this.rouletteInfo.minBet, Math.min(this.rouletteInfo.maxBet, rounded));
  }

  private getPendingRouletteBet(): number {
    if (!this.rouletteInfo) {
      const parsed = parseInt(this.rouletteBetInput, 10);
      return Number.isNaN(parsed) ? Math.max(0, this.rouletteBet || 0) : Math.max(0, Math.round(parsed));
    }

    const parsed = parseInt(this.rouletteBetInput, 10);
    if (Number.isNaN(parsed)) {
      return this.clampRouletteBet(this.rouletteBet || this.rouletteInfo.minBet);
    }
    return this.clampRouletteBet(parsed);
  }

  spinRoulette(): void {
    if (!this.rouletteInfo || this.isRouletteSpinning) return;

    if (this.rouletteResultTimeoutId !== null) {
      clearTimeout(this.rouletteResultTimeoutId);
      this.rouletteResultTimeoutId = null;
    }
    if (this.rouletteClearResultTimeoutId !== null) {
      clearTimeout(this.rouletteClearResultTimeoutId);
      this.rouletteClearResultTimeoutId = null;
    }

    this.commitRouletteBetInput();
    const bet = this.rouletteBet || 0;

    if (bet < this.rouletteInfo.minBet || bet > this.rouletteInfo.maxBet) {
      this.rouletteError = `Einsatz muss zwischen ${this.rouletteInfo.minBet} und ${this.rouletteInfo.maxBet} ZVC liegen.`;
      setTimeout(() => {
        this.rouletteError = '';
      }, 3000);
      return;
    }

    if (this.rouletteBetType === 'number') {
      if (this.rouletteBetValue < 1 || this.rouletteBetValue > 36) {
        this.rouletteError = 'Nummer muss zwischen 1 und 36 liegen.';
        setTimeout(() => {
          this.rouletteError = '';
        }, 3000);
        return;
      }
    }

    if (!this.canAffordRoulette()) {
      this.rouletteError = `Nicht genügend ZVC! Du brauchst mindestens ${bet} ZVC.`;
      setTimeout(() => {
        this.rouletteError = '';
      }, 3000);
      return;
    }

    this.isRouletteSpinning = true;
    void this.audioService.play('roulette.spin');
    this.rouletteLoading = true;
    this.rouletteError = '';
    this.rouletteMessage = '';
    this.showRouletteResult = false;

    // Pause ZVC polling during 8s roulette animation (5s spin + 3s result)
    this.zvcService.pausePolling(8500);

    const requestBody: RoulettePostRequest = {
      bet,
      type: this.rouletteBetType,
    };

    if (this.rouletteBetType === 'number') {
      requestBody.value = this.rouletteBetValue;
    }

    this.userStatistics.experience = (this.userStatistics.experience || 0) - bet;
    this.zvcService.setBalance(this.userStatistics.experience);

    this.authService.authenticatedPost<RoulettePostResponse>(`${environment.apiUrl}/roulette`, requestBody).subscribe({
      next: (response) => {
        this.rouletteSpinResult = response.spinResult;
        this.rouletteWon = response.won;
        this.roulettePayout = response.payout;

        const position = GamesComponent.ROULETTE_WHEEL_SEQUENCE.indexOf(response.spinResult);
        const sectionSize = 360 / 37;
        const targetAngle = position * sectionSize + sectionSize / 2;
        const fullSpins = 5 * 360;
        const rotationDelta = fullSpins + (360 - targetAngle);

        this.rouletteRotation = this.rouletteRotation - (this.rouletteRotation % 360) + rotationDelta;

        if (bet === 67) {
          this.screenSpinActive = true;
          this.screenResetting = false;
          const screenFullSpins = 5 * 360;
          this.screenRotation = this.screenRotation - (this.screenRotation % 360) + screenFullSpins;
        }

        this.rouletteResultTimeoutId = setTimeout(() => {
          this.audioService.stop('roulette.spin');
          void this.audioService.play(response.payout > 0 ? 'roulette.win' : 'roulette.lose');

          this.isRouletteSpinning = false;
          this.showRouletteResult = true;

          if (response.payout > 0) {
            this.userStatistics.experience = (this.userStatistics.experience || 0) + response.payout;
            this.zvcService.setBalance(this.userStatistics.experience);
          }

          if (bet === 67) {
            this.screenSpinActive = false;
            this.screenResetting = false;
            this.screenRotation = 0;
          }

          this.addRouletteSpinToLog(
            response.spinResult,
            this.rouletteBetType,
            this.rouletteBetValue,
            response.won,
            response.payout,
            bet,
          );

          this.rouletteClearResultTimeoutId = setTimeout(() => {
            this.showRouletteResult = false;
            this.rouletteMessage = '';
            this.rouletteSpinResult = null;
            this.rouletteSpinColor = null;
            this.rouletteLoading = false;
          }, 3000);
        }, 5000);
      },
      error: (error) => {
        this.audioService.stop('roulette.spin');

        this.isRouletteSpinning = false;
        this.rouletteLoading = false;

        this.userStatistics.experience = (this.userStatistics.experience || 0) + bet;
        this.zvcService.setBalance(this.userStatistics.experience);

        this.screenSpinActive = false;
        this.screenResetting = false;
        this.screenRotation = 0;

        this.rouletteError = error?.error?.error || 'Fehler beim Drehen des Roulettes';

        setTimeout(() => {
          this.rouletteError = '';
        }, 3000);
      },
    });
  }

  private loadRouletteSpinLog(): void {
    const stored = localStorage.getItem(this.ROULETTE_LOG_STORAGE_KEY);
    try {
      if (stored) {
        this.rouletteSpinLog = JSON.parse(stored);
      } else {
        this.rouletteSpinLog = [];
      }
    } catch {
      this.rouletteSpinLog = [];
    }
  }

  private saveRouletteSpinLog(): void {
    try {
      localStorage.setItem(this.ROULETTE_LOG_STORAGE_KEY, JSON.stringify(this.rouletteSpinLog));
    } catch {
      console.error('Failed to save roulette spin log');
    }
  }

  private addRouletteSpinToLog(
    spinResult: number,
    betType: string,
    betValue: string | number,
    won: boolean,
    payout: number,
    betAmount: number,
  ): void {
    const newEntry = {
      id: Date.now(),
      timestamp: Date.now(),
      betType,
      ...(betType === 'number' && { betValue }),
      spinResult,
      won,
      payout,
      betAmount,
    };

    this.rouletteSpinLog.unshift(newEntry);

    if (this.rouletteSpinLog.length > 100) {
      this.rouletteSpinLog = this.rouletteSpinLog.slice(0, 100);
    }

    this.saveRouletteSpinLog();
  }

  getFilteredRouletteSpinLog(): typeof this.rouletteSpinLog {
    if (!this.hideRouletteLosses) {
      return this.rouletteSpinLog;
    }
    return this.rouletteSpinLog.filter((entry) => entry.won);
  }

  trackByRouletteSpinId(index: number, entry: (typeof this.rouletteSpinLog)[0]): number {
    return entry.id;
  }

  getRouletteSpinTypeInfo(entry: (typeof this.rouletteSpinLog)[0]): { emoji: string; label: string; color: string } {
    if (entry.won) {
      return {
        emoji: '🎉',
        label: 'Gewinn',
        color: '#10b981',
      };
    }
    return {
      emoji: '❌',
      label: 'Verlust',
      color: '#ef4444',
    };
  }

  getRouletteNumberColor(number: number): 'red' | 'black' | 'green' {
    if (number === 0) return 'green';
    return GamesComponent.RED_NUMBERS.includes(number) ? 'red' : 'black';
  }

  getRouletteNumberPosition(number: number): { [key: string]: string } {
    const position = GamesComponent.ROULETTE_WHEEL_SEQUENCE.indexOf(number);

    if (position === -1) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

    const sectionSize = 360 / 37;
    const angle = position * sectionSize + sectionSize / 2;
    const radians = ((angle - 90) * Math.PI) / 180;

    const radiusPercent = 44;
    const x = radiusPercent * Math.cos(radians);
    const y = radiusPercent * Math.sin(radians);

    const rotationAngle = angle;

    return {
      left: `calc(50% + ${x}%)`,
      top: `calc(50% + ${y}%)`,
      transform: `translate(-50%, -50%) rotate(${rotationAngle}deg)`,
    };
  }

  getRouletteNumberBgColor(number: number): string {
    if (number === 0) return '#10b981';
    return GamesComponent.RED_NUMBERS.includes(number) ? '#ef4444' : '#1f2937';
  }
}
