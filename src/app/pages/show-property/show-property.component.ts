import {Component, inject, OnInit} from '@angular/core';

import {ActivatedRoute, Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Property} from '../../core/models/http/property.model';
import {PropertyService} from '../../core/services/http/property.service';
import {PropertyCardComponent} from '../../shared/components/property-card/property-card.component';
import {BadgeComponent} from "../../shared/components/badge/badge.component";
import {PriceFormatPipe} from "../../shared/pipes/price-format.pipe";
import {AreaFormatPipe} from "../../shared/pipes/area-format.pipe";
import {
  ArrowRight,
  Bath,
  Bed,
  Calendar,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Heart,
  LucideAngularModule,
  MapPin,
  Maximize,
  MessageSquare,
  Phone,
  Share2,
  Star,
  User
} from 'lucide-angular';

@Component({
  selector: 'app-show-property',
  standalone: true,
  imports: [
    FormsModule,
    PropertyCardComponent,
    BadgeComponent,
    PriceFormatPipe,
    AreaFormatPipe,
    LucideAngularModule
],
  templateUrl: './show-property.component.html'
})
export class ShowPropertyComponent implements OnInit {
  property: Property | null = null;
  loading = false;
  // Image gallery
  currentImageIndex = 0;
  showImageModal = false;
  // Active tab
  activeTab: 'description' | 'location' = 'description';
  // Similar properties
  similarProperties: Property[] = [];

  // Icons
  readonly ChevronLeft = ChevronLeft;
  readonly ChevronRight = ChevronRight;
  readonly MapPin = MapPin;
  readonly Heart = Heart;
  readonly Share2 = Share2;
  readonly Phone = Phone;
  readonly MessageSquare = MessageSquare;
  readonly Bed = Bed;
  readonly Bath = Bath;
  readonly Maximize = Maximize;
  readonly Calendar = Calendar;
  readonly Car = Car;
  readonly Clock = Clock;
  readonly Check = Check;
  readonly User = User;
  readonly Star = Star;
  readonly ArrowRight = ArrowRight;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private propertyService = inject(PropertyService);

  ngOnInit(): void {
    const propertyId = this.route.snapshot.paramMap.get('id');
    if (propertyId) {
      this.loadProperty(propertyId);
      this.loadSimilarProperties();
    }
  }

  loadProperty(id: string): void {
    this.loading = true;
    this.propertyService.publicShow(id).subscribe({
      next: (property) => {
        this.property = property;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  loadSimilarProperties(): void {
    this.propertyService.heroSearch({
      per_page: 3,
      properties: {with: ['media']}
    }).subscribe({
      next: (response: any) => {
        this.similarProperties = response.data;
      }
    });
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

  openImageModal(): void {
    this.showImageModal = true;
  }

  closeImageModal(): void {
    this.showImageModal = false;
  }

  // Tab methods
  setActiveTab(tab: 'description' | 'location'): void {
    this.activeTab = tab;
  }

  // Action methods
  saveProperty(): void {
    // Implement save/favorite functionality
  }

  shareProperty(): void {
    // Implement share functionality
  }

  contactAgent(): void {
    // Implement contact agent functionality
  }

  scheduleViewing(): void {
    // Implement schedule viewing functionality
  }

  sendMessage(): void {
    // Implement send message functionality
  }

  callAgent(): void {
    // Implement call agent functionality
  }

  viewAllProperties(): void {
    this.router.navigate(['/search']);
  }
}
