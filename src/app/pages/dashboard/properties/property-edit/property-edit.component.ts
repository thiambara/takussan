import {Component, inject, OnInit, signal} from '@angular/core';
import {CommonModule, Location} from '@angular/common';
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {MessageService} from 'primeng/api';
import {Property} from '../../../../core/models/http/property.model';
import {Address} from '../../../../core/models/http/address.model';
import {Media} from '../../../../core/models/http/media.model';
import {environment} from '../../../../../environments/environment';
import {finalize} from 'rxjs';
import {ToastModule} from 'primeng/toast';
import {PropertyService} from "../../../../core/services/http/property.service";
import {
  ArrowLeft,
  Home,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  LucideAngularModule,
  MapPin,
  Save
} from 'lucide-angular';
import {PropertyEditBasicComponent} from './steps/property-edit-basic/property-edit-basic.component';
import {PropertyEditDetailsComponent} from './steps/property-edit-details/property-edit-details.component';
import {PropertyEditLocationComponent} from './steps/property-edit-location/property-edit-location.component';
import {PropertyEditMediaComponent} from './steps/property-edit-media/property-edit-media.component';

@Component({
  selector: 'app-property-edit',
  templateUrl: './property-edit.component.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ToastModule,
    LucideAngularModule,
    PropertyEditBasicComponent,
    PropertyEditDetailsComponent,
    PropertyEditLocationComponent,
    PropertyEditMediaComponent
  ],
  providers: [MessageService],
  standalone: true
})
export class PropertyEditComponent implements OnInit {
  // Signals for reactive UI state
  loading = signal(false);
  saving = signal(false);
  uploadingMedia = signal(false);
  activeSection = signal<'basic' | 'details' | 'location' | 'media'>('basic');
  isEditMode = signal(false);

  // Data State
  property: Property = {};
  propertyForm!: FormGroup;
  addressForm!: FormGroup;
  typeSpecificForm!: FormGroup;

  uploadedFiles: any[] = [];
  propertyMedia: Media[] = [];

  apiUrl = environment.apiUrl + '/api';

  // Constants
  readonly countries = [
    {name: 'France', code: 'FR'},
    {name: 'Spain', code: 'ES'},
    {name: 'Germany', code: 'DE'},
    {name: 'United Kingdom', code: 'GB'},
    {name: 'Italy', code: 'IT'},
    {name: 'Senegal', code: 'SN'}
  ];

  // Icons
  readonly icons = {
    Loader2, ArrowLeft, MapPin, Home, LayoutDashboard, Image: ImageIcon, Save
  };

  // Options
  readonly propertyTypes = [
    {label: 'Appartement', value: 'apartment'},
    {label: 'Maison', value: 'house'},
    {label: 'Villa', value: 'villa'},
    {label: 'Terrain', value: 'land'},
    {label: 'Bureau', value: 'office'},
    {label: 'Magasin', value: 'store'}
  ];

  readonly statusOptions = [
    {label: 'Disponible', value: 'available'},
    {label: 'Vendu', value: 'sold'},
    {label: 'Loué', value: 'rented'},
    {label: 'En maintenance', value: 'under_maintenance'},
    {label: 'Indisponible', value: 'unavailable'}
  ];

  readonly visibilityOptions = [
    {label: 'Public', value: 'public'},
    {label: 'Privé', value: 'private'},
    {label: 'Limité', value: 'limited'}
  ];

  readonly positionOptions = [
    {label: 'Façade', value: 'front'},
    {label: 'Arrière', value: 'back'},
    {label: 'Angle', value: 'corner'},
    {label: 'Milieu', value: 'middle'}
  ];

  readonly levelOptions = [
    {label: 'Rez-de-chaussée', value: 'ground'},
    {label: '1er Étage', value: 'first'},
    {label: '2ème Étage', value: 'second'},
    {label: '3ème Étage', value: 'third'},
    {label: 'Penthouse', value: 'penthouse'},
    {label: 'Sous-sol', value: 'basement'}
  ];

  readonly contractTypeOptions = [
    {label: 'Vente', value: 'sale'},
    {label: 'Location', value: 'rent'},
    {label: 'Bail', value: 'lease'}
  ];

  readonly roomsOptions = [
    {label: '1', value: '1'},
    {label: '2', value: '2'},
    {label: '3', value: '3'},
    {label: '4', value: '4'},
    {label: '5', value: '5'},
    {label: '6+', value: '6+'}
  ];

  readonly bathroomsOptions = [
    {label: '1', value: '1'},
    {label: '2', value: '2'},
    {label: '3', value: '3'},
    {label: '4+', value: '4+'}
  ];

  readonly furnishedOptions = [
    {label: 'Meublé', value: 'fully_furnished'},
    {label: 'Semi-meublé', value: 'semi_furnished'},
    {label: 'Non meublé', value: 'unfurnished'}
  ];

  readonly commercialTypeOptions = [
    {label: 'Commerce de détail', value: 'retail'},
    {label: 'Entrepôt', value: 'warehouse'},
    {label: 'Restaurant', value: 'restaurant'},
    {label: 'Hôtel', value: 'hotel'},
    {label: 'Autre', value: 'other'}
  ];

  private propertyService = inject(PropertyService);
  private messageService = inject(MessageService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location)

