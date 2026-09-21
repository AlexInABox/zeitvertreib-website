import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';

import { RouterOutlet, NavigationEnd, Router } from '@angular/router';
import { DomainWarningComponent } from './components/domain-warning/domain-warning.component';
import { ToastComponent } from './components/toast/toast.component';
import { ZvcOverlayComponent } from './components/zvc-overlay/zvc-overlay.component';
import { SupportOverlayComponent } from './components/support-overlay/support-overlay.component';
import { EasterEggService } from './services/easter-egg.service';
import { AudioService } from './services/audio.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DomainWarningComponent, ToastComponent, ZvcOverlayComponent, SupportOverlayComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  private easterEggService = inject(EasterEggService);
  private router = inject(Router);

  title = 'zeitvertreib-website';
  private chiikawaSubscription?: Subscription;
  private chiikawaActivatedSubscription?: Subscription;
  private routerSubscription?: Subscription;
  private chiikawaOriginalSrc: Map<HTMLImageElement, string> = new Map();
  private audioService = inject(AudioService);

  ngOnInit(): void {
    // Register chiikawa sound (quieter!!!)
    try {
      this.audioService.register('uwa', '/assets/sounds/uwa.mp3', { volume: 0.1 });
    } catch (e) {
      console.warn('Failed to register chiikawa sound', e);
    }

    // Subscribe to chiikawa mode changes
    this.chiikawaSubscription = this.easterEggService.chiikawaTrigger$.subscribe((isActive) => {
      if (isActive) {
        this.applyChiikawaImages();
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
      .subscribe((event) => {
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
