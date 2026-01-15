import {Component, OnInit, ViewChild} from '@angular/core';
import {MessageService} from 'primeng/api';
import {Property} from "../../../../core/models/http/property.model";
import {Toolbar} from "primeng/toolbar";
import {Table, TableModule} from "primeng/table";
import {CommonModule, DatePipe} from "@angular/common";
import {RouterLink} from "@angular/router";
import {Button} from "primeng/button";
import {IconField} from "primeng/iconfield";
import {InputIcon} from "primeng/inputicon";
import {FormsModule} from "@angular/forms";
import {InputText} from "primeng/inputtext";
import {PropertyService} from "../../../../core/services/http/property.service";
import {BadgeComponent, BadgeVariant} from "../../../../shared/components/badge/badge.component";
import {ProprietyStatus} from "../../../../core/models/http/enum-models";
import {ArrowUpDown, Eye, FolderOpen, LucideAngularModule, Pencil, Plus, Search, Upload} from 'lucide-angular';

@Component({
  selector: 'app-property-list',
  templateUrl: './property-list.component.html',
  imports: [
    CommonModule,
    TableModule,
    DatePipe,
    RouterLink,
    Button,
    IconField,
    InputIcon,
    Toolbar,
    FormsModule,
    InputText,
    BadgeComponent,
    LucideAngularModule
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

  // Icons
  readonly Plus = Plus;
  readonly Upload = Upload;
  readonly Search = Search;
  readonly Pencil = Pencil;
  readonly Eye = Eye;
  readonly FolderOpen = FolderOpen;
  readonly ArrowUpDown = ArrowUpDown;

  constructor(
    private propertyService: PropertyService,
    private messageService: MessageService,
  ) {
  }

  ngOnInit() {
    this.getProperties();
  }

  getProperties() {
    this.propertyService.index({
      search_query: this.searchQuery,
      properties: {with_count: 'bookings', with: ['media']}, // Added media to get images
      // filter_fields: {user_id: authUser.id}
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


  onSearch() {
    if (this.searchQueryTimeout) {
      clearTimeout(this.searchQueryTimeout);
    }
    this.searchQueryTimeout = setTimeout(() => {
      this.getProperties();
    }, 500);
  }

  exportCSV() {
    this.propertiesTable.exportCSV();
  }

  getStatusVariant(status?: ProprietyStatus | string): BadgeVariant {
    switch (status) {
      case ProprietyStatus.Available:
        return 'success';
      case ProprietyStatus.Sold:
      case ProprietyStatus.Rented:
      case ProprietyStatus.Unavailable:
        return 'danger';
      case ProprietyStatus.Pending:
      case ProprietyStatus.UnderMaintenance:
        return 'warning';
      default:
        return 'neutral';
    }
  }
}
