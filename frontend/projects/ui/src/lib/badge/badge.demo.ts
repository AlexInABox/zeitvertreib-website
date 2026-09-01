import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BadgeComponent } from './badge.component';
import type { UiDemoEntry } from '../registry';

@Component({
  selector: 'ui-demo-badge-variants',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [BadgeComponent],
  template: `
    <div class="row">
      <ui-badge variant="neutral">Neutral</ui-badge>
      <ui-badge variant="success">Success</ui-badge>
      <ui-badge variant="warning">Warning</ui-badge>
      <ui-badge variant="danger">Danger</ui-badge>
      <ui-badge variant="info">Info</ui-badge>
      <ui-badge variant="pink">Pink</ui-badge>
      <ui-badge variant="admin">Admin</ui-badge>
      <ui-badge variant="rule">Rule 12</ui-badge>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
  `,
})
class BadgeVariantsDemo {}

export const demos: UiDemoEntry[] = [
  {
    title: 'Variants',
    component: BadgeVariantsDemo,
    code: `<ui-badge variant="neutral">Neutral</ui-badge>
<ui-badge variant="success">Success</ui-badge>
<ui-badge variant="warning">Warning</ui-badge>
<ui-badge variant="danger">Danger</ui-badge>
<ui-badge variant="info">Info</ui-badge>
<ui-badge variant="pink">Pink</ui-badge>
<ui-badge variant="admin">Admin</ui-badge>
<ui-badge variant="rule">Rule 12</ui-badge>`,
  },
];
