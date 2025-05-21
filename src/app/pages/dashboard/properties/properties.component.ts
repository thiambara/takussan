import {Component, OnInit} from '@angular/core';
import {PropertyListComponent} from "./property-list/property-list.component";

@Component({
  selector: 'app-properties',
  templateUrl: './properties.component.html',
  imports: [
    PropertyListComponent
  ],
  providers: [],
  standalone: true
})
export class PropertiesComponent implements OnInit {

  constructor() {
  }

  ngOnInit() {
  }

}
