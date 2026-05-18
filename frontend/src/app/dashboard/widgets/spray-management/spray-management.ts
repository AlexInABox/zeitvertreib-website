import { Component, OnInit, OnDestroy, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../services/auth.service';
import type {
  SprayGetResponseItem,
  SprayPostRequest,
  SprayDeleteRequest,
  SprayRulesGetResponse,
} from '@zeitvertreib/types';

interface SpraySlot {
  id: number | null;
  name: string;
  imageUrl: string | null;
  isUploading: boolean;
  selectedFile: File | null;
  preview: string | null;
}

@Component({
  selector: 'app-spray-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './spray-management.html',
  styleUrls: ['./spray-management.css'],
})
export class SprayManagementComponent implements OnInit, OnDestroy {
  @Input() isDonator = false;

  spraySlots: SpraySlot[] = [
    { id: null, name: '', imageUrl: null, isUploading: false, selectedFile: null, preview: null },
    { id: null, name: '', imageUrl: null, isUploading: false, selectedFile: null, preview: null },
    { id: null, name: '', imageUrl: null, isUploading: false, selectedFile: null, preview: null },
  ];

  sprayError = '';
  spraySuccess = '';
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

  private http = inject(HttpClient);
  private authService = inject(AuthService);

  ngOnInit(): void {
    this.isSprayBanned = this.authService.isSprayBanned();
    this.sprayBanReason = this.authService.getSprayBanReason();
    this.sprayBannedBy = this.authService.getSprayBannedBy();

    this.loadSprays();
    this.loadSprayRules();
  }

  loadSprays(): void {
    this.authService
      .authenticatedGet<{
        sprays: Array<{ id: number; name: string; full_res: string }>;
      }>(`${environment.apiUrl}/spray?full_res=true`)
      .subscribe({
        next: (response) => {
          const sprays = response.sprays || [];
          const sprayData = sprays.slice(0, 3);

          this.spraySlots.forEach((slot) => {
            if (slot.imageUrl && slot.imageUrl.startsWith('blob:')) {
              URL.revokeObjectURL(slot.imageUrl);
            }
            slot.id = null;
            slot.name = '';
            slot.imageUrl = null;
            slot.isUploading = false;
            slot.selectedFile = null;
            slot.preview = null;
          });

          sprayData.forEach((spray, dbIndex) => {
            let visualIndex = dbIndex;
            if (this.isDonator || this.authService.isVip() || this.authService.isBooster()) {
              if (sprayData.length === 2 && dbIndex === 1) {
                visualIndex = 2;
              } else if (sprayData.length === 3) {
                if (dbIndex === 1) visualIndex = 2;
                else if (dbIndex === 2) visualIndex = 1;
              }
            }
            if (visualIndex < 3 && spray.id) {
              this.spraySlots[visualIndex].id = spray.id;
              this.spraySlots[visualIndex].name = spray.name;
              this.spraySlots[visualIndex].imageUrl = spray.full_res;
            }
          });
        },
        error: (error) => {
          if (error.status !== 404) console.error('Error loading sprays:', error);
        },
      });
  }

  loadSprayRules(): void {
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

  onSprayFileSelected(event: Event, slotIndex: number): void {
    const target = event.target as HTMLInputElement;
    if (!target?.files?.[0]) return;

    const file = target.files[0];
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
      this.sprayError = 'Nur Bilddateien erlaubt (PNG, JPG, WEBP - keine GIFs)';
      target.value = '';
      return;
    }

    const slot = this.spraySlots[slotIndex];
    if (!slot) return;

    if (slot.preview) URL.revokeObjectURL(slot.preview);

    slot.selectedFile = file;
    slot.preview = URL.createObjectURL(file);
    slot.name = file.name.replace(/\.[^/.]+$/, '');
    this.sprayError = '';
    this.spraySuccess = '';

    this.extractProminentColor(file);
    this.openPreviewModal(slotIndex);
  }

  private extractProminentColor(file: File): void {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = 40;
      canvas.height = 40;
      ctx.drawImage(img, 0, 0, 40, 40);

      const imageData = ctx.getImageData(0, 0, 40, 40).data;
      let maxSat = -1;
      let bestColor = [59, 130, 246];

      for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i]!,
          g = imageData[i + 1]!,
          b = imageData[i + 2]!,
          a = imageData[i + 3]!;
        if (a > 200) {
          const max = Math.max(r, g, b),
            min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
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
    document.body.classList.add('modal-open');
  }

  closePreviewModal(cancel = false): void {
    if (cancel && this.previewModalSlotIndex !== null) {
      this.cancelSpraySelection(this.previewModalSlotIndex);
    }
    this.previewModalOpen = false;
    this.previewModalSlotIndex = null;
    this.previewModalUrl = null;
    this.previewModalName = '';
    document.body.classList.remove('modal-open');
  }

  isNameValid(name: string): boolean {
    if (!name) return false;
    return name.length > 0 && name.length <= 20 && /^[a-zA-Z0-9_ ]+$/.test(name);
  }

  async confirmUploadFromModal(): Promise<void> {
    if (this.previewModalSlotIndex === null) return;
    const slot = this.spraySlots[this.previewModalSlotIndex];
    if (!slot) return;
    slot.name = this.previewModalName || slot.name;
    this.previewModalOpen = false;
    this.previewModalUploading = true;
    await this.uploadSprayForSlot(this.previewModalSlotIndex);
    this.previewModalUploading = false;
    document.body.classList.remove('modal-open');
  }

  async uploadSprayForSlot(slotIndex: number): Promise<void> {
    const slot = this.spraySlots[slotIndex];
    if (!slot || !slot.selectedFile) return;

    if (slot.selectedFile.size > 10 * 1024 * 1024) {
      this.sprayError = 'Datei ist zu groß. Maximum sind 10MB';
      return;
    }

    slot.isUploading = true;
    this.sprayError = '';
    this.spraySuccess = '';

    try {
      const { pixelData, base64Data } = await this.processImageForSpray(slot.selectedFile);
      const requestBody: SprayPostRequest = {
        name: slot.name || 'Unnamed Spray',
        full_res: base64Data,
        text_toy: pixelData,
      };

      await this.authService
        .authenticatedPost<{ success: boolean; id: number }>(`${environment.apiUrl}/spray`, requestBody)
        .toPromise();

      if (slot.preview) URL.revokeObjectURL(slot.preview);
      slot.selectedFile = null;
      slot.preview = null;
      slot.isUploading = false;
      this.spraySuccess = 'Spray erfolgreich hochgeladen!';
      this.loadSprays();
    } catch (error: any) {
      console.error('Spray upload error:', error);
      slot.isUploading = false;
      this.sprayError = error?.error?.error || error?.message || 'Fehler beim Hochladen';
      if (slot.preview) URL.revokeObjectURL(slot.preview);
      slot.selectedFile = null;
      slot.preview = null;
    }
  }

  async deleteSprayForSlot(slotIndex: number): Promise<void> {
    const slot = this.spraySlots[slotIndex];
    if (!slot || !slot.id) return;

    slot.isUploading = true;
    try {
      await this.authService
        .authenticatedDelete<{ success: boolean }>(`${environment.apiUrl}/spray`, { id: slot.id })
        .toPromise();
      slot.isUploading = false;
      this.spraySuccess = 'Spray erfolgreich gelöscht!';
      this.loadSprays();
    } catch (error: any) {
      slot.isUploading = false;
      this.sprayError = error?.error?.error || 'Fehler beim Löschen';
    }
  }

  cancelSpraySelection(slotIndex: number): void {
    const slot = this.spraySlots[slotIndex];
    if (!slot) return;
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    slot.selectedFile = null;
    slot.preview = null;
  }

  private async processImageForSpray(file: File): Promise<{ pixelData: string; base64Data: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const compressedCanvas = document.createElement('canvas');
          const compressedCtx = compressedCanvas.getContext('2d')!;
          compressedCanvas.width = img.width;
          compressedCanvas.height = img.height;
          compressedCtx.drawImage(img, 0, 0);

          let quality = 0.8,
            base64Data = '',
            compressed = false;
          while (quality >= 0.1 && !compressed) {
            base64Data = await new Promise<string>((res) => {
              compressedCanvas.toBlob(
                (blob) => {
                  if (blob && blob.size < 50 * 1024) compressed = true;
                  const reader = new FileReader();
                  reader.onload = () => res(reader.result as string);
                  reader.readAsDataURL(blob!);
                },
                'image/webp',
                quality,
              );
            });
            quality -= 0.1;
          }

          const pixelArtQuality = 100;
          const pixelCanvas = document.createElement('canvas');
          const pixelCtx = pixelCanvas.getContext('2d')!;
          pixelCanvas.width = pixelArtQuality;
          pixelCanvas.height = pixelArtQuality;

          const longestSide = Math.max(img.width, img.height);
          const scale = pixelArtQuality / longestSide;
          const pw = Math.floor(img.width * scale),
            ph = Math.floor(img.height * scale);
          const px = (pixelArtQuality - pw) / 2,
            py = (pixelArtQuality - ph) / 2;

          pixelCtx.clearRect(0, 0, pixelArtQuality, pixelArtQuality);
          pixelCtx.drawImage(img, px, py, pw, ph);

          const imageData = pixelCtx.getImageData(0, 0, pixelArtQuality, pixelArtQuality);
          const data = imageData.data;
          let pixelData = '';

          for (let y = 0; y < pixelArtQuality; y++) {
            let line = '',
              currentColor = '',
              consecutive = 0;
            for (let x = 0; x < pixelArtQuality; x++) {
              const i = (y * pixelArtQuality + x) * 4;
              const r = data[i]!,
                g = data[i + 1]!,
                b = data[i + 2]!,
                a = data[i + 3]!;

              if (a < 25) {
                if (consecutive > 0) line += `<color=${currentColor}>${'█'.repeat(consecutive)}</color>`;
                line += '<color=#00000000>█</color>';
                currentColor = '';
                consecutive = 0;
                continue;
              }

              const col = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
              if (col === currentColor) consecutive++;
              else {
                if (consecutive > 0) line += `<color=${currentColor}>${'█'.repeat(consecutive)}</color>`;
                currentColor = col;
                consecutive = 1;
              }
            }
            if (consecutive > 0) line += `<color=${currentColor}>${'█'.repeat(consecutive)}</color>`;
            pixelData += line + '\n';
          }
          resolve({ pixelData, base64Data });
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  shouldShowSpraySlot(i: number): boolean {
    const slot = this.spraySlots[i];
    return !!(slot && slot.id && !slot.selectedFile && (i === 0 || i === 1 || (i === 2 && this.isDonator)));
  }

  canUploadToSlot(i: number): boolean {
    return i === 0 || i === 1 || (i === 2 && this.isDonator);
  }

  isSlotPaidButAvailable(i: number): boolean {
    return (i === 1 && !this.isDonator) || (i === 2 && this.isDonator);
  }

  ngOnDestroy(): void {
    this.spraySlots.forEach((s) => {
      if (s.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(s.imageUrl);
      if (s.preview) URL.revokeObjectURL(s.preview);
    });
    document.body.classList.remove('modal-open');
  }
}
