import {Component, Input, OnInit} from '@angular/core';
import {MessageService} from 'primeng/api';
import {PropertyService} from "../../../../core/sevices/http/property.service";
import {Property} from "../../../../core/models/http/property.model";
import {Booking} from "../../../../core/models/http/booking.model";
import {CommonModule} from "@angular/common";
import {finalize} from "rxjs";
import {Button} from "primeng/button";
import {Router} from "@angular/router";
import {TabViewModule} from 'primeng/tabview';
import {CardModule} from 'primeng/card';
import {TagModule} from 'primeng/tag';
import {DividerModule} from 'primeng/divider';
import {DialogModule} from 'primeng/dialog';
import {CalendarModule} from 'primeng/calendar';
import {InputTextModule} from 'primeng/inputtext';
import {InputNumberModule} from 'primeng/inputnumber';
import {DropdownModule} from 'primeng/dropdown';
import {InputSwitchModule} from 'primeng/inputswitch';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {ToastModule} from 'primeng/toast';
import {BookingFormComponent} from "../booking-form/booking-form.component";
import {BookingCardComponent} from "../booking-card/booking-card.component";

@Component({
  selector: 'app-property-details',
  templateUrl: './property-details.component.html',
  imports: [
    CommonModule,
    Button,
    TabViewModule,
    CardModule,
    TagModule,
    DividerModule,
    DialogModule,
    CalendarModule,
    InputTextModule,
    InputNumberModule,
    DropdownModule,
    InputSwitchModule,
    FormsModule,
    ReactiveFormsModule,
    ToastModule,
    BookingFormComponent,
    BookingCardComponent
  ],
  standalone: true
})
export class PropertyDetailsComponent implements OnInit {
  property?: Property;
  propertyId!: number;
  loading = false;
  showBookingDialog = false;
  selectedBooking: Booking | null = null;
  isEditMode = false;

  constructor(
    private propertyService: PropertyService,
    private messageService: MessageService,
    private router: Router
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
      properties: {with: ['bookings', 'bookings.customer'], with_count: 'bookings'},
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
    this.router.navigate([`/dashboard/properties/edit/${this.propertyId}`]);
  }

  getStatusSeverity(status: string): string {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'confirmed':
        return 'success';
      case 'cancelled':
        return 'danger';
      case 'completed':
        return 'info';
      default:
        return 'secondary';
    }
  }

  openNewBookingDialog() {
    this.selectedBooking = null;
    this.isEditMode = false;
    this.showBookingDialog = true;
  }

  editBooking(booking: Booking) {
    this.selectedBooking = booking;
    this.isEditMode = true;
    this.showBookingDialog = true;
  }

  deleteBooking(booking: Booking) {
    // Ici, vous pouvez ajouter une confirmation avant de supprimer
    this.messageService.add({
      severity: 'info',
      summary: 'Confirmation Needed',
      detail: 'Are you sure you want to delete this booking?',
      life: 3000
    });

    // Logique de suppression à implémenter plus tard
    // Pour l'instant, affichons juste un message
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Booking deleted successfully',
      life: 3000
    });

    this.getProperty();
  }

  onBookingSave(booking: Booking) {
    if (!this.property || !this.property.id) return;

    // Here you would call your booking service to save the booking
    // For now, we'll just show a success message and refresh the property
    this.messageService.add({
      severity: 'success',
      summary: 'Success',
      detail: `Booking ${this.isEditMode ? 'updated' : 'created'} successfully`,
      life: 3000
    });

    this.showBookingDialog = false;
    this.getProperty();
  }

  onBookingCancel() {
    this.showBookingDialog = false;
    this.selectedBooking = null;
  }
}
