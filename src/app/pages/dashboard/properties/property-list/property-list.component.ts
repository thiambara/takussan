import {Component, OnInit} from '@angular/core';
import {MessageService} from '../../../../core/services/message.service';
import {Property} from "../../../../core/models/http/property.model";
import {PropertyService} from "../../../../core/services/http/property.service";
import {CommonModule, TitleCasePipe} from "@angular/common";
import {Router, RouterLink} from "@angular/router";
import {FormsModule} from "@angular/forms";

// Shared Components
import {
  CardComponent,
  SearchInputComponent,
  StatusBadgeComponent,
  StatusVariant,
  ToolbarComponent
} from '../../../../shared/components';
import {PaginationResult} from "../../../../core/models/http/base/pagination-result.model";

@Component({
  selector: 'app-property-list',
  templateUrl: './property-list.component.html',
  imports: [
    CommonModule,
    TitleCasePipe,
    RouterLink,
    FormsModule,
    CardComponent,
    SearchInputComponent,
    StatusBadgeComponent,
    ToolbarComponent,
  ],
  standalone: true
})
export class PropertyListComponent implements OnInit {

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

  // Sorting properties
  sortField: string = '';
  sortOrder: 1 | -1 = 1; // 1 for ascending, -1 for descending

  // Table columns configuration

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
    this.propertyService.index({
      page: this.currentPage,
      per_page: this.rowsPerPage,
      search_query: this.searchQuery
    }).subscribe({
      next: (data) => {
        this.properties = (data as PaginationResult<Property>).data || [];
        this.totalPages = (data as PaginationResult<Property>).last_page || 1;
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
    this.router.navigate(['edit/new']).then();
  }

  onSearch(searchTerm: string) {
    this.searchQuery = searchTerm;
    clearTimeout(this.searchQueryTimeout);
    this.searchQueryTimeout = setTimeout(() => {
      this.currentPage = 1;
      this.getProperties();
    }, 300);
  }

  // Selection methods
  isAllSelected(): boolean {
    return this.properties.length > 0 && this.selectedProperties.length === this.properties.length;
  }

  isSomeSelected(): boolean {
    return this.selectedProperties.length > 0 && this.selectedProperties.length < this.properties.length;
  }

  isPropertySelected(property: Property): boolean {
    return this.selectedProperties.some(selected => selected.id === property.id);
  }

  onSelectAll(event: any): void {
    if (event.target.checked) {
      this.selectedProperties = [...this.properties];
    } else {
      this.selectedProperties = [];
    }
  }

  toggleSelection(property: Property): void {
    const index = this.selectedProperties.findIndex(selected => selected.id === property.id);
    if (index > -1) {
      this.selectedProperties.splice(index, 1);
    } else {
      this.selectedProperties.push(property);
    }
  }

  // Sorting methods
  onSort(field: string): void {
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder === 1 ? -1 : 1;
    } else {
      this.sortField = field;
      this.sortOrder = 1;
    }
    this.getProperties();
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
      'Title': property.title,
      'Type': property.type,
      'Location': property.address?.label,
      'Price': property.price,
      'Status': property.status,
      'Created At': property.created_at
    }));

    const csvContent = this.convertToCSV(csvData);
    this.downloadCSV(csvContent, 'properties.csv');
  }

  // Utility methods
  trackByProperty(_: number, property: Property): any {
    return property.id;
  }

  formatCurrency(amount: number | undefined): string {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  // Pagination methods
  goToPage(page: any) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getProperties();
    }
  }

  onRowsPerPageChange(newRowsPerPage: number) {
    this.rowsPerPage = newRowsPerPage;
    this.currentPage = 1;
    this.getProperties();
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
}
