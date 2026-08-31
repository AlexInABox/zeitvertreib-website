import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-card',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (title() || subtitle()) {
      <header class="ui-card__header">
        <div class="ui-card__titles">
          <ng-content select="[uiCardIcon]" />
          <div class="ui-card__titles-text">
            @if (title()) {
              <h2 class="ui-card__title">{{ title() }}</h2>
            }
            @if (subtitle()) {
              <p class="ui-card__subtitle">{{ subtitle() }}</p>
            }
          </div>
        </div>
        <div class="ui-card__actions">
          <ng-content select="[uiCardActions]" />
        </div>
      </header>
    }
    <div class="ui-card__body" [class.ui-card__body--flush]="!padded()">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      background: var(--ui-surface);
      border: 1px solid var(--ui-border);
      border-radius: var(--ui-radius-md);
      backdrop-filter: var(--ui-blur);
      -webkit-backdrop-filter: var(--ui-blur);
      overflow: hidden;
      transition: border-color 0.2s ease;
    }

    :host(:hover) {
      border-color: var(--ui-border-strong);
    }

    .ui-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.875rem 1.125rem;
      border-bottom: 1px solid var(--ui-divider);
      background: var(--ui-header-bg);
      border-radius: var(--ui-radius-md) var(--ui-radius-md) 0 0;
    }

    .ui-card__titles {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      min-width: 0;
    }

    :host ::ng-deep [uiCardIcon] {
      flex-shrink: 0;
      font-size: 1.125rem;
    }

    .ui-card__titles-text {
      min-width: 0;
    }

    .ui-card__title {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--ui-text);
      line-height: 1.2;
    }

    .ui-card__subtitle {
      margin: 0.1rem 0 0;
      font-size: 0.725rem;
      color: var(--ui-text-faint);
    }

    .ui-card__actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .ui-card__body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem 1.125rem;
    }

    .ui-card__body--flush {
      padding: 0;
    }
  `,
})
export class CardComponent {
  readonly title = input<string>();
  readonly subtitle = input<string>();
  readonly padded = input(true);
}
