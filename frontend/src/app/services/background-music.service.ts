import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BackgroundMusicService {
  private tracks: string[] = [];
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
  private maxUnmuteAttempts = 6;
  private unmuteIntervalId: any = null;
  private interactionHandlerBound = this.tryUnmuteFromInteraction.bind(this);

  async init() {
    try {
      // Load saved volume from localStorage if available
      let hasSavedVolume = false;
      try {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved !== null) {
          const v = parseFloat(saved);
          if (!isNaN(v)) {
            this.volume = Math.max(0, Math.min(1, v));
            this.volume$.next(this.volume);
            hasSavedVolume = true;
          }
        }
      } catch (e) {
        // ignore storage errors
      }

      // Restore mute state from localStorage, default to true (muted) for new users
      let savedMuted = true;
      try {
        const mutedVal = localStorage.getItem(this.MUTE_KEY);
        if (mutedVal !== null) {
          savedMuted = mutedVal === 'true';
        }
      } catch (e) {}
      this.muted = savedMuted;
      this.isMuted$.next(savedMuted);

      const res = await fetch('/assets/music/tracks.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tracks) && data.tracks.length) {
        this.tracks = data.tracks;
        // Try to start playback ASAP; browsers may block autoplay. We will try muted autoplay as a fallback and attempt to unmute shortly after.
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
      // Standard attributes for cross-browser compatibility
      this.audio.crossOrigin = 'anonymous';
      // Safari mobile requires explicit playsinline for audio to work
      try {
        (this.audio as any).playsInline = true;
        this.audio.setAttribute('playsinline', 'true');
      } catch (e) {}
      // Add ended listener for looping through tracks
      this.audio.addEventListener('ended', () => {
        setTimeout(() => this.tryPlayRandom(), 200);
      });
      // Handle errors gracefully
      this.audio.addEventListener('error', (e) => {
        console.warn('BackgroundMusic: audio error', e);
        this.isPlaying$.next(false);
      });
    }
  }

  private tryPlayRandom() {
    if (!this.tracks.length) return;
    this.createAudioIfNeeded();
    const track = this.tracks[Math.floor(Math.random() * this.tracks.length)];
    if (!this.audio) return;
    this.currentTrack$.next(track);
    // encodeURI so that special characters dont break everything
    this.audio.src = '/assets/music/' + encodeURIComponent(track);

    // Helper: attempt to play with given muted state
    const attemptPlay = async (muted = false): Promise<boolean> => {
      try {
        if (!this.audio) return false;
        this.audio.muted = muted;
        this.isMuted$.next(muted);
        this.audio.volume = this.volume;
        await this.audio.play();
        this.isPlaying$.next(true);
        this.requiresInteraction$.next(false);
        return true;
      } catch (err) {
        return false;
      }
    };

    // Strategy: Try unmuted first, but immediately fallback to muted
    // Most modern browsers block unmuted autoplay, but allow muted autoplay
    (async () => {
      // Try unmuted first (will usually fail but worth attempting)
      const unmuteOk = await attemptPlay(false);
      if (unmuteOk) {
        // Rare case: unmuted autoplay succeeded (e.g., user previously allowed it)
        return;
      }

      // Fallback to muted autoplay (works in most browsers including Safari)
      const mutedOk = await attemptPlay(true);
      if (!mutedOk) {
        // Complete autoplay failure (very rare, maybe in strict sandboxed environments)
        console.warn('BackgroundMusic: autoplay prevented (even muted)');
        this.isPlaying$.next(false);
        this.requiresInteraction$.next(true);
        return;
      }

      // Success: We're playing muted. Only try to auto-unmute if the user did NOT explicitly mute
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

    // Unmute attempt: try to unmute and play
    const attempt = async () => {
      if (!this.audio) return;
      try {
        this.audio.muted = false;
        // For Safari: ensure play is called after unmuting
        await this.audio.play();
        this.isMuted$.next(false);
        this.requiresInteraction$.next(false);
        this.stopUnmuteAttempts();
      } catch (err) {
        this.unmuteAttempts++;
        this.isMuted$.next(true);
        this.requiresInteraction$.next(true);
        // Stop after max attempts to avoid excessive console warnings
        if (this.unmuteAttempts >= this.maxUnmuteAttempts) {
          this.stopUnmuteAttempts();
        }
      }
    };

    // First attempt after a short delay (allows time for browser to settle)
    setTimeout(() => attempt(), 800);
    // Then continue with longer intervals for retries
    this.unmuteIntervalId = setInterval(() => attempt(), 2000);

    // Add user interaction listeners - these trigger immediate unmute attempts
    // Use the bound handler that already exists
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
    // remove listeners (non-once in some browsers)
    try {
      document.removeEventListener('pointerdown', this.interactionHandlerBound as any);
      document.removeEventListener('keydown', this.interactionHandlerBound as any);
      window.removeEventListener('focus', this.interactionHandlerBound as any);
      document.removeEventListener('visibilitychange', this.interactionHandlerBound as any);
    } catch (e) {}
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
    } catch (e) {}
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.volume$.next(this.volume);
    try {
      localStorage.setItem(this.STORAGE_KEY, String(this.volume));
    } catch (e) {}
    if (this.audio) this.audio.volume = this.volume;
  }
}
