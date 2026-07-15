import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { AuthService, SteamUser, UserData } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { NotificationCenterComponent } from '../notification-center/notification-center.component';

@Component({
  selector: 'app-header',
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    AvatarModule,
    AvatarGroupModule,
    FormsModule,
    NotificationCenterComponent,
  ],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  items: MenuItem[] | undefined;
  userLoggedIn = false;
  avatarIcon = '';
  currentUser: SteamUser | null = null;
  isFakerankAdmin = false;
  isUserManagementAdmin = false;
  activeDropdown: string | null = null;
  private authSubscription?: Subscription;
  private userDataSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    public themeService: ThemeService,
    private http: HttpClient,
  ) {}

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

  @HostListener('document:click', ['$event'])
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
            route: '/games',
          },
        ],
      },
      {
        label: 'Spenden',
        icon: PrimeIcons.HEART,

        items: [
          {
            label: 'Online-Spende',
            icon: PrimeIcons.HEART,
            route: '/support',
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
    if (!this.userLoggedIn) {
      this.isUserManagementAdmin = false;
      this.updateMenuItems();
      return;
    }

    const token = this.authService.getSessionToken();
    if (!token) {
      this.isUserManagementAdmin = false;
      this.updateMenuItems();
      return;
    }

    this.http
      .get<{ hasAccess: boolean }>(`${environment.apiUrl}/user-management/access`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .subscribe({
        next: (response) => {
          this.isUserManagementAdmin = response.hasAccess;
          this.updateMenuItems();
        },
        error: () => {
          this.isUserManagementAdmin = false;
          this.updateMenuItems();
        },
      });
  }

  login() {
    this.authService.login();
  }

  logout() {
    this.authService.performLogout();
    location.reload();
  }
}
