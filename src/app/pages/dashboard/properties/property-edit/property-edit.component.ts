import {Component, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {MenuItem, MessageService} from 'primeng/api';
import {DialogService, DynamicDialogModule} from 'primeng/dynamicdialog';
import {PropertyService} from '../../../../core/sevices/http/property.service';
import {Property} from '../../../../core/models/http/property.model';
import {Address} from '../../../../core/models/http/address.model';
import {Media} from '../../../../core/models/http/media.model';
import {environment} from '../../../../../environments/environment';
import {finalize} from 'rxjs';

// PrimeNG Modules
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TextareaModule} from 'primeng/textarea';
import {SelectModule} from 'primeng/select';
import {InputNumberModule} from 'primeng/inputnumber';
import {ToggleSwitchModule} from 'primeng/toggleswitch';
import {DividerModule} from 'primeng/divider';
import {CardModule} from 'primeng/card';
import {AutoCompleteModule} from 'primeng/autocomplete';
import {TabViewModule} from 'primeng/tabview';
import {FileUploadModule} from 'primeng/fileupload';
import {DatePickerModule} from 'primeng/datepicker';
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
    SelectModule,
    InputNumberModule,
    ToggleSwitchModule,
    DividerModule,
    CardModule,
    AutoCompleteModule,
    TabViewModule,
    FileUploadModule,
    DatePickerModule,
    ToastModule,
    StepsModule,
    TableModule,
    DialogModule,
    DynamicDialogModule,
    TagModule
  ],
  providers: [DialogService, MessageService],
  standalone: true
})
export class PropertyEditComponent implements OnInit {
  property: Property = {};
  propertyForm!: FormGroup;
  saving = false;
  loading = false;
  isEditMode = false;
  activeIndex = 0;
  uploadedFiles: any[] = [];
  propertyMedia: Media[] = [];
  uploadingMedia = false;
  steps: MenuItem[] = [];
  addressForm!: FormGroup;
  typeSpecificForm!: FormGroup;
  apiUrl = environment.apiUrl + '/api'; // API URL for direct uploads
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

  // Residential specific options
  roomsOptions = [
    {label: '1', value: '1'},
    {label: '2', value: '2'},
    {label: '3', value: '3'},
    {label: '4', value: '4'},
    {label: '5', value: '5'},
    {label: '6+', value: '6+'}
  ];

  bathroomsOptions = [
    {label: '1', value: '1'},
    {label: '2', value: '2'},
    {label: '3', value: '3'},
    {label: '4+', value: '4+'}
  ];

  furnishedOptions = [
    {label: 'Fully Furnished', value: 'fully_furnished'},
    {label: 'Semi-Furnished', value: 'semi_furnished'},
    {label: 'Unfurnished', value: 'unfurnished'}
  ];

  // Land specific options
  landTypeOptions = [
    {label: 'Residential', value: 'residential'},
    {label: 'Commercial', value: 'commercial'},
    {label: 'Agricultural', value: 'agricultural'},
    {label: 'Industrial', value: 'industrial'},
    {label: 'Mixed Use', value: 'mixed_use'}
  ];

  zoningOptions = [
    {label: 'Residential', value: 'residential'},
    {label: 'Commercial', value: 'commercial'},
    {label: 'Industrial', value: 'industrial'},
    {label: 'Agricultural', value: 'agricultural'},
    {label: 'Mixed Use', value: 'mixed_use'}
  ];

