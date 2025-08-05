import {Component, OnInit} from '@angular/core';
import {MessageService} from '../../../../core/services/message.service';
import {Property} from "../../../../core/models/http/property.model";
import {PropertyService} from "../../../../core/services/http/property.service";
import {DatePipe, CommonModule} from "@angular/common";
import {Router, RouterLink} from "@angular/router";
import {FormsModule} from "@angular/forms";

@Component({
  selector: 'app-property-list',
  templateUrl: './property-list.component.html',
  imports: [
    CommonModule,
    DatePipe,
    RouterLink,
    FormsModule
  ],
  standalone: true
})
export class PropertyListComponent implements OnInit {
  properties: Property[] = [];
  property: Property = {};
  selectedProperties: Property[] = [];

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
  sortOrder: number = 1; // 1 for ascending, -1 for descending

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
    this.propertyService.index({
      search_query: this.searchQuery,
      properties: {with_count: 'bookings'},
      filter_fields: {user_id: (window as any).authUser?.id}
    }).subscribe({
      next: data => {
        this.properties = (data as Property[]);
        this.updatePagination();
      },
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
      this.currentPage = 1; // Reset to first page when searching
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
    // Convert properties to CSV format
    const csvContent = this.convertToCSV(this.properties);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'properties.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Selection methods
  toggleAllSelection(event: any): void {
    if (event.target.checked) {
      this.selectedProperties = [...this.paginatedProperties];
    } else {
      this.selectedProperties = [];
    }
  }

  isAllSelected(): boolean {
    return this.paginatedProperties.length > 0 && 
           this.selectedProperties.length === this.paginatedProperties.length;
  }

  isSomeSelected(): boolean {
    return this.selectedProperties.length > 0 && 
           this.selectedProperties.length < this.paginatedProperties.length;
  }

  toggleSelection(property: Property, event: any): void {
    if (event.target.checked) {
      if (!this.isSelected(property)) {
        this.selectedProperties.push(property);
      }
    } else {
      this.selectedProperties = this.selectedProperties.filter(p => p.id !== property.id);
    }
  }

  isSelected(property: Property): boolean {
    return this.selectedProperties.some(p => p.id === property.id);
  }

  // Sorting methods
  sort(field: string): void {
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder === 1 ? -1 : 1;
    } else {
      this.sortField = field;
      this.sortOrder = 1;
    }
    this.sortProperties();
    this.updatePagination();
  }

  private sortProperties(): void {
    this.properties.sort((a: any, b: any) => {
      const aValue = this.getNestedProperty(a, this.sortField);
      const bValue = this.getNestedProperty(b, this.sortField);

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      let result = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        result = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        result = aValue - bValue;
      } else if (aValue instanceof Date && bValue instanceof Date) {
        result = aValue.getTime() - bValue.getTime();
      } else {
        result = String(aValue).localeCompare(String(bValue));
      }

      return result * this.sortOrder;
    });
  }

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  // Pagination methods
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
    }
  }

  onRowsPerPageChange(): void {
    this.currentPage = 1;
    this.updatePagination();
  }

  getStartIndex(): number {
    return (this.currentPage - 1) * this.rowsPerPage + 1;
  }

  getEndIndex(): number {
    const end = this.currentPage * this.rowsPerPage;
    return Math.min(end, this.properties.length);
  }

  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    const halfVisible = Math.floor(maxVisiblePages / 2);

    let startPage = Math.max(1, this.currentPage - halfVisible);
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

    // Adjust start page if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  private updatePagination(): void {
    this.totalPages = Math.ceil(this.properties.length / this.rowsPerPage);
    
    // Ensure current page is valid
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }

    // Calculate paginated properties
    const startIndex = (this.currentPage - 1) * this.rowsPerPage;
    const endIndex = startIndex + this.rowsPerPage;
    this.paginatedProperties = this.properties.slice(startIndex, endIndex);

    // Update selection to only include items from current page
    this.selectedProperties = this.selectedProperties.filter(selected =>
      this.paginatedProperties.some(paginated => paginated.id === selected.id)
    );
  }

  // Utility methods
  trackByProperty(index: number, property: Property): any {
    return property.id || index;
  }

  private convertToCSV(data: Property[]): string {
    if (!data || data.length === 0) return '';

    const headers = ['ID', 'Title', 'Status', 'Created At', 'Bookings Count'];
    const csvRows = [headers.join(',')];

    data.forEach(property => {
      const row = [
        property.id || '',
        `"${(property.title || '').replace(/"/g, '""')}"`,
        property.status || '',
        property.created_at || '',
        property.bookings_count || 0
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }
}
