import { Component, OnInit, ɵɵqueryRefresh } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { Button, ButtonModule } from 'primeng/button'; import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { TieredMenuModule } from 'primeng/tieredmenu';
import { firstValueFrom } from 'rxjs';

import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-header',
  imports: [Menubar, CommonModule, RouterModule, ButtonModule, AvatarModule, AvatarGroupModule, TieredMenuModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit {
  items: MenuItem[] | undefined;
  userItems: MenuItem[] | undefined;
  isDarkMode: boolean = false;
  inverted: string = "logo_full_1to1_inverted.png";
  userLoggedIn: boolean = false;
  avatarIcon: string = "";

  constructor(private http: HttpClient) {
    this.applyDarkModePreference();
    this.checkAuthStatus();
  }


  ngOnInit() {
    this.items = [
      {
        label: 'Home',
        icon: PrimeIcons.HOME,
        route: '/'
      },
      {
        label: 'YouTube',
        icon: PrimeIcons.VIDEO,
        route: '/youtube'
      },
      {
        label: 'Accounting',
        icon: PrimeIcons.WALLET,
        route: '/accounting'
      },
      {
        label: 'Dashboard',
        icon: PrimeIcons.USER,
        route: '/dashboard'
      },
    ];
  }

  toggleDarkMode() {
    const element = document.querySelector('html');

    if (element) {
      this.isDarkMode = element.classList.toggle('my-app-dark');


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

  checkAuthStatus(): void {
    this.http.get(`${environment.apiUrl}/auth/status`, { observe: 'response', withCredentials: true, responseType: 'text', headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } })
      .subscribe({
        next: response => {
          if (response.status === 200) {
            this.userLoggedIn = true;
            this.avatarIcon = JSON.parse(response.body as string).avatarIcon;

            this.userItems = [
              {
                label: 'Settings',
                icon: PrimeIcons.COG,
                items: [
                  {
                    label: 'Delete Account',
                    icon: PrimeIcons.TIMES,
                    command: () => {
                      this.requestDeletion();
                    }
                  },
                ]
              },
              {
                separator: true
              },
              {
                label: 'Logout',
                icon: PrimeIcons.ARROW_LEFT,
                command: () => {
                  this.logout();
                }
              }
            ]
          }
        },
        error: (e) => {
          console.log(e);
          this.userLoggedIn = false;
          this.userItems = [
            {
              label: 'Login with Steam!',
              icon: PrimeIcons.USER,
              command: () => {
                this.login();
              }
            }
          ]
        }
      });
  }
  login() {
    window.location.href = `${environment.apiUrl}/auth/login`;
  }
  async logout() {
    try {
      await firstValueFrom(this.http.get(`${environment.apiUrl}/auth/logout`, { withCredentials: true }));
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      location.reload();
    }
  }
  async requestDeletion() {
    try {
      await firstValueFrom(this.http.get(`${environment.apiUrl}/pleaseDelete`, { withCredentials: true }));
    } catch (error) {
      console.error('Account deletion request failed:', error);
    } finally {
      location.reload();
    }
  }
}
