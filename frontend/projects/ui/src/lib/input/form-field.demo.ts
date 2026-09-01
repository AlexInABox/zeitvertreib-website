import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormFieldComponent } from './form-field.component';
import { InputComponent } from './input.component';
import type { UiDemoEntry } from '../registry';

@Component({
  selector: 'ui-demo-form-field',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormFieldComponent, InputComponent],
  template: `
    <div class="grid">
      <ui-form-field label="E-Mail-Adresse" hint="Wir senden dir keine Werbung.">
        <ui-input type="email" placeholder="du@beispiel.de" />
      </ui-form-field>
      <ui-form-field label="Passwort" error="Das Passwort ist zu kurz.">
        <ui-input type="password" placeholder="Passwort" [invalid]="true" />
      </ui-form-field>
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      max-width: 520px;
    }
  `,
})
class FormFieldDemo {}

export const demos: UiDemoEntry[] = [
  {
    title: 'Label, Hint & Error',
    component: FormFieldDemo,
    code: `<ui-form-field label="E-Mail-Adresse" hint="Wir senden dir keine Werbung.">
  <ui-input type="email" placeholder="du@beispiel.de" />
</ui-form-field>

<ui-form-field label="Passwort" error="Das Passwort ist zu kurz.">
  <ui-input type="password" placeholder="Passwort" [invalid]="true" />
</ui-form-field>`,
  },
];
