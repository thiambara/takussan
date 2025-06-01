import {Component, OnInit} from '@angular/core';
import {MessageService} from 'primeng/api';
import {User as Customer} from "../../../../core/models/http/user.model";
import {CustomerService} from "../../../../core/sevices/http/customer.service";
import {CommonModule} from "@angular/common";
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";
import {finalize} from "rxjs";
import {ButtonModule} from "primeng/button";
import {ActivatedRoute, Router, RouterModule} from "@angular/router";
import {CardModule} from 'primeng/card';
import {InputTextModule} from 'primeng/inputtext';
import {DropdownModule} from 'primeng/dropdown';
import {AutoFocusModule} from 'primeng/autofocus';
import {ToastModule} from 'primeng/toast';
import {ToggleButtonModule} from 'primeng/togglebutton';
import {TooltipModule} from 'primeng/tooltip';
import {Address} from "../../../../core/models/http/address.model";
import {DialogModule} from 'primeng/dialog';
import {DividerModule} from 'primeng/divider';
import {Textarea} from "primeng/textarea";
import {Select} from "primeng/select";
import {AddressFormComponent} from '../../../../shared/components/address-form/address-form.component';

@Component({
  selector: 'app-customer-edit',
  templateUrl: './customer-edit.component.html',
  styleUrls: ['./customer-edit.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    DropdownModule,
    CardModule,
    AutoFocusModule,
    ToastModule,
    DialogModule,
    ToggleButtonModule,
    TooltipModule,
    DividerModule,
    Textarea,
    Select,
    AddressFormComponent
  ],
  standalone: true
})
export class CustomerEditComponent implements OnInit {
  customer: Customer = {};
  customerId: number = 0;
  customerForm!: FormGroup;
  loading: boolean = false;
  saving: boolean = false;
  isEditMode: boolean = true;

  // For address management
  showAddressForm: boolean = false;
  editingAddressIndex: number = -1;
  selectedAddress?: Address;

  // Customer type options
  customerTypes = [
    {label: 'Individual', value: 'individual'},
    {label: 'Company', value: 'company'},
    {label: 'Agent', value: 'agent'}
  ];

  // Customer status options
  customerStatuses = [
    {label: 'Active', value: 'active'},
    {label: 'Inactive', value: 'inactive'},
    {label: 'Blocked', value: 'blocked'}
  ];

  constructor(
    private customerService: CustomerService,
    private messageService: MessageService,
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute
  ) {
  }

  ngOnInit() {
    const customerId = this.route.snapshot.paramMap.get('id');

    this.initForms();

    if (customerId && customerId !== 'new') {
      this.customerId = +customerId;
      this.isEditMode = false;
      this.getCustomer();
    } else {
      this.isEditMode = true;
    }

  }

