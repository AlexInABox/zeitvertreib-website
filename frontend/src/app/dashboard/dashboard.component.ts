import { Component, OnInit, OnDestroy, inject, ElementRef } from '@angular/core';
import { AudioService } from '../services/audio.service';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { AvatarModule } from 'primeng/avatar';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { DiscordStatsComponent } from '../components/discord-stats/discord-stats.component';
import type {
  SprayGetResponseItem,
  SprayPostRequest,
  SprayDeleteRequest,
  SprayRulesGetResponse,
  FakerankGetResponse,
  FakerankPostRequest,
  FakerankDeleteRequest,
  FakerankColor,
  FakerankColorsResponse,
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

interface PlayerEntry {
  displayname?: string;
  avatarmedium?: string;
}

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
  fakerank_until?: number; // Unix timestamp for fakerank expiration
  fakerankadmin_until?: number; // Unix timestamp for fakerank admin expiration
  fakerankoverride_until?: number; // Unix timestamp for admin-set fakerank override
  lastkillers: Array<{ displayname: string; avatarmedium: string }>;
  lastkills: Array<{ displayname: string; avatarmedium: string }>;
}

interface SpraySlot {
  id: number | null;
  name: string;
  imageUrl: string | null;
  isUploading: boolean;
  selectedFile: File | null;
  preview: string | null;
}

interface Redeemable {
  id: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  redeemableuntil?: string; // ISO date string, optional for limited time items
  isExpired?: boolean; // Indicates if the item is no longer available
  availabilityStatus?: 'available' | 'expired' | 'sold_out';
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

interface DiscordInviteResponse {
  approximate_member_count: number;
  approximate_presence_count: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule, ChartModule, AvatarModule, CommonModule, FormsModule, DiscordStatsComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  // Roulette wheel constants - European roulette sequence (clockwise from 0)
  static readonly ROULETTE_WHEEL_SEQUENCE = [
    0, 26, 3, 35, 12, 28, 7, 29, 18, 22, 9, 31, 14, 20, 1, 33, 16, 24, 5, 10, 23, 8, 30, 11, 36, 13, 27, 6, 34, 17, 25,
    2, 21, 4, 19, 15, 32,
  ];
  static readonly RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

  // Expose Math to template
  Math = Math;

  // Discord stats
  discordMemberCount = 0;
  discordOnlineCount = 0;

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

  isLoading = true;
  hasError = false;
  errorMessage = '';
  randomColors: string[] = [];

  // Spray-related properties - 2 slots for normal users, 3 for donators
  spraySlots: SpraySlot[] = [
    { id: null, name: '', imageUrl: null, isUploading: false, selectedFile: null, preview: null },
    { id: null, name: '', imageUrl: null, isUploading: false, selectedFile: null, preview: null },
    { id: null, name: '', imageUrl: null, isUploading: false, selectedFile: null, preview: null },
  ];
  showSprayHelp = false;
  sprayError = '';
  spraySuccess = '';
  isDonator = false;
  // Spray ban information
  isSprayBanned = false;
  sprayBanReason: string | null = null;
  sprayBannedBy: string | null = null;
  // Preview modal state
  previewModalOpen = false;
  previewModalSlotIndex: number | null = null;
  previewModalName = '';
  previewModalUrl: string | null = null;
  previewModalUploading = false;
  previewModalAccentColor = '#3b82f6';
  acceptedPrivacy = false;
  acceptedRules = false;
  showPrivacyText = false;
  showRulesText = false;
  sprayRules: SprayRulesGetResponse | null = null;
  sprayRulesLoading = false;
  chiikawaActive = false;
  private chiikawaOriginalSrc: Map<HTMLImageElement, string> = new Map();

  // Fakerank-related properties
  currentFakerankId: number | null = null;
  currentFakerank: string | null = null;
  currentFakerankColor: FakerankColor = 'default';
  fakerankModalOpen = false;
  fakerankModalText = '';
  fakerankModalColor: FakerankColor = 'default';
  fakerankLoading = false;
  fakerankError = '';
  fakerankSuccess = '';
  fakerankAccentColor = 'rgb(59, 130, 246)';
  acceptedFakerankPrivacy = false;
  acceptedFakerankRules = false;
  showFakerankPrivacyText = false;
  showFakerankRulesText = false;

  // Fakerank colors by role
  fakerankColorsByRole: {
    teamColors: FakerankColor[];
    vipColors: FakerankColor[];
    donatorColors: FakerankColor[];
    boosterColors: FakerankColor[];
    otherColors: FakerankColor[];
  } = {
    teamColors: [],
    vipColors: [],
    donatorColors: [],
    boosterColors: [],
    otherColors: [],
  };
  allowedFakerankColors: FakerankColor[] = [];

  // Fakerank ban information
  isFakerankBanned = false;
  fakerankBanReason: string | null = null;
  fakerankBannedBy: string | null = null;
  showColorPicker = false;
  private documentClickHandler?: (event: Event) => void;

  // Available fakerank colors (in-game accurate colors)
  fakerankColors: { key: FakerankColor; name: string; hex: string }[] = [
    { key: 'default', name: 'Weiß', hex: '#FFFFFF' },
    { key: 'pink', name: 'Rosa', hex: '#FF96DE' },
    { key: 'red', name: 'Rot', hex: '#C50000' },
    { key: 'brown', name: 'Braun', hex: '#944710' },
    { key: 'silver', name: 'Silber', hex: '#A0A0A0' },
    { key: 'light_green', name: 'Hellgrün', hex: '#32CD32' },
    { key: 'crimson', name: 'Blutrot', hex: '#DC143C' },
    { key: 'cyan', name: 'Cyan', hex: '#00B7EB' },
    { key: 'aqua', name: 'Aquamarin', hex: '#00FFFF' },
    { key: 'deep_pink', name: 'Dunkelrosa', hex: '#FF1493' },
    { key: 'tomato', name: 'Tomatenrot', hex: '#FF6448' },
    { key: 'yellow', name: 'Gelb', hex: '#FAFF86' },
    { key: 'magenta', name: 'Magenta', hex: '#FF0090' },
    { key: 'blue_green', name: 'Blaugrün', hex: '#4DFFB8' },
    { key: 'orange', name: 'Orange', hex: '#FF9966' },
    { key: 'lime', name: 'Limettengrün', hex: '#BFFF00' },
    { key: 'green', name: 'Grün', hex: '#228B22' },
    { key: 'emerald', name: 'Smaragd', hex: '#50C878' },
    { key: 'carmine', name: 'Karminrot', hex: '#960018' },
    { key: 'nickel', name: 'Nickel', hex: '#727472' },
    { key: 'mint', name: 'Mintgrün', hex: '#98FB98' },
    { key: 'army_green', name: 'Armeegrün', hex: '#4B5320' },
    { key: 'pumpkin', name: 'Kürbisorange', hex: '#EE7600' },
  ];

  // Cosmetic-related properties
  activeTab: 'hats' | 'pets' | 'auras' = 'hats';
  selectedHat: string = 'none';
  selectedPet: string = 'none';
  selectedAura: string = 'none';
  cosmeticLoading = false;

  // ZV Coins Redeemables properties
  redeemables: Redeemable[] = [];
  redeemablesLoading = false;
  redeemablesError = '';

  // Code Redemption properties
  redeemCode = '';
  codeRedemptionLoading = false;
  codeRedemptionMessage = '';
  codeRedemptionSuccess = false;

  // ZVC Transfer properties
  transferRecipient = '';
  transferAmount: number | null = null;
  transferLoading = false;
  transferMessage = '';
  transferSuccess = false;

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
  chickenCrossIsAnimating = false; // Track if chicken is animating to next step
  chickenCrossLostAnimation = false; // Track if loss animation is playing
  chickenCrossDeadGame: ChickenCrossGetResponse | null = null; // Store the lost game for display
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

  // Replace images with usagi.webp while chiikawa is active
  applyChiikawaImages(): void {
    if (this.chiikawaActive) return;
    this.chiikawaOriginalSrc.clear();

    const root = (this.elementRef && (this.elementRef.nativeElement as HTMLElement)) || document;

    try {
      const container = (root.querySelector && root.querySelector('.dashboard-container')) || (root as HTMLElement);
      (container as HTMLElement)?.classList?.add('chiikawa');
    } catch (e) {
      // ignore
    }

    const imgs = root.querySelectorAll('img');

    imgs.forEach((img) => {
      try {
        const el = img as HTMLImageElement;
        if (!el.src || el.src.includes('/assets/usagi.webp')) return;

        // Save original and replace
        this.chiikawaOriginalSrc.set(el, el.src);
        el.src = '/assets/usagi.webp';
      } catch (e) {
        // ignore
      }
    });

    this.chiikawaActive = true;
  }

