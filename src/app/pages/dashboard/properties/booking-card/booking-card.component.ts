import {Component, EventEmitter, Input, Output} from '@angular/core';
import {Booking} from "../../../../core/models/http/booking.model";
import {CommonModule} from "@angular/common";
import {ButtonModule} from "primeng/button";
import {TagModule} from "primeng/tag";
import {CardModule} from "primeng/card";
import {DividerModule} from "primeng/divider";

@Component({
  selector: 'app-booking-card',
  templateUrl: './booking-card.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    TagModule,
    CardModule,
    DividerModule
  ]
})
export class BookingCardComponent {
  @Input() booking!: Booking;
  @Output() edit = new EventEmitter<Booking>();
  @Output() delete = new EventEmitter<Booking>();

  getStatusSeverity(status: string): string {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'confirmed':
        return 'success';
      case 'cancelled':
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
}
