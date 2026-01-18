import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ArrowRight, ChevronRight, Building } from 'lucide-angular';

@Component({
  selector: 'app-property-edit-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule, DatePickerModule, AutoCompleteModule],
  templateUrl: './property-edit-details.component.html'
})
export class PropertyEditDetailsComponent {
  @Input() propertyForm!: FormGroup;
  @Input() typeSpecificForm!: FormGroup;
  @Input() positionOptions: any[] = [];
  @Input() levelOptions: any[] = [];
  @Input() roomsOptions: any[] = [];
  @Input() bathroomsOptions: any[] = [];
  @Input() furnishedOptions: any[] = [];
  @Input() commercialTypeOptions: any[] = [];

  @Output() next = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();

  readonly icons = {
    ArrowRight,
    ChevronRight,
    Building
  };

  hasError(controlName: string, errorName?: string) {
    if (errorName) return this.propertyForm?.controls[controlName].hasError(errorName);
    const control = this.propertyForm?.get(controlName);
    return control && control.invalid && (control.dirty || control.touched);
  }

  getTypeSpecificLabel(): string {
    const propertyType = this.propertyForm?.get('type')?.value;
    switch (propertyType) {
      case 'apartment': return 'Détails Appartement';
      case 'house': return 'Détails Maison';
      case 'villa': return 'Détails Villa';
      case 'land': return 'Détails Terrain';
      case 'office': return 'Détails Bureau';
      case 'store': return 'Détails Commerce';
      default: return 'Détails Spécifiques';
    }
  }
}
