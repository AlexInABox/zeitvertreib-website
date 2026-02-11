import { Injectable } from '@angular/core';

export interface AudioOptions {
  loop?: boolean;
  volume?: number; // 0..1
  preload?: boolean;
}

interface AudioEntry {
  element: HTMLAudioElement;
  options: AudioOptions;
}

@Injectable({ providedIn: 'root' })
export class AudioService {
  private audios = new Map<string, AudioEntry>();
  private defaultVolume = 0.5;

  register(name: string, url: string, options: AudioOptions = {}): void {
    // Do nothing if already registered with same src
    const existing = this.audios.get(name);
    if (existing && existing.element.src.endsWith(url)) return;

    // Unregister old if present
    if (existing) {
      this.unregister(name);
    }

    const el = new Audio(url);
    el.loop = !!options.loop;
    el.volume = options.volume ?? this.defaultVolume;
    if (options.preload !== false) {
      void el.load();
    }

    this.audios.set(name, { element: el, options });
  }

  async play(name: string): Promise<void> {
    const entry = this.audios.get(name);
    if (!entry) return Promise.resolve();
    try {
      entry.element.currentTime = 0;
      await entry.element.play();
    } catch (e) {}
  }

  stop(name: string): void {
    const entry = this.audios.get(name);
    if (!entry) return;
    try {
      entry.element.pause();
      entry.element.currentTime = 0;
    } catch (e) {}
  }

  setVolume(name: string, volume: number): void {
    const entry = this.audios.get(name);
    if (!entry) return;
    entry.element.volume = Math.max(0, Math.min(1, volume));
  }

  setDefaultVolume(volume: number): void {
    this.defaultVolume = Math.max(0, Math.min(1, volume));
    this.audios.forEach((entry) => (entry.element.volume = this.defaultVolume));
  }

  unregister(name: string): void {
    const entry = this.audios.get(name);
    if (!entry) return;
    try {
      entry.element.pause();
      entry.element.src = '';
    } catch (e) {}
    this.audios.delete(name);
  }

  unloadAll(): void {
    this.audios.forEach((_, name) => this.unregister(name));
  }
}
