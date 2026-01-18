import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {Booking} from '../../../../core/models/http/booking.model';
import {PaginationResult} from '../../../../core/models/http/base/pagination-result.model';
import {debounceTime, EMPTY, merge, skip} from 'rxjs';

// PrimeNG Modules
import {ButtonModule} from 'primeng/button';
import {InputTextModule} from 'primeng/inputtext';
import {SelectModule} from 'primeng/select';
import {InputNumberModule} from 'primeng/inputnumber';
import {DatePickerModule} from 'primeng/datepicker';
import {DialogModule} from 'primeng/dialog';
import {TextareaModule} from 'primeng/textarea';
import {AutoCompleteModule, AutoCompleteSelectEvent} from 'primeng/autocomplete';
import {ToastModule} from 'primeng/toast';
import {SelectButtonModule} from 'primeng/selectbutton';
import {MessageService} from 'primeng/api';
import {BookingService} from "../../../../core/services/http/booking.service";
import {CustomerService} from "../../../../core/services/http/customer.service";
import {Customer} from "../../../../core/models/http/customer.model";
import {Calendar, Check, Info, LucideAngularModule, X} from 'lucide-angular';

@Component({
  selector: 'app-booking-form',
  templateUrl: './booking-form.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    InputNumberModule,
    DatePickerModule,
    DialogModule,
    TextareaModule,
    AutoCompleteModule,
    ToastModule,
    SelectButtonModule,
    LucideAngularModule
  ],
  providers: [MessageService]
})
export class BookingFormComponent implements OnInit {
  @Input() visible = false;
  @Input() propertyId?: number;
  @Input() booking?: Booking;
  @Input() isEditMode = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() save = new EventEmitter<Booking>();
  @Output() cancel = new EventEmitter<void>();

  bookingForm!: FormGroup;
  customers: Customer[] = [];
  filteredCustomers: Customer[] = [];
  selectedCustomer: Customer | null = null;

  // Icons
  readonly X = X;
  readonly Info = Info;
  readonly Check = Check;
  readonly Calendar = Calendar;

  bookingStatusOptions = [
    {label: 'Pending', value: 'pending'},
    {label: 'Approved', value: 'approved'},
    {label: 'Rejected', value: 'rejected'},
    {label: 'Cancelled', value: 'cancelled'},
    {label: 'Completed', value: 'completed'}
  ];

