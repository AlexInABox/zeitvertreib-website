import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BackgroundMusicService {
  private tracks: Record<string, { title: string; artist: string; file: string }> = {};
  private trackKeys: string[] = [];
  private audio: HTMLAudioElement | null = null;
  public isPlaying$ = new BehaviorSubject<boolean>(false);
  public requiresInteraction$ = new BehaviorSubject<boolean>(false);
  private volume = 0.1;
  public volume$ = new BehaviorSubject<number>(this.volume);
  private muted = false;
  public isMuted$ = new BehaviorSubject<boolean>(false);
  public currentTrack$ = new BehaviorSubject<string | null>(null);
  private readonly STORAGE_KEY = 'zeit_bgm_volume';
  private readonly MUTE_KEY = 'zeit_bgm_muted';

  private unmuteAttempts = 0;
  private readonly maxUnmuteAttempts = 6;
  private unmuteIntervalId: any = null;
  private unmuteTimeoutId: any;
  private readonly interactionHandlerBound = this.tryUnmuteFromInteraction.bind(this);

  async init() {
    try {
      // Load saved volume from localStorage if available
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

      // Restore mute state from localStorage, default to true (muted) for new users
      let savedMuted = true;
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
        this.tracks = data.tracks;
        this.trackKeys = Object.keys(data.tracks);
        this.tryPlayRandom();
      }
    } catch (e) {
      console.warn('BackgroundMusic: failed to load tracks', e);
    }
  }

  private createAudioIfNeeded() {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.loop = false;
      this.audio.volume = this.volume;
      this.audio.muted = this.muted;
      this.audio.preload = 'metadata';
      this.audio.crossOrigin = 'anonymous';
      try {
        (this.audio as any).playsInline = true;
        this.audio.setAttribute('playsinline', 'true');
      } catch {}
      this.audio.addEventListener('ended', () => {
        setTimeout(() => this.tryPlayRandom(), 200);
      });
      this.audio.addEventListener('error', (e) => {
        console.warn('BackgroundMusic: audio error', e);
        this.isPlaying$.next(false);
      });
    }
  }

  private tryPlayRandom() {
    if (!this.trackKeys.length) return;
    this.createAudioIfNeeded();
    const key = this.trackKeys[Math.floor(Math.random() * this.trackKeys.length)];
    const track = this.tracks[key];
    if (!this.audio) return;
    this.currentTrack$.next(track.title + ' — ' + track.artist);
    this.audio.src = '/assets/music/' + encodeURIComponent(track.file);

    // Helper: attempt to play with given muted state (do not leak workaround to observable)
    const attemptPlay = async (muted = false): Promise<boolean> => {
      try {
        if (!this.audio) return false;
        this.audio.muted = muted;
        this.audio.volume = this.volume;
        await this.audio.play();
        this.isMuted$.next(this.muted); // Only reflect user preference after play
        this.isPlaying$.next(true);
        this.requiresInteraction$.next(false);
        return true;
      } catch {
        return false;
      }
    };

    // Strategy: Try unmuted first, but immediately fallback to muted
    // Most modern browsers block unmuted autoplay, but allow muted autoplay
    (async () => {
      const initialAttemptMuted = this.muted;
      const firstOk = await attemptPlay(initialAttemptMuted);
      if (firstOk) return;
      const secondOk = await attemptPlay(!initialAttemptMuted);
      if (!secondOk) {
        console.warn('BackgroundMusic: autoplay prevented (even muted)');
        this.isPlaying$.next(false);
        this.requiresInteraction$.next(true);
        return;
      }
      // Fallback worked, but may be unmuted when user wants muted
      if (this.muted && this.audio && !this.audio.muted) {
        this.audio.muted = true;
        this.isMuted$.next(true);
      }
      // Only try to auto-unmute if user preference is NOT muted
      if (!this.muted) {
        this.startUnmuteAttempts();
      }
    })();
  }

  userToggle() {
    this.createAudioIfNeeded();
    if (!this.audio) return;

    if (this.isPlaying$.value) {
      this.audio.pause();
      this.isPlaying$.next(false);
      this.stopUnmuteAttempts();
    } else {
      // If currently muted because autoplay fallback used muted autoplay, try unmuting first
      if (this.isMuted$.value) {
        this.audio.muted = false;
        this.isMuted$.next(false);
      }

      const playPromise = this.audio.play();
      playPromise
        ?.then(() => {
          this.isPlaying$.next(true);
          this.requiresInteraction$.next(false);
        })
        .catch((err) => {
          // If play failed, try to play muted as a fallback and mark that user interaction is required to enable sound
          console.warn('BackgroundMusic: play failed', err);
          this.isPlaying$.next(false);
          this.requiresInteraction$.next(true);
        });
    }
  }

  private startUnmuteAttempts() {
    this.stopUnmuteAttempts();
    this.unmuteAttempts = 0;

    const attempt = async () => {
      if (!this.audio) return;
      try {
        await this.audio.play();
        this.isMuted$.next(false);
        this.requiresInteraction$.next(false);
        this.stopUnmuteAttempts();
      } catch {
        this.unmuteAttempts++;
        this.isMuted$.next(true);
        this.requiresInteraction$.next(true);
        if (this.unmuteAttempts >= this.maxUnmuteAttempts) {
          this.stopUnmuteAttempts();
        }
      }
    };

    // First attempt after a short delay (allows time for browser to settle)
    this.unmuteTimeoutId = setTimeout(() => attempt(), 800);
    // Then continue with longer intervals for retries
    this.unmuteIntervalId = setInterval(() => attempt(), 2000);

    document.addEventListener('pointerdown', this.interactionHandlerBound as any, { once: true });
    document.addEventListener('keydown', this.interactionHandlerBound as any, { once: true });
    window.addEventListener('focus', this.interactionHandlerBound as any, { once: true });
    document.addEventListener('visibilitychange', this.interactionHandlerBound as any, { once: true });
  }

  private stopUnmuteAttempts() {
    if (this.unmuteIntervalId) {
      clearInterval(this.unmuteIntervalId);
      this.unmuteIntervalId = null;
    }
    if (this.unmuteTimeoutId) {
      clearTimeout(this.unmuteTimeoutId);
      this.unmuteTimeoutId = null;
    }
    try {
      document.removeEventListener('pointerdown', this.interactionHandlerBound as any);
      document.removeEventListener('keydown', this.interactionHandlerBound as any);
      window.removeEventListener('focus', this.interactionHandlerBound as any);
      document.removeEventListener('visibilitychange', this.interactionHandlerBound as any);
    } catch {}
  }

  private async tryUnmuteFromInteraction() {
    if (!this.audio) return;
    try {
      // User interaction detected: try to unmute (even in Safari this usually works with user gesture)
      this.audio.muted = false;
      this.isMuted$.next(false);
      // Make sure audio is playing after unmuting
      const playPromise = this.audio.play();
      if (playPromise) {
        await playPromise;
      }
      this.requiresInteraction$.next(false);
      this.stopUnmuteAttempts();
    } catch (e) {
      // Still blocked by browser; keep attempts running
      // This can happen if the browser's autoplay policy is very strict
      this.isMuted$.next(true);
      this.requiresInteraction$.next(true);
    }
  }

  toggleMute() {
    if (!this.audio) return;
    this.audio.muted = !this.audio.muted;
    this.muted = this.audio.muted;
    this.isMuted$.next(this.audio.muted);
    try {
      localStorage.setItem(this.MUTE_KEY, String(this.audio.muted));
    } catch {}
    if (this.audio.muted) {
      this.stopUnmuteAttempts();
      // Clear any timers/flags related to unmute attempts
      // ...existing logic for clearing timers/flags if any...
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.volume$.next(this.volume);
    try {
      localStorage.setItem(this.STORAGE_KEY, String(this.volume));
    } catch {}
    if (this.audio) this.audio.volume = this.volume;
  }
}
