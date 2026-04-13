import {Component, EventEmitter, Input, Output} from '@angular/core';

import {FormGroup, ReactiveFormsModule} from '@angular/forms';
import {ArrowRight, LucideAngularModule, MapPin} from 'lucide-angular';
import {SelectModule} from 'primeng/select';

@Component({
  selector: 'app-property-edit-location',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, SelectModule],
  templateUrl: './property-edit-location.component.html'
})
export class PropertyEditLocationComponent {
  @Input() addressForm!: FormGroup;
  @Input() countries: any[] = [];

  @Output() next = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();

  readonly icons = {
    MapPin,
    ArrowRight
  };

  hasAddressError(controlName: string, errorName?: string) {
    if (errorName) return this.addressForm?.controls[controlName].hasError(errorName);
    const control = this.addressForm?.get(controlName);
    return control && control.invalid && (control.dirty || control.touched);
  }
}
