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
    const newVal = !this.isDarkSignal();
    this.isDarkSignal.set(newVal);
    this.applyTheme(newVal);
    localStorage.setItem('theme', newVal ? 'dark' : 'light');
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
