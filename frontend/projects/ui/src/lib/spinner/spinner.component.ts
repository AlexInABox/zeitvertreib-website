import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type UiSpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type UiSpinnerVariant = 'accent' | 'light';

const SIZE_PX: Record<UiSpinnerSize, number> = {
  xs: 12,
  sm: 14,
  md: 28,
  lg: 32,
};

/** Loading spinner with size presets (or a custom pixel size) and accent/light variants. */
@Component({
  selector: 'ui-spinner',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <span
      class="ui-spinner"
      [style.--ui-spinner-size.px]="sizePx()"
      [class.ui-spinner--light]="variant() === 'light'"
      role="status"
      aria-hidden="true"
    ></span>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      line-height: 1;
    }

    .ui-spinner {
      display: inline-block;
      width: var(--ui-spinner-size, 1.75rem);
      height: var(--ui-spinner-size, 1.75rem);
      border: 2px solid rgba(139, 92, 246, 0.2);
      border-top-color: #8b5cf6;
      border-radius: 50%;
      animation: ui-spinner-spin 0.8s linear infinite;
    }

    .ui-spinner--light {
      border-color: rgba(255, 255, 255, 0.15);
      border-top-color: rgba(255, 255, 255, 0.8);
    }

    @keyframes ui-spinner-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class SpinnerComponent {
  readonly size = input<UiSpinnerSize | number>('md');
  readonly variant = input<UiSpinnerVariant>('accent');

  protected readonly sizePx = computed(() => {
    const size = this.size();
    return typeof size === 'number' ? size : SIZE_PX[size];
  });
}
