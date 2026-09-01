import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ButtonComponent } from './button.component';
import type { UiDemoEntry } from '../registry';

@Component({
  selector: 'ui-demo-button-variants',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ButtonComponent],
  template: `
    <div class="row">
      <ui-button variant="primary">Primary</ui-button>
      <ui-button variant="secondary">Secondary</ui-button>
      <ui-button variant="success">Success</ui-button>
      <ui-button variant="info">Info</ui-button>
      <ui-button variant="danger">Danger</ui-button>
      <ui-button variant="ghost">Ghost</ui-button>
      <ui-button variant="icon" aria-label="Schließen">✕</ui-button>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }
  `,
})
class ButtonVariantsDemo {}

@Component({
  selector: 'ui-demo-button-sizes',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ButtonComponent],
  template: `
    <div class="row">
      <ui-button size="xs" variant="primary">Extra klein</ui-button>
      <ui-button size="sm" variant="primary">Klein</ui-button>
      <ui-button variant="primary">Mittel</ui-button>
      <ui-button size="lg" variant="primary">Groß</ui-button>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }
  `,
})
class ButtonSizesDemo {}

@Component({
  selector: 'ui-demo-button-states',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ButtonComponent],
  template: `
    <div class="col">
      <div class="row">
        <ui-button variant="primary" [loading]="loading()" (click)="startLoading()">Lädt bei Klick</ui-button>
        <ui-button variant="secondary" [disabled]="true">Deaktiviert</ui-button>
        <ui-button variant="success">Annehmen</ui-button>
        <ui-button variant="danger">Ablehnen</ui-button>
      </div>
      <ui-button variant="primary" [full]="true">Volle Breite</ui-button>
    </div>
  `,
  styles: `
    .col {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }
  `,
})
class ButtonStatesDemo {
  loading = signal(false);

  startLoading(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    setTimeout(() => this.loading.set(false), 2000);
  }
}

export const demos: UiDemoEntry[] = [
  {
    title: 'Variants',
    component: ButtonVariantsDemo,
    code: `<ui-button variant="primary">Primary</ui-button>
<ui-button variant="secondary">Secondary</ui-button>
<ui-button variant="success">Success</ui-button>
<ui-button variant="info">Info</ui-button>
<ui-button variant="danger">Danger</ui-button>
<ui-button variant="ghost">Ghost</ui-button>
<ui-button variant="icon" aria-label="Schließen">✕</ui-button>`,
  },
  {
    title: 'Sizes',
    component: ButtonSizesDemo,
    code: `<ui-button size="xs" variant="primary">Extra klein</ui-button>
<ui-button size="sm" variant="primary">Klein</ui-button>
<ui-button variant="primary">Mittel</ui-button>
<ui-button size="lg" variant="primary">Groß</ui-button>`,
  },
  {
    title: 'States',
    component: ButtonStatesDemo,
    code: `<ui-button variant="primary" [loading]="loading()" (click)="startLoading()">Lädt bei Klick</ui-button>
<ui-button variant="secondary" [disabled]="true">Deaktiviert</ui-button>
<ui-button variant="primary" [full]="true">Volle Breite</ui-button>`,
  },
];
