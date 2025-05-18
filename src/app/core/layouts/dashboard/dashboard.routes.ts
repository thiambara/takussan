import {Routes} from '@angular/router';
import {authGuard} from "../../guards/auth.guard";

export const routes: Routes = [
  {
    'path': '',
    canActivate: [authGuard],
    loadComponent: () => import('./dashboard.layout').then(m => m.DashboardLayout),
    children: [
      {
        'path': '',
        redirectTo: 'properties',
        pathMatch: 'full'
      },
      {
        'path': 'home',
        loadComponent: () => import('../../../pages/dashboard/home/home.component').then(m => m.HomeComponent)
      },
      {
        path: 'properties',
        loadChildren: () => import('../../../pages/dashboard/properties/properties.routes').then(m => m.routes),
      },
      {
        path: 'customers',
        loadChildren: () => import('../../../pages/dashboard/customers/customers.routes').then(m => m.routes),
      }
    ]
  },
];
