import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Router, RouterModule} from '@angular/router';
import {CommonModule, TitleCasePipe} from '@angular/common';
import {Booking} from '../../../../core/models/http/booking.model';
import {FormBuilder, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {BookingService} from '../../../../core/services/http/booking.service';
import {finalize} from 'rxjs';
import {MessageService} from '../../../../core/services/message.service';

// Shared Components
import {
  CardComponent,
  ModalComponent,
  StatusBadgeComponent,
  StatusVariant,
  TooltipComponent
} from '../../../../shared/components';

// Enums

@Component({
  selector: 'app-booking-details',
  standalone: true,
  imports: [
    CommonModule,
    TitleCasePipe,
    RouterModule,
    ReactiveFormsModule,
    CardComponent,
    StatusBadgeComponent,
    TooltipComponent,
    ModalComponent
  ],
  templateUrl: './booking-details.component.html',
})
export class BookingDetailsComponent implements OnInit {
  @Input() booking!: Booking;
  @Input() showDialog = false;

  @Output() showDialogChange = new EventEmitter<boolean>();
  @Output() bookingUpdated = new EventEmitter<Booking>();

  // Component properties for template binding
  bookingId: string = '';
  propertyName: string = '';
  status: string = '';
  customerName: string = '';
  email: string = '';
  phone: string = '';
  startDate: Date | null = null;
  endDate: Date | null = null;
  totalAmount: number = 0;
  notes: string = '';
  bookingDuration: number = 0;
  amountPaid: number = 0;
  paymentDate: Date | null = null;
  paymentMethod: string = '';
  propertyType: string = '';
  propertyMetadata: any = null;

  // Modal and loading states
  showConfirmDialog = false;
  editForm: FormGroup;
  loading = false;

  constructor(
    private router: Router,
    private bookingService: BookingService,
    private messageService: MessageService,
    private fb: FormBuilder
  ) {
    this.editForm = this.fb.group({
      status: [''],
      notes: [''],
      total_amount: [0]
    });
  }

  ngOnInit(): void {
    if (this.booking) {
      this.loadBookingData();
    }
  }

  getStatusVariant(status?: string): StatusVariant {
    switch (status?.toLowerCase()) {
      case 'pending':
        return 'warning';
      case 'confirmed':
        return 'success';
      case 'cancelled':
      case 'rejected':
        return 'danger';
      case 'completed':
        return 'info';
      default:
        return 'neutral';
    }
  }

  getDuration(startDate?: string, endDate?: string): number {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const timeDiff = end.getTime() - start.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
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
    if (!value) return '0';
    return value.toLocaleString();
  }

  showCancelConfirmation(): void {
    this.showConfirmDialog = true;
  }

  closeConfirmDialog(): void {
    this.showConfirmDialog = false;
  }

  navigateToReservations(): void {
    this.router.navigate(['/dashboard/bookings']).then();
  }

  goBackToReservations(): void {
    this.navigateToReservations();
  }

  confirmBooking(): void {
    if (!this.booking.id) return;

    this.loading = true;

    this.bookingService.update(this.booking.id, {...this.booking, status: 'confirmed'})
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (updatedBooking) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Booking confirmed successfully',
            life: 3000
          });

          this.booking = updatedBooking;
          this.loadBookingData();
          this.bookingUpdated.emit(updatedBooking);
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

  cancelBooking(): void {
    if (!this.booking.id) return;

    this.loading = true;

    this.bookingService.update(this.booking.id, {...this.booking, status: 'cancelled'})
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (updatedBooking) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Booking cancelled successfully',
            life: 3000
          });

          this.booking = updatedBooking;
          this.loadBookingData();
          this.showConfirmDialog = false;
          this.bookingUpdated.emit(updatedBooking);
        },
        error: (error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'Failed to cancel booking',
            life: 3000
          });
          this.showConfirmDialog = false;
        }
      });
  }

  private calculateDuration(): number {
    if (!this.startDate || !this.endDate) return 0;
    const timeDiff = this.endDate.getTime() - this.startDate.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }

  private loadBookingData(): void {
    this.bookingId = this.booking.reference_number || this.booking.id?.toString() || '';
    this.propertyName = this.booking.property?.title || 'N/A';
    this.status = this.booking.status || 'pending';
    this.customerName = this.booking.customer?.user?.full_name || 'N/A';
    this.email = this.booking.customer?.user?.email || 'N/A';
    this.phone = this.booking.customer?.user?.phone || 'N/A';
    this.startDate = this.booking.start_date ? new Date(this.booking.start_date) : null;
    this.endDate = this.booking.end_date ? new Date(this.booking.end_date) : null;
    this.totalAmount = this.booking.total_amount || 0;
    this.notes = this.booking.notes || 'No notes available';
    this.bookingDuration = this.calculateDuration();
    this.amountPaid = this.booking.deposit_amount || 0;
    this.paymentDate = this.booking.booking_date ? new Date(this.booking.booking_date) : null;
    this.paymentMethod = 'Credit Card'; // Default or from booking data
    this.propertyType = this.booking.property?.type || '';
    this.propertyMetadata = this.booking.property?.metadata || null;

    // Initialize form with current values
    this.editForm.patchValue({
      status: this.status,
      notes: this.notes,
      total_amount: this.totalAmount
    });
  }
}
