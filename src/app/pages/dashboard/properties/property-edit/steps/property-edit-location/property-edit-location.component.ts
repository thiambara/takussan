import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MapPin, ChevronRight, ArrowRight } from 'lucide-angular';

@Component({
  selector: 'app-property-edit-location',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './property-edit-location.component.html'
})
export class PropertyEditLocationComponent {
  @Input() addressForm!: FormGroup;
  @Input() countries: any[] = [];

  @Output() next = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();

  readonly icons = {
    MapPin,
    ChevronRight,
    ArrowRight
  };

  hasAddressError(controlName: string, errorName?: string) {
    if (errorName) return this.addressForm?.controls[controlName].hasError(errorName);
    const control = this.addressForm?.get(controlName);
    return control && control.invalid && (control.dirty || control.touched);
  }
}
