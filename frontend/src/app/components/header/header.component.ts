import { Component, OnInit, OnDestroy } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { AuthService, SteamUser, UserData } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  imports: [Menubar, CommonModule, RouterModule, ButtonModule, AvatarModule, AvatarGroupModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, OnDestroy {
  items: MenuItem[] | undefined;
  inverted: string = 'logo_full_1to1.svg';
  userLoggedIn: boolean = false;
  avatarIcon: string = '';
  currentUser: SteamUser | null = null;
  isFakerankAdmin: boolean = false;
  private authSubscription?: Subscription;
  private userDataSubscription?: Subscription;

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.updateMenuItems();

    // Subscribe to user authentication status
    this.authSubscription = this.authService.currentUser$.subscribe((user: SteamUser | null) => {
      this.currentUser = user;
      this.userLoggedIn = !!user;
      this.avatarIcon = user?.avatarfull || '';
    });

    // Subscribe to user data changes (including fakerank admin status)
    this.userDataSubscription = this.authService.currentUserData$.subscribe((_userData: UserData | null) => {
      this.isFakerankAdmin = this.authService.isFakerankAdmin();
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
        label: 'Ko-fi',
        icon: PrimeIcons.HEART,
        url: 'https://ko-fi.com/zeitvertreib',
        target: '_blank',
      },

      {
        label: 'Dashboard',
        icon: PrimeIcons.USER,
        route: '/dashboard',
      },
      {
        label: 'Cases',
        icon: PrimeIcons.FOLDER,
        route: '/cases',
      },
      {
        label: 'Bewerben',
        icon: PrimeIcons.PAPERCLIP,
        url: '/bewerben',
      },
    ];

    // Add fakerank admin dashboard if user has privileges
    if (this.isFakerankAdmin) {
      this.items.push({
        label: 'Fakerank Admin',
        icon: PrimeIcons.SHIELD,
        route: '/fakerank',
      });
    }
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.userDataSubscription?.unsubscribe();
  }

  login() {
    this.authService.login();
  }

  logout() {
    this.authService.performLogout();
    location.reload();
  }
}
