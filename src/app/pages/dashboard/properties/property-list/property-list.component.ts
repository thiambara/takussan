import {Component, OnInit, TemplateRef, ViewChild} from '@angular/core';
import {MessageService} from '../../../../core/services/message.service';
import {Property} from "../../../../core/models/http/property.model";
import {PropertyService} from "../../../../core/services/http/property.service";
import {CommonModule, TitleCasePipe} from "@angular/common";
import {Router, RouterLink} from "@angular/router";
import {FormsModule} from "@angular/forms";

// Shared Components
import {
  ButtonComponent,
  CardComponent,
  DataTableComponent,
  SearchInputComponent,
  SortEvent,
  StatusBadgeComponent,
  StatusVariant
} from '../../../../shared/components';
import {PaginationResult} from "../../../../core/models/http/base/pagination-result.model";

// Enums

// Table Column Interface
export interface TableColumn {
  field: string;
  header: string;
  sortable?: boolean;
  template?: string;
  width?: string;
}

@Component({
  selector: 'app-property-list',
  templateUrl: './property-list.component.html',
  imports: [
    CommonModule,
    TitleCasePipe,
    RouterLink,
    FormsModule,
    ButtonComponent,
    CardComponent,
    DataTableComponent,
    SearchInputComponent,
    StatusBadgeComponent,
  ],
  standalone: true
})
export class PropertyListComponent implements OnInit {
  @ViewChild('statusTemplate', {static: true}) statusTemplate!: TemplateRef<any>;
  @ViewChild('actionsTemplate', {static: true}) actionsTemplate!: TemplateRef<any>;
  @ViewChild('emptyTemplate', {static: true}) emptyTemplate!: TemplateRef<any>;

  properties: Property[] = [];
  property: Property = {};
  selectedProperties: Property[] = [];
  loading = false;

  searchQuery: string = '';
  searchQueryTimeout!: any;
  rowsPerPageOptions = [5, 10, 20];

  // Pagination properties
  currentPage: number = 1;
  rowsPerPage: number = 10;
  totalPages: number = 1;
  paginatedProperties: Property[] = [];

  // Sorting properties
  sortField: string = '';
  sortOrder: 1 | -1 = 1; // 1 for ascending, -1 for descending

  // Table columns configuration
  tableColumns: TableColumn[] = [
    {
      field: 'created_at',
      header: 'Created At',
      sortable: true,
      width: '150px'
    },
    {
      field: 'title',
      header: 'Title',
      sortable: true,
      width: '200px'
    },
    {
      field: 'bookings_count',
      header: 'Number of Bookings',
      sortable: true,
      width: '150px'
    },
    {
      field: 'status',
      header: 'Status',
      sortable: true,
      template: 'statusTemplate',
      width: '120px'
    },
    {
      field: 'actions',
      header: 'Actions',
      template: 'actionsTemplate',
      width: '150px'
    }
  ];

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
    this.loading = true;
    this.propertyService.index().subscribe({
      next: (data) => {
        this.properties = (data as PaginationResult<Property>).data || [];
        this.updatePagination();
        this.loading = false;
      },
      error: (error) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to load properties',
          life: 3000
        });
        this.loading = false;
      }
    });
  }

  openNew() {
    this.router.navigate(['/dashboard/properties/create']).then();
  }

  onSearch(searchTerm: string) {
    this.searchQuery = searchTerm;
    clearTimeout(this.searchQueryTimeout);
    this.searchQueryTimeout = setTimeout(() => {
      this.currentPage = 1;
      this.updatePagination();
    }, 300);
  }

  onSelectionChange(selectedItems: Property[]) {
    this.selectedProperties = selectedItems;
  }

  onSort(event: SortEvent) {
    this.sortField = event.field;
    this.sortOrder = event.order;
    this.updatePagination();
  }

  getStatusVariant(status: string): StatusVariant {
    switch (status?.toLowerCase()) {
      case 'available':
        return 'success';
      case 'sold':
        return 'danger';
      case 'rented':
        return 'warning';
      case 'under_maintenance':
        return 'info';
      case 'unavailable':
        return 'neutral';
      default:
        return 'neutral';
    }
  }

  exportCSV() {
    const csvData = this.properties.map(property => ({
      'Created At': property.created_at,
      'Title': property.title,
      'Bookings Count': property.bookings_count,
      'Status': property.status
    }));

    const csvContent = this.convertToCSV(csvData);
    this.downloadCSV(csvContent, 'properties.csv');
  }

  // Pagination methods
  goToPage(page: any) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
    }
  }

  onRowsPerPageChange(newRowsPerPage: number) {
    this.rowsPerPage = newRowsPerPage;
    this.currentPage = 1;
    this.updatePagination();
  }

  getStartIndex(): number {
    return (this.currentPage - 1) * this.rowsPerPage + 1;
  }

  getEndIndex(): number {
    return Math.min(this.currentPage * this.rowsPerPage, this.properties.length);
  }

  getPageNumbers(): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (this.totalPages <= maxVisiblePages) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      const halfVisible = Math.floor(maxVisiblePages / 2);
      let start = Math.max(1, this.currentPage - halfVisible);
      let end = Math.min(this.totalPages, start + maxVisiblePages - 1);

      if (end === this.totalPages) {
        start = Math.max(1, end - maxVisiblePages + 1);
      }

      if (start > 1) {
        pages.push(1);
        if (start > 2) {
          pages.push('...');
        }
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < this.totalPages) {
        if (end < this.totalPages - 1) {
          pages.push('...');
        }
        pages.push(this.totalPages);
      }
    }

    return pages;
  }

  private convertToCSV(data: any[]): string {
    if (!data.length) return '';

    const headers = Object.keys(data[0]);
    return [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',')
      )
    ].join('\n');
  }

  private downloadCSV(csvContent: string, fileName: string) {
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  private updatePagination() {
    let filteredProperties = [...this.properties];

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filteredProperties = filteredProperties.filter(property =>
        property.title?.toLowerCase().includes(query) ||
        property.status?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    if (this.sortField) {
      filteredProperties.sort((a, b) => {
        const aValue = this.getFieldValue(a, this.sortField);
        const bValue = this.getFieldValue(b, this.sortField);

        if (aValue < bValue) return -1 * this.sortOrder;
        if (aValue > bValue) return this.sortOrder;
        return 0;
      });
    }

    // Calculate pagination
    this.totalPages = Math.ceil(filteredProperties.length / this.rowsPerPage);
    const startIndex = (this.currentPage - 1) * this.rowsPerPage;
    const endIndex = startIndex + this.rowsPerPage;

    this.paginatedProperties = filteredProperties.slice(startIndex, endIndex);
  }

  private getFieldValue(obj: any, field: string): any {
    return field.split('.').reduce((o, key) => o?.[key], obj) || '';
  }
}
