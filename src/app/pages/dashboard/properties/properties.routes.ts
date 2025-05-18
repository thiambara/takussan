import {Routes} from '@angular/router';

export const routes: Routes = [
  {
    'path': '',
    loadComponent: () => import('./properties.component').then(m => m.PropertiesComponent),
  },
  {
    'path': ':id',
    loadComponent: () => import('./property-details/property-details.component').then(m => m.PropertyDetailsComponent),
  },
];
