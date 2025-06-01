import {Component, OnInit} from '@angular/core';
import {MessageService} from 'primeng/api';
import {User as Customer} from "../../../../core/models/http/user.model";
import {CustomerService} from "../../../../core/sevices/http/customer.service";
import {CommonModule} from "@angular/common";
import {finalize} from "rxjs";
import {Button} from "primeng/button";
import {ActivatedRoute, Router} from "@angular/router";
import {CardModule} from 'primeng/card';
import {TagModule} from 'primeng/tag';
import {DividerModule} from 'primeng/divider';
import {TabsModule} from 'primeng/tabs';
import {ToastModule} from 'primeng/toast';
import {DialogModule} from 'primeng/dialog';
import {Address} from "../../../../core/models/http/address.model";
import {Booking} from "../../../../core/models/http/booking.model";
import {BookingCardComponent} from "../../properties/booking-card/booking-card.component";

@Component({
  selector: 'app-customer-details',
  templateUrl: './customer-details.component.html',
  styleUrls: ['./customer-details.component.scss'],
  imports: [
    CommonModule,
    Button,
    CardModule,
    TagModule,
    DividerModule,
    TabsModule,
    ToastModule,
    DialogModule,
    BookingCardComponent
  ],
  standalone: true
})
export class CustomerDetailsComponent implements OnInit {
  customer?: Customer;
  customerId: number = 0;
  loading: boolean = false;
  activeTabIndex = 0;

  // Selected address for viewing details
  selectedAddress?: Address;
  showAddressDialog: boolean = false;

  // Selected booking for viewing details
  selectedBooking?: Booking;
  showBookingDialog: boolean = false;

  constructor(
    private customerService: CustomerService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute
  ) {
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.customerId = +params['id'];
        this.getCustomer();
      }
    });
  }

  getCustomer() {
    this.loading = true;
    this.customerService.get(this.customerId)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (data) => {
          this.customer = data as Customer;
        },
        error: (error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'Failed to load customer details',
            life: 3000
          });
          this.router.navigate(['/dashboard/customers']).then();
        }
      });
  }

  navigateToEdit() {
    this.router.navigate(['/dashboard/customers/edit', this.customerId]).then();
  }

  getCustomerTypeLabel(): string {
    if (!this.customer?.type) return 'Individual';

    switch (this.customer.type) {
      case 'individual':
        return 'Individual';
      case 'company':
        return 'Company';
      case 'agent':
        return 'Agent';
      default:
        return this.customer.type;
    }
  }

  getStatusClass(): string {
    if (!this.customer?.status) return 'bg-gray-500';

    switch (this.customer.status) {
      case 'active':
        return 'bg-green-500';
      case 'inactive':
        return 'bg-yellow-500';
      case 'blocked':
        return 'bg-red-500';
      case 'deleted':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  }

  viewAddress(address: Address) {
    this.selectedAddress = address;
    this.showAddressDialog = true;
  }

  closeAddressDialog() {
    this.showAddressDialog = false;
  }

  viewBooking(booking: Booking) {
    this.selectedBooking = booking;
    this.showBookingDialog = true;
  }

  closeBookingDialog() {
    this.showBookingDialog = false;
  }

  /**
   * Calculate the duration in days between start_date and end_date of a booking
   * @param booking The booking object
   * @returns Number of days or 'N/A' if dates are missing
   */
  calculateDuration(booking: Booking): number | string {
    if (!booking?.start_date || !booking?.end_date) {
      return 'N/A';
    }
    
    const startDate = new Date(booking.start_date);
    const endDate = new Date(booking.end_date);
    
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
