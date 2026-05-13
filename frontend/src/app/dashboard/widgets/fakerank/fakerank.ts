import { Component, OnInit, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../services/auth.service';
import { NotificationCenterService } from '../../../services/notification-center.service';
import type {
  FakerankGetResponse,
  FakerankPostRequest,
  FakerankDeleteRequest,
  FakerankColor,
  FakerankColorsResponse,
} from '@zeitvertreib/types';

@Component({
  selector: 'app-fakerank',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fakerank.html',
  styleUrls: ['./fakerank.css'],
})
export class FakerankComponent implements OnInit {
  @Input() isDonator = false;

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

  fakerankColorsByRole: any = { teamColors: [], vipColors: [], donatorColors: [], boosterColors: [], otherColors: [] };
  allowedFakerankColors: FakerankColor[] = [];

  isFakerankBanned = false;
  fakerankBanReason: string | null = null;
  fakerankBannedBy: string | null = null;

  fakerankColors: any[] = [
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

  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private notificationCenter = inject(NotificationCenterService);

  ngOnInit(): void {
    this.isFakerankBanned = this.authService.isFakerankBanned();
    this.fakerankBanReason = this.authService.getFakerankBanReason();
    this.fakerankBannedBy = this.authService.getFakerankBannedBy();

    this.loadFakerank();
    this.loadFakerankColorsByRole();
  }

  loadFakerank(): void {
    this.authService.authenticatedGet<FakerankGetResponse>(`${environment.apiUrl}/fakerank`).subscribe({
      next: (res) => {
        const fr = res?.fakeranks?.[0];
        if (fr) {
          this.currentFakerankId = fr.id;
          this.currentFakerank = fr.text;
          this.currentFakerankColor = fr.color;
        } else {
          this.currentFakerankId = null;
          this.currentFakerank = null;
          this.currentFakerankColor = 'default';
        }
      },
      error: () => (this.fakerankError = 'Fehler beim Laden'),
    });
  }

  private loadFakerankColorsByRole(): void {
    this.authService.authenticatedGet<FakerankColorsResponse>(`${environment.apiUrl}/fakerank/colors`).subscribe({
      next: (res) => {
        this.fakerankColorsByRole = res;
        this.updateAllowedColors();
      },
      error: () => (this.allowedFakerankColors = []),
    });
  }

  private updateAllowedColors(): void {
    const roles = {
      team: this.authService.isTeam(),
      vip: this.authService.isVip(),
      donator: this.authService.isDonator(),
      booster: this.authService.isBooster(),
    };
    let allowed: FakerankColor[] = [...this.fakerankColorsByRole.otherColors];
    if (roles.booster) allowed = [...this.fakerankColorsByRole.boosterColors, ...allowed];
    if (roles.donator) allowed = [...this.fakerankColorsByRole.donatorColors, ...allowed];
    if (roles.vip) allowed = [...this.fakerankColorsByRole.vipColors, ...allowed];
    if (roles.team) allowed = [...this.fakerankColorsByRole.teamColors, ...allowed];
    this.allowedFakerankColors = [...new Set(allowed)];
  }

  get groupedColors(): { groupName: string; requiredRole: string; colors: any[]; isLocked: boolean }[] {
    const groups: { groupName: string; requiredRole: string; colors: any[]; isLocked: boolean }[] = [];

    const addGroup = (keys: string[], name: string, req: string) => {
      if (!keys || keys.length === 0) return;
      const colors = this.fakerankColors.filter((c) => keys.includes(c.key));
      if (colors.length > 0) {
        const isLocked = !this.isColorAllowed(colors[0].key);
        groups.push({ groupName: name, requiredRole: req, colors, isLocked });
      }
    };

    addGroup(this.fakerankColorsByRole.teamColors, 'Team', 'Team');
    addGroup(this.fakerankColorsByRole.vipColors, 'VIP', 'VIP');
    addGroup(this.fakerankColorsByRole.donatorColors, 'Donator', 'Donator');
    addGroup(this.fakerankColorsByRole.boosterColors, 'Booster', 'Server Booster');
    addGroup(this.fakerankColorsByRole.otherColors, 'Standard', '');

    // Add unassigned colors to Standard fallback
    const assignedKeys = groups.reduce((acc, g) => [...acc, ...g.colors.map((c) => c.key)], [] as string[]);
    const unassigned = this.fakerankColors.filter((c) => !assignedKeys.includes(c.key));
    if (unassigned.length > 0) {
      const stdGroup = groups.find((g) => g.groupName === 'Standard');
      if (stdGroup) {
        stdGroup.colors.push(...unassigned);
        stdGroup.isLocked = stdGroup.colors.some((c) => !this.isColorAllowed(c.key));
      } else {
        const isLocked = unassigned.some((c) => !this.isColorAllowed(c.key));
        groups.push({ groupName: 'Standard', requiredRole: '', colors: unassigned, isLocked });
      }
    }

    return groups;
  }

  isColorAllowed(key: FakerankColor): boolean {
    return this.allowedFakerankColors.includes(key);
  }

  openFakerankModal(): void {
    this.fakerankModalText = this.currentFakerank || '';
    this.fakerankModalColor = this.currentFakerankColor;
    this.fakerankModalOpen = true;
    this.acceptedFakerankPrivacy = this.acceptedFakerankRules = false;
    document.body.classList.add('modal-open');
  }

  closeFakerankModal(): void {
    this.fakerankModalOpen = false;
    document.body.classList.remove('modal-open');
  }

  selectColor(key: FakerankColor): void {
    if (this.isColorAllowed(key)) this.fakerankModalColor = key;
  }

  async saveFakerank(): Promise<void> {
    const text = this.fakerankModalText.trim();
    if (!text || text.length > 50 || !this.acceptedFakerankPrivacy || !this.acceptedFakerankRules) {
      this.fakerankError = 'Bitte überprüfe deine Eingaben';
      return;
    }

    this.fakerankLoading = true;
    try {
      await this.authService
        .authenticatedPost(`${environment.apiUrl}/fakerank`, { text, color: this.fakerankModalColor })
        .toPromise();
      this.fakerankSuccess = 'Erfolgreich gespeichert!';
      this.fakerankLoading = false;
      this.closeFakerankModal();
      this.loadFakerank();
      this.notificationCenter.refreshAfterAction();
      setTimeout(() => (this.fakerankSuccess = ''), 3000);
    } catch (e: any) {
      this.fakerankLoading = false;
      this.fakerankError = e?.error?.error || 'Fehler beim Speichern';
    }
  }

  async deleteFakerank(): Promise<void> {
    if (!this.currentFakerankId) return;
    this.fakerankLoading = true;
    try {
      await this.http
        .delete(`${environment.apiUrl}/fakerank`, { body: { id: this.currentFakerankId }, withCredentials: true })
        .toPromise();
      this.fakerankLoading = false;
      this.fakerankSuccess = 'Erfolgreich gelöscht!';
      this.loadFakerank();
      setTimeout(() => (this.fakerankSuccess = ''), 3000);
    } catch (e: any) {
      this.fakerankLoading = false;
      this.fakerankError = e?.error?.error || 'Fehler beim Löschen';
    }
  }

  getColorHex(key: string): string {
    return this.fakerankColors.find((c) => c.key === key)?.hex || '#FFFFFF';
  }
  getColorName(key: string): string {
    return this.fakerankColors.find((c) => c.key === key)?.name || 'Weiß';
  }
}
