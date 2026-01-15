import {Component, OnInit} from '@angular/core';
import {CustomerService} from "../../../../core/services/http/customer.service";
import {CommonModule} from "@angular/common";
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";
import {finalize} from "rxjs";
import {ActivatedRoute, Router, RouterModule} from "@angular/router";
import {Address} from "../../../../core/models/http/address.model";
import {MessageService} from '../../../../core/services/message.service';

// Shared Components
// Address Form Component
import {AddressFormComponent} from '../../../../shared/components/address-form/address-form.component';
import {Customer} from "../../../../core/models/http/customer.model";
import {Card} from "primeng/card";
import {Select} from "primeng/select";
import {ChevronLeft, Loader2, LucideAngularModule, MapPin, Pencil, Plus, Save, Trash2} from 'lucide-angular';

@Component({
  selector: 'app-customer-edit',
  templateUrl: './customer-edit.component.html',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    AddressFormComponent,
    Card,
    Select,
    LucideAngularModule
  ],
  standalone: true
})
export class CustomerEditComponent implements OnInit {
  customer: Customer = {};
  customerForm: FormGroup;
  saving = false;
  isEditMode = false;
  customerId?: number | string | null;

  // Address management
  showAddressForm = false;
  selectedAddress?: Address;
  editingAddressIndex = -1;

  // Icons
  readonly ChevronLeft = ChevronLeft;
  readonly Loader2 = Loader2;
  readonly Save = Save;
  readonly Plus = Plus;
  readonly MapPin = MapPin;
  readonly Pencil = Pencil;
  readonly Trash2 = Trash2;

  customerTypes = [
    {label: 'Individual', value: 'individual'},
    {label: 'Company', value: 'company'}
  ];

  customerStatuses = [
    {label: 'Active', value: 'active'},
    {label: 'Inactive', value: 'inactive'},
    {label: 'Pending', value: 'pending'},
    {label: 'Suspended', value: 'suspended'}
  ];

  constructor(
    private fb: FormBuilder,
    private customerService: CustomerService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.customerForm = this.createForm();
  }

  ngOnInit() {
    this.customerId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = this.customerId !== null && this.customerId !== 'new';

    if (this.isEditMode && this.customerId) {
      this.loadCustomer(+this.customerId);
    } else {
      // Set default values for new customer
      this.customerForm.patchValue({
        type: 'individual',
        status: 'active'
      });
    }

    // Watch for customer type changes to adjust validation
    this.customerForm.get('type')?.valueChanges.subscribe(type => {
      this.updateValidationRules(type);
    });
  }

  saveCustomer() {
    if (this.customerForm.invalid) {
      this.markFormGroupTouched(this.customerForm);
      return;
    }

    this.saving = true;
    const formData = this.customerForm.value;
    const customerData = {...formData, addresses: this.customer.addresses || []};

    const saveOperation = this.isEditMode && this.customerId
      ? this.customerService.update(this.customerId, customerData)
      : this.customerService.create(customerData);

    saveOperation.pipe(
      finalize(() => this.saving = false)
    ).subscribe({
      next: (response) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Customer ${this.isEditMode ? 'updated' : 'created'} successfully`,
          life: 3000
        });

        if (!this.isEditMode) {
          this.router.navigate(['/dashboard/customers/edit', response.id]).then();
        }
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || `Failed to ${this.isEditMode ? 'update' : 'create'} customer`,
          life: 3000
        });
      }
    });
  }

  // Address management methods
  openAddressForm(index?: number) {
    if (index !== undefined) {
      this.editingAddressIndex = index;
      this.selectedAddress = {...this.customer.addresses![index]};
    } else {
      this.editingAddressIndex = -1;
      this.selectedAddress = {} as Address;
    }
    this.showAddressForm = true;
  }

  onAddressSave(address: Address) {
    if (!this.customer.addresses) {
      this.customer.addresses = [];
    }

    if (this.editingAddressIndex >= 0) {
      // Update existing address
      this.customer.addresses[this.editingAddressIndex] = address;
    } else {
      // Add new address
      this.customer.addresses.push(address);
    }

    this.onAddressCancel();
  }

  onAddressCancel() {
    this.showAddressForm = false;
    this.selectedAddress = undefined;
    this.editingAddressIndex = -1;
  }

  removeAddress(index: number) {
    if (this.customer.addresses) {
      this.customer.addresses.splice(index, 1);
    }
  }

  // Form validation helpers
  hasError(fieldName: string, errorType: string): boolean {
    const field = this.customerForm.get(fieldName);
    return !!(field && field.errors?.[errorType] && (field.dirty || field.touched));
  }

  hasMetadataError(fieldName: string, errorType: string): boolean {
    const field = this.customerForm.get(`metadata.${fieldName}`);
    return !!(field && field.errors?.[errorType] && (field.dirty || field.touched));
  }

  private createForm(): FormGroup {
    return this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      email: ['', [Validators.email]],
      phone: [''],
      type: ['individual', Validators.required],
      status: ['active', Validators.required],
      metadata: this.fb.group({
        company_name: [''],
        business_id: [''],
        tax_id: [''],
        notes: ['']
      })
    });
  }

  private updateValidationRules(type: string) {
    const metadata = this.customerForm.get('metadata') as FormGroup;
    const companyName = metadata.get('company_name');
    const businessId = metadata.get('business_id');

    if (type === 'company') {
      companyName?.setValidators([Validators.required]);
      businessId?.setValidators([Validators.required]);
    } else {
      companyName?.clearValidators();
      businessId?.clearValidators();
    }

    companyName?.updateValueAndValidity();
    businessId?.updateValueAndValidity();
  }

  private loadCustomer(id: number) {
    this.customerService.get(id).subscribe({
      next: (customer: Customer) => {
        this.customer = customer;
        this.populateForm(customer);
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to load customer',
          life: 3000
        });
        this.router.navigate(['/dashboard/customers']).then();
      }
    });
  }

  private populateForm(customer: Customer) {
    this.customerForm.patchValue({
      first_name: customer.first_name || '',
      last_name: customer.last_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      status: customer.status || 'active',
      metadata: {
        company_name: customer.metadata?.company_name || '',
        business_id: customer.metadata?.business_id || '',
        tax_id: customer.metadata?.tax_id || '',
        notes: customer.metadata?.notes || ''
      }
    });
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
}
