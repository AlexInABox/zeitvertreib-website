import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { IconComponent } from '../../../components/icon/icon.component';

/** Shows an active coin-sending restriction on a viewed account. */
@Component({
  selector: 'app-coin-restriction',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './coin-restriction.component.html',
  styleUrls: ['./coin-restriction.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CoinRestrictionComponent {
  coinRestriction = input<any>();

  getDateDisplay(timestamp?: number): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
