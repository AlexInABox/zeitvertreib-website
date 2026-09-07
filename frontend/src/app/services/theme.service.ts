import { Injectable, signal } from '@angular/core';

/**
 * Dark mode is the only theme — light mode has been retired.
 * The service keeps the signal API so consumers can still branch on it,
 * but it always resolves to dark.
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly isDarkSignal = signal<boolean>(true);

  readonly isDark = this.isDarkSignal.asReadonly();

  constructor() {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('my-app-dark');
    }

    // Purge stale theme preferences from the light-mode era.
    try {
      localStorage.removeItem('theme');
    } catch {
      // ignore
    }
  }
}
