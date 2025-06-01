import {Component, OnInit} from '@angular/core';
import {MessageService} from 'primeng/api';
import {Media} from "../../../../core/models/http/media.model";
import {PropertyService} from "../../../../core/sevices/http/property.service";
import {Property} from "../../../../core/models/http/property.model";
import {Booking} from "../../../../core/models/http/booking.model";
import {CommonModule, NgOptimizedImage} from "@angular/common";
import {finalize} from "rxjs";
import {Button} from "primeng/button";
import {ActivatedRoute, Router} from "@angular/router";
import {CardModule} from 'primeng/card';
import {TagModule} from 'primeng/tag';
import {DividerModule} from 'primeng/divider';
import {DialogModule} from 'primeng/dialog';
import {DatePickerModule} from 'primeng/datepicker';
import {InputTextModule} from 'primeng/inputtext';
import {InputNumberModule} from 'primeng/inputnumber';
import {SelectModule} from 'primeng/select';
import {ToggleSwitchModule} from 'primeng/toggleswitch';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {ToastModule} from 'primeng/toast';
import {BookingFormComponent} from "../booking-form/booking-form.component";
import {BookingCardComponent} from "../booking-card/booking-card.component";
import {GalleriaModule} from "primeng/galleria";

import {TabsModule} from "primeng/tabs";

@Component({
  selector: 'app-property-details',
  templateUrl: './property-details.component.html',
  imports: [
    CommonModule,
    Button,
    CardModule,
    TagModule,
    DividerModule,
    DialogModule,
    DatePickerModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    ToggleSwitchModule,
    FormsModule,
    ReactiveFormsModule,
    ToastModule,
    BookingFormComponent,
    BookingCardComponent,
    GalleriaModule,
    TabsModule,
    NgOptimizedImage,
  ],
  standalone: true
})
export class PropertyDetailsComponent implements OnInit {
  property?: Property;
  propertyId!: number;
  loading = false;
  showMediaPreviewDialog = false;
  selectedMedia: Media | null = null;
  showBookingDialog = false;
  selectedBooking?: Booking;
  isEditMode = false;
  downloadingFile = false;

  activeTabIndex = 0;

  constructor(
    private propertyService: PropertyService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute
  ) {
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.propertyId = +params['id']; // Convert to number
      if (this.propertyId) {
        this.getProperty();
      }
    });
  }

  getProperty() {
    this.loading = true;
    this.propertyService.get(this.propertyId, {
      properties: {
        with: ['bookings', 'bookings.customer', 'media'],
        with_count: 'bookings'
      },
      filter_fields: {'bookings.status': '@in pending,confirmed'}
    })
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (property: Property) => {
          // Ensure metadata is always initialized to avoid template null checks
          if (!property.metadata) {
            property.metadata = {};
          }

          this.property = property;

          // Map media items and add is_image flag
          if (this.property?.media?.length) {
            this.property.media = this.property.media.map(media => ({
              ...media,
              is_image: media.mime_type?.startsWith('image/') || false
            }));
          }

        },
        error: (error: any) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'Failed to load property details',
            life: 3000
          });
        }
      });
  }

  editProperty() {
    this.router.navigate([`/dashboard/properties/edit/${this.propertyId}`]);
  }

  getStatusSeverity(status: string): string {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'confirmed':
        return 'success';
      case 'cancelled':
        return 'danger';
      case 'completed':
        return 'info';
      default:
        return 'secondary';
    }
  }

  openNewBookingDialog() {
    this.selectedBooking = undefined;
    this.isEditMode = false;
    this.showBookingDialog = true;
  }

  editBooking(booking: Booking) {
    this.selectedBooking = booking;
    this.isEditMode = true;
    this.showBookingDialog = true;
  }

  deleteBooking(booking: Booking) {
    // Ici, vous pouvez ajouter une confirmation avant de supprimer
    this.messageService.add({
      severity: 'info',
      summary: 'Confirmation Needed',
      detail: 'Are you sure you want to delete this booking?',
      life: 3000
    });

    // Logique de suppression à implémenter plus tard
    // Pour l'instant, affichons juste un message
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Booking deleted successfully',
      life: 3000
    });

    this.getProperty();
  }

  onBookingSave(booking: Booking) {
    if (!this.property || !this.property.id) return;

    // Here you would call your booking service to save the booking
    // For now, we'll just show a success message and refresh the property
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: `Booking ${this.isEditMode ? 'updated' : 'created'} successfully`,
      life: 3000
    });

    this.showBookingDialog = false;
    this.getProperty();
  }

  onBookingCancel() {
    this.showBookingDialog = false;
    this.selectedBooking = undefined;
  }

  /**
   * Opens the media preview dialog for the selected media item
   * @param media The media item to preview
   */
  openMediaPreview(media: Media) {
    this.selectedMedia = media;
    this.showMediaPreviewDialog = true;
  }

  /**
   * Closes the media preview dialog
   */
  closeMediaPreview() {
    this.showMediaPreviewDialog = false;
    this.selectedMedia = null;
  }

  /**
   * Get type-specific header label
   */
  getTypeSpecificLabel(): string {
    const propertyType = this.property?.type;
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
        return 'Store Details';
      default:
        return 'Property Details';
    }
  }

  /**
   * Check if property is residential type (apartment, house, villa)
   */
  isResidentialType(): boolean {
    return this.property?.type === 'apartment' ||
      this.property?.type === 'house' ||
      this.property?.type === 'villa';
  }

  /**
   * Check if property is of a specific type
   */
  isPropertyType(type: string): boolean {
    return this.property?.type === type;
  }

  /**
   * Convert furnished value to readable label
   */
  getFurnishedLabel(furnished: string | undefined): string {
    if (!furnished) return 'N/A';

    switch (furnished) {
      case 'fully_furnished':
        return 'Fully Furnished';
      case 'semi_furnished':
        return 'Semi-Furnished';
      case 'unfurnished':
        return 'Unfurnished';
      default:
        return furnished || 'N/A';
    }
  }
}
