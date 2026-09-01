import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormFieldComponent } from './form-field.component';
import { InputComponent } from './input.component';
import type { UiDemoEntry } from '../registry';

@Component({
  selector: 'ui-demo-input-types',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormFieldComponent, InputComponent],
  template: `
    <div class="grid">
      <ui-form-field label="Text">
        <ui-input type="text" placeholder="Beliebiger Text" />
      </ui-form-field>
      <ui-form-field label="E-Mail">
        <ui-input type="email" placeholder="du@beispiel.de" />
      </ui-form-field>
      <ui-form-field label="Passwort">
        <ui-input type="password" placeholder="Passwort" />
      </ui-form-field>
      <ui-form-field label="Zahl">
        <ui-input type="number" placeholder="42" />
      </ui-form-field>
      <ui-form-field label="Suche">
        <ui-input type="search" placeholder="Suchen…" />
      </ui-form-field>
      <ui-form-field label="Datum">
        <ui-input type="date" />
      </ui-form-field>
      <ui-form-field label="Uhrzeit">
        <ui-input type="time" />
      </ui-form-field>
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      max-width: 640px;
    }
  `,
})
class InputTypesDemo {}

@Component({
  selector: 'ui-demo-input-binding',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormFieldComponent, InputComponent, FormsModule],
  template: `
    <div class="col">
      <ui-form-field label="Live-Bindung (ngModel)" hint="Der Wert wird als Signal gespeichert.">
        <ui-input [(ngModel)]="value" placeholder="Tippe etwas…" [maxlength]="20" />
      </ui-form-field>
      <p class="live">Wert: {{ value() }}</p>
      <ui-form-field label="Deaktiviert">
        <ui-input [disabled]="true" placeholder="Nicht editierbar" />
      </ui-form-field>
    </div>
  `,
  styles: `
    .col {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 360px;
    }

    .live {
      margin: 0;
      font-size: 0.85rem;
      color: var(--ui-text-soft);
    }
  `,
})
class InputBindingDemo {
  value = signal('Hallo Welt');
}

export const demos: UiDemoEntry[] = [
  {
    title: 'Typen',
    component: InputTypesDemo,
    code: `<ui-form-field label="E-Mail">
  <ui-input type="email" placeholder="du@beispiel.de" />
</ui-form-field>
<ui-form-field label="Zahl">
  <ui-input type="number" placeholder="42" />
</ui-form-field>
<ui-form-field label="Datum">
  <ui-input type="date" />
</ui-form-field>`,
  },
  {
    title: 'Binding & States',
    component: InputBindingDemo,
    code: `<ui-form-field label="Live-Bindung (ngModel)">
  <ui-input [(ngModel)]="value" [maxlength]="20" />
</ui-form-field>

<ui-form-field label="Deaktiviert">
  <ui-input [disabled]="true" placeholder="Nicht editierbar" />
</ui-form-field>`,
  },
];
