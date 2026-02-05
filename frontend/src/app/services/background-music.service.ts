import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BackgroundMusicService {
  private tracks: string[] = [];
  private audio: HTMLAudioElement | null = null;
  public isPlaying$ = new BehaviorSubject<boolean>(false);
  public requiresInteraction$ = new BehaviorSubject<boolean>(false);
  private volume = 0.10;
  public volume$ = new BehaviorSubject<number>(this.volume);
  public isMuted$ = new BehaviorSubject<boolean>(false);
  public currentTrack$ = new BehaviorSubject<string | null>(null);
  private readonly STORAGE_KEY = 'zeit_bgm_volume';

  private unmuteAttempts = 0;
  private maxUnmuteAttempts = 6;
  private unmuteIntervalId: any = null;
  private interactionHandlerBound = this.tryUnmuteFromInteraction.bind(this);

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
      } catch (e) {
        // ignore storage errors
      }
        
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
      this.audio.preload = 'auto';
      // Hint to allow inline playback on mobile
      try {
        (this.audio as any).playsInline = true;
        this.audio.setAttribute('playsinline', 'true');
      } catch (e) {}
      this.audio.addEventListener('ended', () => {
        setTimeout(() => this.tryPlayRandom(), 200);
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

    // First try normal playback (may be blocked by autoplay policies)
    const attemptPlay = async (muted = false) => {
      try {
        this.audio!.muted = muted;
        this.isMuted$.next(muted);
        this.audio!.volume = this.volume;
        await this.audio!.play();
        this.isPlaying$.next(true);
        this.requiresInteraction$.next(false);
        return true;
      } catch (err) {
        return false;
      }
    };

    (async () => {
      const ok = await attemptPlay(false);
      if (ok) return;
      // Try muted autoplay as a fallback (most browsers allow this)
      const mutedOk = await attemptPlay(true);
      if (!mutedOk) {
        console.warn('BackgroundMusic: autoplay prevented (even muted)');
        this.isPlaying$.next(false);
        this.requiresInteraction$.next(true);
        return;
      }

      // If muted autoplay succeeded, attempt to unmute repeatedly and also listen for user interaction
      this.startUnmuteAttempts();
    })();
  }

  userToggle() {
    this.createAudioIfNeeded();
    if (!this.audio) return;

    if (this.isPlaying$.value) {
      this.audio.pause();
      this.isPlaying$.next(false);
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
        this.audio.muted = false;
        await this.audio.play();
        this.isMuted$.next(false);
        this.requiresInteraction$.next(false);
        this.stopUnmuteAttempts();
      } catch (err) {
        this.unmuteAttempts++;
        this.isMuted$.next(true);
        this.requiresInteraction$.next(true);
        if (this.unmuteAttempts >= this.maxUnmuteAttempts) {
          this.stopUnmuteAttempts();
        }
      }
    };

    // Try once after a short delay
    setTimeout(() => attempt(), 1200);
    // Then schedule repeated attempts
    this.unmuteIntervalId = setInterval(() => attempt(), 1500);

    // Add user interaction listeners to attempt immediate unmute
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
      this.audio.muted = false;
      await this.audio.play();
      this.isMuted$.next(false);
      this.requiresInteraction$.next(false);
      this.stopUnmuteAttempts();
    } catch (e) {
      // still blocked; keep attempts running
    }
  }

  toggleMute() {
    if (!this.audio) return;
    this.audio.muted = !this.audio.muted;
    this.isMuted$.next(this.audio.muted);
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
