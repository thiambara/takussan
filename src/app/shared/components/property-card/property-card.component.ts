import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Property } from '../../../core/models/property.interface';
import { PropertyService } from '../../../core/services/property.service';

@Component({
  selector: 'app-property-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './property-card.component.html'
})
export class PropertyCardComponent {
  @Input() property!: Property;
  @Input() viewMode: 'grid' | 'list' = 'grid';
  
  private propertyService = inject(PropertyService);
  
  currentImageIndex = 0;
  isFavorite = false;
  showContactModal = false;
  
  ngOnInit() {
    // Check if property is in favorites
    this.propertyService.favoriteProperties$.subscribe(favorites => {
      this.isFavorite = favorites.includes(this.property.id);
    });
  }
  
  toggleFavorite(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (this.isFavorite) {
      this.propertyService.removeFromFavorites(this.property.id).subscribe();
    } else {
      this.propertyService.addToFavorites(this.property.id).subscribe();
    }
  }
  
  nextImage(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (this.property.images.length > 1) {
      this.currentImageIndex = (this.currentImageIndex + 1) % this.property.images.length;
    }
  }
  
  previousImage(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (this.property.images.length > 1) {
      this.currentImageIndex = this.currentImageIndex === 0 
        ? this.property.images.length - 1 
        : this.currentImageIndex - 1;
    }
  }
  
  formatPrice(): string {
    const price = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.property.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(this.property.price);
    
    return this.property.priceType === 'rent' ? `${price}/month` : price;
  }
  
  formatArea(): string {
    return new Intl.NumberFormat('en-US').format(this.property.area) + ' sq ft';
  }
  
  getPriceTypeClass(): string {
    return this.property.priceType === 'rent' 
      ? 'bg-green-100 text-green-800' 
      : 'bg-blue-100 text-blue-800';
  }
  
  getPropertyTypeIcon(): string {
    const icons: Record<string, string> = {
      apartment: '🏢',
      house: '🏠',
      condo: '🏙️',
      commercial: '🏬',
      land: '🌳'
    };
    return icons[this.property.propertyType] || '🏠';
  }
}
