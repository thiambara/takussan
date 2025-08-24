import {Component, OnInit} from '@angular/core';
import {User as Customer} from "../../../../core/models/http/user.model";
import {CustomerService} from "../../../../core/services/http/customer.service";
import {FormsModule} from "@angular/forms";
import {Router} from "@angular/router";
import {MessageService} from '../../../../core/services/message.service';
import {CommonModule} from '@angular/common';

// Shared Components
import {
  SearchInputComponent,
  StatusBadgeComponent,
  StatusVariant,
  ToolbarComponent
} from '../../../../shared/components';

@Component({
  selector: 'app-customer-list',
  templateUrl: './customer-list.component.html',
  imports: [
    CommonModule,
    FormsModule,
    ToolbarComponent,
    SearchInputComponent,
    StatusBadgeComponent
  ],
  standalone: true
})
export class CustomerListComponent implements OnInit {
  customers: Customer[] = [];
  customer: Customer = {};
  selectedCustomers: Customer[] = [];
  loading = false;

  searchQuery: string = '';
  rowsPerPageOptions = [5, 10, 20];

  // Pagination properties
  currentPage: number = 0;
  currentRowsPerPage: number = 10;

  // Sorting properties
  sortField: string = '';
  sortOrder: 1 | -1 = 1;

  constructor(
    private customerService: CustomerService,
    private messageService: MessageService,
    private router: Router
  ) {
  }

  ngOnInit() {
    this.getCustomers();
  }

  getCustomers() {
    this.loading = true;
    this.customerService.index({
      search_query: this.searchQuery,
    }).subscribe({
      next: data => {
        this.customers = (data as Customer[]);
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

  openNew() {
    this.router.navigate(['/dashboard/customers/edit/new']).then();
  }

  /**
   * Handle search event from search input component
   */
  search(query: string) {
    this.searchQuery = query;
    this.getCustomers();
  }

  canEditCustomer(_: Customer) {
    // Note: authUser needs to be imported or defined
    // return customer.added_by_id === authUser.id;
    return true; // Temporary - implement proper auth check
  }

  exportCSV() {
    if (this.customers.length === 0) return;

    const csvContent = this.generateCSV();
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'customers.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  private generateCSV(): string {
    const headers = ['Name', 'Email', 'Phone', 'Status'].join(',');
    const rows = this.customers.map(customer =>
      [
        `"${customer.first_name} ${customer.last_name}"`,
        customer.email || '',
        customer.phone || '',
        customer.status || 'inactive'
      ].join(',')
    );
    return [headers, ...rows].join('\n');
  }

  viewCustomerDetails(customer: Customer) {
    if (!customer.id) return;
    this.router.navigate(['/dashboard/customers', customer.id]).then();
  }

  editCustomer(customer: Customer) {
    if (!customer.id) return;

    // Check if user can edit this customer
    if (!this.canEditCustomer(customer)) {
      this.messageService.add({
        severity: 'error',
        summary: 'Access Denied',
        detail: 'You do not have permission to edit this customer',
        life: 3000
      });
      return;
    }

    this.router.navigate(['/dashboard/customers/edit', customer.id]).then();
  }

  /**
   * Get status variant for the status badge component
   */
  getStatusVariant(status: string): StatusVariant {
    switch (status.toLowerCase()) {
      case 'active':
        return 'success';
      case 'pending':
        return 'warning';
      case 'suspended':
        return 'danger';
      case 'inactive':
      default:
        return 'neutral';
    }
  }

  /**
   * Toggle selection of a customer
   */
  toggleSelection(customer: Customer) {
    const index = this.selectedCustomers.findIndex(c => c.id === customer.id);
    if (index > -1) {
      this.selectedCustomers.splice(index, 1);
    } else {
      this.selectedCustomers.push(customer);
    }
  }

  // Pagination methods
  get totalPages(): number {
    return Math.ceil(this.customers.length / this.currentRowsPerPage);
  }

  get paginatedCustomers(): Customer[] {
    const start = this.currentPage * this.currentRowsPerPage;
    const end = start + this.currentRowsPerPage;
    return this.customers.slice(start, end);
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
    }
  }

  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
    }
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
    }
  }

  onRowsPerPageChange(rows: number): void {
    this.currentRowsPerPage = rows;
    this.currentPage = 0; // Reset to first page
  }

  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const half = Math.floor(maxVisible / 2);

    let start = Math.max(0, this.currentPage - half);
    let end = Math.min(this.totalPages - 1, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(0, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  getCurrentPageReport(): string {
    const first = this.currentPage * this.currentRowsPerPage + 1;
    const last = Math.min((this.currentPage + 1) * this.currentRowsPerPage, this.customers.length);
    const totalRecords = this.customers.length;

    return `Showing ${first} to ${last} of ${totalRecords} entries`;
  }

  // Selection methods
  isAllSelected(): boolean {
    return this.customers.length > 0 && this.selectedCustomers.length === this.customers.length;
  }

  isSomeSelected(): boolean {
    return this.selectedCustomers.length > 0 && this.selectedCustomers.length < this.customers.length;
  }

  isCustomerSelected(customer: Customer): boolean {
    return this.selectedCustomers.some(selected => selected.id === customer.id);
  }

  onSelectAll(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectedCustomers = target.checked ? [...this.customers] : [];
  }

  // Sorting methods
  onSort(field: string): void {
    let newOrder: 1 | -1 = 1;
    if (this.sortField === field) {
      newOrder = this.sortOrder === 1 ? -1 : 1;
    }

    this.sortField = field;
    this.sortOrder = newOrder;

    this.customers.sort((a, b) => {
      const aValue = this.getFieldValue(a, field);
      const bValue = this.getFieldValue(b, field);

      if (aValue < bValue) return -1 * newOrder;
      if (aValue > bValue) return 1 * newOrder;
      return 0;
    });
  }

  private getFieldValue(item: any, field: string): any {
    return field.split('.').reduce((obj, prop) => obj?.[prop], item) || '';
  }

  trackByCustomer(index: number, customer: Customer): any {
    return customer.id || index;
  }
}
