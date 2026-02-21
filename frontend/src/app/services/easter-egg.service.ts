import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EasterEggService {
  private readonly CHIIKAWA_STORAGE_KEY = 'chiikawa_mode_enabled';
  
  /** Observable that emits the current chiikawa mode state */
  private chiikawaState$ = new BehaviorSubject<boolean>(this.loadChiikawaState());
  
  /** Public observable for chiikawa state */
  chiikawaTrigger$ = this.chiikawaState$.asObservable();

  /** Observable that emits only when chiikawa is newly activated (not on page load) */
  private chiikawaActivated$ = new Subject<void>();
  chiikawaActivatedEvent$ = this.chiikawaActivated$.asObservable();

  constructor() {
    // Apply saved state on initialization
    if (this.loadChiikawaState()) {
      this.applyChiikawaMode();
    }

    // Listen for storage events (e.g., when theme service disables chiikawa)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === this.CHIIKAWA_STORAGE_KEY) {
          const newState = event.newValue === 'true';
          if (newState !== this.chiikawaState$.value) {
            this.chiikawaState$.next(newState);
            if (newState) {
              this.applyChiikawaMode();
            } else {
              this.removeChiikawaMode();
            }
          }
        }
      });
    }
  }

  private loadChiikawaState(): boolean {
    try {
      return localStorage.getItem(this.CHIIKAWA_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private saveChiikawaState(enabled: boolean): void {
    try {
      localStorage.setItem(this.CHIIKAWA_STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
  }

  isChiikawaActive(): boolean {
    return this.chiikawaState$.value;
  }

  triggerChiikawa(): void {
    const newState = !this.chiikawaState$.value;
    this.chiikawaState$.next(newState);
    this.saveChiikawaState(newState);
    
    if (newState) {
      this.applyChiikawaMode();
      this.chiikawaActivated$.next();
    } else {
      this.removeChiikawaMode();
    }
  }

  /** Force disable chiikawa mode (used when theme is manually changed) */
  disableChiikawa(): void {
    if (this.chiikawaState$.value) {
      this.chiikawaState$.next(false);
      this.saveChiikawaState(false);
      this.removeChiikawaMode();
    }
  }

  private applyChiikawaMode(): void {
    document.body.classList.add('chiikawa');
  }

  private removeChiikawaMode(): void {
    document.body.classList.remove('chiikawa');
  }
}
