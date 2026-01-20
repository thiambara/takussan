import {Routes} from '@angular/router';

export const routes: Routes = [
  {
    'path': '',
    loadComponent: () => import('./component/layout2').then(m => m.Layout2),
    children: [
      {
        'path': '',
        redirectTo: 'home',
        pathMatch: 'full'
      },
      {
        'path': 'home',
        loadComponent: () => import('../../../pages/homepage/homepage.component').then(m => m.HomepageComponent)
      },
      {
        'path': 'search',
        loadComponent: () => import('../../../pages/search-results/search-results.component').then(m => m.SearchResultsComponent)
      },
      {
        'path': 'show-property/:id',
        loadComponent: () => import('../../../pages/show-property/show-property.component').then(m => m.ShowPropertyComponent)
      },

      {
        'path': 'properties',
        // canActivate: [authGuard],
        loadChildren: () => import('../../../pages/dashboard/properties/properties.routes').then(m => m.routes)
      },
      {
        'path': 'bookings',
        // canActivate: [authGuard],
        loadChildren: () => import('../../../pages/dashboard/bookings/bookings.routes').then(m => m.routes)
      },
      {
        'path': 'customers',
        // canActivate: [authGuard],
        loadChildren: () => import('../../../pages/dashboard/customers/customers.routes').then(m => m.routes)
      }
    ]
  },
];
