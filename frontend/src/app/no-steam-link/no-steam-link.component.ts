import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../components/icon/icon.component';
import { JuleNavComponent } from '../components/jule-nav/jule-nav.component';
import { JuleFooterComponent } from '../components/jule-footer/jule-footer.component';

/** Shown when the signed-in Discord account has no linked Steam account. */
@Component({
  selector: 'app-no-steam-link',
  standalone: true,
  imports: [IconComponent, JuleNavComponent, JuleFooterComponent],
  templateUrl: './no-steam-link.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./no-steam-link.component.css'],
})
export class NoSteamLinkComponent implements OnInit, OnDestroy {
  private router = inject(Router);

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