  ngOnInit() {
    const propertyId = this.route.snapshot.paramMap.get('id');
    if (propertyId && propertyId !== 'new') {
      this.isEditMode.set(true);
      this.loadProperty(propertyId);
    } else {
      this.initializeFormBuilder();
      this.initializeTypeSpecificForm();
    }
  }

  loadProperty(id: string) {
    this.loading.set(true);
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

        this.propertyMedia = (property.media || []).map(media => ({
          ...media,
          is_image: media.mime_type?.includes('image')
        }));

        this.loading.set(false);
      },
      error: (error: any) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Impossible de charger le bien: ' + (error.message || 'Erreur inconnue'),
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
    this.propertyForm?.get('type')?.valueChanges.subscribe({
      next: (type) => {
        this.initializeTypeSpecificForm(type);
      }
    });
  }

  initializeAddressForm(address?: Address) {
    this.addressForm = this.fb.group({
      address: [address?.address || '', Validators.required],
      country: [address?.country || 'SN', Validators.required],
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

  saveProperty() {
    if (this.saving()) return;

    // Validate all forms
    if (this.propertyForm?.invalid || this.addressForm?.invalid) {
      this.markFormGroupTouched(this.propertyForm);
      this.markFormGroupTouched(this.addressForm);
      if (this.typeSpecificForm) {
        this.markFormGroupTouched(this.typeSpecificForm);
      }
      this.messageService.add({
        severity: 'error',
        summary: 'Erreur de validation',
        detail: 'Veuillez remplir tous les champs obligatoires correctement.',
        life: 3000
      });
      return;
    }

    this.saving.set(true);

    const data = {
      ...this.propertyForm.value,
      address: {id: this.property.address?.id, ...this.addressForm.value},
      metadata: this.typeSpecificForm ? this.typeSpecificForm.value : {}
    };

    (this.isEditMode()
        ? this.propertyService.update(this.property.id!, data)
        : this.propertyService.create(data)
    )
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (savedProperty: Property) => {
          if (!this.isEditMode() && this.uploadedFiles.length > 0) {
            this.uploadNewPropertyMedia(savedProperty.id!);
          } else {
            this.saveCompleted();
          }
        },
        error: error => this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: error.message || 'Une erreur est survenue',
          life: 3000
        })
      });
  }

  onCustomUpload(event: any) {
    for (let file of event.files) {
      this.uploadedFiles.push(file);
    }
    this.messageService.add({
      severity: 'info',
      summary: 'Fichiers sélectionnés',
      detail: 'Les fichiers seront téléchargés lors de l\'enregistrement.'
    });
  }

  onServerUpload(event: any) {
    this.uploadingMedia.set(false);
    // Refresh property data to show new media
    if (this.property.id) {
      this.loadProperty(this.property.id.toString());
    }
    this.messageService.add({
      severity: 'success',
      summary: 'Téléchargement réussi',
      detail: 'Les médias ont été ajoutés.'
    });
  }

  removePropertyMedia(media: Media, index: number) {
    if (!this.property.id) return;

    if (confirm('Êtes-vous sûr de vouloir supprimer ce média ?')) {
      this.propertyService.deleteMedia(this.property.id, media.id!).subscribe({
        next: () => {
          this.propertyMedia.splice(index, 1);
          this.messageService.add({
            severity: 'success',
            summary: 'Supprimé',
            detail: 'Média supprimé avec succès',
            life: 3000
          });
        },
        error: (error: any) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Erreur',
            detail: 'Impossible de supprimer le média',
            life: 3000
          });
        }
      });
    }
  }

  removeUploadedFile(index: number) {
    this.uploadedFiles.splice(index, 1);
  }

  setFeaturedMedia(media: Media, index: number) {
    if (!this.property.id) return;

    this.propertyService.setFeaturedMedia(this.property.id, media.id!).subscribe({
      next: () => {
        this.propertyMedia.forEach(item => item.is_featured = false);
        this.propertyMedia[index].is_featured = true;
        this.messageService.add({
          severity: 'success',
          summary: 'Mis en avant',
          detail: 'Image définie comme principale',
          life: 3000
        });
      },
      error: (error: any) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Erreur',
          detail: 'Impossible de définir l\'image principale',
          life: 3000
        });
      }
    });
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

  cancel() {
    this.location.back();
  }

  setActiveSection(section: 'basic' | 'details' | 'location' | 'media') {
    this.activeSection.set(section);
  }

  private uploadNewPropertyMedia(propertyId: number) {
    if (this.uploadedFiles.length === 0) return this.saveCompleted();

    this.uploadingMedia.set(true);
    const files = this.uploadedFiles.map(file => file);

    this.propertyService.uploadMedia(propertyId, files)
      .pipe(finalize(() => {
        this.uploadingMedia.set(false);
        this.uploadedFiles = [];
      }))
      .subscribe({
        next: (uploadedMedia: Media[]) => {
          this.propertyMedia = [...this.propertyMedia, ...uploadedMedia];
          this.saveCompleted();
        },
        error: (error: any) => {
          this.messageService.add({
            severity: 'warning',
            summary: 'Upload incomplet',
            detail: 'Propriété sauvegardée mais échec de l\'upload média: ' + (error.message || 'Erreur'),
            life: 5000
          });
          this.saveCompleted();
        }
      });
  }

  private saveCompleted() {
    this.messageService.add({
      severity: 'success',
      summary: 'Succès',
      detail: 'Bien immobilier enregistré avec succès',
      life: 3000
    });
    this.router.navigate(['/dashboard/properties']).then();
  }
}
