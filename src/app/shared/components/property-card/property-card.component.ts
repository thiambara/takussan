import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule, NgOptimizedImage} from '@angular/common';
import {Property} from "../../../core/models/http/property.model";
import {Media} from "../../../core/models/http/media.model";
import {ArrowRight, Bath, Bed, Calendar, Heart, LucideAngularModule, MapPin, Maximize} from 'lucide-angular';
import {BadgeComponent} from "../badge/badge.component";
import {PriceFormatPipe} from "../../pipes/price-format.pipe";
import {AreaFormatPipe} from "../../pipes/area-format.pipe";

@Component({
  selector: 'app-property-card',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    BadgeComponent,
    PriceFormatPipe,
    AreaFormatPipe,
    NgOptimizedImage
  ],
  templateUrl: './property-card.component.html'
})
export class PropertyCardComponent {
  @Input() property!: Property;
  @Input() isFavorite = false;
  @Input() viewMode: 'grid' | 'list' = 'grid';

  @Output() propertyClick = new EventEmitter<Property>();
  @Output() favoriteToggle = new EventEmitter<any>();
  @Output() scheduleVisit = new EventEmitter<Property>();
  @Output() chat = new EventEmitter<Property>();

  // Icons
  readonly MapPin = MapPin;
  readonly Bed = Bed;
  readonly Bath = Bath;
  readonly Maximize = Maximize;
  readonly Heart = Heart;
  readonly Calendar = Calendar;
  readonly ArrowRight = ArrowRight;

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
}

