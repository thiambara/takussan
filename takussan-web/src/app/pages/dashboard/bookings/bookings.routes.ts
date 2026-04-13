import {Routes} from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./bookings.component').then(m => m.BookingsComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./booking-details/booking-details.component').then(m => m.BookingDetailsComponent)
  }
];
