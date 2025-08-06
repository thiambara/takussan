import {Routes} from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard2',
    pathMatch: 'full',
  },
  {
    'path': 'client',
    loadChildren: () => import('./core/layouts/layout2/layout2.routes').then(m => m.routes),
  },
  {
    'path': 'dashboard2',
    loadChildren: () => import('./core/layouts/dashboard2/dashboard2.routes').then(m => m.routes),
  },
  {
    'path': 'login',
    // canActivate: [notAuthGuard],
    loadComponent: () => import('./pages/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    'path': 'sign-up',
    // canActivate: [notAuthGuard],
    loadComponent: () => import('./pages/auth/sign-up/sign-up.component').then(m => m.SignUpComponent)
  }
];
