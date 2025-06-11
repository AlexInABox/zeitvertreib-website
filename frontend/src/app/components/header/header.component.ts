import { Component, OnInit, OnDestroy } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { Button, ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TieredMenuModule } from 'primeng/tieredmenu';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { AuthService, SteamUser } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  imports: [Menubar, CommonModule, RouterModule, ButtonModule, AvatarModule, AvatarGroupModule, TieredMenuModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  items: MenuItem[] | undefined;
  userItems: MenuItem[] | undefined;
  isDarkMode: boolean = false;
  inverted: string = "logo_full_1to1_inverted.png";
  userLoggedIn: boolean = false;
  avatarIcon: string = "";
  currentUser: SteamUser | null = null;
  private authSubscription?: Subscription;

  constructor(private authService: AuthService) {
    this.applyDarkModePreference();
  }


  ngOnInit() {
    this.items = [
      {
        label: 'Startseite',
        icon: PrimeIcons.HOME,
        route: '/'
      },
      {
        label: 'YouTube',
        icon: PrimeIcons.VIDEO,
        route: '/youtube'
      },
      {
        label: 'Finanzen',
        icon: PrimeIcons.WALLET,
        route: '/accounting'
      },
      {
        label: 'Dashboard',
        icon: PrimeIcons.USER,
        route: '/dashboard'
      },
    ];

    // Auf Authentifizierungsstatusänderungen abonnieren
    this.authSubscription = this.authService.currentUser$.subscribe((user: SteamUser | null) => {
      this.currentUser = user;
      this.userLoggedIn = !!user;
      this.avatarIcon = user?.avatarfull || "";
      this.updateUserMenu();
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }

  private updateUserMenu() {
    if (this.userLoggedIn && this.currentUser) {
      this.userItems = [
        {
          label: 'Einstellungen',
          icon: PrimeIcons.COG,
          items: [
            {
              label: 'Profil',
              icon: PrimeIcons.USER,
              command: () => {
                window.open(this.currentUser?.profileurl, '_blank');
              }
            },
          ]
        },
        {
          separator: true
        },
        {
          label: 'Abmelden',
          icon: PrimeIcons.SIGN_OUT,
          command: () => {
            this.logout();
          }
        }
      ];
    } else {
      this.userItems = [
        {
          label: 'Mit Steam anmelden',
          icon: PrimeIcons.USER,
          command: () => {
            this.login();
          }
        }
      ];
    }
  }

  toggleDarkMode() {
    const element = document.querySelector('html');

    if (element) {
      //this.isDarkMode = element.classList.toggle('my-app-dark');
      this.isDarkMode = false;


      if (this.isDarkMode) {
        this.inverted = "logo_full_1to1_inverted.png";
        localStorage['theme'] = "dark";
        element.classList.add('dark');
      } else {
        this.inverted = "logo_full_1to1.svg";
        localStorage['theme'] = "light";
        element.classList.remove('dark');
      }
    }
  }

  applyDarkModePreference() {
    if (localStorage['theme'] === "dark") {
      this.inverted = "logo_full_1to1_inverted.png";
      const element = document.querySelector('html');
      if (element) {
        this.isDarkMode = element.classList.toggle('my-app-dark');
        element.classList.add('dark');
      }
    } else {
      this.inverted = "logo_full_1to1.svg";
      localStorage['theme'] = "light";

    }
  }

  login() {
    this.authService.login();
  }

  logout() {
    this.authService.performLogout();
    location.reload();
  }
}
