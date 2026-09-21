import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { IconComponent } from '../../../components/icon/icon.component';

/** Compact moderation counters for a viewed account. */
@Component({
  selector: 'app-moderation-summary',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './moderation-summary.component.html',
  styleUrls: ['./moderation-summary.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ModerationSummaryComponent {
  moderation = input<any>();
  casesCount = input<number>(0);
}
