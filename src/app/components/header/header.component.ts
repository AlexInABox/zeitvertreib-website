import { Component, OnInit } from '@angular/core';
import { MenuItem, PrimeIcons } from 'primeng/api';
import { Menubar } from 'primeng/menubar';
import { Button, ButtonModule } from 'primeng/button'; import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [Menubar, CommonModule, RouterModule, ButtonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit {
  items: MenuItem[] | undefined;
  isDarkMode: boolean = false;

  constructor(private router: Router) { }


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
    ];

    this.applyLogoInvert();
  }

  toggleDarkMode() {
    const element = document.querySelector('html');

    if (element) {
      this.isDarkMode = element.classList.toggle('my-app-dark');


      const logoImg = document.getElementById('logo-svg');
      if (logoImg instanceof HTMLImageElement) {
        if (this.isDarkMode) {
          logoImg.src = '/assets/logo_full_1to1_inverted.png';
        } else {
          logoImg.src = '/assets/logo_full_1to1.svg';
        }
      }

      const darkModeToggleButton = document.getElementById('darkModeToggleButton');
      if (darkModeToggleButton) {
        if (this.isDarkMode) {

        }
      }
    }
  }


  applyLogoInvert() {
    const logoImg = document.getElementById('logo-svg');
    if (logoImg instanceof HTMLImageElement) {
      if (document.body.classList.contains('my-app-dark')) {
        logoImg.src = '/assets/logo_full_1to1.svg';
      } else {
        logoImg.src = '/assets/logo_full_1to1_inverted.png';
      }
    }
  }
}