  // Commercial specific options
  commercialTypeOptions = [
    {label: 'Retail', value: 'retail'},
    {label: 'Office', value: 'office'},
    {label: 'Industrial', value: 'industrial'},
    {label: 'Warehouse', value: 'warehouse'},
    {label: 'Restaurant', value: 'restaurant'},
    {label: 'Hotel', value: 'hotel'}
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
      this.initializeTypeSpecificForm();
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
    this.loading = true;
    const numericId = parseInt(id, 10);
    this.propertyService.get(numericId, {properties: {with: 'media'}}).subscribe({
      next: (property: Property) => {
        this.property = property;
        this.initializeFormBuilder();
        this.initializeTypeSpecificForm(property.type);
        if (property.address) {
          this.initializeAddressForm(property.address);
        } else {
          this.initializeAddressForm();
        }

        this.propertyMedia = (property.media || []).map(media => ({...media, is_image: media.mime_type?.includes('image')}));

        this.loading = false;
      },
      error: (error: any) => {
        this.loading = false;
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

    // Subscribe to property type changes to update type-specific form
    this.propertyForm?.get('type')?.valueChanges.subscribe(type => {
      this.initializeTypeSpecificForm(type);
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
      postal_code: [address?.postal_code || ''],
      building: [address?.building || ''],
      latitude: [address?.latitude || ''],
      longitude: [address?.longitude || '']
    });
  }

  hasError(controlName: string, errorName?: string) {
    if (errorName) return this.propertyForm?.controls[controlName].hasError(errorName);
    const control = this.propertyForm?.get(controlName);
    return control && control.invalid && (control.dirty || control.touched);
  }

  saveProperty() {
    if (this.saving) return;
    if (this.propertyForm?.invalid || this.addressForm?.invalid) {
      this.markFormGroupTouched(this.propertyForm);
      this.markFormGroupTouched(this.addressForm);
      if (this.typeSpecificForm) {
        this.markFormGroupTouched(this.typeSpecificForm);
      }
      this.messageService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Please fill in all required fields correctly.',
        life: 3000
      });
      return;
    }

    this.saving = true;

    // Prepare the property data with address and type-specific data
    const data = {
      ...this.propertyForm.value,
      // Add user_id if available in your auth context
      // user_id: authUser.id,
      address: {id: this.property.address?.id, ...this.addressForm.value},
      metadata: this.typeSpecificForm ? this.typeSpecificForm.value : {}
    };

    (this.isEditMode
        ? this.propertyService.update(this.property.id!, data)
        : this.propertyService.create(data)
    )
      .pipe(finalize(() => this.saving = false))
      .subscribe({
        next: (savedProperty: Property) => {
          // Handle media uploads for a new property (for existing properties, media is uploaded directly)
          if (!this.isEditMode && this.uploadedFiles.length > 0) {
            this.uploadNewPropertyMedia(savedProperty.id!);
          } else {
            this.saveCompleted();
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


  /**
   * Handle file upload completion
   */
  onUpload(event: any) {
    this.uploadingMedia = false;
    for (let file of event.files) {
      this.uploadedFiles.push(file);
    }

    this.messageService.add({
      severity: 'info',
      summary: 'File Uploaded',
      detail: 'File(s) uploaded successfully'
    });
  }

  /**
   * Remove an existing property media item
   */
  removePropertyMedia(media: Media, index: number) {
    if (!this.property.id) return;

    if (confirm('Are you sure you want to delete this media?')) {
      // Here you would call a service method to delete the media from the server
      this.propertyService.deleteMedia(this.property.id, media.id!).subscribe({
        next: () => {
          this.propertyMedia.splice(index, 1);
          this.messageService.add({
            severity: 'success',
            summary: 'Media Deleted',
            detail: 'Media was successfully deleted',
            life: 3000
          });
        },
        error: (error: any) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Could not delete media: ' + (error.message || 'Unknown error'),
            life: 3000
          });
        }
      });
    }
  }

  /**
   * Remove a newly uploaded file that hasn't been saved yet
   */
  removeUploadedFile(index: number) {
    this.uploadedFiles.splice(index, 1);
  }

  /**
   * Set a media item as the featured image
   */
  setFeaturedMedia(media: Media, index: number) {
    if (!this.property.id) return;

    this.propertyService.setFeaturedMedia(this.property.id, media.id!).subscribe({
      next: () => {
        // Update local state - mark this as featured and others as not featured
        this.propertyMedia.forEach(item => item.is_featured = false);
        this.propertyMedia[index].is_featured = true;

        this.messageService.add({
          severity: 'success',
          summary: 'Featured Image Set',
          detail: 'This image is now the featured image for the property',
          life: 3000
        });
      },
      error: (error: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Could not set featured media: ' + (error.message || 'Unknown error'),
          life: 3000
        });
      }
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

  initializeTypeSpecificForm(type?: string) {
    const propertyType = type || this.propertyForm?.get('type')?.value || 'apartment';
    const metadata = this.property.metadata || {};

    // Create form group based on property type
    switch (propertyType) {
      case 'apartment':
      case 'house':
      case 'villa':
        this.typeSpecificForm = this.fb.group({
          rooms: [metadata.rooms || '', [Validators.required]],
          bathrooms: [metadata.bathrooms || '', [Validators.required]],
          furnished: [metadata.furnished || 'unfurnished'],
          parking_spaces: [metadata.parking_spaces || 0, [Validators.min(0)]],
          has_balcony: [metadata.has_balcony || false],
          has_garden: [metadata.has_garden || false],
          has_pool: [metadata.has_pool || false],
          has_elevator: [metadata.has_elevator || false],
          construction_year: [metadata.construction_year || null],
          heating_type: [metadata.heating_type || ''],
          air_conditioning: [metadata.air_conditioning || false]
        });
        break;
      case 'land':
        this.typeSpecificForm = this.fb.group({
          land_type: [metadata.land_type || '', [Validators.required]],
          zoning: [metadata.zoning || ''],
          is_developed: [metadata.is_developed || false],
          has_water_connection: [metadata.has_water_connection || false],
          has_electricity_connection: [metadata.has_electricity_connection || false],
          has_sewage_connection: [metadata.has_sewage_connection || false],
          topography: [metadata.topography || ''],
          soil_type: [metadata.soil_type || '']
        });
        break;
      case 'office':
        this.typeSpecificForm = this.fb.group({
          rooms: [metadata.rooms || '', [Validators.required]],
          bathrooms: [metadata.bathrooms || '', [Validators.required]],
          floor: [metadata.floor || ''],
          has_reception: [metadata.has_reception || false],
          has_kitchen: [metadata.has_kitchen || false],
          has_meeting_rooms: [metadata.has_meeting_rooms || false],
          has_parking: [metadata.has_parking || false],
          has_security: [metadata.has_security || false],
          internet_connection: [metadata.internet_connection || ''],
          air_conditioning: [metadata.air_conditioning || false]
        });
        break;
      case 'store':
        this.typeSpecificForm = this.fb.group({
          commercial_type: [metadata.commercial_type || '', [Validators.required]],
          storefront_width: [metadata.storefront_width || 0, [Validators.min(0)]],
          has_storage: [metadata.has_storage || false],
          has_loading_dock: [metadata.has_loading_dock || false],
          has_parking: [metadata.has_parking || false],
          pedestrian_traffic: [metadata.pedestrian_traffic || ''],
          visibility: [metadata.store_visibility || '']
        });
        break;
      default:
        this.typeSpecificForm = this.fb.group({});
    }
  }

  getTypeSpecificLabel(): string {
    const propertyType = this.propertyForm?.get('type')?.value;
    switch (propertyType) {
      case 'apartment':
        return 'Apartment Details';
      case 'house':
        return 'House Details';
      case 'villa':
        return 'Villa Details';
      case 'land':
        return 'Land Details';
      case 'office':
        return 'Office Details';
      case 'store':
        return 'Commercial Details';
      default:
        return 'Property Details';
    }
  }

  cancel() {
    this.router.navigate(['/dashboard/properties']).then();
  }

  /**
   * Upload media files for a newly created property
   */
  private uploadNewPropertyMedia(propertyId: number) {
    console.log(this.uploadedFiles);
    if (this.uploadedFiles.length === 0) return this.saveCompleted();

    this.uploadingMedia = true;
    const files = this.uploadedFiles.map(file => file);

    this.propertyService.uploadMedia(propertyId, files)
      .pipe(finalize(() => {
        this.uploadingMedia = false;
        this.uploadedFiles = [];
      }))
      .subscribe({
        next: (uploadedMedia) => {
          this.propertyMedia = [...this.propertyMedia, ...uploadedMedia];
          this.saveCompleted();
        },
        error: (error: any) => {
          this.messageService.add({
            severity: 'warning',
            summary: 'Media Upload Failed',
            detail: 'Property was saved but media upload failed: ' + (error.message || 'Unknown error'),
            life: 5000
          });
          this.saveCompleted();
        }
      });
  }

  /**
   * Complete the save operation and navigate to properties list
   */
  private saveCompleted() {
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Property saved successfully',
      life: 3000
    });
    this.router.navigate(['/dashboard/properties']).then();
  }
}