  depositPaidOptions = [
    {label: 'Yes', value: true},
    {label: 'No', value: false}
  ];

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private messageService: MessageService,
    private bookingService: BookingService
  ) {
  }

  ngOnInit(): void {
    this.initializeForm();
    this.loadCustomers();
  }

  initializeForm(): void {
    this.bookingForm = this.fb.group({
      booking_date: [this.booking?.booking_date ? new Date(this.booking.booking_date) : new Date(), Validators.required],
      start_date: [this.booking?.start_date ? new Date(this.booking.start_date) : null, Validators.required],
      end_date: [this.booking?.end_date ? new Date(this.booking.end_date) : null, Validators.required],
      expiration_date: [this.booking?.expiration_date ? new Date(this.booking.expiration_date) : null],
      status: [this.booking?.status || 'pending', Validators.required],
      price_at_booking: [this.booking?.price_at_booking || 0, [Validators.required, Validators.min(0)]],
      total_amount: [this.booking?.total_amount || 0, [Validators.required, Validators.min(0)]],
      deposit_amount: [this.booking?.deposit_amount || 0, [Validators.min(0)]],
      deposit_paid: [this.booking?.deposit_paid || false],
      notes: [this.booking?.notes || ''],
      reference_number: [this.booking?.reference_number || ''],
      reason_for_rejection: [this.booking?.reason_for_rejection || ''],
      reason_for_cancellation: [this.booking?.reason_for_cancellation || ''],
      cancellation_by: [this.booking?.cancellation_by || ''],
      metadata: [this.booking?.metadata || {}],
      customer_id: [this.booking?.customer_id || null]
    });

    // Listen for changes to dates and price to auto-calculate total amount
    this.setupTotalAmountCalculation();

    if (this.booking?.customer_id) {
      this.loadCustomerDetails(this.booking.customer_id);
    }
  }

  loadCustomers(): void {
    this.customerService.index().subscribe({
        next: (result: Customer[] | PaginationResult<Customer>) => {
          if (Array.isArray(result)) {
            this.customers = result;
          } else {
            this.customers = result.data || [];
          }
        },
        error: (error: any) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load customers: ' + (error.message || 'Unknown error'),
            life: 3000
          });
        }
      }
    );
  }

  loadCustomerDetails(customerId: number): void {
    this.customerService.get(customerId).subscribe({
      next: (customer: Customer) => {
        this.selectedCustomer = customer;
      },
      error: (error: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load customer details: ' + (error.message || 'Unknown error'),
          life: 3000
        });
      }
    });
  }

  filterCustomer(event: any): void {
    const query = event.query.toLowerCase();
    this.filteredCustomers = this.customers.filter(customer =>
      customer.first_name?.toLowerCase().includes(query) ||
      customer.last_name?.toLowerCase().includes(query) ||
      customer.email?.toLowerCase().includes(query)
    );
  }

  onCustomerSelect(event: AutoCompleteSelectEvent): void {
    const customer = event.value as Customer;
    this.selectedCustomer = customer;
    this.bookingForm.patchValue({
      customer_id: customer.id
    });
  }

  clearCustomer(): void {
    this.selectedCustomer = null;
    this.bookingForm.patchValue({
      customer_id: null
    });
  }

  onHide(): void {
    this.visibleChange.emit(false);
    this.cancel.emit();
  }

  saveBooking(): void {
    if (this.bookingForm.invalid) {
      this.markFormGroupTouched(this.bookingForm);
      return;
    }

    const bookingData = this.bookingForm.value;

    // Format dates for API
    if (bookingData.booking_date) {
      bookingData.booking_date = this.formatDate(bookingData.booking_date);
    }

    if (bookingData.start_date) {
      bookingData.start_date = this.formatDate(bookingData.start_date);
    }

    if (bookingData.end_date) {
      bookingData.end_date = this.formatDate(bookingData.end_date);
    }

    if (bookingData.expiration_date) {
      bookingData.expiration_date = this.formatDate(bookingData.expiration_date);
    }

    // Add property_id if available
    if (this.propertyId) {
      bookingData.property_id = this.propertyId;
    }

    // If editing, preserve the original ID
    if (this.isEditMode && this.booking?.id) {
      bookingData.id = this.booking.id;
    }

    this.isEditMode ? this.updateBooking(bookingData) : this.createBooking(bookingData);


  }

  createBooking(bookingData: Booking): void {
    this.bookingService.create(bookingData).subscribe({
      next: (response: Booking) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Booking created successfully',
          life: 3000
        });
        this.save.emit(response);
        this.visibleChange.emit(false);
      },
      error: (error: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to create booking: ' + (error.message || 'Unknown error'),
          life: 3000
        });
      }
    });
  }

  updateBooking(bookingData: Booking): void {
    this.bookingService.update(bookingData.id!, bookingData).subscribe({
      next: (response: Booking) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Booking updated successfully',
          life: 3000
        });
        this.save.emit(response);
        this.visibleChange.emit(false);
      },
      error: (error: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to update booking: ' + (error.message || 'Unknown error'),
          life: 3000
        });
      }
    });
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Set up event listeners to automatically calculate the total amount
   * based on the price_at_booking and the duration of the booking
   */
  setupTotalAmountCalculation(): void {
    // Listen for changes to start_date, end_date, and price_at_booking
    const startDateControl = this.bookingForm.get('start_date');
    const endDateControl = this.bookingForm.get('end_date');
    const priceControl = this.bookingForm.get('price_at_booking');

    // Create a merged observable that triggers when any of the three controls change
    merge(
      startDateControl?.valueChanges || EMPTY,
      endDateControl?.valueChanges || EMPTY,
      priceControl?.valueChanges || EMPTY
    ).pipe(
      // Skip initial emissions
      skip(1),
      // Debounce to prevent rapid recalculations
      debounceTime(300)
    ).subscribe({
      next: () => {
        this.calculateTotalAmount();
      }
    });
  }

  /**
   * Calculate the total amount based on price_at_booking and duration
   */
  calculateTotalAmount(): void {
    const startDate = this.bookingForm.get('start_date')?.value as Date;
    const endDate = this.bookingForm.get('end_date')?.value as Date;
    const priceAtBooking = this.bookingForm.get('price_at_booking')?.value;

    // If any of the required values are missing, don't calculate
    if (!startDate || !endDate || priceAtBooking === null || priceAtBooking === undefined) {
      return;
    }

    // Check if dates are valid
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return;
    }

    // Calculate the difference in milliseconds
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    // Convert to days and round up to include both start and end days
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Calculate total amount based on daily rate (price_at_booking) and duration
    const totalAmount = priceAtBooking * diffDays;

    // Update the total_amount field
    this.bookingForm.patchValue({
      total_amount: totalAmount
    }, {emitEvent: false});
  }

  markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }
}
