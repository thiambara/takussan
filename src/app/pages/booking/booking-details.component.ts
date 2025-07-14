import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-booking-details',
  standalone: true,
  imports: [CommonModule, RouterModule, TooltipModule, ButtonModule],
  templateUrl: './booking-details.component.html',
  styles: [`
    :host {
      width: 100%;
    }
    
    @media screen and (max-width: 576px) {
      .booking-details h2 {
        font-size: 20px;
      }
    }
  `]
})
export class BookingDetailsComponent implements OnInit {
  // Booking info
  bookingId: string = '123456789';
  status: string = 'Confirmed';
  customerName: string = 'Sophia Carter';
  email: string = 'sophia.carter@email.com';
  phone: string = '+1 (555) 123-4567';
  startDate: Date = new Date('2024-07-15');
  endDate: Date = new Date('2024-07-22');
  totalAmount: number = 2500;
  amountPaid: number = 2500;
  paymentDate: Date = new Date('2024-07-10');
  paymentMethod: string = 'Credit Card';
  notes: string = 'Special request: Early check-in if possible.';
  bookingDuration: number = 0;

  // Property info
  propertyName: string = 'The Grand Estate';
  propertyType: string = 'villa';
  propertyMetadata: any = {
    hasPool: true,
    gardenArea: 500,
    floors: 2
  };

  ngOnInit() {
    // Calculate booking duration
    this.calculateBookingDuration();
  }

  calculateBookingDuration() {
    if (this.startDate && this.endDate) {
      const diffTime = Math.abs(this.endDate.getTime() - this.startDate.getTime());
      this.bookingDuration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  }
}
