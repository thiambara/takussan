import {Routes} from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./bookings-list/bookings-list.component').then(m => m.BookingsListComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./booking-details/booking-details.component').then(m => m.BookingDetailsComponent)
  }
];
