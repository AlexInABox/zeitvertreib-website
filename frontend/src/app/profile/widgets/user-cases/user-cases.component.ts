import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IconComponent, type IconName } from '../../../components/icon/icon.component';

/** Case list widget, reused for linked and self-created cases. */
@Component({
  selector: 'app-user-cases',
  standalone: true,
  imports: [RouterModule, IconComponent],
  templateUrl: './user-cases.component.html',
  styleUrls: ['./user-cases.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class UserCasesComponent {
  cases = input<any[]>([]);
  title = input<string>('Cases');
  subtitle = input<string>('Zugewiesene Fälle');
  iconName = input<IconName>('folder-open');
  isCreatedCases = input<boolean>(false);

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
