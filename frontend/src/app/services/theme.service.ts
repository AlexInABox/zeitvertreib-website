import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private isDarkSignal = signal<boolean>(this.getInitialTheme());

  isDark = this.isDarkSignal.asReadonly();

  constructor() {
    // Initial application of theme
    this.applyTheme(this.isDarkSignal());
  }

  toggleDarkMode() {
    // User-initiated toggle should disable chiikawa mode
    this.disableChiikawaIfActive();
    this.setDarkMode(!this.isDarkSignal());
  }

  setDarkMode(isDark: boolean, fromChiikawa = false) {
    // If this is a user-initiated change (not from chiikawa), disable chiikawa
    if (!fromChiikawa) {
      this.disableChiikawaIfActive();
    }
    this.isDarkSignal.set(isDark);
    this.applyTheme(isDark);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      }
    } catch {
      // Ignore storage errors to avoid breaking theme toggling
    }
  }

  private getInitialTheme(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
      return storedTheme === 'dark';
    }
    // Default to light
    return false;
  }

  private applyTheme(isDark: boolean) {
    if (typeof document === 'undefined') return;

    const html = document.documentElement;
    if (isDark) {
      html.classList.add('my-app-dark');
    } else {
      html.classList.remove('my-app-dark');
    }
  }

  private disableChiikawaIfActive() {
    // Directly manipulate DOM and localStorage to avoid circular dependencies
    if (typeof document === 'undefined') return;
    
    if (document.body.classList.contains('chiikawa')) {
      document.body.classList.remove('chiikawa');
      try {
        localStorage.setItem('chiikawa_mode_enabled', 'false');
      } catch {
        // ignore
      }
      
      // Also trigger a storage event to notify EasterEggService
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'chiikawa_mode_enabled',
          newValue: 'false',
          oldValue: 'true',
        }));
      } catch {
        // ignore
      }
    }
  }
}
