import { Component, OnInit, OnDestroy } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { Button, ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { AuthService, SteamUser } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  imports: [Menubar, CommonModule, RouterModule, ButtonModule, AvatarModule, AvatarGroupModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  items: MenuItem[] | undefined;
  inverted: string = "logo_full_1to1.svg";
  userLoggedIn: boolean = false;
  avatarIcon: string = "";
  currentUser: SteamUser | null = null;
  private authSubscription?: Subscription;

  constructor(private authService: AuthService) {
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
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }

  login() {
    this.authService.login();
  }

  logout() {
    this.authService.performLogout();
    location.reload();
  }
}
