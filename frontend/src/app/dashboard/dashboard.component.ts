import { Component, OnInit, OnDestroy, inject, ElementRef, effect } from '@angular/core';
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
import { ThemeService } from '../services/theme.service';
import { EasterEggService } from '../services/easter-egg.service';
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

  // volume for sound effects
  audioVolume = 0.5; // 0.0 - 1.0

  // Mock data for owned cosmetics - in production this would come from backend
  ownedCosmetics = {
    hats: ['cap'] as string[], // User owns a baseball cap
    pets: [] as string[], // No pets owned
    auras: ['blue'] as string[], // User owns blue aura
  };

  private http = inject(HttpClient);
  private audioService = inject(AudioService);
  private elementRef = inject(ElementRef);
  private themeService = inject(ThemeService);
  private easterEggService = inject(EasterEggService);

  constructor(public authService: AuthService) {
    this.generateRandomColors();
    this.loadUserStats();
    this.loadFakerank();
    this.loadSprayRules();

    // Close color picker when clicking outside
    this.documentClickHandler = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.color-picker-container')) {
        this.showColorPicker = false;
      }
    };
    document.addEventListener('click', this.documentClickHandler);
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

    // Clean up event listener
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
    }
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
    // Easter egg trigger - kept for backward compatibility
    // Actual ZVC redemption is now handled by zvc-overlay component
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.easterEggService.triggerChiikawa();
    }
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
}
