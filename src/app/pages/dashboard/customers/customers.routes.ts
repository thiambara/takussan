import {Routes} from '@angular/router';

export const routes: Routes = [
  {
    'path': '',
    loadComponent: () => import('./customers.component').then(m => m.CustomersComponent),
  },
  {
    'path': 'edit/:id',
    loadComponent: () => import('./customer-edit/customer-edit.component').then(m => m.CustomerEditComponent),
  },
  {
    'path': ':id',
    loadComponent: () => import('./customer-details/customer-details.component').then(m => m.CustomerDetailsComponent),
  },
];
