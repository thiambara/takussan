import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Router, RouterModule} from '@angular/router';
import {CommonModule} from '@angular/common';
import {Booking} from '../../../../core/models/http/booking.model';
import {ButtonModule} from 'primeng/button';
import {CardModule} from 'primeng/card';
import {DividerModule} from 'primeng/divider';
import {DialogModule} from 'primeng/dialog';
import {FormBuilder, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {ToastModule} from 'primeng/toast';
import {ConfirmationService, MessageService} from 'primeng/api';
import {ConfirmDialogModule} from 'primeng/confirmdialog';
import {finalize} from 'rxjs';
import {TagModule} from 'primeng/tag';
import {BookingService} from "../../../../core/services/http/booking.service";
import {
  Ban,
  Calendar,
  Check,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  LucideAngularModule,
  Mail,
  MapPin,
  Phone,
  User,
  X
} from 'lucide-angular';
import {BookingStatus} from "../../../../core/models/http/enum-models";

@Component({
  selector: 'app-booking-details',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    CardModule,
    DividerModule,
    RouterModule,
    DialogModule,
    ReactiveFormsModule,
    ToastModule,
    ConfirmDialogModule,
    TagModule,
    LucideAngularModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './booking-details.component.html',
})
export class BookingDetailsComponent implements OnInit {
  @Input() booking!: Booking;
  @Input() showDialog = false;

  @Output() showDialogChange = new EventEmitter<boolean>();
  @Output() bookingUpdated = new EventEmitter<Booking>();

  loading = false;
  confirmBookingForm!: FormGroup;
  calculatingAmount = false;

  // Icons
  readonly X = X;
  readonly Check = Check;
  readonly Ban = Ban;
  readonly Calendar = Calendar;
  readonly CreditCard = CreditCard;
  readonly FileText = FileText;
  readonly User = User;
  readonly Mail = Mail;
  readonly Phone = Phone;
  readonly MapPin = MapPin;
  readonly DollarSign = DollarSign;
  readonly Clock = Clock;

  constructor(
    private fb: FormBuilder,
    private messageService: MessageService,
    private bookingService: BookingService,
    private confirmationService: ConfirmationService,
    private router: Router
  ) {
  }

  ngOnInit(): void {
    this.initForm();
  }

  initForm(): void {
    this.confirmBookingForm = this.fb.group({
      status: ['confirmed']
    });
  }

  getDuration(): number {
    if (!this.booking?.start_date || !this.booking?.end_date) return 0;

    const start = new Date(this.booking.start_date);
    const end = new Date(this.booking.end_date);

    // Calculate the difference in days
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end date

    return diffDays;
  }

  getStatusSeverity(status?: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' | undefined {
    switch (status) {
      case 'pending':
        return 'warn';
      case 'confirmed':
        return 'success';
      case 'rejected':
        return 'danger';
      case 'cancelled':
        return 'danger';
      case 'completed':
        return 'info';
      default:
        return 'secondary';
    }
  }

  confirmBooking(): void {
    this.loading = true;

    const data: Partial<Booking> = {
      status: BookingStatus.Confirmed,
      confirmation_date: new Date().toISOString()
    };

    this.bookingService.update(this.booking.id!, data as Booking)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (updatedBooking) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Booking confirmed successfully',
            life: 3000
          });

          this.bookingUpdated.emit(updatedBooking);
          this.closeDialog();
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

        this.bookingService.update(this.booking.id!, data as Booking)
          .pipe(finalize(() => this.loading = false))
          .subscribe({
            next: (updatedBooking) => {
              this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Booking cancelled successfully',
                life: 3000
              });

              this.bookingUpdated.emit(updatedBooking);
              this.closeDialog();
            },
            error: (error: any) => {
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

  closeDialog(): void {
    this.showDialog = false;
    this.showDialogChange.emit(false);
  }

  goBackToReservations(): void {
    this.router.navigate(['/dashboard/bookings']);
  }

  formatCurrency(value?: number): string {
    if (!value) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  }

  formatDate(date?: string): string {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
