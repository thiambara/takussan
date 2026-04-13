import {Component, OnInit} from '@angular/core';
import {MessageService} from 'primeng/api';
import {Property} from "../../../../core/models/http/property.model";
import { CommonModule, DatePipe, NgOptimizedImage } from "@angular/common";
import {RouterLink} from "@angular/router";
import {Button} from "primeng/button";
import {FormsModule} from "@angular/forms";
import {PropertyService} from "../../../../core/services/http/property.service";
import {BadgeComponent, BadgeVariant} from "../../../../shared/components/badge/badge.component";
import {ProprietyStatus} from "../../../../core/models/http/enum-models";
import {
  ArrowUpDown,
  Calendar,
  Download,
  Eye,
  FileUp,
  Filter,
  FolderOpen,
  LucideAngularModule,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users
} from 'lucide-angular';
import {FileUploadModule} from "primeng/fileupload";
import {MenuModule} from "primeng/menu";
import {TooltipModule} from "primeng/tooltip";
import {TagModule} from "primeng/tag";
import {PaginatorModule, PaginatorState} from 'primeng/paginator';
import {PaginationResult} from "../../../../core/models/http/base/pagination-result.model";

@Component({
  selector: 'app-property-list',
  templateUrl: './property-list.component.html',
  imports: [
    CommonModule,
    DatePipe,
    RouterLink,
    Button,
    FormsModule,
    BadgeComponent,
    LucideAngularModule,
    FileUploadModule,
    MenuModule,
    TooltipModule,
    TagModule,
    PaginatorModule,
    NgOptimizedImage
  ],
  standalone: true
})
export class PropertyListComponent implements OnInit {
  properties: Property[] = [];
  loading = false;

  // Pagination
  totalRecords: number = 0;
  first: number = 0;
  rows: number = 10;
  rowsPerPageOptions: number[] = [5, 10, 20, 50];

  searchQuery: string = '';
  searchQueryTimeout!: any;

  // Icons
  readonly Plus = Plus;
  readonly Download = Download;
  readonly Search = Search;
  readonly Pencil = Pencil;
  readonly Eye = Eye;
  readonly FolderOpen = FolderOpen;
  readonly ArrowUpDown = ArrowUpDown;
  readonly FileUp = FileUp;
  readonly Filter = Filter;
  readonly MoreHorizontal = MoreHorizontal;
  readonly Trash2 = Trash2;
  readonly MapPin = MapPin;
  readonly Calendar = Calendar;
  readonly Users = Users;

  constructor(
    private propertyService: PropertyService,
    private messageService: MessageService,
  ) {
  }

  ngOnInit() {
    this.getProperties();
  }

  getProperties() {
    this.loading = true;
    const page = (this.first / this.rows) + 1;

    this.propertyService.index({
      search_query: this.searchQuery,
      page: page,
      per_page: this.rows,
      properties: {with_count: 'bookings', with: ['media']},
    }).subscribe({
      next: data => {
        if ('data' in data && 'total' in data) {
          // It's a PaginationResult
          const paginationResult = data as PaginationResult<Property>;
          this.properties = paginationResult.data;
          this.totalRecords = paginationResult.total;
        } else {
          // It's an array (fallback, though unlikely given service setup)
          this.properties = (data as Property[]);
          this.totalRecords = this.properties.length;
        }
        this.loading = false;
      },
      error: error => {
        this.loading = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'An error has occurred',
          life: 3000
        });
      }
    });
  }

  onPageChange(event: PaginatorState) {
    this.first = event.first ?? 0;
    this.rows = event.rows ?? 10;
    this.getProperties();
  }

  onSearch() {
    if (this.searchQueryTimeout) {
      clearTimeout(this.searchQueryTimeout);
    }
    this.searchQueryTimeout = setTimeout(() => {
      this.first = 0; // Reset to first page on search
      this.getProperties();
    }, 500);
  }

  exportCSV() {
    // Manual CSV export implementation
    if (!this.properties || this.properties.length === 0) {
      return;
    }

    const headers = ['ID', 'Title', 'City', 'Status', 'Created At', 'Bookings'];
    const rows = this.properties.map(p => [
      p.id,
      `"${(p.title || '').replace(/"/g, '""')}"`, // Escape quotes
      `"${(p.address?.city || '').replace(/"/g, '""')}"`,
      p.status,
      p.created_at ? new Date(p.created_at).toLocaleDateString() : '',
      p.bookings_count || 0
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'properties_export.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  onImport(event: any) {
    // Handle file upload
    const file = event.files[0];
    if (file) {
      this.messageService.add({
        severity: 'info',
        summary: 'Info',
        detail: 'Import functionality will be implemented here',
        life: 3000
      });
      // Clear the file upload
      event.originalEvent.target.value = '';
    }
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

  deleteProperty(property: Property) {
    this.messageService.add({
      severity: 'info',
      summary: 'Info',
      detail: 'Delete functionality to be implemented',
      life: 3000
    });
  }
}
