import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'accounting',
    loadComponent: () => import('./accounting/accounting.component').then((m) => m.AccountingComponent)
  },
  {
    path: 'youtube',
    loadComponent: () => import('./youtube/youtube.component').then((m) => m.YoutubeComponent)
  },
  {
    path: '',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent)
  },
];