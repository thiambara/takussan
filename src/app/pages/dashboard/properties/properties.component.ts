import {Component, OnInit} from '@angular/core';
import {PropertyListComponent} from "./property-list/property-list.component";
import {PropertyComponentService} from "./component-services/property.component.service";
import {BookingComponentService} from "./component-services/booking.component.service";

@Component({
  selector: 'app-properties',
  templateUrl: './properties.component.html',
  imports: [
    PropertyListComponent
  ],
  providers: [
    BookingComponentService,
    PropertyComponentService,
  ],
  standalone: true
})
export class PropertiesComponent implements OnInit {

  constructor() {
  }

  ngOnInit() {
  }

}
