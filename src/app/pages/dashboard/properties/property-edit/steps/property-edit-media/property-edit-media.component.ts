import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { FileUploadModule } from 'primeng/fileupload';
import { File, Star, Trash2, Check, Loader2, Save } from 'lucide-angular';
import { Media } from '../../../../../../core/models/http/media.model';
import { Property } from '../../../../../../core/models/http/property.model';
import { environment } from '../../../../../../../environments/environment';

@Component({
  selector: 'app-property-edit-media',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FileUploadModule],
  templateUrl: './property-edit-media.component.html'
})
export class PropertyEditMediaComponent {
  @Input() property!: Property;
  @Input() propertyMedia: Media[] = [];
  @Input() uploadedFiles: any[] = [];
  @Input() isEditMode = false;
  @Input() saving = false;

  @Output() previous = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() uploadSelect = new EventEmitter<void>();
  @Output() serverUpload = new EventEmitter<any>();
  @Output() customUpload = new EventEmitter<any>();
  @Output() setFeatured = new EventEmitter<{media: Media, index: number}>();
  @Output() removeMedia = new EventEmitter<{media: Media, index: number}>();

  readonly apiUrl = environment.apiUrl + '/api';

  readonly icons = {
    File,
    Star,
    Trash2,
    Check,
    Loader2,
    Save
  };
}
