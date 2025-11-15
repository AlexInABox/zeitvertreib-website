import { Component, OnInit, OnDestroy } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { AvatarModule } from 'primeng/avatar';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

interface BackgroundRemovalResponse {
  success: boolean;
  processedImageUrl?: string;
  message?: string;
  error?: string;
}

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

interface UploadLimits {
  maxOriginalSize: number;
  maxThumbnailSize: number;
  maxOriginalSizeMB: number;
  maxThumbnailSizeKB: number;
  supportedFormats: string[];
  message: string;
}

interface SprayBanStatus {
  isBanned: boolean;
  banReason?: string;
  bannedAt?: number;
  bannedBy?: string;
  permanent?: boolean;
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

@Component({
  selector: 'app-dashboard',
  imports: [
    ButtonModule,
    CardModule,
    ChartModule,
    AvatarModule,
    CommonModule,
    FormsModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
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

  isLoading = true;
  hasError = false;
  errorMessage = '';
  randomColors: string[] = [];

  // Spray-related properties
  sprayUploadLoading = false;
  sprayUploadError = '';
  sprayUploadSuccess = false;
  sprayDeleteSuccess = false;
  currentSprayImage: string | null = null;
  selectedFile: File | null = null;
  selectedFilePreview: string | null = null; // Preview of original selected file
  showSprayHelp = false;
  showPrivacyDetails = false;
  showRulesDetails = false;
  isDragOver = false;
  uploadLimits: UploadLimits | null = null;
  sprayBanStatus: SprayBanStatus | null = null;
  removeBackground = false; // Toggle for automatic background removal
  backgroundRemovalProcessing = false; // Track if background removal is in progress
  processedImagePreview: string | null = null; // Preview of processed image

  // Fakerank-related properties
  currentFakerank: string | null = null;
  currentFakerankColor: string = 'default';
  tempFakerankColor: string = 'default'; // Temporary color for editing
  isEditingFakerank = false;
  fakerankValue = '';
  fakerankLoading = false;
  fakerankError = '';
  fakerankSuccess = false;
  showFakerankHelp = false;
  fakerankAllowed = false;
  fakerankTimeRemaining = 0;
  fakerankAdminTimeRemaining = 0;
  fakerankOverrideTimeRemaining = 0;
  hasFakerankOverride = false;
  isFakerankReadOnly = false;
  private fakerankTimerInterval: any;
  showColorPicker = false;
  private documentClickHandler?: (event: Event) => void;

  // Available fakerank colors
  fakerankColors = [
    { key: 'default', name: 'Default (Weiß)', hex: '#FFFFFF' },
    { key: 'pink', name: 'Pink', hex: '#FF96DE' },
    { key: 'red', name: 'Rot', hex: '#C50000' },
    { key: 'brown', name: 'Braun', hex: '#944710' },
    { key: 'silver', name: 'Silber', hex: '#A0A0A0' },
    { key: 'light_green', name: 'Hellgrün', hex: '#32CD32' },
    { key: 'crimson', name: 'Karmesinrot', hex: '#DC143C' },
    { key: 'cyan', name: 'Cyan', hex: '#00B7EB' },
    { key: 'aqua', name: 'Aqua', hex: '#00FFFF' },
    { key: 'deep_pink', name: 'Tiefes Pink', hex: '#FF1493' },
    { key: 'tomato', name: 'Tomate', hex: '#FF6448' },
    { key: 'yellow', name: 'Gelb', hex: '#FAFF86' },
    { key: 'magenta', name: 'Magenta', hex: '#FF0090' },
    { key: 'blue_green', name: 'Blaugrün', hex: '#4DFFB8' },
    { key: 'orange', name: 'Orange', hex: '#FF9966' },
    { key: 'lime', name: 'Limette', hex: '#BFFF00' },
    { key: 'green', name: 'Grün', hex: '#228B22' },
    { key: 'emerald', name: 'Smaragd', hex: '#50C878' },
    { key: 'carmine', name: 'Karmin', hex: '#960018' },
    { key: 'nickel', name: 'Nickel', hex: '#727472' },
    { key: 'mint', name: 'Minze', hex: '#98FB98' },
    { key: 'army_green', name: 'Armeegrün', hex: '#4B5320' },
    { key: 'pumpkin', name: 'Kürbis', hex: '#EE7600' },
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
  currentWinType: 'jackpot' | 'big_win' | 'small_win' | 'mini_win' | 'loss' =
    'loss';
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

  // Helper method to calculate transfer tax
  getTransferTax(amount: number | null): number {
    if (!amount) return 0;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) return 0;
    return Math.floor(numAmount * 0.1); // 10% tax
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

  constructor(private authService: AuthService) {
    this.generateRandomColors();
    this.loadUserStats();
    this.loadCurrentSpray();
    this.loadUploadLimits();
    this.loadSprayBanStatus();
    this.loadFakerank();
    this.loadRedeemables();
    this.loadSlotMachineInfo();
    this.loadLuckyWheelInfo();
    this.loadWinLog();
    this.loadLuckyWheelSpinLog();

    // Close color picker when clicking outside
    this.documentClickHandler = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.color-picker-container')) {
        this.showColorPicker = false;
        this.updateOverflowClass();
      }
    };
    document.addEventListener('click', this.documentClickHandler);
  }

  ngOnInit(): void {
    // Start the access timer when component initializes
    this.startAccessTimer();

    // Initialize slot machine with question marks
    setTimeout(() => {
      this.initializeSlotMachine();
    }, 100);
  }

  // Handle toggle change to trigger background removal
  async onBackgroundRemovalToggle(): Promise<void> {
    if (
      this.removeBackground &&
      this.selectedFile &&
      !this.backgroundRemovalProcessing
    ) {
      // Process image for preview when toggle is turned on
      try {
        await this.processImageWithBackgroundRemoval(this.selectedFile);
      } catch (error) {
        console.error('Preview processing failed:', error);
        // Reset toggle if processing fails
        this.removeBackground = false;
      }
    } else if (!this.removeBackground) {
      // Clear processed preview when toggle is turned off
      this.clearProcessedPreview();
    }
  }

  // Check if current user is a fakerank admin
  isFakerankAdmin(): boolean {
    return this.authService.isFakerankAdmin();
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
    return (
      Array.isArray(this.userStatistics?.lastkillers) &&
      this.userStatistics.lastkillers.length > 0
    );
  }

  // Safe method to truncate display names
  truncateDisplayName(name?: string, maxLength = 15): string {
    if (!name) return 'Unbekannt';
    return name.length > maxLength
      ? `${name.substring(0, maxLength)}...`
      : name;
  }

  // Safe method to get avatar with fallback
  getAvatarUrl(avatarUrl?: string): string {
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
    this.randomColors = [
      this.getRandomColor(),
      this.getRandomColor(),
      this.getRandomColor(),
    ];
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
      root.style.setProperty(
        '--random-color-1',
        this.randomColors[0] ?? '#000000',
      );
      root.style.setProperty(
        '--random-color-2',
        this.randomColors[1] ?? '#000000',
      );
      root.style.setProperty(
        '--random-color-3',
        this.randomColors[2] ?? '#000000',
      );
    }
  }

  private loadUserStats(): void {
    this.isLoading = true;
    this.hasError = false;

    this.authService
      .authenticatedGet<{ stats: Statistics }>(`${environment.apiUrl}/stats`)
      .subscribe({
        next: (response) => {
          if (response?.stats) {
            this.userStatistics = {
              ...this.userStatistics, // Keep defaults for missing properties
              ...response.stats,
            };
            // Update fakerankAllowed from timestamp-based calculation
            this.fakerankAllowed = this.authService.canEditFakerank();
            this.hasFakerankOverride = this.authService.hasFakerankOverride();
            this.isFakerankReadOnly = this.authService.isFakerankReadOnly();
            // Update timers after loading stats
            this.updateAccessTimers();
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

  // Load the current spray image
  private loadCurrentSpray(): void {
    // Add cache-busting parameter to avoid browser caching issues
    const timestamp = new Date().getTime();
    this.authService
      .authenticatedGetBlob(`${environment.apiUrl}/spray/image?t=${timestamp}`)
      .subscribe({
        next: (response: Blob) => {
          // Clean up previous object URL to prevent memory leaks
          if (this.currentSprayImage) {
            URL.revokeObjectURL(this.currentSprayImage);
          }
          // Convert blob to object URL for display
          this.currentSprayImage = URL.createObjectURL(response);
        },
        error: (error) => {
          // No spray found is fine, just don't set an image
          if (error.status !== 404) {
            console.error('Error loading spray:', error);
          }
          // Clean up previous object URL
          if (this.currentSprayImage) {
            URL.revokeObjectURL(this.currentSprayImage);
          }
          this.currentSprayImage = null;
        },
      });
  }

  // Load upload limits for images
  private loadUploadLimits(): void {
    this.authService
      .authenticatedGet<UploadLimits>(
        `${environment.apiUrl}/spray/upload-limits`,
      )
      .subscribe({
        next: (response) => {
          this.uploadLimits = response;
        },
        error: (error) => {
          console.error('Error loading upload limits:', error);
          // Provide fallback limits if API call fails
          this.uploadLimits = {
            maxOriginalSize: 5 * 1024 * 1024, // 5MB
            maxThumbnailSize: 10 * 1024, // 10KB
            maxOriginalSizeMB: 5,
            maxThumbnailSizeKB: 10,
            supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
            message: 'Maximale Bildgröße: 5MB',
          };
        },
      });
  }

  // Load spray ban status for current user
  private loadSprayBanStatus(): void {
    this.authService
      .authenticatedGet<SprayBanStatus>(
        `${environment.apiUrl}/spray/ban-status`,
      )
      .subscribe({
        next: (response) => {
          this.sprayBanStatus = response;
        },
        error: (error) => {
          console.error('Error loading spray ban status:', error);
          // If we can't load ban status, assume not banned for safety
          this.sprayBanStatus = { isBanned: false };
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
          this.redeemables = (response?.redeemables || []).sort(
            (a, b) => a.price - b.price,
          );
          this.redeemablesLoading = false;
        },
        error: (error) => {
          console.error('Error loading redeemables:', error);
          this.redeemablesError =
            'Fehler beim Laden der verfügbaren Belohnungen';
          this.redeemablesLoading = false;
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
    this.updateAccessTimers();

    // Update fakerank allowed status
    this.fakerankAllowed = this.authService.canEditFakerank();
    this.hasFakerankOverride = this.authService.hasFakerankOverride();
    this.isFakerankReadOnly = this.authService.isFakerankReadOnly();

    // Also refresh any other data that might have changed
    if (this.fakerankTimerInterval) {
      this.startAccessTimer(); // Restart timer to update immediately
    }
  }

  // Public method to regenerate colors only
  regenerateColors(): void {
    this.generateRandomColors();
  }

  // Spray functionality methods
  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target?.files?.[0]) {
      const file = target.files[0];

      // Validate file type - no GIFs allowed
      if (!file.type.startsWith('image/') || file.type === 'image/gif') {
        this.sprayUploadError =
          'Bitte wähle eine Bilddatei aus (PNG, JPG, WEBP - keine GIFs)';
        target.value = ''; // Clear the input
        return;
      }

      // Check if file type is supported
      if (
        this.uploadLimits?.supportedFormats &&
        !this.uploadLimits.supportedFormats.includes(file.type)
      ) {
        this.sprayUploadError = 'Dateiformate unterstützt: PNG, JPG, WEBP';
        target.value = ''; // Clear the input
        return;
      }

      this.setSelectedFile(file);
    }
  }

  // Helper method to set selected file and create preview
  private setSelectedFile(file: File): void {
    // Clean up previous preview
    if (this.selectedFilePreview) {
      URL.revokeObjectURL(this.selectedFilePreview);
    }

    this.selectedFile = file;
    this.selectedFilePreview = URL.createObjectURL(file);
    this.sprayUploadError = '';
    this.sprayUploadSuccess = false;
    this.sprayDeleteSuccess = false;

    // Clear any existing processed preview since we have a new file
    this.clearProcessedPreview();
  }

  // Drag and drop methods
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file && file.type.startsWith('image/') && file.type !== 'image/gif') {
        // Check if file type is supported
        if (
          this.uploadLimits?.supportedFormats &&
          !this.uploadLimits.supportedFormats.includes(file.type)
        ) {
          this.sprayUploadError = 'Dateiformate unterstützt: PNG, JPG, WEBP';
          return;
        }
        this.setSelectedFile(file);
      } else {
        this.sprayUploadError =
          'Bitte wähle eine Bilddatei aus (PNG, JPG, WEBP - keine GIFs)';
      }
    }
  }

  async uploadSpray(): Promise<void> {
    if (!this.selectedFile) {
      this.sprayUploadError = 'Bitte wähle eine Datei aus';
      return;
    }

    // Validate file type - only images, no GIFs
    if (
      !this.selectedFile.type.startsWith('image/') ||
      this.selectedFile.type === 'image/gif'
    ) {
      this.sprayUploadError =
        'Bitte wähle eine Bilddatei aus (PNG, JPG, WEBP - keine GIFs)';
      return;
    }

    // Validate supported formats
    if (
      this.uploadLimits?.supportedFormats &&
      !this.uploadLimits.supportedFormats.includes(this.selectedFile.type)
    ) {
      this.sprayUploadError = 'Dateiformate unterstützt: PNG, JPG, WEBP';
      return;
    }

    // Validate file size using dynamic limits
    const maxSize = this.uploadLimits?.maxOriginalSize || 5 * 1024 * 1024; // Fallback to 5MB
    if (this.selectedFile.size > maxSize) {
      const maxSizeMB = this.uploadLimits?.maxOriginalSizeMB || 5;
      this.sprayUploadError = `Datei ist zu groß. Maximum sind ${maxSizeMB}MB`;
      return;
    }

    this.sprayUploadLoading = true;
    this.sprayUploadError = '';
    this.sprayDeleteSuccess = false;

    try {
      // Process image with background removal if enabled
      const fileToProcess = await this.processImageWithBackgroundRemoval(
        this.selectedFile,
      );

      // Process the image (no more GIF processing since GIFs are not supported)
      const processedData = await this.processImageForUpload(fileToProcess);

      if (!this.selectedFile) {
        throw new Error('Keine Datei ausgewählt');
      }

      const formData = new FormData();
      formData.append('smallImage', processedData.smallImage); // Thumbnail for storage
      formData.append('originalImage', fileToProcess); // Use processed file (with or without background removal)
      formData.append('isGif', 'false'); // No more GIF support
      formData.append('removeBackground', this.removeBackground.toString()); // Background removal toggle

      // Only handle regular image data
      if ('pixelData' in processedData) {
        formData.append('pixelData', processedData.pixelData); // Single string for images
      }

      await this.authService
        .authenticatedPost(`${environment.apiUrl}/spray/upload`, formData)
        .toPromise();

      this.sprayUploadLoading = false;
      this.sprayUploadSuccess = true;
      this.sprayUploadError = '';
      this.selectedFile = null;
      this.removeBackground = false; // Reset toggle after successful upload

      // Clean up all preview URLs
      if (this.selectedFilePreview) {
        URL.revokeObjectURL(this.selectedFilePreview);
        this.selectedFilePreview = null;
      }
      if (this.processedImagePreview) {
        URL.revokeObjectURL(this.processedImagePreview);
        this.processedImagePreview = null;
      }

      // Reset file input
      const fileInput = document.getElementById(
        'sprayFileInput',
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Reload spray image
      this.loadCurrentSpray();
    } catch (error: any) {
      console.error('Spray upload error:', error);
      this.sprayUploadLoading = false;
      this.sprayUploadError =
        error?.error?.error ||
        error?.message ||
        'Fehler beim Hochladen des Sprays';
      this.sprayUploadSuccess = false;
    }
  }

  // Method to remove current spray
  removeSpray(): void {
    if (!this.hasSpray) {
      return;
    }

    this.sprayUploadLoading = true;
    this.sprayUploadError = '';
    this.sprayUploadSuccess = false;
    this.sprayDeleteSuccess = false;

    this.authService
      .authenticatedDelete(`${environment.apiUrl}/spray/delete`)
      .subscribe({
        next: (_response: any) => {
          this.sprayUploadLoading = false;
          this.sprayDeleteSuccess = true;
          this.sprayUploadSuccess = false;
          this.sprayUploadError = '';

          // Clear the cached image URL to avoid browser caching issues
          if (this.currentSprayImage) {
            URL.revokeObjectURL(this.currentSprayImage);
          }
          this.currentSprayImage = null;

          // Clear any selected file as well
          this.selectedFile = null;
          const fileInput = document.getElementById(
            'sprayFileInputMini',
          ) as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        },
        error: (error: any) => {
          console.error('Spray deletion error:', error);
          this.sprayUploadLoading = false;
          this.sprayUploadError =
            error.error?.error || 'Fehler beim Löschen des Sprays';
          this.sprayUploadSuccess = false;
          this.sprayDeleteSuccess = false;
        },
      });
  }

  get hasSpray(): boolean {
    return !!this.currentSprayImage;
  }

  get selectedFileName(): string {
    return this.selectedFile?.name || '';
  }

  get isSprayBanned(): boolean {
    return this.sprayBanStatus?.isBanned === true;
  }

  // Clear processed image preview
  clearProcessedPreview(): void {
    if (this.processedImagePreview) {
      URL.revokeObjectURL(this.processedImagePreview);
      this.processedImagePreview = null;
    }
  }

  // Clear all previews and selected file
  clearAllPreviews(): void {
    if (this.selectedFilePreview) {
      URL.revokeObjectURL(this.selectedFilePreview);
      this.selectedFilePreview = null;
    }
    this.clearProcessedPreview();
    this.selectedFile = null;
    this.removeBackground = false;

    // Reset file input
    const fileInput = document.getElementById(
      'sprayFileInput',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  ngOnDestroy(): void {
    // Stop the access timer
    this.stopAccessTimer();

    // Clean up object URLs to prevent memory leaks
    if (this.currentSprayImage) {
      URL.revokeObjectURL(this.currentSprayImage);
    }

    // Clean up file previews
    if (this.selectedFilePreview) {
      URL.revokeObjectURL(this.selectedFilePreview);
    }
    if (this.processedImagePreview) {
      URL.revokeObjectURL(this.processedImagePreview);
    }

    // Clean up event listener
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
    }
  }

  // Process image with background removal if enabled
  private async processImageWithBackgroundRemoval(file: File): Promise<File> {
    if (!this.removeBackground) {
      return file; // Return original file if background removal is disabled
    }

    try {
      this.backgroundRemovalProcessing = true;

      // Send image to backend for background removal
      const formData = new FormData();
      formData.append('image', file);

      const response = (await this.authService
        .authenticatedPost(
          `${environment.apiUrl}/spray/remove-background`,
          formData,
        )
        .toPromise()) as BackgroundRemovalResponse;

      if (!response?.success || !response?.processedImageUrl) {
        throw new Error('Backend did not return processed image URL');
      }

      // Fetch the processed image from the URL
      const imageResponse = await fetch(response.processedImageUrl);
      if (!imageResponse.ok) {
        throw new Error('Failed to fetch processed image');
      }

      const imageBlob = await imageResponse.blob();

      // Create preview URL for display
      if (this.processedImagePreview) {
        URL.revokeObjectURL(this.processedImagePreview);
      }
      this.processedImagePreview = URL.createObjectURL(imageBlob);

      // Convert blob to file
      const processedFile = new File([imageBlob], file.name, {
        type: 'image/png', // Background removal always outputs PNG for transparency
        lastModified: Date.now(),
      });

      this.backgroundRemovalProcessing = false;
      return processedFile;
    } catch (error) {
      this.backgroundRemovalProcessing = false;
      console.error('Background removal failed:', error);
      this.sprayUploadError =
        'Hintergrundentfernung fehlgeschlagen: ' +
        (error instanceof Error ? error.message : 'Unbekannter Fehler');
      return file; // Fall back to original file
    }
  }

  // Process image to create 50x50 thumbnail and high-quality pixel data
  private async processImageForUpload(
    file: File,
  ): Promise<{ smallImage: Blob; pixelData: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const pixelArtQuality = 100;

          // Create 50x50 thumbnail (for storage/display)
          const thumbnailCanvas = document.createElement('canvas');
          const thumbnailCtx = thumbnailCanvas.getContext('2d');
          if (!thumbnailCtx)
            throw new Error(
              'Konnte 2D-Kontext für Thumbnail-Canvas nicht erhalten',
            );

          thumbnailCanvas.width = 50;
          thumbnailCanvas.height = 50;

          // Scale thumbnail so the longest side becomes 50px
          const { width: thumbWidth, height: thumbHeight } =
            this.scaleToLongestSide(img.width, img.height, 50);
          const thumbOffsetX = (50 - thumbWidth) / 2;
          const thumbOffsetY = (50 - thumbHeight) / 2;

          thumbnailCtx.clearRect(0, 0, 50, 50);
          thumbnailCtx.drawImage(
            img,
            thumbOffsetX,
            thumbOffsetY,
            thumbWidth,
            thumbHeight,
          );

          // Create high-quality canvas for pixel art generation
          const pixelCanvas = document.createElement('canvas');
          const pixelCtx = pixelCanvas.getContext('2d');
          if (!pixelCtx)
            throw new Error(
              'Konnte 2D-Kontext für Pixel-Canvas nicht erhalten',
            );

          pixelCanvas.width = pixelArtQuality;
          pixelCanvas.height = pixelArtQuality;

          // Scale for pixel art so the longest side becomes pixelArtQuality
          const { width: pixelWidth, height: pixelHeight } =
            this.scaleToLongestSide(img.width, img.height, pixelArtQuality);
          const pixelOffsetX = (pixelArtQuality - pixelWidth) / 2;
          const pixelOffsetY = (pixelArtQuality - pixelHeight) / 2;

          pixelCtx.clearRect(0, 0, pixelArtQuality, pixelArtQuality);
          pixelCtx.drawImage(
            img,
            pixelOffsetX,
            pixelOffsetY,
            pixelWidth,
            pixelHeight,
          );

          // Extract pixel data from high-quality canvas to create pixel art string
          const pixelData = this.createPixelArtFromCanvas(
            pixelCtx,
            pixelArtQuality,
            pixelArtQuality,
          );

          // Convert thumbnail canvas to blob for storage
          thumbnailCanvas.toBlob(
            (smallBlob) => {
              if (!smallBlob) {
                reject(new Error('Konnte Thumbnail-Blob nicht erstellen'));
                return;
              }

              resolve({ smallImage: smallBlob, pixelData });
            },
            'image/png',
            1.0,
          ); // Use PNG to preserve transparency
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Konnte Bild nicht laden'));
      img.src = URL.createObjectURL(file);
    });
  }

  // Create pixel art string from canvas data (like the C# version)
  private createPixelArtFromCanvas(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): string {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data; // RGBA array
    let result = '';

    for (let y = 0; y < height; y++) {
      let line = '';
      let currentColor = '';
      let consecutiveCount = 0;

      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4; // 4 bytes per pixel (RGBA)
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const alpha = data[index + 3];

        // Ensure all values are defined
        if (
          r === undefined ||
          g === undefined ||
          b === undefined ||
          alpha === undefined
        ) {
          continue;
        }

        // Handle transparency like the C# code (alpha < 25 becomes transparent block)
        if (alpha < 25) {
          if (consecutiveCount > 0 && currentColor) {
            line += `<color=${currentColor}>${'█'.repeat(consecutiveCount)}</color>`;
            consecutiveCount = 0;
          }
          line += '<color=#00000000>█</color>'; // Transparent unicode block
          currentColor = '';
          continue;
        }

        // Convert to hex color
        const pixelColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

        if (pixelColor === currentColor) {
          consecutiveCount++;
        } else {
          // Flush previous color group
          if (consecutiveCount > 0 && currentColor) {
            line += `<color=${currentColor}>${'█'.repeat(consecutiveCount)}</color>`;
          }
          currentColor = pixelColor;
          consecutiveCount = 1;
        }
      }

      // Flush remaining pixels for this line
      if (consecutiveCount > 0 && currentColor) {
        line += `<color=${currentColor}>${'█'.repeat(consecutiveCount)}</color>`;
      }

      // Always add the line and a newline, like the C# version
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

  // Calculate dimensions that fit within max width/height while keeping aspect ratio
  // private calculateAspectRatioFit(
  //   srcWidth: number,
  //   srcHeight: number,
  //   maxWidth: number,
  //   maxHeight: number,
  // ): { width: number; height: number } {
  //   const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
  //   return {
  //     width: Math.floor(srcWidth * ratio),
  //     height: Math.floor(srcHeight * ratio),
  //   };
  // }

  // Fakerank methods
  loadFakerank(): void {
    this.authService
      .authenticatedGet<{
        fakerank: string | null;
        fakerank_color: string;
        fakerank_until: number;
      }>(`${environment.apiUrl}/fakerank`)
      .subscribe({
        next: (response) => {
          this.currentFakerank = response?.fakerank || null;
          this.currentFakerankColor = response?.fakerank_color || 'default';
          this.fakerankValue = this.currentFakerank || '';
          this.fakerankAllowed = this.authService.canEditFakerank();
          this.hasFakerankOverride = this.authService.hasFakerankOverride();
          this.isFakerankReadOnly = this.authService.isFakerankReadOnly();
        },
        error: (error) => {
          console.error('Error loading fakerank:', error);
          this.fakerankError = 'Fehler beim Laden des Fakeranks';
        },
      });
  }

  startEditingFakerank(): void {
    this.isEditingFakerank = true;
    this.fakerankValue = this.currentFakerank || '';
    this.tempFakerankColor = this.currentFakerankColor; // Store current color as temp
    this.fakerankError = '';
    this.fakerankSuccess = false;
    this.showColorPicker = false;
    this.updateOverflowClass();
  }

  cancelEditingFakerank(): void {
    this.isEditingFakerank = false;
    this.fakerankValue = this.currentFakerank || '';
    this.tempFakerankColor = this.currentFakerankColor; // Reset temp color to current
    this.fakerankError = '';
    this.fakerankSuccess = false;
    this.showColorPicker = false;
    this.updateOverflowClass();
  }

  // Prevent parentheses and commas from being typed
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === '(' || event.key === ')' || event.key === ',') {
      event.preventDefault();
    }
  }

  saveFakerank(): void {
    if (this.fakerankLoading) return;

    // Validate fakerank content - ban parentheses and commas
    if (
      this.fakerankValue.includes('(') ||
      this.fakerankValue.includes(')') ||
      this.fakerankValue.includes(',')
    ) {
      this.fakerankError =
        'Fakerank darf keine Klammern () oder Kommas enthalten';
      return;
    }

    this.fakerankLoading = true;
    this.fakerankError = '';
    this.fakerankSuccess = false;

    const payload = {
      fakerank: this.fakerankValue.trim(),
      fakerank_color: this.tempFakerankColor,
    };

    this.authService
      .authenticatedPost<{
        success: boolean;
        message: string;
        fakerank: string;
        fakerank_color: string;
        override_cleared?: boolean;
      }>(`${environment.apiUrl}/fakerank`, payload)
      .subscribe({
        next: (response) => {
          if (response?.success) {
            this.currentFakerank = response.fakerank;
            this.currentFakerankColor = response.fakerank_color;
            this.fakerankSuccess = true;
            this.isEditingFakerank = false;
            this.showColorPicker = false;
            this.updateOverflowClass();

            // Show different message if override was cleared
            if (response.override_cleared) {
              console.log('Admin override was cleared due to user edit');
              // Update the user's permission state to reflect that override is gone
              this.authService.refreshUserData();
            }

            setTimeout(() => (this.fakerankSuccess = false), 3000);
          }
          this.fakerankLoading = false;
        },
        error: (error) => {
          console.error('Error saving fakerank:', error);
          this.fakerankError =
            error?.error?.error || 'Fehler beim Speichern des Fakeranks';
          this.fakerankLoading = false;
        },
      });
  }

  deleteFakerank(): void {
    if (this.fakerankLoading) return;

    this.fakerankLoading = true;
    this.fakerankError = '';
    this.fakerankSuccess = false;

    this.authService
      .authenticatedDelete<{
        success: boolean;
      }>(`${environment.apiUrl}/fakerank`)
      .subscribe({
        next: (response) => {
          if (response?.success) {
            this.currentFakerank = null;
            this.currentFakerankColor = 'default';
            this.fakerankValue = '';
            this.fakerankSuccess = true;
            this.isEditingFakerank = false;
            this.showColorPicker = false;
            this.updateOverflowClass();
            setTimeout(() => (this.fakerankSuccess = false), 3000);
          }
          this.fakerankLoading = false;
        },
        error: (error) => {
          console.error('Error deleting fakerank:', error);
          this.fakerankError =
            error?.error?.error || 'Fehler beim Löschen des Fakeranks';
          this.fakerankLoading = false;
        },
      });
  }

  // Color picker methods
  toggleColorPicker(): void {
    this.showColorPicker = !this.showColorPicker;
    this.updateOverflowClass();
  }

  selectColor(colorKey: string): void {
    this.tempFakerankColor = colorKey; // Update temp color during editing
    this.showColorPicker = false;
    this.updateOverflowClass();
  }

  private updateOverflowClass(): void {
    // Add/remove overflow class for the fakerank card
    const fakerankCard = document.getElementById('fakerank-card');
    if (fakerankCard) {
      if (this.showColorPicker) {
        fakerankCard.classList.add('fakerank-card-overflow');
      } else {
        fakerankCard.classList.remove('fakerank-card-overflow');
      }
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
            this.codeRedemptionMessage =
              response.message || 'Code erfolgreich eingelöst!';

            // Update the user balance if provided
            if (response.newBalance !== undefined) {
              this.userStatistics.experience = response.newBalance;
            } else if (response.credits) {
              this.userStatistics.experience =
                (this.userStatistics.experience || 0) + response.credits;
            }

            // Clear the input after successful redemption
            this.redeemCode = '';

            // Force refresh the entire page to ensure all data is updated
            window.location.reload();
          } else {
            this.codeRedemptionSuccess = false;
            this.codeRedemptionMessage =
              response?.message || 'Code konnte nicht eingelöst werden';
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

    // Validate transfer amount
    const currentBalance = this.userStatistics.experience || 0;
    const taxAmount = Math.floor(amount * 0.1); // 10% tax
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
              this.userStatistics.experience =
                response.transfer.senderNewBalance;
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
            this.transferMessage =
              response?.message || 'Transfer fehlgeschlagen';
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
      alert(
        `Du besitzt diesen Begleiter noch nicht! Kaufe ihn im Cosmetic Shop.`,
      );
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
    alert(
      'Cosmetic Shop wird bald verfügbar sein! Hier kannst du neue Hüte, Begleiter und Aura-Effekte kaufen.',
    );
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

  // Update access timers
  private updateAccessTimers(): void {
    this.fakerankTimeRemaining = this.authService.getFakerankTimeRemaining();
    this.fakerankAdminTimeRemaining =
      this.authService.getFakerankAdminTimeRemaining();
    this.fakerankOverrideTimeRemaining =
      this.authService.getFakerankOverrideTimeRemaining();
    this.fakerankAllowed = this.authService.canEditFakerank();
    this.hasFakerankOverride = this.authService.hasFakerankOverride();
    this.isFakerankReadOnly = this.authService.isFakerankReadOnly();
  }

  // Start the countdown timer
  private startAccessTimer(): void {
    // Clear any existing timer
    if (this.fakerankTimerInterval) {
      clearInterval(this.fakerankTimerInterval);
    }

    // Update immediately
    this.updateAccessTimers();

    // Update every second
    this.fakerankTimerInterval = setInterval(() => {
      this.updateAccessTimers();
    }, 1000);
  }

  // Stop the countdown timer
  private stopAccessTimer(): void {
    if (this.fakerankTimerInterval) {
      clearInterval(this.fakerankTimerInterval);
      this.fakerankTimerInterval = null;
    }
  }

  // ZV Coins redeemables methods
  redeemItem(redeemable: Redeemable): void {
    if (!redeemable) {
      return;
    }

    // Check if item is still available
    if (!this.isAvailable(redeemable)) {
      alert(
        `❌ Item nicht verfügbar\n\n${redeemable.name} ist nicht mehr verfügbar zum Einlösen.`,
      );
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
            alert(
              `🎉 Erfolgreich eingelöst!\n\n${response.message}\n\nNeues Guthaben: ${response.newBalance} ZVC`,
            );

            // Force refresh the entire page to ensure all data is updated
            window.location.reload();
          } else {
            alert(
              'Fehler beim Einlösen: ' +
                (response?.message || 'Unbekannter Fehler'),
            );
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
    return (
      !redeemable.isExpired && redeemable.availabilityStatus === 'available'
    );
  }

  isExpired(redeemable: Redeemable): boolean {
    return (
      !!redeemable.isExpired || redeemable.availabilityStatus === 'expired'
    );
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
    const hours = Math.floor(
      (timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );

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

  spin(
    slotSymbols: string[],
    target1?: string,
    target2?: string,
    target3?: string,
    onComplete?: () => void,
  ): void {
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
      const symbolHeight =
        symbols.querySelector('.symbolInSlot')?.clientHeight || 150;

      // Random number of full rotations (2-6)
      const randomRotations = Math.floor(Math.random() * 8) + 4;

      // Calculate position to land on target symbol after random rotations
      const targetSymbol = targetSymbols[index];
      let targetOffset;

      if (targetSymbol && slotSymbols.includes(targetSymbol)) {
        // Land on specific symbol after random full spins
        const targetIndex = slotSymbols.indexOf(targetSymbol);
        const fullRotations =
          randomRotations * slotSymbols.length * symbolHeight;
        targetOffset = -(fullRotations + (targetIndex + 1) * symbolHeight);
      } else {
        // Random position after random full spins
        const randomIndex = Math.floor(Math.random() * slotSymbols.length);
        const fullRotations =
          randomRotations * slotSymbols.length * symbolHeight;
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
      const symbolHeight =
        symbols.querySelector('.symbolInSlot')?.clientHeight || 150;
      const topValue = Math.abs(parseInt(symbols.style.top, 10));

      // Account for the question mark at the beginning
      const symbolIndex =
        (Math.floor(topValue / symbolHeight) - 1) % slotSymbols.length;
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
      localStorage.setItem(
        this.WIN_LOG_STORAGE_KEY,
        JSON.stringify(this.slotWinLog),
      );
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
      console.error(
        'Error loading lucky wheel spins from localStorage:',
        error,
      );
      this.luckyWheelSpinLog = [];
    }
  }

  private saveLuckyWheelSpinLog(): void {
    try {
      localStorage.setItem(
        this.WHEEL_LOG_STORAGE_KEY,
        JSON.stringify(this.luckyWheelSpinLog),
      );
    } catch (error) {
      console.error('Error saving lucky wheel spins to localStorage:', error);
    }
  }

  private addLuckyWheelSpinToLog(
    multiplier: number,
    payout: number,
    bet: number,
    message: string,
  ): void {
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
      this.luckyWheelSpinLog = this.luckyWheelSpinLog.slice(
        0,
        this.MAX_WIN_LOG_ENTRIES,
      );
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
    if (minutes > 0)
      return minutes === 1 ? 'vor 1 Minute' : `vor ${minutes} Minuten`;
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
    this.userStatistics.experience =
      (this.userStatistics.experience || 0) - cost;

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
          this.spin(mySymbols, slot1, slot2, slot3, () => {
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
              this.userStatistics.experience =
                (this.userStatistics.experience || 0) + payout;
            }
          }, 10000); // Animation duration (10 seconds)
        },
        error: (error) => {
          this.isSpinning = false;
          this.slotMachineLoading = false;
          // Refund the cost on error
          const cost = this.slotMachineInfo?.cost || 10;
          this.userStatistics.experience =
            (this.userStatistics.experience || 0) + cost;
          this.slotMachineError =
            error?.error?.error || 'Fehler beim Spielen der Slotmaschine';

          setTimeout(() => {
            this.slotMachineError = '';
          }, 3000);
        },
      });
  }

  // Lucky Wheel Methods
  loadLuckyWheelInfo(): void {
    this.luckyWheelError = ''; // Clear any previous errors
    this.authService
      .authenticatedGet<LuckyWheelInfo>(`${environment.apiUrl}/luckywheel/info`)
      .subscribe({
        next: (response) => {
          this.luckyWheelInfo = response;
          this.luckyWheelError = ''; // Clear error on success
          const defaultBet =
            typeof response.minBet === 'number'
              ? response.minBet
              : this.luckyWheelBet;
          this.luckyWheelBet = this.clampLuckyWheelBet(defaultBet || 0);
          this.syncLuckyWheelBetInput();
        },
        error: (error) => {
          console.error('Error loading lucky wheel info:', error);
          this.luckyWheelError =
            'Fehler beim Laden des Glücksrads. Bitte versuche es erneut.';
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
    const controlKeys = [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
    ];

    // Allow Ctrl/Cmd + A, C, V, X for copy/paste/select all
    if (
      (event.ctrlKey || event.metaKey) &&
      ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())
    ) {
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
    return Math.max(
      this.luckyWheelInfo.minBet,
      Math.min(this.luckyWheelInfo.maxBet, rounded),
    );
  }

  private getPendingLuckyWheelBet(): number {
    if (!this.luckyWheelInfo) {
      const parsed = parseInt(this.luckyWheelBetInput, 10);
      return Number.isNaN(parsed)
        ? Math.max(0, this.luckyWheelBet || 0)
        : Math.max(0, Math.round(parsed));
    }

    const parsed = parseInt(this.luckyWheelBetInput, 10);
    if (Number.isNaN(parsed)) {
      return this.clampLuckyWheelBet(
        this.luckyWheelBet || this.luckyWheelInfo.minBet,
      );
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
    this.luckyWheelLoading = true;
    this.luckyWheelError = '';
    this.luckyWheelMessage = '';
    this.showWheelResult = false;
    this.winningSegmentIndex = null;

    // Deduct the bet immediately
    this.userStatistics.experience =
      (this.userStatistics.experience || 0) - bet;

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

          const fallbackIndex = segments.findIndex(
            (seg) => seg.multiplier === response.multiplier,
          );

          // Pick a random matching segment (fallback to first occurrence)
          const targetSegmentIndex = (
            matchingIndices.length
              ? matchingIndices[
                  Math.floor(Math.random() * matchingIndices.length)
                ]
              : fallbackIndex !== -1
                ? fallbackIndex
                : 0
          )!;

          const totalSegments = segments.length || 1;
          const degreesPerSegment = 360 / totalSegments;

          // Calculate the angle of the segment's center relative to the base orientation
          const rawSegmentCenterAngle =
            targetSegmentIndex * degreesPerSegment + degreesPerSegment / 2 - 90;
          const segmentCenterAngle = this.normalizeAngle(rawSegmentCenterAngle);

          // Pointer arrow sits at top -> -90 degrees -> normalize to 270
          const pointerAngle = 270;

          // Account for current wheel rotation so subsequent spins continue smoothly
          const currentAngle = this.normalizeAngle(this.wheelRotation);

          // Determine clockwise rotation needed from current position to align the target
          let rotationToPointer =
            pointerAngle - segmentCenterAngle - currentAngle;
          rotationToPointer = this.normalizeAngle(rotationToPointer);

          // Enforce at least 5 full rotations, plus up to 2 extra for drama
          const minFullRotations = 5;
          const extraRotations = Math.floor(Math.random() * 3); // 0-2
          const spinDegrees =
            (minFullRotations + extraRotations) * 360 + rotationToPointer;

          this.wheelRotation += spinDegrees;

          // Remember which segment should glow once the spin completes
          const resolvedSegmentIndex = targetSegmentIndex;

          // Wait for spin animation to complete
          setTimeout(() => {
            this.isWheelSpinning = false;
            this.luckyWheelLoading = false;
            this.showWheelResult = true;
            this.winningSegmentIndex = resolvedSegmentIndex;

            // Update balance with payout
            if (response.payout > 0) {
              this.userStatistics.experience =
                (this.userStatistics.experience || 0) + response.payout;
            }

            this.luckyWheelMessage = response.message;
            this.addLuckyWheelSpinToLog(
              response.multiplier,
              response.payout,
              bet,
              response.message,
            );

            this.showWheelResult = false;
            this.luckyWheelMessage = '';
            this.winningSegmentIndex = null;

            // Check for auto-spin
            this.checkForAutoWheelSpin();
          }, 4000); // 4 second spin animation
        },
        error: (error) => {
          this.isWheelSpinning = false;
          this.luckyWheelLoading = false;

          // Refund the bet on error
          this.userStatistics.experience =
            (this.userStatistics.experience || 0) + bet;

          this.luckyWheelError =
            error?.error?.error || 'Fehler beim Drehen des Glücksrads';

          setTimeout(() => {
            this.luckyWheelError = '';
          }, 3000);
        },
      });
  }

  getTotalSegments(): number {
    if (!this.luckyWheelInfo) return 1;
    return this.luckyWheelInfo.payoutTable.reduce(
      (sum, entry) => sum + entry.weight,
      0,
    );
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
    const sortedTable = [...this.luckyWheelInfo.payoutTable].sort(
      (a, b) => a.multiplier - b.multiplier,
    );

    this.luckyWheelInfo.payoutTable.forEach((entry) => {
      const sortedIndex = sortedTable.findIndex(
        (e) => e.multiplier === entry.multiplier,
      );
      const color = this.getColorFromPaletteIndex(
        sortedIndex,
        sortedTable.length,
      );
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

    const paletteIndex = Math.floor(
      (index / (total - 1)) * (palette.length - 1),
    );
    return palette[paletteIndex];
  }

  getMultiplierColor(multiplier: number): string {
    if (!this.luckyWheelInfo) return '#3b82f6';

    const sortedTable = [...this.luckyWheelInfo.payoutTable].sort(
      (a, b) => a.multiplier - b.multiplier,
    );
    const sortedIndex = sortedTable.findIndex(
      (e) => e.multiplier === multiplier,
    );

    return this.getColorFromPaletteIndex(sortedIndex, sortedTable.length);
  }
}
