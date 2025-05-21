import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {MenuItem, MessageService} from 'primeng/api';
import {DialogService, DynamicDialogModule} from 'primeng/dynamicdialog';
import {PropertyService} from '../../../../core/sevices/http/property.service';
import {Property} from '../../../../core/models/http/property.model';
import {Address} from '../../../../core/models/http/address.model';
import {finalize} from 'rxjs';

// PrimeNG Modules
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TextareaModule} from 'primeng/textarea';
import {DropdownModule} from 'primeng/dropdown';
import {InputNumberModule} from 'primeng/inputnumber';
import {InputSwitchModule} from 'primeng/inputswitch';
import {DividerModule} from 'primeng/divider';
import {CardModule} from 'primeng/card';
import {ChipsModule} from 'primeng/chips';
import {TabViewModule} from 'primeng/tabview';
import {FileUploadModule} from 'primeng/fileupload';
import {CalendarModule} from 'primeng/calendar';
import {ToastModule} from 'primeng/toast';
import {StepsModule} from 'primeng/steps';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {TagModule} from 'primeng/tag';

@Component({
  selector: 'app-property-edit',
  templateUrl: './property-edit.component.html',
  styleUrls: ['./property-edit.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    TextareaModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    InputNumberModule,
    InputSwitchModule,
    DividerModule,
    CardModule,
    ChipsModule,
    TabViewModule,
    FileUploadModule,
    CalendarModule,
    ToastModule,
    StepsModule,
    TableModule,
    DialogModule,
    DynamicDialogModule,
    TagModule
  ],
  providers: [DialogService],
  standalone: true
})
export class PropertyEditComponent implements OnInit {
  property: Property = {};
  propertyForm!: FormGroup;
  saving = false;
  isEditMode = false;
  activeIndex = 0;
  uploadedFiles: any[] = [];
  steps: MenuItem[] = [];
  addressForm!: FormGroup;
  countries: any[] = [
    {name: 'France', code: 'FR'},
    {name: 'Spain', code: 'ES'},
    {name: 'Germany', code: 'DE'},
    {name: 'United Kingdom', code: 'GB'},
    {name: 'Italy', code: 'IT'}
  ];

  propertyTypes = [
    {label: 'Apartment', value: 'apartment'},
    {label: 'House', value: 'house'},
    {label: 'Villa', value: 'villa'},
    {label: 'Land', value: 'land'},
    {label: 'Office', value: 'office'},
    {label: 'Store', value: 'store'}
  ];

  statusOptions = [
    {label: 'Available', value: 'available'},
    {label: 'Sold', value: 'sold'},
    {label: 'Rented', value: 'rented'},
    {label: 'Under Maintenance', value: 'under_maintenance'},
    {label: 'Unavailable', value: 'unavailable'}
  ];

  visibilityOptions = [
    {label: 'Public', value: 'public'},
    {label: 'Private', value: 'private'},
    {label: 'Limited', value: 'limited'}
  ];

  positionOptions = [
    {label: 'Front', value: 'front'},
    {label: 'Back', value: 'back'},
    {label: 'Corner', value: 'corner'},
    {label: 'Middle', value: 'middle'}
  ];

  levelOptions = [
    {label: 'Ground Floor', value: 'ground'},
    {label: 'First Floor', value: 'first'},
    {label: 'Second Floor', value: 'second'},
    {label: 'Third Floor', value: 'third'},
    {label: 'Penthouse', value: 'penthouse'},
    {label: 'Basement', value: 'basement'}
  ];

  titleTypeOptions = [
    {label: 'Freehold', value: 'freehold'},
    {label: 'Leasehold', value: 'leasehold'},
    {label: 'Other', value: 'other'}
  ];

  contractTypeOptions = [
    {label: 'Sale', value: 'sale'},
    {label: 'Rent', value: 'rent'},
    {label: 'Lease', value: 'lease'}
  ];

  constructor(
    private propertyService: PropertyService,
    private messageService: MessageService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private dialogService: DialogService
  ) {
  }

  ngOnInit() {
    this.initializeSteps();

    const propertyId = this.route.snapshot.paramMap.get('id');
    if (propertyId && propertyId !== 'new') {
      this.isEditMode = true;
      this.loadProperty(propertyId);
    } else {
      this.initializeFormBuilder();
    }
  }

