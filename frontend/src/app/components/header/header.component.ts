import { Component, OnInit } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { Button, ButtonModule } from 'primeng/button'; import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-header',
  imports: [Menubar, CommonModule, RouterModule, ButtonModule, AvatarModule, AvatarGroupModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit {
  items: MenuItem[] | undefined;
  isDarkMode: boolean = false;
  inverted: string = "logo_full_1to1_inverted.png";
  userLoggedIn: boolean = false;

  constructor(private router: Router, private http: HttpClient) {
    function isSystemDark(): boolean {
      return window?.matchMedia?.('(prefers-color-scheme:dark)')?.matches;
    }
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
      } else {
        this.inverted = "logo_full_1to1.svg";
        localStorage['theme'] = "light";
      }
    }
  }

  applyDarkModePreference() {
    if (localStorage['theme'] === "dark") {
      this.inverted = "logo_full_1to1_inverted.png";
      const element = document.querySelector('html');
      if (element) {
        this.isDarkMode = element.classList.toggle('my-app-dark');
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
          }
        },
        error: (e) => {
          console.log(e);
          this.userLoggedIn = false;
        }
      });
  }
}