  initForms(): void {
    // Initialize main customer form
    this.customerForm = this.fb.group({
      first_name: ['', [Validators.required]],
      last_name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required]],
      status: ['active'],
      type: ['individual'],
      metadata: this.fb.group({
        company_name: [''],
        business_id: [''],
        tax_id: [''],
        notes: ['']
      })
    });

    // Watch for customer type changes to update form
    this.customerForm.get('type')?.valueChanges.subscribe(type => {
      this.updateFormBasedOnType(type);
    });
  }

  updateFormBasedOnType(type: string) {
    const metadataGroup = this.customerForm.get('metadata') as FormGroup;

    // Reset validators for all fields
    metadataGroup.get('company_name')?.clearValidators();
    metadataGroup.get('business_id')?.clearValidators();
    metadataGroup.get('tax_id')?.clearValidators();

    // Apply validators based on type
    if (type === 'company') {
      metadataGroup.get('company_name')?.addValidators([Validators.required]);
      metadataGroup.get('business_id')?.addValidators([Validators.required]);
    }

    // Update validators
    metadataGroup.get('company_name')?.updateValueAndValidity();
    metadataGroup.get('business_id')?.updateValueAndValidity();
    metadataGroup.get('tax_id')?.updateValueAndValidity();
  }

  getCustomer() {
    this.loading = true;
    this.customerService.get(this.customerId)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (data: any) => {
          this.customer = data as Customer;
          this.patchFormValues();
        },
        error: (error: any) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'Failed to load customer details',
            life: 3000
          });
          this.router.navigate(['/dashboard/customers']);
        }
      });
  }

  patchFormValues() {
    // Patch main form values
    this.customerForm.patchValue({
      first_name: this.customer.first_name || '',
      last_name: this.customer.last_name || '',
      email: this.customer.email || '',
      phone: this.customer.phone || '',
      status: this.customer.status || 'active',
      type: this.customer.type || 'individual'
    });

    // Patch metadata if exists
    if (this.customer.metadata) {
      const metadataGroup = this.customerForm.get('metadata') as FormGroup;
      metadataGroup.patchValue({
        company_name: this.customer.metadata.company_name || '',
        business_id: this.customer.metadata.business_id || '',
        tax_id: this.customer.metadata.tax_id || '',
        notes: this.customer.metadata.notes || ''
      });
    }
  }

  hasError(controlName: string, errorName?: string): boolean {
    const control = this.getControl(controlName);
    if (errorName) {
      return control ? control.hasError(errorName) : false;
    }
    return control ? control.invalid && (control.dirty || control.touched) : false;
  }

  hasMetadataError(controlName: string, errorName?: string): boolean {
    const metadataGroup = this.customerForm.get('metadata');
    if (!metadataGroup) return false;

    const control = metadataGroup.get(controlName);
    if (errorName) {
      return control ? control.hasError(errorName) : false;
    }
    return control ? control.invalid && (control.dirty || control.touched) : false;
  }

  getControl(controlName: string) {
    return this.customerForm.get(controlName);
  }

  openAddressForm(index: number = -1): void {
    this.editingAddressIndex = index;
    if (index >= 0 && this.customer.addresses && this.customer.addresses[index]) {
      this.selectedAddress = { ...this.customer.addresses[index] };
    } else {
      this.selectedAddress = {
        type: 'residential'
      };
    }
    this.showAddressForm = true;
  }

  onAddressSave(address: Address): void {
    if (!this.customer.addresses) {
      this.customer.addresses = [];
    }
    
    if (this.editingAddressIndex >= 0) {
      // Edit existing address
      this.customer.addresses[this.editingAddressIndex] = address;
    } else {
      // Add new address
      this.customer.addresses.push(address);
    }

    this.showAddressForm = false;
    this.editingAddressIndex = -1;
    this.selectedAddress = undefined;
  }
  
  onAddressCancel(): void {
    this.showAddressForm = false;
    this.editingAddressIndex = -1;
    this.selectedAddress = undefined;
  }

  removeAddress(index: number) {
    if (this.customer.addresses && index >= 0 && index < this.customer.addresses.length) {
      this.customer.addresses.splice(index, 1);
    }
  }

  saveCustomer() {
    if (this.saving || this.customerForm.invalid) {
      this.customerForm.markAllAsTouched();
      return;
    }

    this.saving = true;
    const formData = this.customerForm.value;

    // Clean empty metadata fields
    const metadata = {...formData.metadata};
    Object.keys(metadata).forEach(key => {
      if (metadata[key] === '' || metadata[key] === null) {
        delete metadata[key];
      }
    });

    const customerData = {
      ...formData,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      addresses: this.customer.addresses || []
    };

    const request = this.isEditMode
      ? this.customerService.create(customerData)
      : this.customerService.update(this.customerId, customerData);

    request
      .pipe(finalize(() => this.saving = false))
      .subscribe({
        next: (result) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Customer saved successfully',
            life: 3000
          });

          if (this.isEditMode) {
            const newCustomerId = (result as Customer).id;
            this.router.navigate(['/dashboard/customers', newCustomerId]);
          } else {
            this.router.navigate(['/dashboard/customers', this.customerId]);
          }
        },
        error: error => this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'An error has occurred',
          life: 3000
        })
      });
  }
}
