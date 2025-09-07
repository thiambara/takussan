import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {Property} from "../../../core/models/http/property.model";
import {Media} from "../../../core/models/http/media.model";

@Component({
  selector: 'app-property-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './property-card.component.html',
  styleUrls: ['./property-card.component.scss']
})
export class PropertyCardComponent {
  @Input() property!: Property;
  @Input() isFavorite = false;

  @Output() propertyClick = new EventEmitter<Property>();
  @Output() favoriteToggle = new EventEmitter<any>();
  @Output() scheduleVisit = new EventEmitter<Property>();
  @Output() chat = new EventEmitter<Property>();

  get images(): Media[] {
    this.property.media = this.property.media || [];
    return this.property.media.filter((media) => media.mime_type?.includes('image'))
  }

  get featuredImageUrl(): string {
    if (this.images?.length) {
      return this.images[0].preview_url!
    }
    return '';
  }

  get formatedPrice(): string {
    const price = this.property.price;
    if (!price) return '0';
    return new Intl.NumberFormat('fr-FR').format(price);
  }

}

