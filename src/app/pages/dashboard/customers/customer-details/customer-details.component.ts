import {Component, OnInit} from '@angular/core';
import {Customer} from "../../../../core/models/http/customer.model";
import {CustomerService} from "../../../../core/services/http/customer.service";
import {CommonModule} from "@angular/common";
import {finalize} from "rxjs";
import {ActivatedRoute, Router} from "@angular/router";
import {Address} from "../../../../core/models/http/address.model";
import {Booking} from "../../../../core/models/http/booking.model";
import {MessageService} from '../../../../core/services/message.service';

// Shared Components
// Status variant enum
import {
  ButtonComponent,
  CardComponent,
  ModalComponent,
  StatusBadgeComponent,
  StatusVariant,
  TabComponent,
  TabsComponent
} from '../../../../shared/components';

// Booking Card Component
import {BookingCardComponent} from "../../properties/booking-card/booking-card.component";

@Component({
  selector: 'app-customer-details',
  templateUrl: './customer-details.component.html',
  imports: [
    CommonModule,
    ButtonComponent,
    CardComponent,
    StatusBadgeComponent,
    TabsComponent,
    TabComponent,
    ModalComponent,
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
    const customerId = this.route.snapshot.paramMap.get('id');

    if (customerId) {
      this.customerId = +customerId;
      this.getCustomer();
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Customer ID not found',
        life: 3000
      });
      this.router.navigate(['/dashboard/customers']).then();
    }
  }

  getCustomer() {
    this.loading = true;
    this.customerService.get(this.customerId)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (data: Customer) => {
          this.customer = data;
        },
        error: (error: any) => {
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

  getCustomerTypeLabel(): string {
    if (!this.customer?.type) return 'N/A';

    switch (this.customer.type) {
      case 'individual':
        return 'Individual';
      case 'company':
        return 'Company';
      default:
        return this.customer.type;
    }
  }

  getStatusVariant(status: string): StatusVariant {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'info';
      case 'pending':
        return 'warning';
      case 'suspended':
        return 'danger';
      default:
        return 'info';
    }
  }

  getBookingStatusVariant(status: string): StatusVariant {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'cancelled':
        return 'danger';
      case 'completed':
        return 'info';
      default:
        return 'info';
    }
  }

  navigateToEdit() {
    if (this.customer?.id) {
      this.router.navigate(['/dashboard/customers/edit', this.customer.id]).then();
    }
  }

  // Address dialog methods
  viewAddress(address: Address) {
    this.selectedAddress = address;
    this.showAddressDialog = true;
  }

  closeAddressDialog() {
    this.showAddressDialog = false;
    this.selectedAddress = undefined;
  }

  // Booking dialog methods
  viewBooking(booking: Booking) {
    this.selectedBooking = booking;
    this.showBookingDialog = true;
  }

  closeBookingDialog() {
    this.showBookingDialog = false;
    this.selectedBooking = undefined;
  }

  calculateDuration(booking: Booking): number {
    if (!booking.start_date || !booking.end_date) return 0;

    const startDate = new Date(booking.start_date);
    const endDate = new Date(booking.end_date);
    const timeDiff = endDate.getTime() - startDate.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }
}
