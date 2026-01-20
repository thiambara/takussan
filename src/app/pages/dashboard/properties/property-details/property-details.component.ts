import {Component, computed, inject, OnInit, signal} from '@angular/core';
import {CommonModule, Location} from "@angular/common";
import {ActivatedRoute, Router} from '@angular/router';
import {Property} from '../../../../core/models/http/property.model';
import {PropertyService} from '../../../../core/services/http/property.service';
import {BadgeComponent, BadgeVariant} from "../../../../shared/components/badge/badge.component";
import {PriceFormatPipe} from "../../../../shared/pipes/price-format.pipe";
import {AreaFormatPipe} from "../../../../shared/pipes/area-format.pipe";
import {
  AlertCircle,
  ArrowLeft,
  Bath,
  Bed,
  Building,
  Calendar,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Edit,
  FileText,
  LucideAngularModule,
  Mail,
  MapPin,
  Maximize,
  MoreVertical,
  Phone,
  Share2,
  Trash2,
  TrendingUp,
  User,
  Users,
  X
} from 'lucide-angular';

@Component({
  selector: 'app-property-details',
  templateUrl: './property-details.component.html',
  standalone: true,
  imports: [
    CommonModule,
    BadgeComponent,
    PriceFormatPipe,
    AreaFormatPipe,
    LucideAngularModule
  ]
})
export class PropertyDetailsComponent implements OnInit {
  property = signal<Property | null>(null);
  loading = signal<boolean>(false);
  activeTab = signal<'details' | 'bookings' | 'financials'>('details');

  // Gallery state
  currentImageIndex = signal<number>(0);
  showGalleryModal = signal<boolean>(false);

  // Derived signals for statistics
  totalRevenue = computed(() => {
    const prop = this.property();
    if (!prop?.bookings) return 0;
    return prop.bookings
      .filter(b => b.status === 'confirmed' || b.status === 'completed')
      .reduce((sum, b) => sum + (b.total_amount || 0), 0);
  });

  occupancyRate = computed(() => {
    // Simplified occupancy rate (booked days / 30 days window approximation or total bookings count for now)
    // Real implementation would require date range context
    const prop = this.property();
    if (!prop?.bookings?.length) return 0;
    const activeBookings = prop.bookings.filter(b => b.status === 'confirmed').length;
    // Mock calculation: active bookings * 5% just for demo visualization
    return Math.min(activeBookings * 5, 100);
  });

  nextBooking = computed(() => {
    const prop = this.property();
    if (!prop?.bookings) return null;
    const now = new Date();
    return prop.bookings
      .filter(b => b.start_date && new Date(b.start_date) > now && b.status === 'confirmed')
      .sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime())[0] || null;
  });

  // Icons
  readonly icons = {
    ArrowLeft, Edit, Trash2, MapPin, Calendar, User, Check, Clock,
    ChevronLeft, ChevronRight, MoreVertical, Bed, Bath, Maximize,
    DollarSign, Building, FileText, X, TrendingUp, Users, CalendarCheck,
    AlertCircle, Share2, Phone, Mail
  };

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private propertyService = inject(PropertyService);
  private location = inject(Location);

  ngOnInit() {
    const propertyId = this.route.snapshot.paramMap.get('id');
    if (propertyId) {
      this.loadProperty(propertyId);
    }
  }

  goBack() {
    this.location.back();
  }

  loadProperty(id: string) {
    this.loading.set(true);
    this.propertyService.get(id, {
      with: ['media', 'address', 'bookings', 'bookings.customer', 'bookings.user', 'agency']
    }).subscribe({
      next: (property: Property) => {
        this.property.set(property);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        // Handle error
      }
    });
  }

  setActiveTab(tab: 'details' | 'bookings' | 'financials') {
    this.activeTab.set(tab);
  }

  // Image gallery methods
  nextImage(): void {
    const prop = this.property();
    if (prop?.media) {
      this.currentImageIndex.update(i => (i + 1) % prop.media!.length);
    }
  }

  previousImage(): void {
    const prop = this.property();
    if (prop?.media) {
      this.currentImageIndex.update(i => i === 0 ? prop.media!.length - 1 : i - 1);
    }
  }

  selectImage(index: number): void {
    this.currentImageIndex.set(index);
  }

  openGallery(index: number = 0): void {
    this.currentImageIndex.set(index);
    this.showGalleryModal.set(true);
    document.body.style.overflow = 'hidden';
  }

  closeGallery(): void {
    this.showGalleryModal.set(false);
    document.body.style.overflow = '';
  }

  deleteProperty() {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce bien ?')) {
      const prop = this.property();
      if (prop?.id) {
        this.propertyService.delete(prop.id).subscribe({
          next: () => {
            this.router.navigate(['/dashboard/properties']);
          }
        });
      }
    }
  }

  getBookingStatusVariant(status: string | undefined): BadgeVariant {
    switch (status) {
      case 'confirmed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'cancelled':
        return 'danger';
      case 'completed':
        return 'info';
      default:
        return 'neutral';
    }
  }

  getBookingStatusLabel(status: string | undefined): string {
    switch (status) {
      case 'confirmed':
        return 'Confirmé';
      case 'pending':
        return 'En attente';
      case 'cancelled':
        return 'Annulé';
      case 'completed':
        return 'Terminé';
      default:
        return status || 'Inconnu';
    }
  }
}

