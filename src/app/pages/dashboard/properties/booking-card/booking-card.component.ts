import {Component, EventEmitter, Input, Output} from '@angular/core';
import {Booking} from "../../../../core/models/http/booking.model";
import {CommonModule} from "@angular/common";
import {ButtonModule} from "primeng/button";
import {TagModule} from "primeng/tag";
import {CardModule} from "primeng/card";
import {DividerModule} from "primeng/divider";
import {LucideAngularModule, Pencil, Trash2, CheckCircle, XCircle} from 'lucide-angular';

@Component({
  selector: 'app-booking-card',
  templateUrl: './booking-card.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    TagModule,
    CardModule,
    DividerModule,
    LucideAngularModule
  ]
})
export class BookingCardComponent {
  @Input() booking!: Booking;
  @Output() edit = new EventEmitter<Booking>();
  @Output() delete = new EventEmitter<Booking>();

  // Icons
  readonly Pencil = Pencil;
  readonly Trash2 = Trash2;
  readonly CheckCircle = CheckCircle;
  readonly XCircle = XCircle;

  getStatusSeverity(status: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined {
    switch (status) {
      case 'pending':
        return 'warn';
      case 'confirmed':
      case 'approved':
        return 'success';
      case 'cancelled':
      case 'rejected':
        return 'danger';
      case 'completed':
        return 'info';
      default:
        return 'secondary';
    }
  }

  onEdit() {
    this.edit.emit(this.booking);
  }

  onDelete() {
    this.delete.emit(this.booking);
  }

  /**
   * Calculate the duration in days between start_date and end_date of a booking
   * @returns Number of days or 'N/A' if dates are missing
   */
  calculateDuration(): number | string {
    if (!this.booking?.start_date || !this.booking?.end_date) {
      return 'N/A';
    }

    const startDate = new Date(this.booking.start_date);
    const endDate = new Date(this.booking.end_date);

    // Check if dates are valid
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return 'N/A';
    }

    // Calculate the difference in milliseconds
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    // Convert to days and round up to include both start and end days
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }
}
