import { Routes } from '@angular/router';
import { BookingDetailsComponent } from './booking-details.component';

export const BOOKING_ROUTES: Routes = [
    {
        path: 'details/:id',
        component: BookingDetailsComponent,
        data: {
            breadcrumb: 'Booking Details'
        }
    }
];
