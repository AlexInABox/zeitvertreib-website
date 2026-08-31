import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type UiInputType = 'text' | 'number' | 'email' | 'password' | 'tel' | 'url' | 'search' | 'date' | 'time';

const INPUT_VALUE_ACCESSOR = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => InputComponent),
  multi: true,
};

@Component({
  selector: 'ui-input',
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [INPUT_VALUE_ACCESSOR],
  template: `
    <input
      class="ui-field ui-input"
      [class.ui-input--invalid]="invalid()"
      [value]="value()"
      [attr.type]="type()"
      [attr.placeholder]="placeholder()"
      [attr.maxlength]="maxlength()"
      [attr.disabled]="disabled() || isDisabled ? true : undefined"
      [attr.aria-label]="ariaLabel()"
      (input)="onInput($event)"
      (blur)="onBlur()"
    />
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .ui-input--invalid {
      border-color: var(--ui-danger);
    }

    .ui-input--invalid:focus {
      border-color: var(--ui-danger);
      box-shadow: 0 0 0 2px var(--ui-danger-bg-hover);
    }
  `,
})
export class InputComponent implements ControlValueAccessor {
  readonly type = input<UiInputType>('text');
  readonly placeholder = input<string>();
  readonly maxlength = input<number>();
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly ariaLabel = input<string>();

  private readonly valueSignal = signal('');
  protected readonly value = this.valueSignal.asReadonly();

  protected isDisabled = false;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null | undefined): void {
    this.valueSignal.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.valueSignal.set(value);
    this.onChange(value);
  }

  protected onBlur(): void {
    this.onTouched();
  }
}
