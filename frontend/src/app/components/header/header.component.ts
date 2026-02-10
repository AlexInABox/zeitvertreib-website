// ...existing imports...
import { Component, OnInit, OnDestroy } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { AuthService, SteamUser, UserData } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { BackgroundMusicService } from '../../services/background-music.service';
import { FormsModule } from '@angular/forms';
import { SliderModule } from 'primeng/slider';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-header',
  imports: [
    Menubar,
    CommonModule,
    RouterModule,
    ButtonModule,
    AvatarModule,
    AvatarGroupModule,
    SliderModule,
    FormsModule,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, OnDestroy {
  items: MenuItem[] | undefined;
  userLoggedIn: boolean = false;
  avatarIcon: string = '';
  currentUser: SteamUser | null = null;
  isFakerankAdmin: boolean = false;
  private authSubscription?: Subscription;
  private userDataSubscription?: Subscription;
  private bgmInteractionSubscription?: Subscription;
  private bgmVolumeSubscription?: Subscription;
  private bgmMutedSubscription?: Subscription;
  requiresInteraction: boolean = false;
  volume: number = 0.25;
  isMuted: boolean = false;
  showVolumePanel: boolean = false;
  ctaShown: boolean = false;
  private draggingVolume: boolean = false;
  private boundPointerUp: any = null;

  constructor(
    private authService: AuthService,
    private bgm: BackgroundMusicService,
    public themeService: ThemeService,
  ) {}

  get logoSrc(): string {
    return this.themeService.isDark() ? 'inverted/logo_full_1to1.svg' : 'logo_full_1to1.svg';
  }

  ngOnInit() {
    this.updateMenuItems();

    // Subscribe to user authentication status
    this.authSubscription = this.authService.currentUser$.subscribe((user: SteamUser | null) => {
      this.currentUser = user;
      this.userLoggedIn = !!user;
      this.avatarIcon = user?.avatarUrl || '';
    });

    // Subscribe to user data changes (including fakerank admin status)
    this.userDataSubscription = this.authService.currentUserData$.subscribe((_userData: UserData | null) => {
      this.isFakerankAdmin = this.authService.isFakerankAdmin();
      this.updateMenuItems(); // Update menu items when admin status changes
    });

    // Background music state
    this.bgmInteractionSubscription = this.bgm.requiresInteraction$.subscribe((v) => (this.requiresInteraction = v));
    this.bgmVolumeSubscription = this.bgm.volume$.subscribe((v) => (this.volume = v));
    this.bgmMutedSubscription = this.bgm.isMuted$.subscribe((v) => (this.isMuted = v));

    // CTA shown flag (do not show CTA if user dismissed earlier)
    try {
      this.ctaShown = localStorage.getItem('zeit_bgm_cta_shown') === '1';
    } catch (e) {
      this.ctaShown = false;
    }
  }

  toggleTheme() {
    this.themeService.toggleDarkMode();
  }

  private updateMenuItems() {
    this.items = [
      {
        label: 'Startseite',
        icon: PrimeIcons.HOME,
        route: '/',
      },
      {
        label: 'Ko-fi',
        icon: PrimeIcons.HEART,
        url: 'https://ko-fi.com/zeitvertreib',
        target: '_blank',
      },
      {
        label: 'Paysafecard',
        icon: PrimeIcons.CREDIT_CARD,
        route: '/paysafecard',
      },

      {
        label: 'Dashboard',
        icon: PrimeIcons.USER,
        route: '/dashboard',
      },
      {
        label: 'Cases',
        icon: PrimeIcons.FOLDER,
        route: '/cases',
      },
      {
        label: 'Bewerben',
        icon: PrimeIcons.PAPERCLIP,
        url: '/bewerben',
      },
    ];

    // Check visibility window: show adventcalendar from Nov 15 through December (German timezone)
    const nowGerman = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    const currentMonth = nowGerman.getMonth() + 1; // 0-indexed
    const currentDay = nowGerman.getDate();

    const visible = currentMonth === 12 || (currentMonth === 11 && currentDay >= 15);
    if (visible) {
      this.items.push({
        label: 'Adventskalender',
        icon: PrimeIcons.GIFT,
        route: '/advent',
      });
    }
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.userDataSubscription?.unsubscribe();
    this.bgmInteractionSubscription?.unsubscribe();
    this.bgmVolumeSubscription?.unsubscribe();
    this.bgmMutedSubscription?.unsubscribe();
    if (this.boundPointerUp) {
      window.removeEventListener('pointerup', this.boundPointerUp);
      this.boundPointerUp = null;
    }
  }

  login() {
    this.authService.login();
  }

  logout() {
    this.authService.performLogout();
    location.reload();
  }

  toggleMute() {
    this.bgm.toggleMute();
  }

  onVolumeChange(v: number) {
    this.bgm.setVolume(v);
  }

  onSliderPointerDown(e: PointerEvent) {
    this.draggingVolume = true;
    this.showVolumePanel = true;
    if (!this.boundPointerUp) {
      this.boundPointerUp = (ev: PointerEvent) => this.onDocumentPointerUp(ev);
      window.addEventListener('pointerup', this.boundPointerUp);
    }
  }

  private onDocumentPointerUp(e: PointerEvent) {
    this.draggingVolume = false;
    if (this.boundPointerUp) {
      window.removeEventListener('pointerup', this.boundPointerUp);
      this.boundPointerUp = null;
    }
    this.showVolumePanel = false;
  }

  onPopoverMouseLeave() {
    if (!this.draggingVolume) {
      this.showVolumePanel = false;
    }
  }

  // Removed pointer position check for simplicity
}
