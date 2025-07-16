import { Component, inject, OnDestroy } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { environment } from '../../environments/environment';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { AvatarModule } from 'primeng/avatar';
import { CommonModule, NgForOf } from '@angular/common';
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
  lastkillers?: PlayerEntry[];
  lastkills?: PlayerEntry[];
}

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule, ChartModule, AvatarModule, CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnDestroy {
  userStatistics: Statistics = {
    username: "LÄDT...",
    kills: 0,
    deaths: 0,
    experience: 0,
    playtime: 0,
    avatarFull: "",
    roundsplayed: 0,
    leaderboardposition: null,
    usedmedkits: 0,
    usedcolas: 0,
    pocketescapes: 0,
    usedadrenaline: 0,
    lastkillers: [],
    lastkills: []
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

  constructor(private authService: AuthService) {
    this.generateRandomColors();
    this.loadUserStats();
    this.loadCurrentSpray();
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
      : "NICHT GENÜGEND DATEN";
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
    this.randomColors = [
      this.getRandomColor(),
      this.getRandomColor(),
      this.getRandomColor()
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
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
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

    this.authService.authenticatedGet<{ stats: Statistics }>(`${environment.apiUrl}/stats`)
      .subscribe({
        next: response => {
          if (response?.stats) {
            this.userStatistics = {
              ...this.userStatistics, // Keep defaults for missing properties
              ...response.stats
            };
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Fehler beim Laden der Benutzerstatistiken:', error);
          this.hasError = true;
          this.errorMessage = 'Statistiken konnten nicht geladen werden';
          this.isLoading = false;
        }
      });
  }

  // Load the current spray image
  private loadCurrentSpray(): void {
    // Add cache-busting parameter to avoid browser caching issues
    const timestamp = new Date().getTime();
    this.authService.authenticatedGetBlob(`${environment.apiUrl}/spray/image?t=${timestamp}`)
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
        }
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
      this.selectedFile = target.files[0];
      this.sprayUploadError = '';
      this.sprayUploadSuccess = false;
      this.sprayDeleteSuccess = false;
    }
  }

  uploadSpray(): void {
    if (!this.selectedFile) {
      this.sprayUploadError = 'Bitte wähle eine Datei aus';
      return;
    }

    // Validate file type
    if (!this.selectedFile.type.startsWith('image/')) {
      this.sprayUploadError = 'Bitte wähle eine Bilddatei aus';
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (this.selectedFile.size > maxSize) {
      this.sprayUploadError = 'Datei ist zu groß. Maximum sind 10MB';
      return;
    }

    this.sprayUploadLoading = true;
    this.sprayUploadError = '';
    this.sprayDeleteSuccess = false;

    // Process the image to create 400x400 and 50x50 versions plus pixel data
    this.processImageForUpload(this.selectedFile)
      .then(({ largeImage, smallImage, pixelData }) => {
        const formData = new FormData();
        formData.append('largeImage', largeImage); // 400x400 for fallback
        formData.append('smallImage', smallImage); // 50x50 for storage
        formData.append('pixelData', pixelData); // Pre-computed pixel art string

        return this.authService.authenticatedPost(`${environment.apiUrl}/spray/upload`, formData).toPromise();
      })
      .then((response: any) => {
        this.sprayUploadLoading = false;
        this.sprayUploadSuccess = true;
        this.sprayUploadError = '';
        this.selectedFile = null;

        // Reset file input
        const fileInput = document.getElementById('sprayFileInput') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        // Reload spray image
        this.loadCurrentSpray();
      })
      .catch((error) => {
        console.error('Spray upload error:', error);
        this.sprayUploadLoading = false;
        this.sprayUploadError = error.error?.error || error.message || 'Fehler beim Hochladen des Sprays';
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

    this.authService.authenticatedDelete(`${environment.apiUrl}/spray/delete`)
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
          const fileInput = document.getElementById('sprayFileInputMini') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        },
        error: (error: any) => {
          console.error('Spray deletion error:', error);
          this.sprayUploadLoading = false;
          this.sprayUploadError = error.error?.error || 'Fehler beim Löschen des Sprays';
          this.sprayUploadSuccess = false;
          this.sprayDeleteSuccess = false;
        }
      });
  }

  get hasSpray(): boolean {
    return !!this.currentSprayImage;
  }

  get selectedFileName(): string {
    return this.selectedFile?.name || '';
  }

  ngOnDestroy(): void {
    // Clean up object URLs to prevent memory leaks
    if (this.currentSprayImage) {
      URL.revokeObjectURL(this.currentSprayImage);
    }
  }

  // Process image to create 400x400 and 50x50 versions plus pixel data
  private async processImageForUpload(file: File): Promise<{ largeImage: Blob; smallImage: Blob; pixelData: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          // Create 400x400 version (keeping aspect ratio)
          const largeCanvas = document.createElement('canvas');
          const largeCtx = largeCanvas.getContext('2d');
          if (!largeCtx) throw new Error('Could not get 2D context for large canvas');

          // Calculate size keeping aspect ratio for 400x400 max
          let { width: largeWidth, height: largeHeight } = this.calculateAspectRatioFit(img.width, img.height, 400, 400);
          largeCanvas.width = largeWidth;
          largeCanvas.height = largeHeight;
          largeCtx.drawImage(img, 0, 0, largeWidth, largeHeight);

          // Create 50x50 version (ignoring aspect ratio)
          const smallCanvas = document.createElement('canvas');
          const smallCtx = smallCanvas.getContext('2d');
          if (!smallCtx) throw new Error('Could not get 2D context for small canvas');

          smallCanvas.width = 50;
          smallCanvas.height = 50;
          smallCtx.drawImage(img, 0, 0, 50, 50);

          // Extract pixel data from small canvas to create pixel art string
          const pixelData = this.createPixelArtFromCanvas(smallCtx, 50, 50);

          // Convert canvases to blobs
          largeCanvas.toBlob((largeBlob) => {
            if (!largeBlob) {
              reject(new Error('Failed to create large image blob'));
              return;
            }

            smallCanvas.toBlob((smallBlob) => {
              if (!smallBlob) {
                reject(new Error('Failed to create small image blob'));
                return;
              }

              resolve({ largeImage: largeBlob, smallImage: smallBlob, pixelData });
            }, 'image/jpeg', 0.8);
          }, 'image/jpeg', 0.9);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  // Create pixel art string from canvas data (like the C# version)
  private createPixelArtFromCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): string {
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

        // Handle transparency like the C# code (alpha < 25 becomes space)
        if (alpha < 25) {
          if (consecutiveCount > 0 && currentColor) {
            line += `<color=${currentColor}>${'█'.repeat(consecutiveCount)}</color>`;
            consecutiveCount = 0;
          }
          line += ' ';
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

  // Calculate dimensions that fit within max width/height while keeping aspect ratio
  private calculateAspectRatioFit(srcWidth: number, srcHeight: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
    const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
    return {
      width: Math.floor(srcWidth * ratio),
      height: Math.floor(srcHeight * ratio)
    };
  }
}