import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Router, RouterModule} from '@angular/router';
import {BookingService} from '../../../../core/services/http/booking.service';
import {Booking} from '../../../../core/models/http/booking.model';
import {PaginationResult} from '../../../../core/models/http/base/pagination-result.model';
import {finalize} from 'rxjs';
import {MessageService} from '../../../../core/services/message.service';

// Shared Components
import {
  CardComponent,
  StatusBadgeComponent,
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
    FormsModule,
    RouterModule,
    CardComponent,
    StatusBadgeComponent,
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

  // Pagination properties
  currentPage: number = 0;
  currentRowsPerPage: number = 10;
  rowsPerPageOptions = [5, 10, 20, 50];

  // Sorting properties
  sortField: string = '';
  sortOrder: 1 | -1 = 1;

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

  // Pagination methods
  get totalPages(): number {
    return Math.ceil(this.bookings.length / this.currentRowsPerPage);
  }

  get paginatedBookings(): Booking[] {
    const start = this.currentPage * this.currentRowsPerPage;
    const end = start + this.currentRowsPerPage;
    return this.bookings.slice(start, end);
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
    }
  }

  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
    }
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
    }
  }

  onRowsPerPageChange(rows: number): void {
    this.currentRowsPerPage = rows;
    this.currentPage = 0; // Reset to first page
  }

  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const half = Math.floor(maxVisible / 2);

    let start = Math.max(0, this.currentPage - half);
    let end = Math.min(this.totalPages - 1, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(0, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  getCurrentPageReport(): string {
    const first = this.currentPage * this.currentRowsPerPage + 1;
    const last = Math.min((this.currentPage + 1) * this.currentRowsPerPage, this.bookings.length);
    const totalRecords = this.bookings.length;

    return `Showing ${first} to ${last} of ${totalRecords} entries`;
  }

  // Sorting methods
  onSort(field: string): void {
    let newOrder: 1 | -1 = 1;
    if (this.sortField === field) {
      newOrder = this.sortOrder === 1 ? -1 : 1;
    }

    this.sortField = field;
    this.sortOrder = newOrder;

    this.bookings.sort((a, b) => {
      const aValue = this.getFieldValue(a, field);
      const bValue = this.getFieldValue(b, field);

      if (aValue < bValue) return -1 * newOrder;
      if (aValue > bValue) return 1 * newOrder;
      return 0;
    });
  }

  private getFieldValue(item: any, field: string): any {
    return field.split('.').reduce((obj, prop) => obj?.[prop], item) || '';
  }

  trackByBooking(index: number, booking: Booking): any {
    return booking.id || index;
  }
}
