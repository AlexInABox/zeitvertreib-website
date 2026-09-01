import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'pink' | 'admin' | 'rule';

/** Small status badge with color variants; exposes data-variant on the host element. */
@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    '[attr.data-variant]': 'variant()',
  },
  template: `
    <span
      class="ui-badge"
      [class.ui-badge--neutral]="variant() === 'neutral'"
      [class.ui-badge--success]="variant() === 'success'"
      [class.ui-badge--warning]="variant() === 'warning'"
      [class.ui-badge--danger]="variant() === 'danger'"
      [class.ui-badge--info]="variant() === 'info'"
      [class.ui-badge--pink]="variant() === 'pink'"
      [class.ui-badge--admin]="variant() === 'admin'"
      [class.ui-badge--rule]="variant() === 'rule'"
      ><ng-content
    /></span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .ui-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.5rem;
      border-radius: var(--ui-radius-full);
      font-size: 0.7rem;
      font-weight: 600;
      white-space: nowrap;
    }

    :host ::ng-deep app-icon,
    :host ::ng-deep [uiBadgeIcon] {
      font-size: 0.65rem;
    }

    .ui-badge--neutral {
      background: rgba(255, 255, 255, 0.08);
      color: var(--ui-text-muted);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .ui-badge--success {
      background: var(--ui-success-bg);
      color: var(--ui-success);
      border: 1px solid var(--ui-success-border);
    }

    .ui-badge--warning {
      background: var(--ui-warning-bg);
      color: var(--ui-warning);
      border: 1px solid var(--ui-warning-border);
    }

    .ui-badge--danger {
      background: var(--ui-danger-bg);
      color: var(--ui-danger);
      border: 1px solid var(--ui-danger-border);
    }

    .ui-badge--info {
      background: var(--ui-info-bg);
      color: var(--ui-info);
      border: 1px solid var(--ui-info-border);
    }

    .ui-badge--pink {
      background: var(--ui-pink-bg);
      color: var(--ui-pink);
      border: 1px solid var(--ui-pink-border);
    }

    .ui-badge--admin,
    .ui-badge--rule {
      background: rgba(167, 139, 250, 0.15);
      border: 1px solid rgba(167, 139, 250, 0.3);
    }

    .ui-badge--admin {
      color: var(--ui-violet-pale);
    }

    .ui-badge--rule {
      color: var(--ui-violet-soft);
      border-color: rgba(167, 139, 250, 0.25);
      font-size: 0.65rem;
      text-transform: uppercase;
    }
  `,
})
export class BadgeComponent {
  readonly variant = input<UiBadgeVariant>('neutral');
}
