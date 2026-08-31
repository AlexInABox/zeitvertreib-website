import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'ui-progress',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div
      class="ui-progress"
      [class.ui-progress--md]="size() === 'md'"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="percent()"
    >
      <div
        class="ui-progress__fill"
        [style.width.%]="percent()"
        [class.ui-progress__fill--complete]="percent() >= 100"
      ></div>
    </div>
  `,
  styles: `
    .ui-progress {
      width: 100%;
      height: 4px;
      background: var(--ui-progress-track);
      border-radius: 4px;
      overflow: hidden;
      transition: all 0.3s ease;
    }

    .ui-progress--md {
      height: 8px;
    }

    .ui-progress__fill {
      height: 100%;
      background: var(--ui-progress-fill);
      border-radius: 4px;
      transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .ui-progress__fill--complete {
      background: var(--ui-success-fill);
    }
  `,
})
export class ProgressComponent {
  readonly value = input(0);
  readonly max = input(100);
  readonly size = input<'sm' | 'md'>('sm');

  protected readonly percent = computed(() => {
    const max = this.max();
    if (max <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((this.value() / max) * 100)));
  });
}
