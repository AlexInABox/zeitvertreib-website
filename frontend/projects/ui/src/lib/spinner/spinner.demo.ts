import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SpinnerComponent } from './spinner.component';
import type { UiDemoEntry } from '../registry';

@Component({
  selector: 'ui-demo-spinner-sizes',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SpinnerComponent],
  template: `
    <div class="row">
      <ui-spinner size="xs" />
      <ui-spinner size="sm" />
      <ui-spinner size="md" />
      <ui-spinner size="lg" />
      <ui-spinner [size]="48" />
    </div>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }
  `,
})
class SpinnerSizesDemo {}

@Component({
  selector: 'ui-demo-spinner-variants',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SpinnerComponent],
  template: `
    <div class="row">
      <ui-spinner />
      <div class="dark-panel">
        <ui-spinner variant="light" />
      </div>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    .dark-panel {
      display: inline-flex;
      padding: 0.75rem 1.5rem;
      border-radius: var(--ui-radius-sm);
      background: var(--ui-input-bg);
    }
  `,
})
class SpinnerVariantsDemo {}

export const demos: UiDemoEntry[] = [
  {
    title: 'Sizes',
    component: SpinnerSizesDemo,
    code: `<ui-spinner size="xs" />
<ui-spinner size="sm" />
<ui-spinner size="md" />
<ui-spinner size="lg" />
<ui-spinner [size]="48" />`,
  },
  {
    title: 'Variants',
    component: SpinnerVariantsDemo,
    code: `<ui-spinner />

<div class="dark-panel">
  <ui-spinner variant="light" />
</div>`,
  },
];
