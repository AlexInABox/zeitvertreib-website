import { Component, OnDestroy, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService, SteamUser } from '../../services/auth.service';
import { Subscription, filter } from 'rxjs';

/** The shared m3 navbar: brand, hairline-divided link strip, account cell. */
@Component({
  selector: 'app-m3-nav',
  imports: [RouterModule],
  templateUrl: './m3-nav.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class M3NavComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);

  currentUrl = '/';
  user: SteamUser | null = null;

  private routerSubscription?: Subscription;
  private authSubscription?: Subscription;

  ngOnInit(): void {
    this.currentUrl = this.router.url;
    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl = (event as NavigationEnd).urlAfterRedirects;
      });
    this.authSubscription = this.authService.currentUser$.subscribe((user) => {
      this.user = user;
    });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
    this.authSubscription?.unsubscribe();
  }

  /** Seasonal nav link: advent calendar from Nov 15 through December (German timezone). */
  get showAdvent(): boolean {
    try {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
      const month = now.getMonth() + 1;
      const day = now.getDate();
      return month === 12 || (month === 11 && day >= 15);
    } catch {
      return false;
    }
  }
}
