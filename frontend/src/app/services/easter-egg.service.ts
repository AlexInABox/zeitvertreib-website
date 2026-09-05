import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EasterEggService {
  private readonly CHIIKAWA_STORAGE_KEY = 'chiikawa_mode_enabled';
  private readonly TEST_UI_STORAGE_KEY = 'testui_mode_enabled';
  private readonly TEST_UI2_STORAGE_KEY = 'testui2_mode_enabled';
  private readonly TEST_UI3_STORAGE_KEY = 'testui3_mode_enabled';

  /** Observable that emits the current chiikawa mode state */
  private chiikawaState$ = new BehaviorSubject<boolean>(this.loadChiikawaState());
  private testUiState$ = new BehaviorSubject<boolean>(this.loadTestUiState());
  private testUi2State$ = new BehaviorSubject<boolean>(this.loadTestUi2State());
  private testUi3State$ = new BehaviorSubject<boolean>(this.loadTestUi3State());

  /** Public observable for chiikawa state */
  chiikawaTrigger$ = this.chiikawaState$.asObservable();
  testUiTrigger$ = this.testUiState$.asObservable();
  testUi2Trigger$ = this.testUi2State$.asObservable();
  testUi3Trigger$ = this.testUi3State$.asObservable();

  /** Observable that emits only when chiikawa is newly activated (not on page load) */
  private chiikawaActivated$ = new Subject<void>();
  chiikawaActivatedEvent$ = this.chiikawaActivated$.asObservable();

  constructor() {
    // Apply saved state on initialization
    if (this.loadChiikawaState()) {
      this.applyChiikawaMode();
    }
    if (this.loadTestUiState()) {
      this.applyTestUiMode();
    }
    if (this.loadTestUi2State()) {
      this.applyTestUi2Mode();
    }
    if (this.loadTestUi3State()) {
      this.applyTestUi3Mode();
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
        if (event.key === this.TEST_UI_STORAGE_KEY) {
          const newState = event.newValue === 'true';
          if (newState !== this.testUiState$.value) {
            this.testUiState$.next(newState);
            if (newState) {
              this.applyTestUiMode();
            } else {
              this.removeTestUiMode();
            }
          }
        }
        if (event.key === this.TEST_UI2_STORAGE_KEY) {
          const newState = event.newValue === 'true';
          if (newState !== this.testUi2State$.value) {
            this.testUi2State$.next(newState);
            if (newState) {
              this.applyTestUi2Mode();
            } else {
              this.removeTestUi2Mode();
            }
          }
        }
        if (event.key === this.TEST_UI3_STORAGE_KEY) {
          const newState = event.newValue === 'true';
          if (newState !== this.testUi3State$.value) {
            this.testUi3State$.next(newState);
            if (newState) {
              this.applyTestUi3Mode();
            } else {
              this.removeTestUi3Mode();
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

  private loadTestUiState(): boolean {
    try {
      return localStorage.getItem(this.TEST_UI_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private saveTestUiState(enabled: boolean): void {
    try {
      localStorage.setItem(this.TEST_UI_STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
  }

  private loadTestUi2State(): boolean {
    try {
      return localStorage.getItem(this.TEST_UI2_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private saveTestUi2State(enabled: boolean): void {
    try {
      localStorage.setItem(this.TEST_UI2_STORAGE_KEY, String(enabled));
    } catch {
      // ignore
    }
  }

  private loadTestUi3State(): boolean {
    try {
      return localStorage.getItem(this.TEST_UI3_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private saveTestUi3State(enabled: boolean): void {
    try {
      localStorage.setItem(this.TEST_UI3_STORAGE_KEY, String(enabled));
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

  isTestUiActive(): boolean {
    return this.testUiState$.value;
  }

  triggerTestUi(): void {
    const newState = !this.testUiState$.value;
    this.testUiState$.next(newState);
    this.saveTestUiState(newState);

    // Only one experimental UI at a time.
    if (newState) {
      this.applyTestUiMode();
      this.setTestUi2Active(false);
      this.setTestUi3Active(false);
    } else {
      this.removeTestUiMode();
    }
  }

  isTestUi2Active(): boolean {
    return this.testUi2State$.value;
  }

  triggerTestUi2(): void {
    const newState = !this.testUi2State$.value;
    this.testUi2State$.next(newState);
    this.saveTestUi2State(newState);

    // Only one experimental UI at a time.
    if (newState) {
      this.applyTestUi2Mode();
      this.setTestUiActive(false);
      this.setTestUi3Active(false);
    } else {
      this.removeTestUi2Mode();
    }
  }

  private setTestUiActive(active: boolean): void {
    this.testUiState$.next(active);
    this.saveTestUiState(active);
    if (active) {
      this.applyTestUiMode();
    } else {
      this.removeTestUiMode();
    }
  }

  private setTestUi2Active(active: boolean): void {
    this.testUi2State$.next(active);
    this.saveTestUi2State(active);
    if (active) {
      this.applyTestUi2Mode();
    } else {
      this.removeTestUi2Mode();
    }
  }

  isTestUi3Active(): boolean {
    return this.testUi3State$.value;
  }

  triggerTestUi3(): void {
    const newState = !this.testUi3State$.value;
    this.testUi3State$.next(newState);
    this.saveTestUi3State(newState);

    // Only one experimental UI at a time.
    if (newState) {
      this.applyTestUi3Mode();
      this.setTestUiActive(false);
      this.setTestUi2Active(false);
    } else {
      this.removeTestUi3Mode();
    }
  }

  private setTestUi3Active(active: boolean): void {
    this.testUi3State$.next(active);
    this.saveTestUi3State(active);
    if (active) {
      this.applyTestUi3Mode();
    } else {
      this.removeTestUi3Mode();
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

  private applyTestUiMode(): void {
    document.body.classList.add('testui');
  }

  private removeTestUiMode(): void {
    document.body.classList.remove('testui');
  }

  private applyTestUi2Mode(): void {
    document.body.classList.add('testui2');
  }

  private removeTestUi2Mode(): void {
    document.body.classList.remove('testui2');
  }

  private applyTestUi3Mode(): void {
    document.body.classList.add('testui3');
  }

  private removeTestUi3Mode(): void {
    document.body.classList.remove('testui3');
  }
}
