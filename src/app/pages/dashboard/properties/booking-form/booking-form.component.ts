import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Booking } from '../../../../core/models/http/booking.model';
import { Customer } from '../../../../core/models/http/customer.model';
import { User } from '../../../../core/models/http/user.model';
import { PaginationResult } from '../../../../core/models/http/base/pagination-result.model';
import { CustomerService } from '../../../../core/sevices/http/customer.service';

// PrimeNG Modules
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { AutoCompleteModule, AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-booking-form',
  templateUrl: './booking-form.component.html',
  styleUrls: ['./booking-form.component.scss'],
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
    ToastModule
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
  customers: User[] = [];
  filteredCustomers: User[] = [];
  selectedCustomer: User | null = null;
  
  bookingStatusOptions = [
    {label: 'Pending', value: 'pending'},
    {label: 'Confirmed', value: 'confirmed'},
    {label: 'Cancelled', value: 'cancelled'},
    {label: 'Completed', value: 'completed'}
  ];
  
  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private messageService: MessageService
  ) {}
  
  ngOnInit(): void {
    this.initializeForm();
    this.loadCustomers();
  }
  
  initializeForm(): void {
    this.bookingForm = this.fb.group({
      booking_date: [this.booking?.booking_date ? new Date(this.booking.booking_date) : new Date(), Validators.required],
      expiration_date: [this.booking?.expiration_date ? new Date(this.booking.expiration_date) : null],
      status: [this.booking?.status || 'pending', Validators.required],
      price_at_booking: [this.booking?.price_at_booking || 0, [Validators.required, Validators.min(0)]],
      deposit_amount: [this.booking?.deposit_amount || 0, [Validators.min(0)]],
      notes: [this.booking?.notes || ''],
      reference_number: [this.booking?.reference_number || ''],
      customer_id: [this.booking?.customer_id || null]
    });
    
    if (this.booking?.customer_id) {
      this.loadCustomerDetails(this.booking.customer_id);
    }
  }
  
  loadCustomers(): void {
    this.customerService.index().subscribe(
      (result: User[] | PaginationResult<User>) => {
        if (Array.isArray(result)) {
          this.customers = result;
        } else {
          this.customers = result.data || [];
        }
      },
      (error: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load customers: ' + (error.message || 'Unknown error'),
          life: 3000
        });
      }
    );
  }
  
  loadCustomerDetails(customerId: number): void {
    this.customerService.get(customerId).subscribe({
      next: (customer: User) => {
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
    const customer = event.value as User;
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
    
    this.save.emit(bookingData);
    this.visibleChange.emit(false);
  }
  
  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
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
