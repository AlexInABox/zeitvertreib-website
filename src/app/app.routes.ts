import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'accounting',
    loadComponent: () => import('./accounting/accounting.component').then((m) => m.AccountingComponent)
  }
];