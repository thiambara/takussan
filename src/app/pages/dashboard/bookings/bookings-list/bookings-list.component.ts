import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {Router, RouterModule} from '@angular/router';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {CardModule} from 'primeng/card';
import {Booking} from '../../../../core/models/http/booking.model';
import {PaginationResult} from '../../../../core/models/http/base/pagination-result.model';
import {ToastModule} from 'primeng/toast';
import {ConfirmationService, MessageService} from 'primeng/api';
import {ConfirmDialogModule} from 'primeng/confirmdialog';
import {finalize} from 'rxjs';
import {BookingService} from "../../../../core/services/http/booking.service";
import {BadgeComponent, BadgeVariant} from "../../../../shared/components/badge/badge.component";
import {BookingStatus} from "../../../../core/models/http/enum-models";
import {LucideAngularModule, RefreshCw, Eye, Check, X, CalendarX} from 'lucide-angular';

@Component({
  selector: 'app-bookings-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonModule,
    TableModule,
    CardModule,
    ToastModule,
    ConfirmDialogModule,
    BadgeComponent,
    LucideAngularModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './bookings-list.component.html',
})
export class BookingsListComponent implements OnInit {
  bookings: Booking[] = [];
  loading = false;

  // Icons
  readonly RefreshCw = RefreshCw;
  readonly Eye = Eye;
  readonly Check = Check;
  readonly X = X;
  readonly CalendarX = CalendarX;

  constructor(
    private bookingService: BookingService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private router: Router
  ) {
  }

  ngOnInit(): void {
    this.fetchBookings();
  }

  fetchBookings(): void {
    this.loading = true;
    this.bookingService.index()
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (bookings: Booking[] | PaginationResult<Booking>) => {
          if (Array.isArray(bookings)) {
            this.bookings = bookings;
          } else {
            this.bookings = bookings.data || [];
          }
        },
        error: (error: any) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'Failed to fetch bookings',
            life: 3000
          });
        }
      });
  }

  viewBookingDetails(booking: Booking): void {
    this.router.navigate(['/dashboard/bookings', booking.id]);
  }

  confirmBooking(booking: Booking): void {
    this.loading = true;

    const data: Partial<Booking> = {
      status: BookingStatus.Confirmed,
      confirmation_date: new Date().toISOString()
    };

    this.bookingService.update(booking.id!, data as Booking)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (updatedBooking) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Booking confirmed successfully',
            life: 3000
          });

          // Update booking in the list
          const index = this.bookings.findIndex(b => b.id === booking.id);
          if (index !== -1) {
            this.bookings[index] = updatedBooking;
          }
        },
        error: (error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'Failed to confirm booking',
            life: 3000
          });
        }
      });
  }

  cancelBooking(booking: Booking): void {
    this.confirmationService.confirm({
      header: 'Cancel Booking',
      message: 'Are you sure you want to cancel this booking?',
      accept: () => {
        this.loading = true;

        const data: Partial<Booking> = {
          status: BookingStatus.Cancelled,
          cancellation_date: new Date().toISOString(),
          reason_for_cancellation: 'Cancelled by admin'
        };

        this.bookingService.update(booking.id!, data as Booking)
          .pipe(finalize(() => this.loading = false))
          .subscribe({
            next: (updatedBooking) => {
              this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Booking cancelled successfully',
                life: 3000
              });

              // Update booking in the list
              const index = this.bookings.findIndex(b => b.id === booking.id);
              if (index !== -1) {
                this.bookings[index] = updatedBooking;
              }
            },
            error: (error) => {
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: error.message || 'Failed to cancel booking',
                life: 3000
              });
            }
          });
      }
    });
  }

  getStatusSeverity(status?: BookingStatus | string): BadgeVariant {
    switch (status) {
      case BookingStatus.Pending:
        return 'warning';
      case BookingStatus.Confirmed:
        return 'success';
      case 'rejected': // Keep string fallback if needed or remove if strictly enum
        return 'danger';
      case BookingStatus.Cancelled:
        return 'danger';
      case BookingStatus.Completed:
        return 'info';
      default:
        return 'secondary';
    }
  }

  formatDate(date?: string): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatCurrency(value?: number): string {
    if (!value) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  }
}
