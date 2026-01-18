import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Address} from '../../../core/models/http/address.model';

// PrimeNG Modules
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {DialogModule} from 'primeng/dialog';
import {TextareaModule} from 'primeng/textarea';
import {TooltipModule} from 'primeng/tooltip';
import {Select} from "primeng/select";
import {LucideAngularModule, Home, Briefcase, Truck, CreditCard, MapPin, X, Check} from 'lucide-angular';

@Component({
  selector: 'app-address-form',
  templateUrl: './address-form.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    ButtonModule,
    DialogModule,
    TextareaModule,
    TooltipModule,
    Select,
    LucideAngularModule
  ]
})
export class AddressFormComponent implements OnInit {
  @Input() visible = false;
  @Input() address?: Address;
  @Input() isEdit = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() save = new EventEmitter<Address>();
  @Output() cancel = new EventEmitter<void>();

  addressForm!: FormGroup;

  // Icons
  readonly Home = Home;
  readonly Briefcase = Briefcase;
  readonly Truck = Truck;
  readonly CreditCard = CreditCard;
  readonly MapPin = MapPin;
  readonly X = X;
  readonly Check = Check;

  // Address type options
  addressTypes = [
    {label: 'Residential', value: 'residential'},
    {label: 'Business', value: 'business'},
    {label: 'Shipping', value: 'shipping'},
    {label: 'Billing', value: 'billing'},
    {label: 'Other', value: 'other'}
  ];

  constructor(private fb: FormBuilder) {
  }

  ngOnInit(): void {
    this.initForm();
  }

  ngOnChanges(): void {
    if (this.addressForm && this.address) {
      this.patchForm();
    }
  }

  onCancel(): void {
    this.addressForm.reset();
    this.visible = false;
    this.visibleChange.emit(false);
    this.cancel.emit();
  }

  onSubmit(): void {
    if (this.addressForm.invalid) {
      this.addressForm.markAllAsTouched();
      return;
    }

    const formData = this.addressForm.value;
    this.save.emit(formData);
    this.addressForm.reset();
    this.visible = false;
    this.visibleChange.emit(false);
  }

  private initForm(): void {
    this.addressForm = this.fb.group({
      label: ['', [Validators.required]],
      address: ['', [Validators.required]],
      city: ['', [Validators.required]],
      state: [''],
      country: ['', [Validators.required]],
      postal_code: [''],
      type: ['residential']
    });

    if (this.address) {
      this.patchForm();
    }
  }

  private patchForm(): void {
    if (this.address) {
      this.addressForm.patchValue({
        label: this.address.label || '',
        address: this.address.address || '',
        city: this.address.city || '',
        state: this.address.state || '',
        country: this.address.country || '',
        postal_code: this.address.postal_code || '',
        type: this.address.type || 'residential'
      });
    }
  }
}
