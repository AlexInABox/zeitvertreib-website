import { Component, inject, OnDestroy } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { AvatarModule } from 'primeng/avatar';
import { CommonModule, NgForOf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

interface PlayerEntry {
  displayname?: string;
  avatarmedium?: string;
}

interface Statistics {
  username?: string;
  kills?: number;
  deaths?: number;
  experience?: number;
  playtime?: number;
  avatarFull?: string;
  roundsplayed?: number;
  leaderboardposition?: number | null;
  usedmedkits?: number;
  usedcolas?: number;
  pocketescapes?: number;
  usedadrenaline?: number;
  snakehighscore?: number;
  fakerankallowed?: boolean;
  lastkillers?: PlayerEntry[];
  lastkills?: PlayerEntry[];
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

@Component({
  selector: 'app-dashboard',
  imports: [
    ButtonModule,
    CardModule,
    ChartModule,
    AvatarModule,
    CommonModule,
    FormsModule,
    RouterLink,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnDestroy {
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
  showSprayHelp = false;
  showPrivacyDetails = false;
  showRulesDetails = false;
  isDragOver = false;
  uploadLimits: UploadLimits | null = null;
  sprayBanStatus: SprayBanStatus | null = null;

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

  constructor(private authService: AuthService) {
    this.generateRandomColors();
    this.loadUserStats();
    this.loadCurrentSpray();
    this.loadUploadLimits();
    this.loadSprayBanStatus();
    this.loadFakerank();

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
      root.style.setProperty('--random-color-1', this.randomColors[0]);
      root.style.setProperty('--random-color-2', this.randomColors[1]);
      root.style.setProperty('--random-color-3', this.randomColors[2]);
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
            // Update fakerankAllowed from stats as well
            this.fakerankAllowed = response.stats.fakerankallowed || false;
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
      .authenticatedGet<UploadLimits>(`${environment.apiUrl}/spray/upload-limits`)
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
            message: 'Maximale Bildgröße: 5MB'
          };
        },
      });
  }

  // Load spray ban status for current user
  private loadSprayBanStatus(): void {
    this.authService
      .authenticatedGet<SprayBanStatus>(`${environment.apiUrl}/spray/ban-status`)
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

  // Öffentliche Methode zum Aktualisieren der Statistiken (kann vom Template aufgerufen werden)
  refreshStats(): void {
    this.generateRandomColors();
    this.loadUserStats();
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
        this.sprayUploadError = 'Bitte wähle eine Bilddatei aus (PNG, JPG, WEBP - keine GIFs)';
        target.value = ''; // Clear the input
        return;
      }

      // Check if file type is supported
      if (this.uploadLimits?.supportedFormats &&
        !this.uploadLimits.supportedFormats.includes(file.type)) {
        this.sprayUploadError = 'Dateiformate unterstützt: PNG, JPG, WEBP';
        target.value = ''; // Clear the input
        return;
      }

      this.selectedFile = file;
      this.sprayUploadError = '';
      this.sprayUploadSuccess = false;
      this.sprayDeleteSuccess = false;
    }
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
      if (file.type.startsWith('image/') && file.type !== 'image/gif') {
        // Check if file type is supported
        if (this.uploadLimits?.supportedFormats &&
          !this.uploadLimits.supportedFormats.includes(file.type)) {
          this.sprayUploadError = 'Dateiformate unterstützt: PNG, JPG, WEBP';
          return;
        }
        this.selectedFile = file;
        this.sprayUploadError = '';
        this.sprayUploadSuccess = false;
        this.sprayDeleteSuccess = false;
      } else {
        this.sprayUploadError = 'Bitte wähle eine Bilddatei aus (PNG, JPG, WEBP - keine GIFs)';
      }
    }
  }

  uploadSpray(): void {
    if (!this.selectedFile) {
      this.sprayUploadError = 'Bitte wähle eine Datei aus';
      return;
    }

    // Validate file type - only images, no GIFs
    if (!this.selectedFile.type.startsWith('image/') || this.selectedFile.type === 'image/gif') {
      this.sprayUploadError = 'Bitte wähle eine Bilddatei aus (PNG, JPG, WEBP - keine GIFs)';
      return;
    }

    // Validate supported formats
    if (this.uploadLimits?.supportedFormats &&
      !this.uploadLimits.supportedFormats.includes(this.selectedFile.type)) {
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

    // Process the image (no more GIF processing since GIFs are not supported)
    this.processImageForUpload(this.selectedFile)
      .then((processedData) => {
        if (!this.selectedFile) {
          throw new Error('Keine Datei ausgewählt');
        }

        const formData = new FormData();
        formData.append('smallImage', processedData.smallImage); // Thumbnail for storage
        formData.append('originalImage', this.selectedFile); // Original file for moderation
        formData.append('isGif', 'false'); // No more GIF support

        // Only handle regular image data
        if ('pixelData' in processedData) {
          formData.append('pixelData', processedData.pixelData); // Single string for images
        }

        return this.authService
          .authenticatedPost(`${environment.apiUrl}/spray/upload`, formData)
          .toPromise();
      })
      .then((response: any) => {
        this.sprayUploadLoading = false;
        this.sprayUploadSuccess = true;
        this.sprayUploadError = '';
        this.selectedFile = null;

        // Reset file input
        const fileInput = document.getElementById(
          'sprayFileInput',
        ) as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        // Reload spray image
        this.loadCurrentSpray();
      })
      .catch((error) => {
        console.error('Spray upload error:', error);
        this.sprayUploadLoading = false;
        this.sprayUploadError =
          error.error?.error ||
          error.message ||
          'Fehler beim Hochladen des Sprays';
        this.sprayUploadSuccess = false;
      });
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
        next: (response: any) => {
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

  ngOnDestroy(): void {
    // Clean up object URLs to prevent memory leaks
    if (this.currentSprayImage) {
      URL.revokeObjectURL(this.currentSprayImage);
    }

    // Clean up event listener
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
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
  private calculateAspectRatioFit(
    srcWidth: number,
    srcHeight: number,
    maxWidth: number,
    maxHeight: number,
  ): { width: number; height: number } {
    const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
    return {
      width: Math.floor(srcWidth * ratio),
      height: Math.floor(srcHeight * ratio),
    };
  }

  // Fakerank methods
  loadFakerank(): void {
    this.authService
      .authenticatedGet<{
        fakerank: string | null;
        fakerank_color: string;
        fakerankallowed: boolean;
      }>(`${environment.apiUrl}/fakerank`)
      .subscribe({
        next: (response) => {
          this.currentFakerank = response?.fakerank || null;
          this.currentFakerankColor = response?.fakerank_color || 'default';
          this.fakerankValue = this.currentFakerank || '';
          this.fakerankAllowed = response?.fakerankallowed || false;
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
    if (this.fakerankValue.includes('(') || this.fakerankValue.includes(')') || this.fakerankValue.includes(',')) {
      this.fakerankError = 'Fakerank darf keine Klammern () oder Kommas enthalten';
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
        fakerank: string;
        fakerank_color: string;
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
}
