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
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-header',
  imports: [Menubar, CommonModule, RouterModule, ButtonModule, AvatarModule, AvatarGroupModule, FormsModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, OnDestroy {
  private boundCheckPortrait: () => void = () => { };
  isPortrait = false;
  scrollPaused = false;
  items: MenuItem[] | undefined;
  userLoggedIn = false;
  avatarIcon = '';
  currentUser: SteamUser | null = null;
  isFakerankAdmin = false;
  private authSubscription?: Subscription;
  private userDataSubscription?: Subscription;
  private bgmInteractionSubscription?: Subscription;
  private bgmVolumeSubscription?: Subscription;
  private bgmMutedSubscription?: Subscription;
  private bgmPlayingSubscription?: Subscription;
  private bgmTrackSubscription?: Subscription;
  requiresInteraction = false;
  volume = 0.25;
  isMuted = false;
  showVolumePanel = false;
  ctaShown = false;
  private draggingVolume = false;
  private boundPointerUp: any = null;
  private boundPointerMove: any = null;
  private sliderElement: HTMLElement | null = null;
  isPlaying = false;
  currentTrack: string | null = null;

  copySongTitle(): void {
    if (this.currentTrack) {
      navigator.clipboard.writeText(this.currentTrack).catch(() => {
        // Clipboard write failed — silently ignore or provide fallback
      });
    }
  }

  constructor(
    private authService: AuthService,
    private bgm: BackgroundMusicService,
    public themeService: ThemeService,
  ) { }

  get logoSrc(): string {
    return this.themeService.isDark() ? 'inverted/logo_full_1to1.svg' : 'logo_full_1to1.svg';
  }

  ngOnInit() {
    this.checkPortrait();
    this.boundCheckPortrait = this.checkPortrait.bind(this);
    window.addEventListener('resize', this.boundCheckPortrait);
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
    this.bgmPlayingSubscription = this.bgm.isPlaying$.subscribe((v) => (this.isPlaying = v));
    this.bgmTrackSubscription = this.bgm.currentTrack$.subscribe((v) => (this.currentTrack = v));

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
        label: 'Spiele',
        icon: PrimeIcons.CHART_SCATTER,
        route: '/games',
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
    if (this.boundCheckPortrait) {
      window.removeEventListener('resize', this.boundCheckPortrait);
    }
    this.authSubscription?.unsubscribe();
    this.authSubscription = undefined;
    this.userDataSubscription?.unsubscribe();
    this.userDataSubscription = undefined;
    this.bgmInteractionSubscription?.unsubscribe();
    this.bgmInteractionSubscription = undefined;
    this.bgmVolumeSubscription?.unsubscribe();
    this.bgmVolumeSubscription = undefined;
    this.bgmMutedSubscription?.unsubscribe();
    this.bgmMutedSubscription = undefined;
    this.bgmPlayingSubscription?.unsubscribe();
    this.bgmPlayingSubscription = undefined;
    this.bgmTrackSubscription?.unsubscribe();
    this.bgmTrackSubscription = undefined;
    if (this.boundPointerUp) {
      window.removeEventListener('pointerup', this.boundPointerUp);
      this.boundPointerUp = null;
    }
  }

  private checkPortrait() {
    this.isPortrait = window.innerHeight > window.innerWidth;
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

  onVolumeSliderPointerDown(e: PointerEvent) {
    this.draggingVolume = true;
    this.showVolumePanel = true;
    this.sliderElement = e.currentTarget as HTMLElement;

    if (!this.boundPointerUp) {
      this.boundPointerUp = (ev: PointerEvent) => this.onDocumentPointerUp(ev);
      window.addEventListener('pointerup', this.boundPointerUp);
    }

    if (!this.boundPointerMove) {
      this.boundPointerMove = (ev: PointerEvent) => this.onDocumentPointerMove(ev);
      window.addEventListener('pointermove', this.boundPointerMove);
    }

    // Handle initial click/touch
    this.updateVolumeFromPointer(e);
  }

  onVolumeSliderPointerMove(e: PointerEvent) {
    // This is handled by the document-level listener when dragging
  }

  private onDocumentPointerMove(e: PointerEvent) {
    if (this.draggingVolume && this.sliderElement) {
      this.updateVolumeFromPointer(e);
    }
  }

  private updateVolumeFromPointer(e: PointerEvent) {
    if (!this.sliderElement) return;

    const rect = this.sliderElement.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    // Calculate the value from bottom to top (0% at bottom, 100% at top)
    let percentage = (height - y) / height;
    percentage = Math.max(0, Math.min(1, percentage));

    // Convert percentage to volume range [0.05, 0.8]
    const newVolume = 0.05 + percentage * (0.8 - 0.05);
    this.volume = Math.round(newVolume / 0.01) * 0.01; // Round to step
    this.onVolumeChange(this.volume);
  }

  private onDocumentPointerUp(e: PointerEvent) {
    this.draggingVolume = false;
    this.sliderElement = null;

    if (this.boundPointerUp) {
      window.removeEventListener('pointerup', this.boundPointerUp);
      this.boundPointerUp = null;
    }
    if (this.boundPointerMove) {
      window.removeEventListener('pointermove', this.boundPointerMove);
      this.boundPointerMove = null;
    }
    this.showVolumePanel = false;
  }

  onPopoverMouseLeave() {
    if (!this.draggingVolume) {
      this.showVolumePanel = false;
    }
  }

  //
}
