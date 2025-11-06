import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { fakerankAdminGuard } from './guards/fakerank-admin.guard';

export const routes: Routes = [
  {
    path: 'accounting',
    loadComponent: () =>
      import('./accounting/accounting.component').then(
        (m) => m.AccountingComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'youtube',
    loadComponent: () =>
      import('./youtube/youtube.component').then((m) => m.YoutubeComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'fakerank',
    loadComponent: () =>
      import('./fakerank-admin/fakerank-admin.component').then(
        (m) => m.FakerankAdminComponent,
      ),
    canActivate: [fakerankAdminGuard],
  },
  {
    path: 'cases',
    loadComponent: () =>
      import('./case-management/case-management.component').then(
        (m) => m.CaseManagementComponent,
      ),
    canActivate: [fakerankAdminGuard],
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./profile/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'no-steam-link',
    loadComponent: () =>
      import('./no-steam-link/no-steam-link.component').then(
        (m) => m.NoSteamLinkComponent,
      ),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./auth-callback/auth-callback.component').then(
        (m) => m.AuthCallbackComponent,
      ),
  },
  {
    path: '',
    loadComponent: () =>
      import('./home/home.component').then((m) => m.HomeComponent),
  },
];
