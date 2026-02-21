import { Injectable, inject, effect, Injector, runInInjectionContext } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { ThemeService } from './theme.service';
import { EasterEggService } from './easter-egg.service';

@Injectable({ providedIn: 'root' })
export class BackgroundMusicService {
  private tracks: Record<string, { title: string; artist: string; file: string }> = {};
  private tracksByTheme: {
    light?: Record<string, { title: string; artist: string; file: string }>;
    dark?: Record<string, { title: string; artist: string; file: string }>;
  } = {};
  private trackKeys: string[] = [];
  private audio: HTMLAudioElement | null = null;
  public isPlaying$ = new BehaviorSubject<boolean>(false);
  public requiresInteraction$ = new BehaviorSubject<boolean>(false);
  private volume = 0.1;
  public volume$ = new BehaviorSubject<number>(this.volume);
  private muted = true;
  public isMuted$ = new BehaviorSubject<boolean>(true);
  public currentTrack$ = new BehaviorSubject<string | null>(null);
  private readonly STORAGE_KEY = 'zeit_bgm_volume';
  private readonly MUTE_KEY = 'zeit_bgm_muted_v2';
  private themeService = inject(ThemeService);
  private easterEggService = inject(EasterEggService);
  private injector = inject(Injector);
  private chiikawaSubscription?: Subscription;
  private isChiikawaMode = false;
  private chiikawaTimeoutId?: ReturnType<typeof setTimeout>;

  async init() {
    try {
      // Load saved volume
      try {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved !== null) {
          const v = parseFloat(saved);
          if (!isNaN(v)) {
            this.volume = Math.max(0, Math.min(1, v));
            this.volume$.next(this.volume);
          }
        }
      } catch {}

      let savedMuted = false;
      try {
        const mutedVal = localStorage.getItem(this.MUTE_KEY);
        if (mutedVal !== null) {
          savedMuted = mutedVal === 'true';
        }
      } catch {}
      this.muted = savedMuted;
      this.isMuted$.next(savedMuted);

      const res = await fetch('/assets/music/tracks.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();

      if (data.tracks && typeof data.tracks === 'object') {
        if (data.tracks.light || data.tracks.dark) {
          this.tracksByTheme.light = data.tracks.light || {};
          this.tracksByTheme.dark = data.tracks.dark || {};

          // apply current theme immediately
          this.applyThemeTracks();
          this.loadRandomTrack();

          // react to future theme changes using runInInjectionContext
          runInInjectionContext(this.injector, () => {
            effect(() => {
              const isDark = this.themeService.isDark();
              void isDark;
              if (!this.isChiikawaMode) {
                this.applyThemeTracks();
              }
            });
          });
        } else {
          this.tracks = data.tracks;
          this.trackKeys = Object.keys(data.tracks);
          if (!this.isChiikawaMode) {
            this.loadRandomTrack();
          }
        }

        // Subscribe to chiikawa mode changes
        this.chiikawaSubscription = this.easterEggService.chiikawaTrigger$.subscribe((isActive) => {
          this.isChiikawaMode = isActive;
          if (isActive) {
            this.applyChiikawaTrack();
          } else {
            this.applyThemeTracks();
          }
        });

        // Only autoplay if user previously had music unmuted
        if (!this.muted) {
          this.tryAutoplay();
        }
      }
    } catch (e) {
      console.warn('BackgroundMusic: failed to load tracks', e);
    }
  }

  private applyChiikawaTrack() {
    // Set up the chiikawa track
    this.tracks = {
      'chiikawa': {
        title: 'Chiikawa Theme',
        artist: 'Chiikawa',
        file: 'chiikawa.mp3'
      }
    };
    this.trackKeys = ['chiikawa'];

    // If a track is playing, switch to the chiikawa track
    if (this.audio && this.isPlaying$.value) {
      try {
        this.audio.pause();
      } catch {}
      this.loadRandomTrack();
      if (!this.muted) {
        // Clear any existing timeout
        if (this.chiikawaTimeoutId) {
          clearTimeout(this.chiikawaTimeoutId);
        }
        // Add 14 second delay before playing
        this.chiikawaTimeoutId = setTimeout(() => {
          // Only play if still in chiikawa mode and still unmuted
          if (this.isChiikawaMode && !this.muted) {
            void this.tryAutoplay();
          }
        }, 14000);
      }
    } else {
      this.loadRandomTrack();
    }
  }

