import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SupportService {
  readonly expanded = signal<boolean>(false);
  readonly persistExpanded = signal<boolean>(false);
  readonly selectedAmount = signal<number | null>(10);

  expand(persist = true, amount?: number): void {
    if (amount !== undefined) {
      this.selectedAmount.set(amount);
    }
    this.expanded.set(true);
    if (persist) {
      this.persistExpanded.set(true);
    }
  }

  collapse(): void {
    this.expanded.set(false);
    this.persistExpanded.set(false);
  }

  togglePersist(): void {
    const next = !this.persistExpanded();
    this.persistExpanded.set(next);
    this.expanded.set(next || this.expanded());
  }
}
