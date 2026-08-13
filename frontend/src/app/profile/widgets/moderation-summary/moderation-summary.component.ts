import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-moderation-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './moderation-summary.component.html',
  styleUrls: ['./moderation-summary.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ModerationSummaryComponent {
  moderation = input<any>();
  casesCount = input<number>(0);
}
