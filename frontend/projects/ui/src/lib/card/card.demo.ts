import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BadgeComponent } from '../badge/badge.component';
import { ButtonComponent } from '../button/button.component';
import { CardComponent } from './card.component';
import type { UiDemoEntry } from '../registry';

@Component({
  selector: 'ui-demo-card-header',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CardComponent, BadgeComponent, ButtonComponent],
  template: `
    <ui-card title="Profil" subtitle="Persönliche Daten">
      <span class="card-icon" uiCardIcon>◆</span>
      <ui-button variant="ghost" size="xs" uiCardActions>Bearbeiten</ui-button>
      <p class="text">Karten mit Titel, Untertitel, Icon-Slot und Aktions-Slot.</p>
      <ui-badge variant="success">Verifiziert</ui-badge>
    </ui-card>
  `,
  styles: `
    :host {
      display: block;
      max-width: 420px;
    }

    .card-icon {
      color: var(--ui-violet-soft);
    }

    .text {
      margin: 0;
      color: var(--ui-text-soft);
      font-size: 0.85rem;
      line-height: 1.5;
    }
  `,
})
class CardHeaderDemo {}

@Component({
  selector: 'ui-demo-card-flush',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CardComponent],
  template: `
    <ui-card [padded]="false">
      <ul class="list">
        <li class="list__item">Rang: Owner</li>
        <li class="list__item">Spielzeit: 1.337 h</li>
        <li class="list__item">Karma: 87 / 100</li>
      </ul>
    </ui-card>
  `,
  styles: `
    :host {
      display: block;
      max-width: 420px;
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .list__item {
      padding: 0.75rem 1.125rem;
      border-bottom: 1px solid var(--ui-divider);
      color: var(--ui-text-soft);
      font-size: 0.85rem;
    }

    .list__item:last-child {
      border-bottom: none;
    }
  `,
})
class CardFlushDemo {}

export const demos: UiDemoEntry[] = [
  {
    title: 'Header & Slots',
    component: CardHeaderDemo,
    code: `<ui-card title="Profil" subtitle="Persönliche Daten">
  <span uiCardIcon>◆</span>
  <ui-button variant="ghost" size="xs" uiCardActions>Bearbeiten</ui-button>
  <p>Karteninhalt…</p>
  <ui-badge variant="success">Verifiziert</ui-badge>
</ui-card>`,
  },
  {
    title: 'Flush (padded=false)',
    component: CardFlushDemo,
    code: `<ui-card [padded]="false">
  <ul>
    <li>Rang: Owner</li>
    <li>Spielzeit: 1.337 h</li>
    <li>Karma: 87 / 100</li>
  </ul>
</ui-card>`,
  },
];
