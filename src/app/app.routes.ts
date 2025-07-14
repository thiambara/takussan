import {Routes} from '@angular/router';
import {notAuthGuard} from "./core/guards/not-auth.guard";

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  // {
  //   'path': 'dashboard',
  //   loadChildren: () => import('./core/layouts/dashboard/dashboard.routes').then(m => m.routes),
  // },
  {
    'path': 'dashboard',
    loadChildren: () => import('./core/layouts/layout2/layout2.routes').then(m => m.routes),
  },
  {
    'path': 'login',
    canActivate: [notAuthGuard],
    loadComponent: () => import('./pages/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    'path': 'sign-up',
    canActivate: [notAuthGuard],
    loadComponent: () => import('./pages/auth/sign-up/sign-up.component').then(m => m.SignUpComponent)
  }
];
