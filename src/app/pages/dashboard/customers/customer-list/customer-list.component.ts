import {Component, OnInit, ViewChild} from '@angular/core';
import {User as Customer} from "../../../../core/models/http/user.model";
import {CustomerService} from "../../../../core/services/http/customer.service";
import {FormsModule} from "@angular/forms";
import {Router} from "@angular/router";
import {MessageService} from '../../../../core/services/message.service';

// Shared Components
import {
  ButtonComponent,
  DataTableComponent,
  SearchInputComponent,
  StatusBadgeComponent,
  StatusVariant,
  TableColumn,
  ToolbarComponent
} from '../../../../shared/components';

@Component({
  selector: 'app-customer-list',
  templateUrl: './customer-list.component.html',
  imports: [
    FormsModule,
    ToolbarComponent,
    ButtonComponent,
    DataTableComponent,
    SearchInputComponent,
    StatusBadgeComponent
  ],
  standalone: true
})
export class CustomerListComponent implements OnInit {
  @ViewChild(DataTableComponent) dataTable!: DataTableComponent;

  customers: Customer[] = [];
  customer: Customer = {};
  selectedCustomers: Customer[] = [];
  loading = false;

  searchQuery: string = '';
  rowsPerPageOptions = [5, 10, 20];

  tableColumns: TableColumn[] = [
    {field: 'first_name', header: 'Name', sortable: true, width: '200px'},
    {field: 'email', header: 'Email', sortable: true, width: '250px'},
    {field: 'phone', header: 'Phone', sortable: true, width: '150px'},
    {field: 'status', header: 'Status', sortable: true, width: '120px'},
    {field: 'actions', header: 'Actions', sortable: false, width: '150px'}
  ];

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
    if (this.dataTable) {
      this.dataTable.exportCSV();
    }
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
}
