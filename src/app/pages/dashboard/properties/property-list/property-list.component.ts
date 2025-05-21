import {Component, OnInit, ViewChild} from '@angular/core';
import {MessageService} from 'primeng/api';
import {Property} from "../../../../core/models/http/property.model";
import {PropertyService} from "../../../../core/sevices/http/property.service";
import {Toolbar} from "primeng/toolbar";
import {Table, TableModule} from "primeng/table";
import {DatePipe} from "@angular/common";
import {Router, RouterLink} from "@angular/router";
import {Button} from "primeng/button";
import {IconField} from "primeng/iconfield";
import {InputIcon} from "primeng/inputicon";
import {FormsModule} from "@angular/forms";
import {InputText} from "primeng/inputtext";

@Component({
  selector: 'app-property-list',
  templateUrl: './property-list.component.html',
  imports: [
    TableModule,
    DatePipe,
    RouterLink,
    Button,
    IconField,
    InputIcon,
    Toolbar,
    FormsModule,
    InputText
  ],
  standalone: true
})
export class PropertyListComponent implements OnInit {
  @ViewChild('propertiesTable') propertiesTable!: Table;

  properties: Property[] = [];
  property: Property = {};
  selectedProperties: Property[] = [];

  searchQuery: string = '';
  searchQueryTimeout!: any;
  rowsPerPageOptions = [5, 10, 20];

  constructor(
    private propertyService: PropertyService,
    private messageService: MessageService,
    private router: Router
  ) {
  }

  ngOnInit() {
    this.getProperties();
  }

  getProperties() {
    console.log(authUser)

    this.propertyService.index({
      search_query: this.searchQuery,
      properties: {with_count: 'bookings'},
      filter_fields: {user_id: authUser.id}
    }).subscribe({
      next: data => this.properties = (data as Property[]),
      error: error => this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'An error has occurred',
        life: 3000
      })
    });
  }

  openNew() {
    this.router.navigate(['/dashboard/properties/edit/new']);
  }

  onSearch() {
    if (this.searchQueryTimeout) {
      clearTimeout(this.searchQueryTimeout);
    }
    this.searchQueryTimeout = setTimeout(() => {
      this.getProperties();
    }, 500);
  }


  showPropertyForm(property?: Property) {
    if (property && property.id) {
      this.router.navigate([`/dashboard/properties/edit/${property.id}`]);
    } else {
      this.router.navigate(['/dashboard/properties/edit/new']);
    }
  }

  exportCSV() {
    this.propertiesTable.exportCSV();
  }
}
