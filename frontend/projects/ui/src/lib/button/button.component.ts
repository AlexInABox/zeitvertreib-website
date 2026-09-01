import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SpinnerComponent } from '../spinner/spinner.component';

export type UiButtonVariant = 'primary' | 'secondary' | 'success' | 'info' | 'danger' | 'ghost' | 'icon';
export type UiButtonSize = 'xs' | 'sm' | 'md' | 'lg';

/** Button with color variants, four sizes, full-width mode and an inline loading spinner. */
@Component({
  selector: 'ui-button',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SpinnerComponent],
  template: `
    <button
      class="ui-button"
      [class.ui-button--primary]="variant() === 'primary'"
      [class.ui-button--secondary]="variant() === 'secondary'"
      [class.ui-button--success]="variant() === 'success'"
      [class.ui-button--info]="variant() === 'info'"
      [class.ui-button--danger]="variant() === 'danger'"
      [class.ui-button--ghost]="variant() === 'ghost'"
      [class.ui-button--icon]="variant() === 'icon'"
      [class.ui-button--xs]="size() === 'xs'"
      [class.ui-button--sm]="size() === 'sm'"
      [class.ui-button--lg]="size() === 'lg'"
      [class.ui-button--full]="full()"
      [disabled]="disabled() || loading()"
      [attr.type]="type()"
      [attr.aria-busy]="loading()"
    >
      @if (loading()) {
        <ui-spinner size="sm" variant="light" />
      } @else {
        <ng-content />
      }
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .ui-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.45rem 0.875rem;
      border-radius: var(--ui-radius-sm);
      font-family: inherit;
      font-size: 0.8125rem;
      font-weight: 500;
      line-height: 1.2;
      color: var(--ui-text);
      background: transparent;
      border: none;
      white-space: nowrap;
      cursor: pointer;
      transition: var(--ui-transition);
    }

    .ui-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .ui-button--primary {
      background: var(--ui-primary-grad);
      color: var(--ui-primary-contrast);
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: var(--ui-primary-shadow);
    }

    .ui-button--primary:hover:not(:disabled) {
      background: var(--ui-primary-grad-hover);
      box-shadow: var(--ui-primary-shadow-hover);
    }

    .ui-button--secondary {
      background: var(--ui-surface-soft);
      color: var(--ui-text-soft);
      border: 1px solid var(--ui-border-soft);
    }

    .ui-button--secondary:hover:not(:disabled) {
      background: var(--ui-surface-hover);
      color: var(--ui-text);
    }

    .ui-button--success {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #ffffff;
      border: none;
    }

    .ui-button--success:hover:not(:disabled) {
      background: linear-gradient(135deg, #059669, #047857);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }

    .ui-button--info {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: #ffffff;
      border: none;
    }

    .ui-button--info:hover:not(:disabled) {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .ui-button--danger {
      background: var(--ui-danger-bg);
      color: var(--ui-danger);
      border: 1px solid var(--ui-danger-border);
    }

    .ui-button--danger:hover:not(:disabled) {
      background: var(--ui-danger-bg-hover);
    }

    .ui-button--ghost {
      color: var(--ui-text-soft);
    }

    .ui-button--ghost:hover:not(:disabled) {
      background: var(--ui-surface-hover);
      color: var(--ui-text);
    }

    .ui-button--icon {
      width: 28px;
      height: 28px;
      padding: 0;
      flex-shrink: 0;
      background: var(--ui-surface-subtle);
      color: var(--ui-text-muted);
      border: 1px solid var(--ui-border-soft);
    }

    .ui-button--icon:hover:not(:disabled) {
      background: var(--ui-surface-hover);
      color: var(--ui-text);
    }

    .ui-button--sm {
      padding: 0.35rem 0.65rem;
      font-size: 0.75rem;
    }

    .ui-button--xs {
      padding: 0.2rem 0.45rem;
      font-size: 0.7rem;
      border-radius: var(--ui-radius-xs);
    }

    .ui-button--lg {
      padding: 0.7rem 1.25rem;
      font-size: 0.9rem;
    }

    .ui-button--full {
      width: 100%;
    }
  `,
})
export class ButtonComponent {
  readonly variant = input<UiButtonVariant>('primary');
  readonly size = input<UiButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly full = input(false, { transform: booleanAttribute });
}
