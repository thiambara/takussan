import {Component, Input, OnInit} from '@angular/core';
import {MessageService} from 'primeng/api';
import {PropertyService} from "../../../../core/sevices/http/property.service";
import {Property} from "../../../../core/models/http/property.model";
import {CommonModule} from "@angular/common";
import {finalize} from "rxjs";
import {Button} from "primeng/button";
import {PropertyComponentService} from "../component-services/property.component.service";

@Component({
  selector: 'app-property-details',
  templateUrl: './property-details.component.html',
  imports: [
    CommonModule,
    Button,
  ],
  standalone: true
})
export class PropertyDetailsComponent implements OnInit {
  property?: Property;
  propertyId!: number;
  loading = false;

  constructor(
    private propertyComponentService: PropertyComponentService,
    private propertyService: PropertyService,
    private messageService: MessageService,
  ) {
  }

  @Input()
  set id(id: string) {
    this.propertyId = +id;
  }

  ngOnInit() {
    this.getProperty();
  }

  getProperty() {
    this.loading = true;
    this.propertyService.get(this.propertyId, {
      properties: {with: ['bookings'], with_count: 'bookings'},
      filter_fields: {'bookings.status': '@in pending,confirmed'}
    })
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: result => {
          this.property = result;
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: error.message || 'An error has occurred',
            life: 3000
          })
        }
      });
  }

  editProperty() {
    if (!this.property) return;
    this.propertyComponentService.showPropertyForm(this.property).onClose.subscribe({
      next: (value) => {
        if (value) {
          this.getProperty();
        }
      }
    });
  }
}
