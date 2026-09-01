import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ButtonComponent } from '../button/button.component';
import { DialogComponent } from './dialog.component';
import type { UiDemoEntry } from '../registry';

@Component({
  selector: 'ui-demo-dialog-basic',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ButtonComponent, DialogComponent],
  template: `
    <ui-button variant="primary" (click)="open.set(true)">Dialog öffnen</ui-button>
    <ui-dialog [(open)]="open" title="Aktion bestätigen">
      <p class="text">
        Möchtest du diese Aktion wirklich ausführen? Escape oder ein Klick auf den Hintergrund schließen den Dialog
        ebenfalls.
      </p>
      <div uiDialogFooter>
        <ui-button variant="primary" (click)="open.set(false)">Bestätigen</ui-button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .text {
      margin: 0;
      color: inherit;
      opacity: 0.8;
      font-size: 0.85rem;
      line-height: 1.5;
    }
  `,
})
class DialogBasicDemo {
  open = signal(false);
}

@Component({
  selector: 'ui-demo-dialog-solid',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ButtonComponent, DialogComponent],
  template: `
    <ui-button variant="secondary" (click)="open.set(true)">Solid-Dialog öffnen</ui-button>
    <ui-dialog [(open)]="open" title="Profil löschen" appearance="solid" [maxWidth]="'420px'">
      <p class="text">
        Diese Aktion kann nicht rückgängig gemacht werden. Dein Konto wird nach 30 Tagen endgültig gelöscht.
      </p>
      <div uiDialogFooter>
        <ui-button variant="primary" (click)="open.set(false)">Verstanden</ui-button>
      </div>
    </ui-dialog>
  `,
  styles: `
    .text {
      margin: 0;
      color: inherit;
      opacity: 0.8;
      font-size: 0.85rem;
      line-height: 1.5;
    }
  `,
})
class DialogSolidDemo {
  open = signal(false);
}

export const demos: UiDemoEntry[] = [
  {
    title: 'Glass',
    component: DialogBasicDemo,
    code: `<ui-button variant="primary" (click)="open.set(true)">Dialog öffnen</ui-button>

<ui-dialog [(open)]="open" title="Aktion bestätigen">
  <p>Möchtest du diese Aktion wirklich ausführen?</p>
  <div uiDialogFooter>
    <ui-button variant="primary" (click)="open.set(false)">Bestätigen</ui-button>
  </div>
</ui-dialog>`,
  },
  {
    title: 'Solid',
    component: DialogSolidDemo,
    code: `<ui-dialog [(open)]="open" title="Profil löschen" appearance="solid" [maxWidth]="420px">
  <p>Diese Aktion kann nicht rückgängig gemacht werden.</p>
  <div uiDialogFooter>
    <ui-button variant="primary" (click)="open.set(false)">Verstanden</ui-button>
  </div>
</ui-dialog>`,
  },
];
