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
    this.setDarkMode(!this.isDarkSignal());
  }

  setDarkMode(isDark: boolean) {
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
}
