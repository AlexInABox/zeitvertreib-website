import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'accounting',
    loadComponent: () => import('./accounting/accounting.component').then((m) => m.AccountingComponent),
    canActivate: [authGuard]
  },
  {
    path: 'youtube',
    loadComponent: () => import('./youtube/youtube.component').then((m) => m.YoutubeComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent)
  },
];