import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-user-cases',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './user-cases.component.html',
  styleUrls: ['./user-cases.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class UserCasesComponent {
  cases = input<any[]>([]);
  title = input<string>('Cases');
  subtitle = input<string>('Zugewiesene Fälle');
  iconClass = input<string>('pi-folder-open icon-purple');
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
