import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'advent',
    loadComponent: () => import('./advent-calendar/advent-calendar.component').then((m) => m.AdventCalendarComponent),
    canActivate: [authGuard],
  },
  {
    path: 'paysafecard',
    loadComponent: () => import('./paysafecard/paysafecard.component').then((m) => m.PaysafecardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'coin_managment',
    loadComponent: () => import('./coin-managment/coin-managment.component').then((m) => m.CoinManagmentComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'cases',
    loadComponent: () => import('./case-management/case-management.component').then((m) => m.CaseManagementComponent),
  },
  {
    path: 'cases/:id',
    loadComponent: () => import('./case-detail/case-detail.component').then((m) => m.CaseDetailComponent),
    // No guard - public route
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'no-steam-link',
    loadComponent: () => import('./no-steam-link/no-steam-link.component').then((m) => m.NoSteamLinkComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./auth-callback/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
];