  initializeSteps() {
    this.steps = [
      {label: 'Basic Information', command: () => this.activeIndex = 0},
      {label: 'Property Details', command: () => this.activeIndex = 1},
      {label: 'Location', command: () => this.activeIndex = 2},
      {label: 'Media', command: () => this.activeIndex = 3}
    ];
  }

  loadProperty(id: string) {
    // Convertir l'id en nombre si le service l'attend comme tel
    const numericId = parseInt(id, 10);
    this.propertyService.get(numericId).subscribe({
      next: (property: Property) => {
        this.property = property;
        this.initializeFormBuilder();

        // Load address if it exists
        if (property.address && property.address.length > 0) {
          this.initializeAddressForm(property.address[0]);
        } else {
          this.initializeAddressForm();
        }

        // Load media if it exists (would need to be implemented based on your API structure)
      },
      error: (error: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load property: ' + (error.message || 'Unknown error'),
          life: 3000
        });
        this.router.navigate(['/dashboard/properties']).then();
      }
    });
  }

  initializeFormBuilder() {
    this.propertyForm = this.fb.group({
      // Basic Information
      title: [this.property.title || '', [Validators.required]],
      description: [this.property.description || '', [Validators.required]],
      type: [this.property.type || 'apartment', [Validators.required]],
      status: [this.property.status || 'available', [Validators.required]],
      visibility: [this.property.visibility || 'public', [Validators.required]],

      // Property Details
      price: [this.property.price || 0, [Validators.required, Validators.min(0)]],
      area: [this.property.area || 0, [Validators.required, Validators.min(0)]],
      position: [this.property.position || ''],
      level: [this.property.level || ''],

      // Legal Information
      title_type: [this.property.title_type || ''],
      with_administrative_monitoring: [this.property.with_administrative_monitoring || false],
      contract_type: [this.property.contract_type || 'sale', [Validators.required]],

      // Additional Information
      servicing: [this.property.servicing || []]
    });
  }

  initializeAddressForm(address?: Address) {
    this.addressForm = this.fb.group({
      address: [address?.address || '', Validators.required],
      country: [address?.country || '', Validators.required],
      state: [address?.state || '', Validators.required],
      city: [address?.city || '', Validators.required],
      district: [address?.district || ''],
      street: [address?.street || '', Validators.required],
      postal_code: ['', Validators.required],
      building: [address?.building || ''],
      latitude: [address?.latitude || ''],
      longitude: [address?.longitude || '']
    });
  }

  hasError(controlName: string, errorName?: string) {
    if (errorName) return this.propertyForm.controls[controlName].hasError(errorName);
    const control = this.propertyForm.get(controlName);
    return control && control.invalid && (control.dirty || control.touched);
  }

  saveProperty() {
    if (this.saving) return;
    if (this.propertyForm.invalid || this.addressForm.invalid) {
      this.markFormGroupTouched(this.propertyForm);
      this.markFormGroupTouched(this.addressForm);
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Please fill in all required fields correctly.',
        life: 3000
      });
      return;
    }

    this.saving = true;

    // Prepare the property data with address
    const data = {
      ...this.propertyForm.value,
      // Add user_id if available in your auth context
      // user_id: authUser.id,
      address: this.addressForm.value
    };

    (this.isEditMode
        ? this.propertyService.update(this.property.id!, data)
        : this.propertyService.create(data)
    )
      .pipe(finalize(() => this.saving = false))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Property saved successfully',
            life: 3000
          });
          this.router.navigate(['/dashboard/properties']).then();
        },
        error: error => this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'An error has occurred',
          life: 3000
        })
      });
  }

  onUpload(event: any) {
    for (let file of event.files) {
      this.uploadedFiles.push(file);
    }

    this.messageService.add({
      severity: 'info',
      summary: 'File Uploaded',
      detail: 'File(s) uploaded successfully'
    });
  }

  nextStep() {
    this.activeIndex = Math.min(this.activeIndex + 1, this.steps.length - 1);
  }

  prevStep() {
    this.activeIndex = Math.max(this.activeIndex - 1, 0);
  }

  markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }

  cancel() {
    this.router.navigate(['/dashboard/properties']).then();
  }
}