  private applyThemeTracks() {
    // Clear any pending chiikawa playback
    if (this.chiikawaTimeoutId) {
      clearTimeout(this.chiikawaTimeoutId);
      this.chiikawaTimeoutId = undefined;
    }

    if (this.isChiikawaMode) return;
    
    const themeKey = this.themeService.isDark() ? 'dark' : 'light';
    const source = (this.tracksByTheme as any)[themeKey] || {};
    this.tracks = source;
    this.trackKeys = Object.keys(source);

    // If a track is playing, switch to a new track from the active pool
    if (this.audio && this.isPlaying$.value) {
      try {
        this.audio.pause();
      } catch {}
      this.loadRandomTrack();
      if (!this.muted) {
        void this.tryAutoplay();
      }
    } else {
      this.loadRandomTrack();
    }
  }

  private createAudioIfNeeded() {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.loop = false;
      this.audio.volume = this.volume;
      this.audio.preload = 'auto';
      try {
        (this.audio as any).playsInline = true;
        this.audio.setAttribute('playsinline', 'true');
      } catch {}
      this.audio.addEventListener('ended', () => {
        this.loadRandomTrack();
        this.playAudio();
      });
      this.audio.addEventListener('error', () => {
        console.warn('BackgroundMusic: audio error');
        this.isPlaying$.next(false);
      });
    }
  }

  private loadRandomTrack() {
    if (!this.trackKeys.length) return;
    this.createAudioIfNeeded();
    if (!this.audio) return;
    const key = this.trackKeys[Math.floor(Math.random() * this.trackKeys.length)];
    const track = this.tracks[key];
    this.currentTrack$.next(track.title + ' — ' + track.artist);
    this.audio.src = '/assets/music/' + encodeURIComponent(track.file);
  }

  private async tryAutoplay() {
    if (!this.audio) return;

    // Wait for audio to be ready
    await new Promise<void>((resolve) => {
      if (!this.audio) return resolve();
      if (this.audio.readyState >= 2) return resolve();
      const onCanPlay = () => {
        this.audio?.removeEventListener('canplay', onCanPlay);
        resolve();
      };
      this.audio.addEventListener('canplay', onCanPlay);
      // Timeout after 5s so we don't wait forever
      setTimeout(() => {
        this.audio?.removeEventListener('canplay', onCanPlay);
        resolve();
      }, 5000);
    });

    await this.playAudio();
  }

  private async playAudio(): Promise<boolean> {
    if (!this.audio) return false;
    try {
      this.audio.volume = this.volume;
      this.audio.muted = false;
      await this.audio.play();
      this.isPlaying$.next(true);
      this.isMuted$.next(false);
      this.requiresInteraction$.next(false);
      return true;
    } catch {
      // Autoplay blocked — set to muted, don't play
      this.muted = true;
      this.isMuted$.next(true);
      this.isPlaying$.next(false);
      this.requiresInteraction$.next(true);
      return false;
    }
  }

  toggleMute() {
    if (!this.audio) return;

    if (this.isPlaying$.value) {
      // Currently playing → pause and mute
      this.audio.pause();
      this.muted = true;
      this.isMuted$.next(true);
      this.isPlaying$.next(false);
    } else {
      // Not playing → try to play unmuted
      this.muted = false;
      this.isMuted$.next(false);
      this.playAudio();
    }

    try {
      localStorage.setItem(this.MUTE_KEY, String(this.muted));
    } catch {}
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.volume$.next(this.volume);
    try {
      localStorage.setItem(this.STORAGE_KEY, String(this.volume));
    } catch {}
    if (this.audio) this.audio.volume = this.volume;
  }

  ngOnDestroy() {
    if (this.chiikawaSubscription) {
      this.chiikawaSubscription.unsubscribe();
    }
    if (this.chiikawaTimeoutId) {
      clearTimeout(this.chiikawaTimeoutId);
    }
  }
}
