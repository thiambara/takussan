import {Component, EventEmitter, Input, Output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {Property} from "../../../core/models/http/property.model";
import {Media} from "../../../core/models/http/media.model";

@Component({
  selector: 'app-product-card',
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
  currentImageIndex = 0;

  get images(): Media[] {
    this.property.media = this.property.media || [];
    return this.property.media.filter((media) => media.mime_type?.includes('image'))
  }

  setCurrentImage(index: number, event: Event): void {
    event.stopPropagation();
    this.currentImageIndex = index;
  }

  onPropertyClick(): void {
    this.propertyClick.emit(this.property);
  }

  onToggleFavorite(event: Event): void {
    event.stopPropagation();
    this.favoriteToggle.emit(this.property.id!);
  }

  onScheduleVisit(event: Event): void {
    event.stopPropagation();
    this.scheduleVisit.emit(this.property);
  }

  onChat(event: Event): void {
    event.stopPropagation();
    this.chat.emit(this.property);
  }

  onImageError(event: any): void {
    event.target.src = 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg';
  }

  onAgentImageError(event: any): void {
    event.target.src = 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg';
  }
}

