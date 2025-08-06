import {Routes} from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./dashboard2.component').then(m => m.Dashboard2Component),
    children: [
      // Default route redirects to dashboard
      {path: '', redirectTo: 'overview', pathMatch: 'full'},

      // Dashboard routes
      {
        path: 'overview',
        loadComponent: () => import('./pages/overview/dashboard2-overview.component').then(m => m.Dashboard2OverviewComponent)
      },
      {
        path: 'analytics',
        loadComponent: () => import('./pages/analytics/dashboard2-analytics.component').then(m => m.Dashboard2AnalyticsComponent)
      },

      // Users routes
      {
        path: 'users',
        loadComponent: () => import('./pages/users/dashboard2-users.component').then(m => m.Dashboard2UsersComponent)
      },
      {
        path: 'users/roles',
        loadComponent: () => import('./pages/users/dashboard2-user-roles.component').then(m => m.Dashboard2UserRolesComponent)
      },
      {
        path: 'users/permissions',
        loadComponent: () => import('./pages/users/dashboard2-user-permissions.component').then(m => m.Dashboard2UserPermissionsComponent)
      },
    ]
  }
];

