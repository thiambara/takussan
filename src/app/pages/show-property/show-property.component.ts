import {Component, inject, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ActivatedRoute, Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {Property} from '../../core/models/http/property.model';
import {PropertyService} from '../../core/services/http/property.service';
import {PropertyCardComponent} from '../../shared/components/product-card/property-card.component';

@Component({
  selector: 'app-show-property',
  standalone: true,
  imports: [CommonModule, FormsModule, PropertyCardComponent],
  templateUrl: './show-property.component.html',
  styleUrls: ['./show-property.component.scss']
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
    this.propertyService.get(id).subscribe({
      next: (property) => {
        this.property = property;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading property:', error);
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
    console.log('Save property');
  }

  shareProperty(): void {
    // Implement share functionality
    console.log('Share property');
  }

  contactAgent(): void {
    // Implement contact agent functionality
    console.log('Contact agent');
  }

  scheduleViewing(): void {
    // Implement schedule viewing functionality
    console.log('Schedule viewing');
  }

  sendMessage(): void {
    // Implement send message functionality
    console.log('Send message');
  }

  callAgent(): void {
    // Implement call agent functionality
    console.log('Call agent');
  }

  viewAllProperties(): void {
    this.router.navigate(['/client/search']);
  }
}
