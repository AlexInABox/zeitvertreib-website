import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, NavigationEnd, Router } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { DomainWarningComponent } from './components/domain-warning/domain-warning.component';
import { ToastComponent } from './components/toast/toast.component';
import { ZvcOverlayComponent } from './components/zvc-overlay/zvc-overlay.component';
import { BackgroundMusicService } from './services/background-music.service';
import { ThemeService } from './services/theme.service';
import { EasterEggService } from './services/easter-egg.service';
import { AudioService } from './services/audio.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, HeaderComponent, DomainWarningComponent, ToastComponent, ZvcOverlayComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'zeitvertreib-website';
  showHeader = true;
  showSoundCTA: boolean = false;
  private chiikawaSubscription?: Subscription;
  private chiikawaActivatedSubscription?: Subscription;
  private routerSubscription?: Subscription;
  private chiikawaOriginalSrc: Map<HTMLImageElement, string> = new Map();
  private audioService = inject(AudioService);

  constructor(
    private backgroundMusic: BackgroundMusicService,
    private themeService: ThemeService,
    private easterEggService: EasterEggService,
    private router: Router,
  ) {}

  //feel free to transfer this to a seperate file and then call that, but I tried it and it broke everything and killed my grandma
  private easterDates: Record<number, { month: number; day: number }> = {
    2026: { month: 3, day: 5 },
    2027: { month: 2, day: 28 },
    2028: { month: 3, day: 16 },
    2029: { month: 3, day: 1 },
    2030: { month: 3, day: 21 },
    //remind me to add more in 4 years
  };

  private isEaster(date: Date): boolean {
    const year = date.getFullYear();
    const easter = this.easterDates[year];
    if (!easter) return false;

    return date.getMonth() === easter.month && date.getDate() === easter.day;
  }

  ngOnInit(): void {
    try {
      const today = new Date();
      const isEasterToday = this.isEaster(today);
      if (isEasterToday) {
        document.body.classList.add('easter');
        document.documentElement.classList.add('easter');
      } else {
        document.body.classList.remove('easter');
        document.documentElement.classList.remove('easter');
      }
    } catch (e) {
      console.warn('Easter background check failed', e);
    }

    // Start background music
    try {
      this.backgroundMusic.init();
    } catch (e) {
      console.warn('Failed to initialize background music', e);
    }

    // Register chiikawa sound (quieter!!!)
    try {
      this.audioService.register('uwa', '/assets/sounds/uwa.mp3', { volume: 0.10 });
    } catch (e) {
      console.warn('Failed to register chiikawa sound', e);
    }

    // Subscribe to chiikawa mode changes
    this.chiikawaSubscription = this.easterEggService.chiikawaTrigger$.subscribe((isActive) => {
      if (isActive) {
        this.applyChiikawaImages();
        // Switch to light mode for better visibility (fromChiikawa = true to prevent disabling chiikawa)
        this.themeService.setDarkMode(false, true);
      } else {
        this.resetChiikawaImages();
      }
    });

    // Subscribe to chiikawa activation event (only fires on new activation, not on page load)
    this.chiikawaActivatedSubscription = this.easterEggService.chiikawaActivatedEvent$.subscribe(() => {
      // Play sound when activating chiikawa mode
      try {
        void this.audioService.play('uwa');
      } catch (e) {
        console.warn('Failed to play chiikawa sound', e);
      }
    });

    // Re-apply chiikawa images after navigation (for dynamically loaded content)
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        if (this.easterEggService.isChiikawaActive()) {
          // Small delay to allow new content to render
          setTimeout(() => this.applyChiikawaImages(), 100);
        }
      });
  }

  ngOnDestroy(): void {
    this.chiikawaSubscription?.unsubscribe();
    this.chiikawaActivatedSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    // Clean up audio
    try {
      this.audioService.unregister('uwa');
    } catch (e) {
      // ignore
    }
  }

  private applyChiikawaImages(): void {
    const imgs = document.querySelectorAll('img');
    imgs.forEach((img) => {
      try {
        const el = img as HTMLImageElement;
        if (!el.src || el.src.includes('/assets/usagi.webp')) return;

        // Save original if not already saved
        if (!this.chiikawaOriginalSrc.has(el)) {
          this.chiikawaOriginalSrc.set(el, el.src);
        }
        el.src = '/assets/usagi.webp';
      } catch (e) {
        // ignore
      }
    });
  }

  private resetChiikawaImages(): void {
    // Restore original images
    this.chiikawaOriginalSrc.forEach((src, el) => {
      try {
        if (el && el.src) {
          el.src = src;
        }
      } catch (e) {
        // ignore
      }
    });
    this.chiikawaOriginalSrc.clear();
  }
}
