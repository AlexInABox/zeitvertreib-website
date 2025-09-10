import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, UserData } from '../services/auth.service';
import {
  FakerankAdminService,
  UserFakerank,
  Player,
  BlacklistItem,
  WhitelistItem,
} from '../services/fakerank-admin.service';
import { Subscription, finalize } from 'rxjs';

interface Tab {
  title: string;
  icon: string;
  id: string;
}

interface ConfirmationDialog {
  show: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

interface ToastMessage {
  id: number;
  severity: 'success' | 'error' | 'warn' | 'info';
  summary: string;
  detail: string;
}

interface LoadingStates {
  user: boolean;
  blacklist: boolean;
  whitelist: boolean;
  fakeranks: boolean;
}

interface FakerankColor {
  key: string;
  name: string;
  hex: string;
}

@Component({
  selector: 'app-fakerank-admin',
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './fakerank-admin.component.html',
  styleUrl: './fakerank-admin.component.css',
})
export class FakerankAdminComponent implements OnInit, OnDestroy {
  // Signals for reactive state management
  userData = signal<UserData | null>(null);
  activeTabIndex = signal(0);
  searchedUser = signal<UserFakerank | null>(null);

  // Loading states
  loading = signal<LoadingStates>({
    user: false,
    blacklist: false,
    whitelist: false,
    fakeranks: false,
  });

  // Form data
  searchSteamId = signal('');
  newFakerank = signal('');
  newBlacklistWord = signal('');
  newWhitelistWord = signal('');
  tempFakerankColor = signal('default');

  // Data collections
  blacklistItems = signal<BlacklistItem[]>([]);
  whitelistItems = signal<WhitelistItem[]>([]);
  allFakeranks = signal<Player[]>([]);

  // Statistics
  stats = signal({
    currentPlayersOnline: 0,
    uniquePlayerNames: 0,
    total: 0,
  });

  // Pagination
  pagination = signal({
    limit: 20,
    offset: 0,
    total: 0,
  });

