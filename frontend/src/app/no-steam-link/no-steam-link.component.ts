import { Component, ChangeDetectionStrategy, inject } from '@angular/core';

import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-no-steam-link',
  standalone: true,
  imports: [ButtonModule],
  templateUrl: './no-steam-link.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./no-steam-link.component.css'],
})
export class NoSteamLinkComponent {
  private router = inject(Router);

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
