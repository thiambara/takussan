import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AlertCircle, ArrowRight, ChevronRight } from 'lucide-angular';

@Component({
  selector: 'app-property-edit-basic',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './property-edit-basic.component.html'
})
export class PropertyEditBasicComponent {
  @Input() propertyForm!: FormGroup;
  @Input() propertyTypes: any[] = [];
  @Input() contractTypeOptions: any[] = [];
  @Input() statusOptions: any[] = [];
  @Input() visibilityOptions: any[] = [];

  @Output() next = new EventEmitter<void>();

  readonly icons = {
    AlertCircle,
    ArrowRight,
    ChevronRight
  };

  hasError(controlName: string, errorName?: string) {
    if (errorName) return this.propertyForm?.controls[controlName].hasError(errorName);
    const control = this.propertyForm?.get(controlName);
    return control && control.invalid && (control.dirty || control.touched);
  }
}
