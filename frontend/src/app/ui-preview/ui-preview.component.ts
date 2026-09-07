import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BadgeComponent, UI_REGISTRY } from '@app/ui';
import { UiDemoFrameComponent } from './ui-demo-frame.component';

@Component({
  selector: 'app-ui-preview',
  imports: [BadgeComponent, UiDemoFrameComponent],
  templateUrl: './ui-preview.component.html',
  styleUrl: './ui-preview.component.css',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class UiPreviewComponent {
  protected readonly registry = UI_REGISTRY;

  protected scrollTo(selector: string): void {
    document.getElementById(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
