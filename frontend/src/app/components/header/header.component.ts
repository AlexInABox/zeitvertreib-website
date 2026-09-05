import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { RouterModule, Router } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { AuthService, SteamUser, UserData } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { NotificationCenterComponent } from '../notification-center/notification-center.component';

import { SupportService } from '../../services/support.service';

@Component({
  selector: 'app-header',
  imports: [RouterModule, ButtonModule, AvatarModule, AvatarGroupModule, FormsModule, NotificationCenterComponent],
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./header.component.css'],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class HeaderComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  themeService = inject(ThemeService);
  private http = inject(HttpClient);
  private supportService = inject(SupportService);
  private router = inject(Router);

  items: MenuItem[] | undefined;
  userLoggedIn = false;
  avatarIcon = '';
  currentUser: SteamUser | null = null;
  isFakerankAdmin = false;
  isUserManagementAdmin = false;
  activeDropdown: string | null = null;
  private authSubscription?: Subscription;
  private userDataSubscription?: Subscription;

  get logoSrc(): string {
    return this.themeService.isDark() ? 'inverted/logo_full_1to1.svg' : 'logo_full_1to1.svg';
  }

  toggleDropdown(label: string | undefined, event: Event) {
    // Only toggle on click if we are on a small screen or touch device
    // On desktop, hover still works via CSS
    if (!label) return;
    event.stopPropagation();
    if (this.activeDropdown === label) {
      this.activeDropdown = null;
    } else {
      this.activeDropdown = label;
    }
  }

  onSubItemClick(subItem: MenuItem, event: Event) {
    event.stopPropagation();
    this.activeDropdown = null;
    if (subItem.command) {
      subItem.command({ originalEvent: event, item: subItem });
    }
  }

  /**
   * In the testui pager (dashboard -> games), clicking "Spiele" scrolls to the
   * games screen without leaving the page. Everywhere else it navigates normally.
   */
  private openGames() {
    const onDashboard =
      this.router.url.split('?')[0] === '/dashboard' || this.router.url.startsWith('/dashboard');
    const testUiActive = typeof document !== 'undefined' && document.body.classList.contains('testui');

    if (!testUiActive) {
      void this.router.navigate(['/games']);
      return;
    }

    if (onDashboard) {
      window.dispatchEvent(new CustomEvent('testui-open-games'));
    } else {
      // Land on the dashboard with a marker so it opens the games screen once loaded.
      void this.router.navigate(['/dashboard'], { queryParams: { screen: 'games' } });
    }
  }

  onDocumentClick(_event: MouseEvent) {
    this.activeDropdown = null;
  }

  ngOnInit() {
    this.updateMenuItems();

    // Subscribe to user authentication status
    this.authSubscription = this.authService.currentUser$.subscribe((user: SteamUser | null) => {
      this.currentUser = user;
      this.userLoggedIn = !!user;
      this.avatarIcon = user?.avatarUrl || '';
      this.checkUserManagementAccess(); // Check access when user logs in/out
    });

    // Subscribe to user data changes (including fakerank admin status)
    this.userDataSubscription = this.authService.currentUserData$.subscribe((_userData: UserData | null) => {
      this.isFakerankAdmin = this.authService.isFakerankAdmin();
      this.checkUserManagementAccess(); // Check user management access when user data changes
      this.updateMenuItems(); // Update menu items when admin status changes
    });
  }

  toggleTheme() {
    this.themeService.toggleDarkMode();
  }

  private updateMenuItems() {
    this.items = [
      {
        label: 'Startseite',
        icon: PrimeIcons.HOME,
        route: '/',
      },
      {
        label: 'Dashboard & Spiele',
        icon: PrimeIcons.USER,
        items: [
          {
            label: 'Dashboard',
            icon: PrimeIcons.USER,
            route: '/dashboard',
          },
          {
            label: 'Spiele',
            icon: PrimeIcons.POWER_OFF,
            command: () => this.openGames(),
          },
        ],
      },
      {
        label: 'Spenden',
        icon: PrimeIcons.HEART,

        items: [
          {
            label: 'Unterstützen',
            icon: PrimeIcons.HEART,
            command: () => this.supportService.expand(true),
          },
          {
            label: 'Paysafecard',
            icon: PrimeIcons.CREDIT_CARD,
            route: '/paysafecard',
          },
        ],
      },
      {
        label: 'Hilfe!',
        icon: PrimeIcons.EXCLAMATION_TRIANGLE,
        items: [
          {
            label: 'Z.E.I.T.',
            icon: PrimeIcons.SEARCH,
            route: '/zeit',
          },
          {
            label: 'Permissions?',
            icon: PrimeIcons.TABLE,
            route: '/permissions',
          },
          {
            label: 'Cases',
            icon: PrimeIcons.FOLDER,
            route: '/cases',
          },
          {
            label: 'Melden',
            icon: PrimeIcons.FLAG,
            route: '/reporting',
          },
        ],
      },

      {
        label: 'Bewerben',
        icon: PrimeIcons.PAPERCLIP,
        url: '/bewerben',
      },
    ];

    // Check visibility window: show adventcalendar from Nov 15 through December (German timezone)
    const nowGerman = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    const currentMonth = nowGerman.getMonth() + 1; // 0-indexed
    const currentDay = nowGerman.getDate();

    const visible = currentMonth === 12 || (currentMonth === 11 && currentDay >= 15);
    if (visible) {
      this.items.push({
        label: 'Adventskalender',
        icon: PrimeIcons.GIFT,
        route: '/advent',
      });
    }
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.authSubscription = undefined;
    this.userDataSubscription?.unsubscribe();
    this.userDataSubscription = undefined;
  }

  private checkUserManagementAccess() {
    this.isUserManagementAdmin = this.userLoggedIn && this.authService.isTeam();
    this.updateMenuItems();
  }

  login() {
    this.authService.login();
  }

  logout() {
    this.authService.performLogout();
    location.reload();
  }
}
