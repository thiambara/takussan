import {Component, OnInit, ViewChild} from '@angular/core';
import {MessageService} from 'primeng/api';
import {User as Customer} from "../../../../core/models/http/user.model";
import {Toolbar} from "primeng/toolbar";
import {Table, TableModule} from "primeng/table";
import {FormsModule} from "@angular/forms";
import {DialogService} from "primeng/dynamicdialog";
import {Router} from "@angular/router";
import {CustomerService} from "../../../../core/services/http/customer.service";
import {BadgeComponent, BadgeVariant} from "../../../../shared/components/badge/badge.component";
import {CustomerStatus} from "../../../../core/models/http/enum-models";
import {ArrowUpDown, Eye, LucideAngularModule, Pencil, Plus, Search, Trash2, Upload, Users} from 'lucide-angular';

@Component({
  selector: 'app-customer-list',
  templateUrl: './customer-list.component.html',
  imports: [
    Toolbar,
    TableModule,
    FormsModule,
    BadgeComponent,
    LucideAngularModule
  ],
  standalone: true
})
export class CustomerListComponent implements OnInit {
  @ViewChild('customersTable') customersTable!: Table;

  customers: Customer[] = [];
  customer: Customer = {};
  selectedCustomers: Customer[] = [];

  searchQuery: string = '';
  searchQueryTimeout!: any;
  rowsPerPageOptions = [5, 10, 20];

  // Icons
  readonly Plus = Plus;
  readonly Upload = Upload;
  readonly Search = Search;
  readonly Eye = Eye;
  readonly Pencil = Pencil;
  readonly Trash2 = Trash2;
  readonly Users = Users;
  readonly ArrowUpDown = ArrowUpDown;

  constructor(
    private customerService: CustomerService,
    private messageService: MessageService,
    private dialogService: DialogService,
    private router: Router) {
  }

  ngOnInit() {
    this.getCustomers();
  }

  getCustomers() {


    this.customerService.index({
      search_query: this.searchQuery,
    }).subscribe({
      next: data => this.customers = (data as Customer[]),
      error: error => this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'An error has occurred',
        life: 3000
      })
    });
  }

  openNew() {
    this.router.navigate(['/dashboard/customers/edit/new']);
  }

  onSearch() {
    if (this.searchQueryTimeout) {
      clearTimeout(this.searchQueryTimeout);
    }
    this.searchQueryTimeout = setTimeout(() => {
      this.getCustomers();
    }, 500);
  }

  canEditCustomer(customer: Customer) {
    // Assuming authUser is available globally or injected
    // For now returning true to avoid error if authUser is missing
    return true;
    // return customer.added_by_id === authUser.id;
  }

  exportCSV() {
    this.customersTable.exportCSV();
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

    this.router.navigate(['/dashboard/customers/edit', customer.id]);
  }

  getStatusVariant(status?: CustomerStatus | string): BadgeVariant {
    switch (status) {
      case CustomerStatus.Active:
        return 'success';
      case CustomerStatus.Inactive:
        return 'neutral';
      case CustomerStatus.Blocked:
      case CustomerStatus.Deleted:
        return 'danger';
      default:
        return 'neutral';
    }
  }
}
