import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BadgeComponent, UI_REGISTRY } from '@app/ui';
import { ThemeService } from '../services/theme.service';
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

  private readonly themeService = inject(ThemeService);
  protected readonly isDark = this.themeService.isDark;

  protected toggleTheme(): void {
    this.themeService.toggleDarkMode();
  }

  protected scrollTo(selector: string): void {
    document.getElementById(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
