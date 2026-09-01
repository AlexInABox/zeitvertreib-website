import { ChangeDetectionStrategy, Component, OnDestroy, signal } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { ProgressComponent } from './progress.component';
import type { UiDemoEntry } from '../registry';

@Component({
  selector: 'ui-demo-progress-sizes',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ProgressComponent],
  template: `
    <div class="col">
      <ui-progress [value]="25" />
      <ui-progress [value]="60" size="md" />
      <ui-progress [value]="100" size="md" />
    </div>
  `,
  styles: `
    .col {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 420px;
    }
  `,
})
class ProgressSizesDemo {}

@Component({
  selector: 'ui-demo-progress-animated',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ProgressComponent, ButtonComponent],
  template: `
    <div class="col">
      <ui-progress [value]="value()" size="md" />
      <div class="row">
        <ui-button variant="primary" size="xs" (click)="toggle()">{{ running() ? 'Pause' : 'Start' }}</ui-button>
        <ui-button variant="ghost" size="xs" (click)="reset()">Reset</ui-button>
      </div>
    </div>
  `,
  styles: `
    .col {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 420px;
    }

    .row {
      display: flex;
      gap: 0.5rem;
    }
  `,
})
class ProgressAnimatedDemo implements OnDestroy {
  value = signal(0);
  running = signal(false);

  private interval?: ReturnType<typeof setInterval>;

  toggle(): void {
    if (this.running()) {
      clearInterval(this.interval);
      this.running.set(false);
      return;
    }
    this.running.set(true);
    this.interval = setInterval(() => {
      this.value.update((current) => (current >= 100 ? 100 : current + 2));
    }, 100);
  }

  reset(): void {
    clearInterval(this.interval);
    this.running.set(false);
    this.value.set(0);
  }

  ngOnDestroy(): void {
    clearInterval(this.interval);
  }
}

export const demos: UiDemoEntry[] = [
  {
    title: 'Sizes',
    component: ProgressSizesDemo,
    code: `<ui-progress [value]="25" />
<ui-progress [value]="60" size="md" />
<ui-progress [value]="100" size="md" />`,
  },
  {
    title: 'Animiert',
    component: ProgressAnimatedDemo,
    code: `<ui-progress [value]="value()" size="md" />

<ui-button variant="primary" size="xs" (click)="toggle()">Start</ui-button>
<ui-button variant="ghost" size="xs" (click)="reset()">Reset</ui-button>`,
  },
];
