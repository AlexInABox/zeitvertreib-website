import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-form-field',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <label class="ui-form-field">
      @if (label()) {
        <span class="ui-form-field__label">{{ label() }}</span>
      }
      <ng-content />
      @if (hint()) {
        <span class="ui-form-field__hint">{{ hint() }}</span>
      }
      @if (error()) {
        <span class="ui-form-field__error">{{ error() }}</span>
      }
    </label>
  `,
  styles: `
    :host {
      display: block;
    }

    .ui-form-field {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      width: 100%;
    }

    .ui-form-field__label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--ui-text-soft);
    }

    .ui-form-field__hint {
      font-size: 0.75rem;
      color: var(--ui-text-muted);
    }

    .ui-form-field__error {
      font-size: 0.75rem;
      color: var(--ui-danger);
    }
  `,
})
export class FormFieldComponent {
  readonly label = input<string>();
  readonly hint = input<string>();
  readonly error = input<string>();
}
