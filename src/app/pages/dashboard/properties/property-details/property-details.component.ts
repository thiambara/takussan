import {Component, inject, OnInit} from '@angular/core';
import {CommonModule} from "@angular/common";
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {Property} from '../../../../core/models/http/property.model';
import {PropertyService} from '../../../../core/services/http/property.service';
import {BadgeComponent} from "../../../../shared/components/badge/badge.component";
import {PriceFormatPipe} from "../../../../shared/pipes/price-format.pipe";
import {AreaFormatPipe} from "../../../../shared/pipes/area-format.pipe";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit,
  LucideAngularModule,
  MapPin,
  MoreVertical,
  Trash2,
  User,
  Bed,
  Bath,
  Maximize,
  DollarSign,
  Building,
  FileText,
  X
} from 'lucide-angular';
import {Booking} from "../../../../core/models/http/booking.model";

@Component({
  selector: 'app-property-details',
  templateUrl: './property-details.component.html',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    BadgeComponent,
    PriceFormatPipe,
    AreaFormatPipe,
    LucideAngularModule
  ]
})
export class PropertyDetailsComponent implements OnInit {
  property: Property | null = null;
  loading = false;
  activeTab: 'details' | 'bookings' | 'media' = 'details';
  currentImageIndex = 0;
  showGalleryModal = false;

  // Icons
  readonly ArrowLeft = ArrowLeft;
  readonly Edit = Edit;
  readonly Trash2 = Trash2;
  readonly MapPin = MapPin;
  readonly Calendar = Calendar;
  readonly User = User;
  readonly Check = Check;
  readonly Clock = Clock;
  readonly ChevronLeft = ChevronLeft;
  readonly ChevronRight = ChevronRight;
  readonly MoreVertical = MoreVertical;
  readonly Bed = Bed;
  readonly Bath = Bath;
  readonly Maximize = Maximize;
  readonly DollarSign = DollarSign;
  readonly Building = Building;
  readonly FileText = FileText;
  readonly X = X;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private propertyService = inject(PropertyService);

  ngOnInit() {
    const propertyId = this.route.snapshot.paramMap.get('id');
    if (propertyId) {
      this.loadProperty(propertyId);
    }
  }

  loadProperty(id: string) {
    this.loading = true;
    this.propertyService.get(id, {
      with: ['media', 'address', 'bookings', 'bookings.customer', 'bookings.user']
    }).subscribe({
      next: (property: Property) => {
        this.property = property;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        // Handle error (maybe redirect or show toast)
      }
    });
  }

  setActiveTab(tab: 'details' | 'bookings' | 'media') {
    this.activeTab = tab;
  }

  // Image gallery methods
  nextImage(): void {
    if (this.property && this.property.media) {
      this.currentImageIndex = (this.currentImageIndex + 1) % this.property.media.length;
    }
  }

  previousImage(): void {
    if (this.property && this.property.media) {
      this.currentImageIndex = this.currentImageIndex === 0
        ? this.property.media.length - 1
        : this.currentImageIndex - 1;
    }
  }

  selectImage(index: number): void {
    this.currentImageIndex = index;
  }

  openGallery(index: number = 0): void {
    this.currentImageIndex = index;
    this.showGalleryModal = true;
    document.body.style.overflow = 'hidden'; // Prevent scrolling
  }

  closeGallery(): void {
    this.showGalleryModal = false;
    document.body.style.overflow = ''; // Restore scrolling
  }

  deleteProperty() {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce bien ?')) {
       if (this.property && this.property.id) {
         this.propertyService.delete(this.property.id).subscribe({
           next: () => {
             this.router.navigate(['/dashboard/properties']);
           }
         });
       }
    }
  }

  getBookingStatusVariant(status: string | undefined): 'success' | 'warning' | 'danger' | 'neutral' | 'primary' | 'secondary' {
    switch (status) {
      case 'confirmed': return 'success';
      case 'pending': return 'warning';
      case 'cancelled': return 'danger';
      case 'completed': return 'primary';
      default: return 'neutral';
    }
  }

  getBookingStatusLabel(status: string | undefined): string {
    switch (status) {
        case 'confirmed': return 'Confirmé';
        case 'pending': return 'En attente';
        case 'cancelled': return 'Annulé';
        case 'completed': return 'Terminé';
        default: return status || 'Inconnu';
    }
  }
}