  // UI state
  showColorPicker = signal(false);
  toastMessages = signal<ToastMessage[]>([]);
  confirmationDialog = signal<ConfirmationDialog>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });

  // Computed properties
  isAuthenticated = computed(() => !!this.userData()?.user);
  isFakerankAdmin = computed(() => {
    const adminFlag = this.userData()?.playerData?.fakerankadmin;
    return adminFlag === true || adminFlag === 1;
  });
  hasSearchedUser = computed(() => !!this.searchedUser());
  currentPage = computed(
    () => Math.floor(this.pagination().offset / this.pagination().limit) + 1,
  );
  totalPages = computed(() =>
    Math.ceil(this.pagination().total / this.pagination().limit),
  );

  // Constants
  readonly FAKERANK_COLORS: FakerankColor[] = [
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

  readonly TABS: Tab[] = [
    { title: 'Benutzer verwalten', icon: '👤', id: 'user-management' },
    { title: 'Blacklist', icon: '🚫', id: 'blacklist' },
    { title: 'Whitelist', icon: '✅', id: 'whitelist' },
    { title: 'Aktuelle Runde', icon: '🔴', id: 'all-fakeranks' },
  ];

  private authSubscription?: Subscription;
  private documentClickHandler?: (event: Event) => void;
  private toastIdCounter = 0;

  constructor(
    private authService: AuthService,
    private fakerankAdminService: FakerankAdminService,
    private router: Router,
  ) { }

  ngOnInit() {
    this.setupClickHandlers();
    this.subscribeToAuth();
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.removeClickHandlers();
  }

  private setupClickHandlers() {
    this.documentClickHandler = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.color-picker-container')) {
        this.showColorPicker.set(false);
      }
    };
    document.addEventListener('click', this.documentClickHandler);
  }

  private removeClickHandlers() {
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
    }
  }

  private subscribeToAuth() {
    this.authSubscription = this.authService.currentUserData$.subscribe(
      (userData: UserData | null) => {
        this.userData.set(userData);

        if (!userData?.user) {
          this.router.navigate(['/login']);
          return;
        }

        if (!this.isFakerankAdmin()) {
          this.router.navigate(['/dashboard']);
          return;
        }

        this.loadInitialData();
      },
    );
  }

  private loadInitialData() {
    this.loadBlacklist();
    this.loadWhitelist();
    this.loadAllFakeranks();
  }

  // Toast notification methods
  private showToast(
    severity: 'success' | 'error' | 'warn' | 'info',
    summary: string,
    detail: string,
  ) {
    const toast: ToastMessage = {
      id: ++this.toastIdCounter,
      severity,
      summary,
      detail,
    };

    this.toastMessages.update((messages) => [...messages, toast]);

    setTimeout(() => {
      this.removeToast(toast.id);
    }, 5000);
  }

  removeToast(id: number) {
    this.toastMessages.update((messages) =>
      messages.filter((toast) => toast.id !== id),
    );
  }

  private showConfirmation(
    title: string,
    message: string,
    onConfirm: () => void,
  ) {
    this.confirmationDialog.set({
      show: true,
      title,
      message,
      onConfirm,
    });
  }

  confirmDialogAccept() {
    const dialog = this.confirmationDialog();
    dialog.onConfirm();
    this.confirmationDialog.update((d) => ({ ...d, show: false }));
  }

  confirmDialogReject() {
    this.confirmationDialog.update((d) => ({ ...d, show: false }));
  }

  onTabChange(tabIndex: number) {
    this.activeTabIndex.set(tabIndex);

    // Load data when switching to specific tabs
    switch (tabIndex) {
      case 1: // Blacklist
        if (this.blacklistItems().length === 0) {
          this.loadBlacklist();
        }
        break;
      case 2: // Whitelist
        if (this.whitelistItems().length === 0) {
          this.loadWhitelist();
        }
        break;
      case 3: // All Fakeranks
        if (this.allFakeranks().length === 0) {
          this.loadAllFakeranks();
        }
        break;
    }
  }

  // Helper method to normalize Steam ID input
  private normalizeSteamId(input: string): string {
    const trimmed = input.trim();
    return trimmed.endsWith('@steam') ? trimmed.slice(0, -6) : trimmed;
  }

  // User Management Methods
  searchUser() {
    const steamId = this.searchSteamId();
    if (!steamId.trim()) {
      this.showToast('warn', 'Warnung', 'Bitte gib eine Steam ID ein');
      return;
    }

    const normalizedSteamId = this.normalizeSteamId(steamId);
    this.setLoadingState('user', true);

    this.fakerankAdminService
      .getUserFakerank(normalizedSteamId)
      .pipe(finalize(() => this.setLoadingState('user', false)))
      .subscribe({
        next: (user) => {
          this.searchedUser.set(user);
          this.newFakerank.set(user.fakerank || '');
          this.tempFakerankColor.set(
            this.getColorKeyFromHex(user.fakerank_color) || 'default',
          );
        },
        error: (error) => {
          this.showToast(
            'error',
            'Fehler',
            error.message || 'Benutzer konnte nicht gefunden werden',
          );
          this.searchedUser.set(null);
        },
      });
  }

  setUserFakerank() {
    const user = this.searchedUser();
    const fakerank = this.newFakerank();

    if (!user || !fakerank.trim()) {
      this.showToast('warn', 'Warnung', 'Bitte gib einen Fakerank ein');
      return;
    }

    // Validate fakerank content - ban parentheses and commas
    if (fakerank.includes('(') || fakerank.includes(')') || fakerank.includes(',')) {
      this.showToast('error', 'Fehler', 'Fakerank darf keine Klammern () oder Kommas enthalten');
      return;
    }

    this.setLoadingState('user', true);

    this.fakerankAdminService
      .setUserFakerank(user.steamId, fakerank.trim(), this.tempFakerankColor())
      .pipe(finalize(() => this.setLoadingState('user', false)))
      .subscribe({
        next: () => {
          this.showToast('success', 'Erfolg', 'Fakerank erfolgreich gesetzt');
          this.searchedUser.update((u) =>
            u ? { ...u, fakerank: fakerank.trim() } : u,
          );

          if (this.activeTabIndex() === 3) {
            this.loadAllFakeranks();
          }
        },
        error: (error) => {
          this.showToast(
            'error',
            'Fehler',
            error.message || 'Fakerank konnte nicht gesetzt werden',
          );
        },
      });
  }

  removeUserFakerank() {
    const user = this.searchedUser();
    if (!user) return;

    this.showConfirmation(
      'Fakerank entfernen',
      `Möchtest du den Fakerank von ${user.username} wirklich entfernen?`,
      () => {
        this.setLoadingState('user', true);

        this.fakerankAdminService
          .removeUserFakerank(user.steamId)
          .pipe(finalize(() => this.setLoadingState('user', false)))
          .subscribe({
            next: () => {
              this.showToast(
                'success',
                'Erfolg',
                'Fakerank erfolgreich entfernt',
              );
              this.searchedUser.update((u) =>
                u ? { ...u, fakerank: null } : u,
              );
              this.newFakerank.set('');

              if (this.activeTabIndex() === 3) {
                this.loadAllFakeranks();
              }
            },
            error: (error) => {
              this.showToast(
                'error',
                'Fehler',
                error.message || 'Fakerank konnte nicht entfernt werden',
              );
            },
          });
      },
    );
  }

  // Blacklist Methods
  loadBlacklist() {
    this.setLoadingState('blacklist', true);

    this.fakerankAdminService
      .getBlacklist()
      .pipe(finalize(() => this.setLoadingState('blacklist', false)))
      .subscribe({
        next: (response) => {
          this.blacklistItems.set(response.blacklistedWords);
        },
        error: (error) => {
          this.showToast(
            'error',
            'Fehler',
            error.message || 'Blacklist konnte nicht geladen werden',
          );
        },
      });
  }

  addToBlacklist() {
    const word = this.newBlacklistWord();
    if (!word.trim()) {
      this.showToast('warn', 'Warnung', 'Bitte gib ein Wort ein');
      return;
    }

    // Validate word content - ban parentheses and commas
    if (word.includes('(') || word.includes(')') || word.includes(',')) {
      this.showToast('error', 'Fehler', 'Wort darf keine Klammern () oder Kommas enthalten');
      return;
    }

    const trimmedWord = word.trim();
    this.fakerankAdminService.addToBlacklist(trimmedWord).subscribe({
      next: (response) => {
        this.showToast('success', 'Erfolg', 'Wort zur Blacklist hinzugefügt');
        this.blacklistItems.update((items) => [
          ...items,
          {
            id: response.id,
            word: trimmedWord,
            createdAt: new Date().toISOString(),
          },
        ]);
        this.newBlacklistWord.set('');
      },
      error: (error) => {
        this.showToast(
          'error',
          'Fehler',
          error.message || 'Wort konnte nicht zur Blacklist hinzugefügt werden',
        );
      },
    });
  }

  removeFromBlacklist(item: BlacklistItem) {
    this.showConfirmation(
      'Aus Blacklist entfernen',
      `Möchtest du "${item.word}" wirklich aus der Blacklist entfernen?`,
      () => {
        this.fakerankAdminService.removeFromBlacklist(item.word).subscribe({
          next: () => {
            this.showToast('success', 'Erfolg', 'Wort aus Blacklist entfernt');
            this.blacklistItems.update((items) =>
              items.filter((b) => b.id !== item.id),
            );
          },
          error: (error) => {
            this.showToast(
              'error',
              'Fehler',
              error.message ||
              'Wort konnte nicht aus der Blacklist entfernt werden',
            );
          },
        });
      },
    );
  }

  // Whitelist Methods
  loadWhitelist() {
    this.setLoadingState('whitelist', true);

    this.fakerankAdminService
      .getWhitelist()
      .pipe(finalize(() => this.setLoadingState('whitelist', false)))
      .subscribe({
        next: (response) => {
          this.whitelistItems.set(response.whitelistedWords);
        },
        error: (error) => {
          this.showToast(
            'error',
            'Fehler',
            error.message || 'Whitelist konnte nicht geladen werden',
          );
        },
      });
  }

  addToWhitelist() {
    const word = this.newWhitelistWord();
    if (!word.trim()) {
      this.showToast('warn', 'Warnung', 'Bitte gib ein Wort ein');
      return;
    }

    // Validate word content - ban parentheses and commas
    if (word.includes('(') || word.includes(')') || word.includes(',')) {
      this.showToast('error', 'Fehler', 'Wort darf keine Klammern () oder Kommas enthalten');
      return;
    }

    const trimmedWord = word.trim();
    this.fakerankAdminService.addToWhitelist(trimmedWord).subscribe({
      next: (response) => {
        this.showToast('success', 'Erfolg', 'Wort zur Whitelist hinzugefügt');
        this.whitelistItems.update((items) => [
          ...items,
          {
            id: response.id,
            word: trimmedWord,
            createdAt: new Date().toISOString(),
          },
        ]);
        this.newWhitelistWord.set('');
      },
      error: (error) => {
        this.showToast(
          'error',
          'Fehler',
          error.message || 'Wort konnte nicht zur Whitelist hinzugefügt werden',
        );
      },
    });
  }

  removeFromWhitelist(item: WhitelistItem) {
    this.showConfirmation(
      'Aus Whitelist entfernen',
      `Möchtest du "${item.word}" wirklich aus der Whitelist entfernen?`,
      () => {
        this.fakerankAdminService.removeFromWhitelist(item.word).subscribe({
          next: () => {
            this.showToast('success', 'Erfolg', 'Wort aus Whitelist entfernt');
            this.whitelistItems.update((items) =>
              items.filter((w) => w.id !== item.id),
            );
          },
          error: (error) => {
            this.showToast(
              'error',
              'Fehler',
              error.message ||
              'Wort konnte nicht aus der Whitelist entfernt werden',
            );
          },
        });
      },
    );
  }

  // All Fakeranks Methods
  loadAllFakeranks() {
    this.setLoadingState('fakeranks', true);
    const { limit, offset } = this.pagination();

    this.fakerankAdminService
      .getAllFakeranks(limit, offset)
      .pipe(finalize(() => this.setLoadingState('fakeranks', false)))
      .subscribe({
        next: (response) => {
          this.allFakeranks.set(response.data);
          this.pagination.update((p) => ({ ...p, total: response.totalItems }));
          this.stats.set({
            currentPlayersOnline: response.currentPlayersOnline,
            uniquePlayerNames: response.uniquePlayerNames,
            total: response.totalItems,
          });
        },
        error: (error) => {
          this.showToast(
            'error',
            'Fehler',
            error.message || 'Fakeranks konnten nicht geladen werden',
          );
        },
      });
  }

  onPageChange(page: number) {
    this.pagination.update((p) => ({ ...p, offset: page * p.limit }));
    this.loadAllFakeranks();
  }

  editFakerank(user: Player) {
    this.activeTabIndex.set(0);
    this.searchSteamId.set(user.id);

    const userFakerank: UserFakerank = {
      steamId: user.id,
      fakerank:
        user.fakerank && user.fakerank !== 'No Fakerank' ? user.fakerank : '',
      fakerank_color: user.fakerank_color,
      username: user.personaname,
      avatarFull: user.avatarfull || '',
    };

    this.searchedUser.set(userFakerank);
    this.newFakerank.set(userFakerank.fakerank || '');
    this.tempFakerankColor.set(
      this.getColorKeyFromHex(user.fakerank_color) || 'default',
    );
  }

  // Utility methods
  private setLoadingState(key: keyof LoadingStates, value: boolean) {
    this.loading.update((state) => ({ ...state, [key]: value }));
  }

  getAvatarUrl(avatar: string | null | undefined): string {
    return avatar || '/assets/logos/logo_full_color_1to1.png';
  }

  onAvatarError(event: any) {
    event.target.src = '/assets/logos/logo_full_color_1to1.png';
  }

  // Prevent parentheses and commas from being typed
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === '(' || event.key === ')' || event.key === ',') {
      event.preventDefault();
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Color picker methods
  toggleColorPicker(): void {
    this.showColorPicker.update((show) => !show);
  }

  selectColor(colorKey: string): void {
    this.tempFakerankColor.set(colorKey);
    this.showColorPicker.set(false);
  }

  getColorHex(colorKey: string): string {
    const color = this.FAKERANK_COLORS.find((c) => c.key === colorKey);
    return color?.hex || '#FFFFFF';
  }

  getColorName(colorKey: string): string {
    const color = this.FAKERANK_COLORS.find((c) => c.key === colorKey);
    return color?.name || 'Default (Weiß)';
  }

  getColorKeyFromHex(hex: string | null): string | null {
    if (!hex) return null;
    const color = this.FAKERANK_COLORS.find(
      (c) => c.hex.toLowerCase() === hex.toLowerCase(),
    );
    return color?.key || null;
  }
}
