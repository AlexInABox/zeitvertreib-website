import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
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
  inverted: string = 'logo_full_1to1.svg';
  userLoggedIn: boolean = false;
  avatarIcon: string = '';
  currentUser: SteamUser | null = null;
  isFakerankAdmin: boolean = false;
  private authSubscription?: Subscription;
  private userDataSubscription?: Subscription;
  private bgmPlayingSubscription?: Subscription;
  private bgmInteractionSubscription?: Subscription;
  private bgmVolumeSubscription?: Subscription;
  private bgmMutedSubscription?: Subscription;
  private bgmTrackSubscription?: Subscription;
  isPlaying: boolean = false;
  requiresInteraction: boolean = false;
  volume: number = 0.25;
  isMuted: boolean = false;
  currentTrack: string | null = null;
  showVolumePanel: boolean = false;
  ctaShown: boolean = false;

  constructor(
    private authService: AuthService,
    private bgm: BackgroundMusicService,
  ) {}

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
    this.bgmPlayingSubscription = this.bgm.isPlaying$.subscribe((v) => (this.isPlaying = v));
    this.bgmInteractionSubscription = this.bgm.requiresInteraction$.subscribe((v) => (this.requiresInteraction = v));
    this.bgmVolumeSubscription = this.bgm.volume$.subscribe((v) => (this.volume = v));
    this.bgmMutedSubscription = this.bgm.isMuted$.subscribe((v) => (this.isMuted = v));
    this.bgmTrackSubscription = this.bgm.currentTrack$.subscribe((t) => (this.currentTrack = t));

    // CTA shown flag (do not show CTA if user dismissed earlier)
    try {
      this.ctaShown = localStorage.getItem('zeit_bgm_cta_shown') === '1';
    } catch (e) {
      this.ctaShown = false;
    }
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
    this.bgmPlayingSubscription?.unsubscribe();
    this.bgmInteractionSubscription?.unsubscribe();
    this.bgmVolumeSubscription?.unsubscribe();
    this.bgmMutedSubscription?.unsubscribe();
    this.bgmTrackSubscription?.unsubscribe();
  }

  login() {
    this.authService.login();
  }

  logout() {
    this.authService.performLogout();
    location.reload();
  }

  toggleMusic() {
    this.bgm.userToggle();
  }

  toggleMute() {
    this.bgm.toggleMute();
  }

  onVolumeChange(v: number) {
    this.bgm.setVolume(v);
  }

  toggleVolumePanel(e: Event) {
    e.stopPropagation();

    // If interaction to play needed, treat main button as a Play button
    if (this.requiresInteraction && !this.isPlaying) {
      this.enableSoundCTA();
      return;
    }

    this.showVolumePanel = !this.showVolumePanel;
  }

  enableSoundCTA() {
    try {
      this.bgm.userToggle();
      localStorage.setItem('zeit_bgm_cta_shown', '1');
      this.ctaShown = true;
      this.showVolumePanel = false;
    } catch (e) {}
  }

  dismissSoundCTA() {
    try {
      localStorage.setItem('zeit_bgm_cta_shown', '1');
      this.ctaShown = true;
      this.showVolumePanel = false;
    } catch (e) {}
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(_e: Event) {
    if (this.showVolumePanel) this.showVolumePanel = false;
  }
}
