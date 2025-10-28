import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
    selector: 'app-no-steam-link',
    standalone: true,
    imports: [CommonModule, ButtonModule],
    templateUrl: './no-steam-link.component.html',
    styleUrls: ['./no-steam-link.component.css'],
})
export class NoSteamLinkComponent {
    constructor(private router: Router) { }

    goToLogin() {
        this.router.navigate(['/login']);
    }

    goHome() {
        this.router.navigate(['/']);
    }
}
