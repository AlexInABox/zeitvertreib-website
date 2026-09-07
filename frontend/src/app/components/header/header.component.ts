import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { RouterModule } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { AuthService, SteamUser, UserData } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { NotificationCenterComponent } from '../notification-center/notification-center.component';

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

  items: MenuItem[] | undefined;
  userLoggedIn = false;
  avatarIcon = '';
  currentUser: SteamUser | null = null;
  isFakerankAdmin = false;
  isUserManagementAdmin = false;
  activeDropdown: string | null = null;
  private authSubscription?: Subscription;
  private userDataSubscription?: Subscription;

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

  private updateMenuItems() {
    this.items = [
      {
        label: 'Startseite',
        icon: PrimeIcons.HOME,
        route: '/',
      },
      {
        label: 'Dashboard',
        icon: PrimeIcons.USER,
        route: '/dashboard',
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