  resetChiikawaImages(): void {
    if (!this.chiikawaActive) return;

    // Remove image replacements
    this.chiikawaOriginalSrc.forEach((src, el) => {
      try {
        el.src = src;
      } catch (e) {
        // ignore
      }
    });
    this.chiikawaOriginalSrc.clear();

    try {
      const root = (this.elementRef && (this.elementRef.nativeElement as HTMLElement)) || document;
      const container = (root.querySelector && root.querySelector('.dashboard-container')) || (root as HTMLElement);
      (container as HTMLElement)?.classList?.remove('chiikawa');
    } catch (e) {
      // ignore
    }

    this.chiikawaActive = false;
  }

  private generateRouletteWheelSegments(): Array<{ path: string; color: string }> {
    const segments: Array<{ path: string; color: string }> = [];
    const total = 37;
    const cx = 100;
    const cy = 100;
    const r = 100;

    for (let i = 0; i < total; i++) {
      const num = DashboardComponent.ROULETTE_WHEEL_SEQUENCE[i];
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
      } else if (DashboardComponent.RED_NUMBERS.includes(num)) {
        color = '#ef4444';
      } else {
        color = '#1f2937';
      }

      segments.push({ path, color });
    }

    return segments;
  }

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

  // Check if it's currently weekend (Saturday or Sunday) in Berlin, Germany
  isWeekendInBerlin(): boolean {
    const berlinTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' });
    const berlinDate = new Date(berlinTime);
    const dayOfWeek = berlinDate.getDay();
    // Sunday = 0, Saturday = 6
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  // Helper method to calculate transfer tax (0% on weekends in Berlin)
  getTransferTax(amount: number | null): number {
    if (!amount) return 0;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) return 0;
    // No tax on weekends in Berlin
    if (this.isWeekendInBerlin()) return 0;
    return Math.floor(numAmount * 0.05); // 5% tax
  }

