import {Component, OnInit} from '@angular/core';
import {BookingsListComponent} from "./bookings-list/bookings-list.component";

@Component({
  selector: 'app-bookings',
  templateUrl: './bookings.component.html',
  imports: [
    BookingsListComponent
  ],
  providers: [],
  standalone: true
})
export class BookingsComponent implements OnInit {

  constructor() {
  }

  ngOnInit() {
  }

}
