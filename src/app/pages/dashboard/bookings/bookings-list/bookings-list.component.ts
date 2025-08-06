import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {Router, RouterModule} from '@angular/router';
import {BookingService} from '../../../../core/services/http/booking.service';
import {Booking} from '../../../../core/models/http/booking.model';
import {PaginationResult} from '../../../../core/models/http/base/pagination-result.model';
import {finalize} from 'rxjs';
import {MessageService} from '../../../../core/services/message.service';

// Shared Components
import {
  ButtonComponent,
  CardComponent,
  DataTableComponent,
  StatusBadgeComponent,
  TooltipComponent,
  ModalComponent,
  StatusVariant
} from '../../../../shared/components';

// Table column interface
interface TableColumn {
  field: string;
  header: string;
  sortable?: boolean;
  template?: string;
}

// Confirmation dialog data interface
interface ConfirmDialogData {
  title: string;
  message: string;
  acceptLabel: string;
  severity: 'info' | 'warning' | 'danger';
  accept?: () => void;
}

@Component({
  selector: 'app-bookings-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ButtonComponent,
    CardComponent,
    DataTableComponent,
    StatusBadgeComponent,
    TooltipComponent,
    ModalComponent
  ],
  templateUrl: './bookings-list.component.html',
})
export class BookingsListComponent implements OnInit {
  bookings: Booking[] = [];
  loading = false;
  showConfirmDialog = false;
  confirmDialogData: ConfirmDialogData = {
    title: '',
    message: '',
    acceptLabel: 'Confirm',
    severity: 'info'
  };

  tableColumns: TableColumn[] = [
    { field: 'reference_number', header: 'Reference', sortable: true },
    { field: 'property.title', header: 'Property', sortable: true },
    { field: 'customer.user.full_name', header: 'Customer', sortable: true },
    { field: 'check_in_date', header: 'Check-in', sortable: true },
    { field: 'check_out_date', header: 'Check-out', sortable: true },
    { field: 'status', header: 'Status', template: 'statusTemplate' },
    { field: 'total_amount', header: 'Amount', template: 'amountTemplate' },
    { field: 'actions', header: 'Actions', template: 'actionsTemplate', sortable: false }
  ];

  constructor(
    private bookingService: BookingService,
    private messageService: MessageService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadBookings();
  }

  loadBookings(): void {
    this.loading = true;
    this.bookingService.index()
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (response) => {
          if (Array.isArray(response)) {
            this.bookings = response;
          } else {
            // Handle paginated response
            this.bookings = (response as PaginationResult<Booking>).data || [];
          }
        },
        error: (error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'Failed to load bookings',
            life: 3000
          });
        }
      });
  }

  getStatusVariant(status: string): StatusVariant {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'cancelled':
      case 'rejected':
        return 'danger';
      case 'completed':
        return 'info';
      default:
        return 'info';
    }
  }

  viewBookingDetails(booking: Booking): void {
    if (booking.id) {
      this.router.navigate(['/dashboard/bookings', booking.id]).then();
    }
  }

  confirmBooking(booking: Booking): void {
    this.confirmDialogData = {
      title: 'Confirm Booking',
      message: `Are you sure you want to confirm booking ${booking.reference_number}? This action cannot be undone.`,
      acceptLabel: 'Confirm',
      severity: 'info',
      accept: () => this.performConfirmBooking(booking)
    };
    this.showConfirmDialog = true;
  }

  cancelBooking(booking: Booking): void {
    this.confirmDialogData = {
      title: 'Cancel Booking',
      message: `Are you sure you want to cancel booking ${booking.reference_number}? This action cannot be undone.`,
      acceptLabel: 'Cancel Booking',
      severity: 'danger',
      accept: () => this.performCancelBooking(booking)
    };
    this.showConfirmDialog = true;
  }

  private performConfirmBooking(booking: Booking): void {
    if (!booking.id) return;
    
    this.bookingService.update(booking.id, { ...booking, status: 'confirmed' })
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Booking confirmed successfully',
            life: 3000
          });
          this.loadBookings();
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

  private performCancelBooking(booking: Booking): void {
    if (!booking.id) return;
    
    this.bookingService.update(booking.id, { ...booking, status: 'cancelled' })
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Booking cancelled successfully',
            life: 3000
          });
          this.loadBookings();
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

  closeConfirmDialog(): void {
    this.showConfirmDialog = false;
    this.confirmDialogData = {
      title: '',
      message: '',
      acceptLabel: 'Confirm',
      severity: 'info'
    };
  }

  acceptConfirmDialog(): void {
    if (this.confirmDialogData.accept) {
      this.confirmDialogData.accept();
    }
    this.closeConfirmDialog();
  }

  formatDate(date: string | Date): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatCurrency(amount: number | string): string {
    if (!amount) return 'N/A';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR'
    }).format(numAmount);
  }
}