  // Helper method to calculate total transfer cost
  getTransferTotalCost(amount: number | null): number {
    if (!amount) return 0;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) return 0;
    return numAmount + this.getTransferTax(numAmount);
  }

  // Mock data for owned cosmetics - in production this would come from backend
  ownedCosmetics = {
    hats: ['cap'] as string[], // User owns a baseball cap
    pets: [] as string[], // No pets owned
    auras: ['blue'] as string[], // User owns blue aura
  };

  private http = inject(HttpClient);
  private audioService = inject(AudioService);
  private elementRef = inject(ElementRef);

  constructor(public authService: AuthService) {
    this.generateRandomColors();
    this.loadUserStats();
    // Moved loadSprays() to ngOnInit to fix race condition with isDonator
    this.loadFakerank();
    this.loadRedeemables();
    this.loadSprayRules();
    this.loadSlotMachineInfo();
    this.loadLuckyWheelInfo();
    this.loadChickenCrossInfo();
    this.loadChickenCrossActive();
    this.loadRouletteInfo();
    this.loadWinLog();
    this.loadLuckyWheelSpinLog();
    this.loadChickenCrossHistory();

    // Close color picker when clicking outside
    this.documentClickHandler = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.color-picker-container')) {
        this.showColorPicker = false;
      }
    };
    document.addEventListener('click', this.documentClickHandler);

    // Register roulette sounds (roulette.mp3)
    this.audioService.register('roulette.spin', '/assets/sounds/roulette-spin.mp3', {
      loop: true,
      volume: this.audioVolume,
    });
    this.audioService.register('roulette.win', '/assets/sounds/win.mp3', { volume: this.audioVolume });
    this.audioService.register('roulette.lose', '/assets/sounds/lose.mp3', { volume: this.audioVolume });

    // Lucky Wheel spin sound (wheel.mp3)
    this.audioService.register('luckywheel.spin', '/assets/sounds/wheel.mp3', { loop: true, volume: this.audioVolume });
    this.audioService.register('luckywheel.win', '/assets/sounds/win.mp3', { volume: this.audioVolume });
    this.audioService.register('luckywheel.lose', '/assets/sounds/lose.mp3', { volume: this.audioVolume });

    // Slot machine spin sound (slot.mp3)
    this.audioService.register('slot.spin', '/assets/sounds/slot.mp3', { loop: true, volume: this.audioVolume });
    this.audioService.register('slot.win', '/assets/sounds/win.mp3', { volume: this.audioVolume });
    this.audioService.register('slot.lose', '/assets/sounds/lose.mp3', { volume: this.audioVolume });

    // Chiikawa (uwa.mp3)
    this.audioService.register('uwa', '/assets/sounds/uwa.mp3', { volume: this.audioVolume });
  }

  ngOnInit(): void {
    // Check if user is a donator
    this.isDonator = this.authService.isDonator();

    // Load sprays AFTER isDonator is set to avoid race condition
    this.loadSprays();

    // Check spray ban status
    this.isSprayBanned = this.authService.isSprayBanned();
    this.sprayBanReason = this.authService.getSprayBanReason();
    this.sprayBannedBy = this.authService.getSprayBannedBy();

    // Check fakerank ban status
    this.isFakerankBanned = this.authService.isFakerankBanned();
    this.fakerankBanReason = this.authService.getFakerankBanReason();
    this.fakerankBannedBy = this.authService.getFakerankBannedBy();

    // Load fakerank colors by role
    this.loadFakerankColorsByRole();

    // Initialize slot machine with question marks
    setTimeout(() => {
      this.initializeSlotMachine();
    }, 100);
  }

  // Check if current user is a fakerank admin
  isFakerankAdmin(): boolean {
    return this.authService.isFakerankAdmin();
  }

  // Helper for spray slot visibility
  shouldShowSpraySlot(slotIndex: number): boolean {
    const slot = this.spraySlots[slotIndex];
    return (slotIndex < 2 || this.isDonator) && !!slot.id && !slot.selectedFile;
  }

  // Safe getter methods for template usage
  get kdRatio(): string {
    const kills = this.userStatistics?.kills || 0;
    const deaths = this.userStatistics?.deaths || 0;

    if (!deaths || deaths === 0) {
      return kills > 0 ? '∞' : '0.00';
    }
    return (kills / deaths).toFixed(2);
  }

  get playtimeFormatted(): string {
    const playtime = this.userStatistics?.playtime || 0;
    const hours = Math.floor(playtime / 3600);
    const minutes = Math.floor((playtime % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  get leaderboardText(): string {
    return this.userStatistics?.leaderboardposition
      ? `Platz #${this.userStatistics.leaderboardposition}`
      : 'NICHT GENÜGEND DATEN';
  }

  get hasKillers(): boolean {
    return Array.isArray(this.userStatistics?.lastkillers) && this.userStatistics.lastkillers.length > 0;
  }

  // Safe method to truncate display names
  truncateDisplayName(name?: string, maxLength = 15): string {
    if (!name) return 'Unbekannt';
    return name.length > maxLength ? `${name.substring(0, maxLength)}...` : name;
  }

  // Safe method to get avatar with fallback
  getAvatarUrl(avatarUrl?: string): string {
    // If chiikawa is active, always show usagi
    if (this.chiikawaActive) return '/assets/usagi.webp';
    return avatarUrl || '/assets/logos/logo_full_color_1to1.png';
  }

  // Handle image loading errors
  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = '/assets/logos/logo_full_color_1to1.png';
    }
  }

  // Track by function for better performance in *ngFor
  trackByKiller(index: number, killer?: PlayerEntry): string {
    return killer?.displayname || index.toString();
  }

  // Track by function for win log entries
  trackByWinLogId(index: number, entry: SlotWinLogEntry): number {
    return entry.id;
  }

  trackByWheelSpinId(index: number, entry: LuckyWheelSpinLogEntry): number {
    return entry.id;
  }

  // Generate random colors for gradients
  generateRandomColors(): void {
    this.randomColors = [this.getRandomColor(), this.getRandomColor(), this.getRandomColor()];
    this.applyRandomColors();
  }

  // Generate a random hex color
  private getRandomColor(): string {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(Math.random() * 40) + 60; // 60-100% for vibrant colors
    const lightness = Math.floor(Math.random() * 30) + 45; // 45-75% for good contrast
    return this.hslToHex(hue, saturation, lightness);
  }

  // Convert HSL to HEX
  private hslToHex(h: number, s: number, l: number): string {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color)
        .toString(16)
        .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  // Apply random colors to CSS custom properties
  private applyRandomColors(): void {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--random-color-1', this.randomColors[0] ?? '#000000');
      root.style.setProperty('--random-color-2', this.randomColors[1] ?? '#000000');
      root.style.setProperty('--random-color-3', this.randomColors[2] ?? '#000000');
    }
  }

  private loadUserStats(): void {
    this.isLoading = true;
    this.hasError = false;

    this.authService.authenticatedGet<{ stats: Statistics }>(`${environment.apiUrl}/stats`).subscribe({
      next: (response) => {
        if (response?.stats) {
          this.userStatistics = {
            ...this.userStatistics, // Keep defaults for missing properties
            ...response.stats,
          };
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Fehler beim Laden der Benutzerstatistiken:', error);
        this.hasError = true;
        this.errorMessage = 'Statistiken konnten nicht geladen werden';
        this.isLoading = false;
      },
    });
  }

  // Load all sprays for the user (max 3)
  private loadSprays(): void {
    this.authService
      .authenticatedGet<{
        sprays: Array<{ id: number; name: string; full_res: string }>;
      }>(`${environment.apiUrl}/spray?full_res=true`)
      .subscribe({
        next: (response) => {
          const sprays = response.sprays || [];
          // Only process first 3 sprays
          const sprayData = sprays.slice(0, 3);

          // Reset all slots
          this.spraySlots.forEach((slot) => {
            if (slot.imageUrl) {
              URL.revokeObjectURL(slot.imageUrl);
            }
            slot.id = null;
            slot.name = '';
            slot.imageUrl = null;
            slot.isUploading = false;
            slot.selectedFile = null;
            slot.preview = null;
          });

          // Load spray data into slots
          sprayData.forEach((spray, index) => {
            if (index < 3 && spray.id) {
              this.spraySlots[index].id = spray.id;
              this.spraySlots[index].name = spray.name;
              // Only set imageUrl if full_res is available
              if (spray.full_res) {
                this.spraySlots[index].imageUrl = spray.full_res;
              }
            }
          });
        },
        error: (error) => {
          if (error.status !== 404) {
            console.error('Error loading sprays:', error);
          }
        },
      });
  }

  // Load available zeitvertreib coin redeemables
  public loadRedeemables(): void {
    this.redeemablesLoading = true;
    this.redeemablesError = '';

    this.authService
      .authenticatedGet<{
        redeemables: Redeemable[];
        total: number;
        timestamp: string;
      }>(`${environment.apiUrl}/redeemables`)
      .subscribe({
        next: (response) => {
          // Sort redeemables by price (ascending - cheapest first)
          this.redeemables = (response?.redeemables || []).sort((a, b) => a.price - b.price);
          this.redeemablesLoading = false;
        },
        error: (error) => {
          console.error('Error loading redeemables:', error);
          this.redeemablesError = 'Fehler beim Laden der verfügbaren Belohnungen';
          this.redeemablesLoading = false;
        },
      });
  }

  // Load spray rules from backend
  public loadSprayRules(): void {
    this.sprayRulesLoading = true;

    this.http.get<SprayRulesGetResponse>(`${environment.apiUrl}/spray/rules`).subscribe({
      next: (response) => {
        this.sprayRules = response;
        this.sprayRulesLoading = false;
      },
      error: (error) => {
        console.error('Error loading spray rules:', error);
        this.sprayRulesLoading = false;
      },
    });
  }

  // Öffentliche Methode zum Aktualisieren der Statistiken (kann vom Template aufgerufen werden)
  refreshStats(): void {
    this.generateRandomColors();
    this.loadUserStats();
  }

  // Comprehensive refresh method for post-redemption updates
  refreshAllData(): void {
    this.generateRandomColors();
    // Refresh auth service user data first to get updated timestamps
    this.authService.refreshUserData();

    // Then refresh other data
    this.loadUserStats();
    this.loadRedeemables();
  }

  // Public method to regenerate colors only
  regenerateColors(): void {
    this.generateRandomColors();
  }

  // ===== SPRAY FUNCTIONALITY =====

  // Handle file selection for a specific slot
  onSprayFileSelected(event: Event, slotIndex: number): void {
    const target = event.target as HTMLInputElement;
    if (!target?.files?.[0]) return;

    const file = target.files[0];

    // Validate file type
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
      this.sprayError = 'Nur Bilddateien erlaubt (PNG, JPG, WEBP - keine GIFs)';
      target.value = '';
      return;
    }

    const slot = this.spraySlots[slotIndex];
    if (!slot) return;

    // Clean up previous preview
    if (slot.preview) {
      URL.revokeObjectURL(slot.preview);
    }

    slot.selectedFile = file;
    slot.preview = URL.createObjectURL(file);
    slot.name = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
    this.sprayError = '';
    this.spraySuccess = '';

    // Extract prominent color for modal styling
    this.extractProminentColor(file);

    // Open preview modal for better editing on small previews
    this.openPreviewModal(slotIndex);
  }

  private extractProminentColor(file: File): void {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Downsample for performance
      canvas.width = 40;
      canvas.height = 40;
      ctx.drawImage(img, 0, 0, 40, 40);

      const imageData = ctx.getImageData(0, 0, 40, 40).data;
      let maxSat = -1;
      let bestColor = [59, 130, 246]; // Default blue

      for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const a = imageData[i + 3];

        if (a > 200) {
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;

          // Prefer colors that are not too dark and not too light
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (sat > maxSat && brightness > 40 && brightness < 220) {
            maxSat = sat;
            bestColor = [r, g, b];
          }
        }
      }

      this.previewModalAccentColor = `rgb(${bestColor[0]}, ${bestColor[1]}, ${bestColor[2]})`;
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  openPreviewModal(slotIndex: number): void {
    const slot = this.spraySlots[slotIndex];
    if (!slot || !slot.selectedFile) return;
    this.previewModalSlotIndex = slotIndex;
    this.previewModalUrl = slot.preview;
    this.previewModalName = slot.name || '';
    this.previewModalOpen = true;
    this.acceptedPrivacy = false;
    this.acceptedRules = false;
    this.showPrivacyText = false;
    this.showRulesText = false;
    this.toggleBodyScroll(true);
  }

  closePreviewModal(cancel = false): void {
    if (cancel && this.previewModalSlotIndex !== null) {
      this.cancelSpraySelection(this.previewModalSlotIndex);
    }
    this.previewModalOpen = false;
    this.previewModalSlotIndex = null;
    this.previewModalUrl = null;
    this.previewModalName = '';
    this.toggleBodyScroll(false);
  }

  public isNameValid(name: string): boolean {
    if (!name) return false;
    const nameRegex = /^[a-zA-Z0-9_ ]+$/;
    return name.length > 0 && name.length <= 20 && nameRegex.test(name);
  }

  private toggleBodyScroll(block: boolean): void {
    if (typeof document !== 'undefined') {
      if (block) {
        document.body.classList.add('modal-open');
      } else {
        document.body.classList.remove('modal-open');
      }
    }
  }

  async confirmUploadFromModal(): Promise<void> {
    if (this.previewModalSlotIndex === null) return;
    const slot = this.spraySlots[this.previewModalSlotIndex];
    if (!slot) return;
    // apply name
    slot.name = this.previewModalName || slot.name;
    // Close modal and start upload (uploadSprayForSlot handles validations)
    this.previewModalOpen = false;
    this.previewModalUploading = true;
    await this.uploadSprayForSlot(this.previewModalSlotIndex);
    this.previewModalUploading = false;
  }

  // Upload spray for a specific slot
  async uploadSprayForSlot(slotIndex: number): Promise<void> {
    const slot = this.spraySlots[slotIndex];
    if (!slot || !slot.selectedFile) {
      this.sprayError = 'Bitte wähle eine Datei aus';
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (slot.selectedFile.size > maxSize) {
      this.sprayError = 'Datei ist zu groß. Maximum sind 10MB';
      return;
    }

    // Validate name length
    if (slot.name && slot.name.length > 20) {
      this.sprayError = 'Der Name darf maximal 20 Zeichen lang sein';
      return;
    }

    // Validate name characters
    const nameRegex = /^[a-zA-Z0-9_ ]+$/;
    if (slot.name && !nameRegex.test(slot.name)) {
      this.sprayError = 'Der Name darf nur Buchstaben, Zahlen, Unterstriche und Leerzeichen enthalten';
      return;
    }

    slot.isUploading = true;
    this.sprayError = '';
    this.spraySuccess = '';

    try {
      // Process image to create pixel data and base64
      const { pixelData, base64Data } = await this.processImageForSpray(slot.selectedFile);

      // Create request payload
      const requestBody: SprayPostRequest = {
        name: slot.name || 'Unnamed Spray',
        full_res: base64Data,
        text_toy: pixelData,
      };

      // Upload to backend
      await this.authService
        .authenticatedPost<{ success: boolean; id: number }>(`${environment.apiUrl}/spray`, requestBody)
        .toPromise();

      // Clean up and reload
      if (slot.preview) {
        URL.revokeObjectURL(slot.preview);
      }
      slot.selectedFile = null;
      slot.preview = null;
      slot.isUploading = false;

      this.spraySuccess = 'Spray erfolgreich hochgeladen!';
      this.loadSprays();
    } catch (error: any) {
      console.error('Spray upload error:', error);
      slot.isUploading = false;
      this.sprayError = error?.error?.error || error?.message || 'Fehler beim Hochladen';

      // Reset slot on upload failure
      if (slot.preview) {
        URL.revokeObjectURL(slot.preview);
      }
      slot.selectedFile = null;
      slot.preview = null;
    }
  }

  // Delete spray for a specific slot
  async deleteSprayForSlot(slotIndex: number): Promise<void> {
    const slot = this.spraySlots[slotIndex];
    if (!slot || !slot.id) return;

    slot.isUploading = true;
    this.sprayError = '';
    this.spraySuccess = '';

    const requestBody: SprayDeleteRequest = {
      id: slot.id,
    };

    try {
      // Use authenticated delete with body
      await this.authService
        .authenticatedDelete<{ success: boolean }>(`${environment.apiUrl}/spray`, requestBody)
        .toPromise();

      slot.isUploading = false;
      this.spraySuccess = 'Spray erfolgreich gelöscht!';
      this.loadSprays();
    } catch (error: any) {
      console.error('Spray deletion error:', error);
      slot.isUploading = false;
      this.sprayError = error?.error?.error || 'Fehler beim Löschen';
    }
  }

  // Cancel file selection for a slot
  cancelSpraySelection(slotIndex: number): void {
    const slot = this.spraySlots[slotIndex];
    if (!slot) return;

    if (slot.preview) {
      URL.revokeObjectURL(slot.preview);
    }
    slot.selectedFile = null;
    slot.preview = null;
  }

  // Process image to create pixel data and base64
  private async processImageForSpray(file: File): Promise<{ pixelData: string; base64Data: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Create compressed WebP version under 50KB
          const compressedCanvas = document.createElement('canvas');
          const compressedCtx = compressedCanvas.getContext('2d');
          if (!compressedCtx) throw new Error('Could not get canvas context');

          compressedCanvas.width = img.width;
          compressedCanvas.height = img.height;
          compressedCtx.drawImage(img, 0, 0);

          // Compress to WebP with lossy quality, aiming for < 50KB
          let quality = 0.8;
          let base64Data = '';
          let compressed = false;

          while (quality >= 0.1 && !compressed) {
            base64Data = await new Promise<string>((resolveCompress) => {
              compressedCanvas.toBlob(
                (blob) => {
                  if (blob && blob.size < 50 * 1024) {
                    compressed = true;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    resolveCompress(reader.result as string);
                  };
                  reader.readAsDataURL(blob!);
                },
                'image/webp',
                quality,
              );
            });
            quality -= 0.1;
          }

          // Create pixel art from original
          const pixelArtQuality = 100;
          const pixelCanvas = document.createElement('canvas');
          const pixelCtx = pixelCanvas.getContext('2d');
          if (!pixelCtx) throw new Error('Could not get canvas context');

          pixelCanvas.width = pixelArtQuality;
          pixelCanvas.height = pixelArtQuality;

          // Scale image to fit canvas
          const { width: pixelWidth, height: pixelHeight } = this.scaleToLongestSide(
            img.width,
            img.height,
            pixelArtQuality,
          );
          const pixelOffsetX = (pixelArtQuality - pixelWidth) / 2;
          const pixelOffsetY = (pixelArtQuality - pixelHeight) / 2;

          pixelCtx.clearRect(0, 0, pixelArtQuality, pixelArtQuality);
          pixelCtx.drawImage(img, pixelOffsetX, pixelOffsetY, pixelWidth, pixelHeight);

          // Extract pixel data for text toy
          const pixelData = this.createPixelArtFromCanvas(pixelCtx, pixelArtQuality, pixelArtQuality);

          resolve({ pixelData, base64Data });
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Could not load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  // Create pixel art string from canvas data
  private createPixelArtFromCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): string {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    let result = '';

    for (let y = 0; y < height; y++) {
      let line = '';
      let currentColor = '';
      let consecutiveCount = 0;

      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const alpha = data[index + 3];

        if (r === undefined || g === undefined || b === undefined || alpha === undefined) {
          continue;
        }

        // Handle transparency
        if (alpha < 25) {
          if (consecutiveCount > 0 && currentColor) {
            line += `<color=${currentColor}>${'█'.repeat(consecutiveCount)}</color>`;
            consecutiveCount = 0;
          }
          line += '<color=#00000000>█</color>';
          currentColor = '';
          continue;
        }

        const pixelColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

        if (pixelColor === currentColor) {
          consecutiveCount++;
        } else {
          if (consecutiveCount > 0 && currentColor) {
            line += `<color=${currentColor}>${'█'.repeat(consecutiveCount)}</color>`;
          }
          currentColor = pixelColor;
          consecutiveCount = 1;
        }
      }

      if (consecutiveCount > 0 && currentColor) {
        line += `<color=${currentColor}>${'█'.repeat(consecutiveCount)}</color>`;
      }

      result += line + '\n';
    }

    return result;
  }

  // Scale image so the longest side becomes the target size
  private scaleToLongestSide(
    srcWidth: number,
    srcHeight: number,
    targetSize: number,
  ): { width: number; height: number } {
    const longestSide = Math.max(srcWidth, srcHeight);
    const scaleFactor = targetSize / longestSide;
    return {
      width: Math.floor(srcWidth * scaleFactor),
      height: Math.floor(srcHeight * scaleFactor),
    };
  }

  ngOnDestroy(): void {
    // Clean up spray slot URLs
    this.spraySlots.forEach((slot) => {
      if (slot.imageUrl) {
        URL.revokeObjectURL(slot.imageUrl);
      }
      if (slot.preview) {
        URL.revokeObjectURL(slot.preview);
      }
    });

    // Reset any chiikawa image replacements
    this.resetChiikawaImages();

    // Clean up event listener
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
    }

    // Clean up roulette timeouts
    if (this.rouletteResultTimeoutId !== null) {
      clearTimeout(this.rouletteResultTimeoutId);
      this.rouletteResultTimeoutId = null;
    }
    if (this.rouletteClearResultTimeoutId !== null) {
      clearTimeout(this.rouletteClearResultTimeoutId);
      this.rouletteClearResultTimeoutId = null;
    }

    // Unregister roulette sounds
    this.audioService.unregister('roulette.spin');
    this.audioService.unregister('roulette.win');
    this.audioService.unregister('roulette.lose');

    // Unregister lucky wheel sounds
    this.audioService.unregister('luckywheel.spin');

    // Unregister slot sounds
    this.audioService.unregister('slot.spin');
    this.audioService.unregister('uwa');
  }

  // ===== FAKERANK METHODS =====

  // Load fakerank(s) for the user
  loadFakerank(): void {
    this.authService.authenticatedGet<FakerankGetResponse>(`${environment.apiUrl}/fakerank`).subscribe({
      next: (response) => {
        const fakeranks = response?.fakeranks || [];
        if (fakeranks.length > 0) {
          const fakerank = fakeranks[0];
          this.currentFakerankId = fakerank.id;
          this.currentFakerank = fakerank.text;
          this.currentFakerankColor = fakerank.color;
        } else {
          this.currentFakerankId = null;
          this.currentFakerank = null;
          this.currentFakerankColor = 'default';
        }
      },
      error: (error) => {
        console.error('Error loading fakerank:', error);
        this.fakerankError = 'Fehler beim Laden des Fakeranks';
      },
    });
  }

  // Load fakerank colors by role from API
  private loadFakerankColorsByRole(): void {
    this.authService.authenticatedGet<FakerankColorsResponse>(`${environment.apiUrl}/fakerank/colors`).subscribe({
      next: (response) => {
        this.fakerankColorsByRole = response;
        this.updateAllowedFakerankColors();
      },
      error: (error) => {
        console.error('Error loading fakerank colors:', error);
        // Fallback to empty allowed colors if fetch fails
        this.allowedFakerankColors = [];
      },
    });
  }

  // Determine which colors are allowed based on user's role
  private updateAllowedFakerankColors(): void {
    const isTeamMember = this.authService.isTeam();
    const isVip = this.authService.isVip();
    const isDonator = this.authService.isDonator();
    const isBooster = this.authService.isBooster();

    if (isTeamMember) {
      this.allowedFakerankColors = [
        ...this.fakerankColorsByRole.teamColors,
        ...this.fakerankColorsByRole.vipColors,
        ...this.fakerankColorsByRole.donatorColors,
        ...this.fakerankColorsByRole.boosterColors,
        ...this.fakerankColorsByRole.otherColors,
      ];
    } else if (isVip) {
      this.allowedFakerankColors = [
        ...this.fakerankColorsByRole.vipColors,
        ...this.fakerankColorsByRole.donatorColors,
        ...this.fakerankColorsByRole.boosterColors,
        ...this.fakerankColorsByRole.otherColors,
      ];
    } else if (isDonator) {
      this.allowedFakerankColors = [
        ...this.fakerankColorsByRole.donatorColors,
        ...this.fakerankColorsByRole.boosterColors,
        ...this.fakerankColorsByRole.otherColors,
      ];
    } else if (isBooster) {
      this.allowedFakerankColors = [
        ...this.fakerankColorsByRole.boosterColors,
        ...this.fakerankColorsByRole.otherColors,
      ];
    } else {
      this.allowedFakerankColors = this.fakerankColorsByRole.otherColors;
    }
  }

  // Check if a color is allowed for the current user
  isColorAllowed(colorKey: FakerankColor): boolean {
    return this.allowedFakerankColors.includes(colorKey);
  }

  // Open modal to edit/create fakerank
  openFakerankModal(): void {
    this.fakerankModalText = this.currentFakerank || '';
    this.fakerankModalColor = this.currentFakerankColor;
    this.fakerankModalOpen = true;
    this.fakerankError = '';
    this.fakerankSuccess = '';
    this.acceptedFakerankPrivacy = false;
    this.acceptedFakerankRules = false;
    this.showFakerankPrivacyText = false;
    this.showFakerankRulesText = false;
    this.toggleBodyScroll(true);
  }

  closeFakerankModal(cancel = false): void {
    this.fakerankModalOpen = false;
    this.toggleBodyScroll(false);
  }

  // Select color for fakerank
  selectFakerankColor(colorKey: FakerankColor): void {
    this.fakerankModalColor = colorKey;
  }

  // Validate and save fakerank
  async saveFakerankFromModal(): Promise<void> {
    if (this.fakerankLoading) return;

    const text = this.fakerankModalText.trim();
    if (!text) {
      this.fakerankError = 'Bitte gib einen Text ein';
      return;
    }

    if (text.length > 50) {
      this.fakerankError = 'Der Text darf maximal 50 Zeichen lang sein';
      return;
    }

    if (!this.acceptedFakerankPrivacy || !this.acceptedFakerankRules) {
      this.fakerankError = 'Bitte akzeptiere die Datenschutzhinweise und Inhaltsregeln';
      return;
    }

    this.fakerankLoading = true;
    this.fakerankError = '';
    this.fakerankSuccess = '';

    const payload: FakerankPostRequest = {
      text: text,
      color: this.fakerankModalColor,
    };

    try {
      await this.authService
        .authenticatedPost<{
          success: boolean;
          message: string;
          fakerank: { id: number; text: string; color: FakerankColor };
        }>(`${environment.apiUrl}/fakerank`, payload)
        .toPromise();

      this.fakerankSuccess = 'Fakerank erfolgreich gespeichert!';
      this.fakerankLoading = false;
      this.fakerankModalOpen = false;
      this.toggleBodyScroll(false);
      this.loadFakerank();

      setTimeout(() => (this.fakerankSuccess = ''), 3000);
    } catch (error: any) {
      console.error('Fakerank save error:', error);
      this.fakerankLoading = false;
      this.fakerankError = error?.error?.error || error?.message || 'Fehler beim Speichern';
    }
  }

  // Delete fakerank
  async deleteFakerank(): Promise<void> {
    if (!this.currentFakerankId || this.fakerankLoading) return;

    this.fakerankLoading = true;
    this.fakerankError = '';
    this.fakerankSuccess = '';

    const requestBody: FakerankDeleteRequest = {
      id: this.currentFakerankId,
    };

    try {
      await this.http
        .delete<{ success: boolean }>(`${environment.apiUrl}/fakerank`, {
          body: requestBody,
          headers: {
            'Content-Type': 'application/json',
          },
          withCredentials: true,
        })
        .toPromise();

      this.fakerankLoading = false;
      this.fakerankSuccess = 'Fakerank erfolgreich gelöscht!';
      this.loadFakerank();

      setTimeout(() => (this.fakerankSuccess = ''), 3000);
    } catch (error: any) {
      console.error('Fakerank deletion error:', error);
      this.fakerankLoading = false;
      this.fakerankError = error?.error?.error || 'Fehler beim Löschen';
    }
  }

  getColorHex(colorKey: string): string {
    const color = this.fakerankColors.find((c) => c.key === colorKey);
    return color ? color.hex : '#FFFFFF';
  }

  getColorName(colorKey: string): string {
    const color = this.fakerankColors.find((c) => c.key === colorKey);
    return color ? color.name : 'Default (Weiß)';
  }

  // ZV Coins related methods
  getProgressPercentage(current: number, target: number): number {
    return Math.min(100, Math.floor((current / target) * 100));
  }

  redeemCodeAction(): void {
    if (!this.redeemCode || this.redeemCode.trim() === '') {
      return;
    }

    const trimmed = this.redeemCode.trim();
    if (trimmed.toLowerCase() === 'chiikawa') {
      void this.audioService.play('uwa');
      this.redeemCode = '';
      this.applyChiikawaImages();
      return;
    }

    this.codeRedemptionLoading = true;
    this.codeRedemptionMessage = '';
    this.codeRedemptionSuccess = false;

    // Call the backend API to redeem the code
    this.authService
      .authenticatedPost<{
        success: boolean;
        message: string;
        credits?: number;
        newBalance?: number;
      }>(`${environment.apiUrl}/redeem-code`, { code: this.redeemCode.trim() })
      .subscribe({
        next: (response) => {
          this.codeRedemptionLoading = false;
          if (response?.success) {
            this.codeRedemptionSuccess = true;
            this.codeRedemptionMessage = response.message || 'Code erfolgreich eingelöst!';

            // Update the user balance if provided
            if (response.newBalance !== undefined) {
              this.userStatistics.experience = response.newBalance;
            } else if (response.credits) {
              this.userStatistics.experience = (this.userStatistics.experience || 0) + response.credits;
            }

            // Clear the input after successful redemption
            this.redeemCode = '';

            // Force refresh the entire page to ensure all data is updated
            window.location.reload();
          } else {
            this.codeRedemptionSuccess = false;
            this.codeRedemptionMessage = response?.message || 'Code konnte nicht eingelöst werden';
          }
        },
        error: (error) => {
          this.codeRedemptionLoading = false;
          this.codeRedemptionSuccess = false;

          console.error('Error redeeming code:', error);
          let errorMessage = 'Fehler beim Einlösen des Codes';

          if (error?.error?.error) {
            errorMessage = error.error.error;
          } else if (error?.error?.message) {
            errorMessage = error.error.message;
          } else if (error?.message) {
            errorMessage = error.message;
          }

          this.codeRedemptionMessage = errorMessage;
        },
      });

    // Clear message after 5 seconds
    setTimeout(() => {
      this.codeRedemptionMessage = '';
    }, 5000);
  }

  // ZVC Transfer method
  transferZVC(): void {
    if (!this.transferRecipient || !this.transferAmount) {
      return;
    }

    // Convert to number and validate
    const amount = Number(this.transferAmount);
    if (isNaN(amount) || amount <= 0) {
      this.transferMessage = 'Bitte gib einen gültigen Betrag ein';
      this.transferSuccess = false;
      setTimeout(() => {
        this.transferMessage = '';
      }, 3000);
      return;
    }

    // Validate minimum transfer amount
    if (amount < 100) {
      this.transferMessage = 'Mindestbetrag für Transfers: 100 ZVC';
      this.transferSuccess = false;
      setTimeout(() => {
        this.transferMessage = '';
      }, 3000);
      return;
    }

    // Validate maximum transfer amount
    if (amount > 50000) {
      this.transferMessage = 'Maximaler Transferbetrag: 50.000 ZVC';
      this.transferSuccess = false;
      setTimeout(() => {
        this.transferMessage = '';
      }, 3000);
      return;
    }

    // Validate maximum transfer amount
    if (amount > 50000) {
      this.transferMessage = 'Maximaler Transferbetrag: 50.000 ZVC';
      this.transferSuccess = false;
      setTimeout(() => {
        this.transferMessage = '';
      }, 3000);
      return;
    }

    // Validate transfer amount (use weekend-aware tax calculation)
    const currentBalance = this.userStatistics.experience || 0;
    const taxAmount = this.getTransferTax(amount);
    const totalCost = amount + taxAmount;

    if (totalCost > currentBalance) {
      this.transferMessage = `Nicht genügend ZVC! Benötigt: ${totalCost} ZVC (${amount} + ${taxAmount} Steuer), Verfügbar: ${currentBalance} ZVC`;
      this.transferSuccess = false;
      setTimeout(() => {
        this.transferMessage = '';
      }, 5000);
      return;
    }

    this.transferLoading = true;
    this.transferMessage = '';
    this.transferSuccess = false;

    // Just trim the input and send it to backend - let backend handle Steam ID vs username detection
    const cleanRecipient = this.transferRecipient.trim();

    // Call the backend API
    this.authService
      .authenticatedPost<{
        success: boolean;
        message: string;
        transfer?: {
          amount: number;
          tax: number;
          totalCost: number;
          recipient: string;
          senderNewBalance: number;
          recipientNewBalance: number;
        };
      }>(`${environment.apiUrl}/transfer-zvc`, {
        recipient: cleanRecipient,
        amount: amount, // Use the converted number
      })
      .subscribe({
        next: (response) => {
          this.transferLoading = false;
          if (response?.success) {
            this.transferSuccess = true;
            this.transferMessage = response.message;

            // Update the user balance immediately with the new balance from server
            if (response.transfer?.senderNewBalance !== undefined) {
              this.userStatistics.experience = response.transfer.senderNewBalance;
            }

            // Clear the inputs after successful transfer
            this.transferRecipient = '';
            this.transferAmount = null;

            // Clear message after 5 seconds
            setTimeout(() => {
              this.transferMessage = '';
            }, 5000);
          } else {
            this.transferSuccess = false;
            this.transferMessage = response?.message || 'Transfer fehlgeschlagen';
          }
        },
        error: (error) => {
          this.transferLoading = false;
          this.transferSuccess = false;

          console.error('Error transferring ZVC:', error);
          let errorMessage = 'Fehler beim Senden der ZVC';

          if (error?.error?.error) {
            errorMessage = error.error.error;
          } else if (error?.error?.message) {
            errorMessage = error.error.message;
          } else if (error?.message) {
            errorMessage = error.message;
          }

          this.transferMessage = errorMessage;

          // Clear message after 5 seconds
          setTimeout(() => {
            this.transferMessage = '';
          }, 5000);
        },
      });
  }

  // Cosmetic-related methods
  getHatEmoji(hatKey: string): string {
    const hatEmojis: { [key: string]: string } = {
      cap: '🧢',
      crown: '👑',
      helmet: '⛑️',
    };
    return hatEmojis[hatKey] || '';
  }

  getHatName(hatKey: string): string {
    const hatNames: { [key: string]: string } = {
      cap: 'Baseball Cap',
      crown: 'Königskrone',
      helmet: 'Schutzhelm',
    };
    return hatNames[hatKey] || '';
  }

  getPetEmoji(petKey: string): string {
    const petEmojis: { [key: string]: string } = {
      cat: '🐱',
      dog: '🐕',
      bird: '🦅',
    };
    return petEmojis[petKey] || '';
  }

  getPetName(petKey: string): string {
    const petNames: { [key: string]: string } = {
      cat: 'Cyber Katze',
      dog: 'Roboter Hund',
      bird: 'Drohnen Adler',
    };
    return petNames[petKey] || '';
  }

  getAuraName(auraKey: string): string {
    const auraNames: { [key: string]: string } = {
      blue: 'Blaue Aura',
      red: 'Rote Aura',
      rainbow: 'Regenbogen Aura',
    };
    return auraNames[auraKey] || '';
  }

  selectHat(hatKey: string): void {
    if (hatKey === 'none' || this.ownedCosmetics.hats.includes(hatKey)) {
      this.selectedHat = hatKey;
    } else {
      alert(`Du besitzt diesen Hut noch nicht! Kaufe ihn im Cosmetic Shop.`);
    }
  }

  selectPet(petKey: string): void {
    if (petKey === 'none' || this.ownedCosmetics.pets.includes(petKey)) {
      this.selectedPet = petKey;
    } else {
      alert(`Du besitzt diesen Begleiter noch nicht! Kaufe ihn im Cosmetic Shop.`);
    }
  }

  selectAura(auraKey: string): void {
    if (auraKey === 'none' || this.ownedCosmetics.auras.includes(auraKey)) {
      this.selectedAura = auraKey;
    } else {
      alert(`Du besitzt diese Aura noch nicht! Kaufe sie im Cosmetic Shop.`);
    }
  }

  saveCosmetics(): void {
    this.cosmeticLoading = true;

    // Simulate API call
    setTimeout(() => {
      this.cosmeticLoading = false;
      alert(
        `Cosmetics gespeichert!\nHut: ${this.getHatName(this.selectedHat) || 'Keiner'}\nBegleiter: ${this.getPetName(this.selectedPet) || 'Keiner'}\nAura: ${this.getAuraName(this.selectedAura) || 'Keine'}`,
      );
    }, 1500);
  }

  resetToDefault(): void {
    this.selectedHat = 'none';
    this.selectedPet = 'none';
    this.selectedAura = 'none';
  }

  openCosmeticShop(): void {
    alert('Cosmetic Shop wird bald verfügbar sein! Hier kannst du neue Hüte, Begleiter und Aura-Effekte kaufen.');
  }

  // Format time remaining for display
  formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return 'Expired';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 30) {
      return `${Math.floor(days / 30)}mo ${days % 30}d`;
    } else if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 5) {
      return `${minutes}m`;
    } else {
      return `${minutes}m ${secs}s`;
    }
  }

  // ZV Coins redeemables methods
  redeemItem(redeemable: Redeemable): void {
    if (!redeemable) {
      return;
    }

    // Check if item is still available
    if (!this.isAvailable(redeemable)) {
      alert(`❌ Item nicht verfügbar\n\n${redeemable.name} ist nicht mehr verfügbar zum Einlösen.`);
      return;
    }

    // Check if user has enough ZV Coins
    const currentBalance = this.userStatistics.experience || 0;
    if (currentBalance < redeemable.price) {
      const missing = redeemable.price - currentBalance;
      alert(
        `Nicht genügend ZV Coins!\n\nBenötigt: ${redeemable.price} ZVC\nVorhanden: ${currentBalance} ZVC\nFehlen noch: ${missing} ZVC`,
      );
      return;
    }

    // Show expiration warning for limited time items
    let confirmMessage = `${redeemable.emoji} ${redeemable.name}\n\n${redeemable.description}\n\nPreis: ${redeemable.price} ZVC`;

    if (this.isLimitedTime(redeemable)) {
      const timeLeft = this.getTimeLeft(redeemable.redeemableuntil);
      confirmMessage += `\n\n⏰ Limitierte Zeit: ${timeLeft}`;
    }

    confirmMessage += '\n\nMöchtest du dieses Item wirklich einlösen?';

    // Confirm redemption
    const confirmed = confirm(confirmMessage);

    if (!confirmed) {
      return;
    }

    // Call the redemption API
    this.authService
      .authenticatedPost<{
        success: boolean;
        message: string;
        item: Redeemable;
        newBalance: number;
        transactionId: string;
      }>(`${environment.apiUrl}/redeemables/redeem`, { itemId: redeemable.id })
      .subscribe({
        next: (response) => {
          if (response?.success) {
            // Update user balance immediately
            this.userStatistics.experience = response.newBalance;

            // Show success message
            alert(`🎉 Erfolgreich eingelöst!\n\n${response.message}\n\nNeues Guthaben: ${response.newBalance} ZVC`);

            // Force refresh the entire page to ensure all data is updated
            window.location.reload();
          } else {
            alert('Fehler beim Einlösen: ' + (response?.message || 'Unbekannter Fehler'));
          }
        },
        error: (error) => {
          console.error('Error redeeming item:', error);
          let errorMessage = 'Fehler beim Einlösen der Belohnung';

          if (error?.error?.error) {
            errorMessage = error.error.error;
          } else if (error?.message) {
            errorMessage = error.message;
          }

          alert(errorMessage);
        },
      });
  }

  canAfford(price: number): boolean {
    return (this.userStatistics.experience || 0) >= price;
  }

  isAvailable(redeemable: Redeemable): boolean {
    return !redeemable.isExpired && redeemable.availabilityStatus === 'available';
  }

  isExpired(redeemable: Redeemable): boolean {
    return !!redeemable.isExpired || redeemable.availabilityStatus === 'expired';
  }

  isSoldOut(redeemable: Redeemable): boolean {
    return redeemable.availabilityStatus === 'sold_out';
  }

  canRedeem(redeemable: Redeemable): boolean {
    return this.isAvailable(redeemable) && this.canAfford(redeemable.price);
  }

  getAvailabilityText(redeemable: Redeemable): string {
    if (this.isExpired(redeemable)) {
      return 'Nicht mehr verfügbar';
    }
    if (this.isSoldOut(redeemable)) {
      return 'Ausverkauft';
    }
    if (!this.canAfford(redeemable.price)) {
      const missing = redeemable.price - (this.userStatistics.experience || 0);
      return `${missing | 0} ZVC fehlen`;
    }
    return '✨ Einlösen';
  }

  isLimitedTime(redeemable: Redeemable): boolean {
    return !!redeemable.redeemableuntil;
  }

  getTimeLeft(redeemableuntil?: string): string {
    if (!redeemableuntil) return '';

    const endDate = new Date(redeemableuntil);
    const now = new Date();
    const timeDiff = endDate.getTime() - now.getTime();

    if (timeDiff <= 0) return 'Abgelaufen';

    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      return `${minutes}m`;
    }
  }

  // Slot machine functions
  initializeSlotMachine(): void {
    const slots = document.querySelectorAll('.slot');
    slots.forEach((slot) => {
      const symbols = slot.querySelector('.symbols') as HTMLElement;
      if (symbols && symbols.children.length === 0) {
        // Only initialize if empty
        symbols.innerHTML = '';
        symbols.appendChild(this.createSymbolElement('❓'));
        symbols.style.top = '0';
      }
    });
  }

  createSymbolElement(symbol: string): HTMLElement {
    const div = document.createElement('div');
    div.classList.add('symbolInSlot');
    div.textContent = symbol;
    // Add inline styles for guaranteed styling
    div.style.textAlign = 'center';
    div.style.fontSize = '400%';
    div.style.height = '120px';

    return div;
  }

  spin(slotSymbols: string[], target1?: string, target2?: string, target3?: string, onComplete?: () => void): void {
    this.reset();

    const slots = document.querySelectorAll('.slot');
    let completedSlots = 0;
    const targetSymbols = [target1, target2, target3];

    slots.forEach((slot, index) => {
      const symbols = slot.querySelector('.symbols') as HTMLElement;

      // Clear and rebuild symbols
      symbols.innerHTML = '';
      symbols.appendChild(this.createSymbolElement('❓'));

      // Add 8 cycles of symbols
      for (let i = 0; i < 15; i++) {
        slotSymbols.forEach((symbol) => {
          symbols.appendChild(this.createSymbolElement(symbol));
        });
      }

      // Get symbol height AFTER adding symbols
      const symbolHeight = symbols.querySelector('.symbolInSlot')?.clientHeight || 150;

      // Random number of full rotations (2-6)
      const randomRotations = Math.floor(Math.random() * 8) + 4;

      // Calculate position to land on target symbol after random rotations
      const targetSymbol = targetSymbols[index];
      let targetOffset;

      if (targetSymbol && slotSymbols.includes(targetSymbol)) {
        // Land on specific symbol after random full spins
        const targetIndex = slotSymbols.indexOf(targetSymbol);
        const fullRotations = randomRotations * slotSymbols.length * symbolHeight;
        targetOffset = -(fullRotations + (targetIndex + 1) * symbolHeight);
      } else {
        // Random position after random full spins
        const randomIndex = Math.floor(Math.random() * slotSymbols.length);
        const fullRotations = randomRotations * slotSymbols.length * symbolHeight;
        targetOffset = -(fullRotations + (randomIndex + 1) * symbolHeight);
      }

      symbols.style.top = `${targetOffset}px`;

      symbols.addEventListener(
        'transitionend',
        () => {
          completedSlots++;
          if (completedSlots === slots.length) {
            this.logDisplayedSymbols(slotSymbols);

            // Call the completion callback if provided
            if (onComplete) {
              onComplete();
            }

            // Autospin
            this.checkForAutoSpin();
          }
        },
        { once: true },
      );
    });
  }

  reset(): void {
    const slots = document.querySelectorAll('.slot');
    slots.forEach((slot) => {
      const symbols = slot.querySelector('.symbols') as HTMLElement;
      symbols.style.transition = 'none';
      symbols.style.top = '0';
      symbols.offsetHeight;
      symbols.style.transition = '';
    });
  }

  toggleAutoSpin(): void {
    this.autoSpinEnabled = !this.autoSpinEnabled;

    if (this.autoSpinEnabled) {
      this.testSlotMachine();
    }
  }

  checkForAutoSpin(): void {
    //Wait for 1 second before auto-spinning again
    setTimeout(() => {
      if (this.autoSpinEnabled) {
        this.testSlotMachine();
      }
    }, 500);
  }

  logDisplayedSymbols(slotSymbols: string[]): void {
    const slots = document.querySelectorAll('.slot');
    const displayedSymbols: string[] = [];

    slots.forEach((slot) => {
      const symbols = slot.querySelector('.symbols') as HTMLElement;
      const symbolHeight = symbols.querySelector('.symbolInSlot')?.clientHeight || 150;
      const topValue = Math.abs(parseInt(symbols.style.top, 10));

      // Account for the question mark at the beginning
      const symbolIndex = (Math.floor(topValue / symbolHeight) - 1) % slotSymbols.length;
      const displayedSymbol = slotSymbols[symbolIndex];
      if (displayedSymbol) {
        displayedSymbols.push(displayedSymbol);
      }
    });

    console.log('🎰 Slot Machine Results:', displayedSymbols);
  }

  // Load slot machine information (payout table)
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

  // Load win log from localStorage
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

  // Save win log to localStorage
  private saveWinLog(): void {
    try {
      localStorage.setItem(this.WIN_LOG_STORAGE_KEY, JSON.stringify(this.slotWinLog));
    } catch (error) {
      console.error('Error saving win log to localStorage:', error);
    }
  }

  // Add entry to win log
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

    // Add to beginning of array (newest first)
    this.slotWinLog.unshift(entry);

    // Keep only the last MAX_WIN_LOG_ENTRIES entries
    if (this.slotWinLog.length > this.MAX_WIN_LOG_ENTRIES) {
      this.slotWinLog = this.slotWinLog.slice(0, this.MAX_WIN_LOG_ENTRIES);
    }

    // Save to localStorage
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

  // Get time ago string for display
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

  // Get win type display info
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

  // Toggle payout info visibility
  togglePayoutInfo(): void {
    this.showPayoutInfo = !this.showPayoutInfo;
  }

  // Check if user can afford to play the slot machine
  canAffordSlotMachine(): boolean {
    const cost = this.slotMachineInfo?.cost || 10;
    const currentBalance = this.userStatistics.experience || 0;
    return currentBalance >= cost;
  }

  // Example method to test the slot machine
  testSlotMachine(): void {
    // Prevent multiple simultaneous spins
    if (this.isSpinning) {
      return;
    }

    // Get the cost from slot machine info
    const cost = this.slotMachineInfo?.cost || 10;

    // Check if user has enough ZVC
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

    // Deduct the cost immediately (cost to play)
    this.userStatistics.experience = (this.userStatistics.experience || 0) - cost;

    // Call backend to get the result
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

          // Use the same symbols as backend for animation
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

          // Animate to the result (don't reveal win/loss yet)
          void this.audioService.play('slot.spin');

          this.spin(mySymbols, slot1, slot2, slot3, () => {
            this.audioService.stop('slot.spin');

            // Play win/lose jingle
            if (payout > 0) {
              void this.audioService.play('slot.win');
            } else {
              void this.audioService.play('slot.lose');
            }

            // Log win to the win log after animation completes
            this.addToWinLog(winType, payout, [slot1, slot2, slot3], netChange);
          });

          // Wait for animation to complete before revealing result
          setTimeout(() => {
            this.isSpinning = false;
            this.slotMachineLoading = false;
            this.currentWinType = winType;

            // Update balance based on payout
            if (payout > 0) {
              this.userStatistics.experience = (this.userStatistics.experience || 0) + payout;
            }
          }, 10000); // Animation duration (10 seconds)
        },
        error: (error) => {
          // Stop slot sound on error
          this.audioService.stop('slot.spin');

          this.isSpinning = false;
          this.slotMachineLoading = false;
          // Refund the cost on error
          const cost = this.slotMachineInfo?.cost || 10;
          this.userStatistics.experience = (this.userStatistics.experience || 0) + cost;
          this.slotMachineError = error?.error?.error || 'Fehler beim Spielen der Slotmaschine';

          setTimeout(() => {
            this.slotMachineError = '';
          }, 3000);
        },
      });
  }

  // Lucky Wheel Methods
  loadLuckyWheelInfo(): void {
    this.luckyWheelError = ''; // Clear any previous errors
    this.authService.authenticatedGet<LuckyWheelInfo>(`${environment.apiUrl}/luckywheel/info`).subscribe({
      next: (response) => {
        this.luckyWheelInfo = response;
        this.luckyWheelError = ''; // Clear error on success
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

    // Remove leading zeros
    sanitized = sanitized.replace(/^0+/, '') || '0';

    // Enforce max limit if luckyWheelInfo is available
    if (this.luckyWheelInfo) {
      const numValue = parseInt(sanitized, 10);
      if (!isNaN(numValue) && numValue > this.luckyWheelInfo.maxBet) {
        sanitized = this.luckyWheelInfo.maxBet.toString();
      }
    }

    this.luckyWheelBetInput = sanitized;

    // Update the input element's value to reflect sanitization
    input.value = sanitized;
  }

  onLuckyWheelBetKeydown(event: KeyboardEvent): void {
    // Allow control keys: backspace, delete, tab, escape, enter, arrows
    const controlKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];

    // Allow Ctrl/Cmd + A, C, V, X for copy/paste/select all
    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }

    // Allow control keys
    if (controlKeys.includes(event.key)) {
      return;
    }

    // Block anything that's not a digit (0-9)
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

    // Deduct the bet immediately
    this.userStatistics.experience = (this.userStatistics.experience || 0) - bet;

    // Call backend
    this.authService
      .authenticatedPost<LuckyWheelResult>(`${environment.apiUrl}/luckywheel`, {
        bet,
      })
      .subscribe({
        next: (response) => {
          this.lastWheelMultiplier = response.multiplier;
          this.lastWheelPayout = response.payout;

          // Find all segments matching the winning multiplier
          const segments = this.getWheelSegments();
          const matchingIndices: number[] = [];
          segments.forEach((seg, idx) => {
            if (seg.multiplier === response.multiplier) {
              matchingIndices.push(idx);
            }
          });

          const fallbackIndex = segments.findIndex((seg) => seg.multiplier === response.multiplier);

          // Pick a random matching segment (fallback to first occurrence)
          const targetSegmentIndex = (
            matchingIndices.length
              ? matchingIndices[Math.floor(Math.random() * matchingIndices.length)]
              : fallbackIndex !== -1
                ? fallbackIndex
                : 0
          )!;

          const totalSegments = segments.length || 1;
          const degreesPerSegment = 360 / totalSegments;

          // Calculate the angle of the segment's center relative to the base orientation
          const rawSegmentCenterAngle = targetSegmentIndex * degreesPerSegment + degreesPerSegment / 2 - 90;
          const segmentCenterAngle = this.normalizeAngle(rawSegmentCenterAngle);

          // Pointer arrow sits at top -> -90 degrees -> normalize to 270
          const pointerAngle = 270;

          // Account for current wheel rotation so subsequent spins continue smoothly
          const currentAngle = this.normalizeAngle(this.wheelRotation);

          // Determine clockwise rotation needed from current position to align the target
          let rotationToPointer = pointerAngle - segmentCenterAngle - currentAngle;
          rotationToPointer = this.normalizeAngle(rotationToPointer);

          // Enforce at least 5 full rotations, plus up to 2 extra for drama
          const minFullRotations = 5;
          const extraRotations = Math.floor(Math.random() * 3); // 0-2
          const spinDegrees = (minFullRotations + extraRotations) * 360 + rotationToPointer;

          this.wheelRotation += spinDegrees;

          // Remember which segment should glow once the spin completes
          const resolvedSegmentIndex = targetSegmentIndex;

          // Wait for spin animation to complete
          setTimeout(() => {
            this.audioService.stop('luckywheel.spin');

            // Play win/lose jingle
            if (response.payout > 0) {
              void this.audioService.play('luckywheel.win');
            } else {
              void this.audioService.play('luckywheel.lose');
            }

            this.isWheelSpinning = false;
            this.luckyWheelLoading = false;
            this.showWheelResult = true;
            this.winningSegmentIndex = resolvedSegmentIndex;

            // Update balance with payout
            if (response.payout > 0) {
              this.userStatistics.experience = (this.userStatistics.experience || 0) + response.payout;
            }

            this.luckyWheelMessage = response.message;
            this.addLuckyWheelSpinToLog(response.multiplier, response.payout, bet, response.message);

            this.showWheelResult = false;
            this.luckyWheelMessage = '';
            this.winningSegmentIndex = null;

            // Check for auto-spin
            this.checkForAutoWheelSpin();
          }, 4000); // 4 second spin animation
        },
        error: (error) => {
          this.audioService.stop('luckywheel.spin');
          this.isWheelSpinning = false;
          this.luckyWheelLoading = false;

          // Refund the bet on error
          this.userStatistics.experience = (this.userStatistics.experience || 0) + bet;

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
        // Return the middle of this multiplier's segments
        return index + Math.floor(entry.weight / 2);
      }
      index += entry.weight;
    }
    return 0;
  }

  getWheelSegments(): Array<{ color: string; multiplier: number }> {
    // Return cached segments if already generated
    if (this.cachedWheelSegments) {
      return this.cachedWheelSegments;
    }

    if (!this.luckyWheelInfo) return [];

    const segments: Array<{ color: string; multiplier: number }> = [];

    // Sort payout table by multiplier to determine color palette position
    const sortedTable = [...this.luckyWheelInfo.payoutTable].sort((a, b) => a.multiplier - b.multiplier);

    this.luckyWheelInfo.payoutTable.forEach((entry) => {
      const sortedIndex = sortedTable.findIndex((e) => e.multiplier === entry.multiplier);
      const color = this.getColorFromPaletteIndex(sortedIndex, sortedTable.length);
      for (let i = 0; i < entry.weight; i++) {
        segments.push({ color, multiplier: entry.multiplier });
      }
    });

    // Shuffle using seeded pseudo-random for apparent randomness
    this.cachedWheelSegments = this.seededShuffle(segments);
    return this.cachedWheelSegments;
  }

  seededShuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    // Use a simple seeded random based on current date (changes daily)
    const seed = new Date()
      .toDateString()
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);

    // Linear Congruential Generator for pseudo-random numbers
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
    // Grey to colorful palette - evenly spaced
    const palette = [
      '#6b7280', // Grey (lowest)
      '#f59e0b', // Orange
      '#8b5cf6', // Purple
      '#3b82f6', // Blue
      '#10b981', // Green
      '#ec4899', // Pink/Magenta (highest)
    ];

    // Map index to palette position
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
        // Clear old history format (with 'steps' instead of 'multiplier')
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
    this.chickenCrossDeadGame = null; // Clear any previous dead game

    // Deduct bet immediately
    this.userStatistics.experience = (this.userStatistics.experience || 0) - bet;

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
          // Refund bet on error
          this.userStatistics.experience = (this.userStatistics.experience || 0) + bet;
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

    // Move chicken immediately to the next step (suspense state)
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
          // Add suspense delay
          setTimeout(() => {
            this.chickenCrossIsMoving = false;

            if (response.state === 'LOST') {
              // Mark as lost - show skull and explosion
              this.chickenCrossGame = {
                ...this.chickenCrossGame!,
                state: 'LOST' as const,
              };
              this.chickenCrossLostAnimation = true;

              // After explosion animation, transition to dead game state
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

                // Store the dead game - same state, just swap references
                this.chickenCrossDeadGame = { ...this.chickenCrossGame! };
                this.chickenCrossGame = null;
                this.chickenCrossLostAnimation = false;
                this.chickenCrossIsAnimating = false;
              }, 1000);
            } else {
              // Success - update payout
              this.chickenCrossGame = {
                ...this.chickenCrossGame!,
                currentPayout: response.currentPayout,
                state: response.state,
              };
              this.chickenCrossIsAnimating = false;
            }
          }, 600); // 600ms suspense delay
        },
        error: (error) => {
          // Roll back the step on error
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

    const requestBody: ChickenCrossPostRequest = {
      intent: 'CASHOUT',
      seed: this.chickenCrossGame.seed,
    };

    this.authService
      .authenticatedPost<ChickenCrossPostResponse>(`${environment.apiUrl}/chickencross`, requestBody)
      .subscribe({
        next: (response) => {
          this.chickenCrossLoading = false;

          // Add payout to balance
          this.userStatistics.experience = (this.userStatistics.experience || 0) + response.currentPayout;

          const multiplier = response.currentPayout / this.chickenCrossGame!.initialWager;

          // Only add to history if player actually made at least one move
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

    // Clamp value between 1 and 36
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

    // Clear any previous timeouts
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

    // Validate number bet type
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

    const requestBody: RoulettePostRequest = {
      bet,
      type: this.rouletteBetType,
    };

    if (this.rouletteBetType === 'number') {
      requestBody.value = this.rouletteBetValue;
    }

    this.userStatistics.experience = (this.userStatistics.experience || 0) - bet;

    this.authService.authenticatedPost<RoulettePostResponse>(`${environment.apiUrl}/roulette`, requestBody).subscribe({
      next: (response) => {
        this.rouletteSpinResult = response.spinResult;
        this.rouletteWon = response.won;
        this.roulettePayout = response.payout;

        // Calculate rotation to land on the winning number
        // Each section is 360/37 ≈ 9.73 degrees
        // We need to rotate so the winning number's center aligns with the pointer at top
        const position = DashboardComponent.ROULETTE_WHEEL_SEQUENCE.indexOf(response.spinResult);
        const sectionSize = 360 / 37;
        const targetAngle = position * sectionSize + sectionSize / 2;
        // Rotate backwards (negative) to bring the target to the pointer, add full spins
        const fullSpins = 5 * 360; // 5 full rotations
        const rotationDelta = fullSpins + (360 - targetAngle);
        
        // Final wheel rotation
        this.rouletteRotation = this.rouletteRotation - (this.rouletteRotation % 360) + rotationDelta;

        //rotate screen feature
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
    return DashboardComponent.RED_NUMBERS.includes(number) ? 'red' : 'black';
  }

  getRouletteNumberPosition(number: number): { [key: string]: string } {
    // Real European roulette wheel number sequence (clockwise from 0)
    const position = DashboardComponent.ROULETTE_WHEEL_SEQUENCE.indexOf(number);

    if (position === -1) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

    // Each position gets equal space (360 / 37 degrees)
    const sectionSize = 360 / 37;
    const angle = position * sectionSize + sectionSize / 2;
    const radians = ((angle - 90) * Math.PI) / 180;

    // Position on the outer edge
    const radiusPercent = 44;
    const x = radiusPercent * Math.cos(radians);
    const y = radiusPercent * Math.sin(radians);

    // Rotate number to face inward toward the center
    const rotationAngle = angle;

    return {
      left: `calc(50% + ${x}%)`,
      top: `calc(50% + ${y}%)`,
      transform: `translate(-50%, -50%) rotate(${rotationAngle}deg)`,
    };
  }

  getRouletteNumberBgColor(number: number): string {
    if (number === 0) return '#10b981'; // Green
    return DashboardComponent.RED_NUMBERS.includes(number) ? '#ef4444' : '#1f2937';
  }
}
