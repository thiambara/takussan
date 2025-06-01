import {Component, OnInit, ViewChild} from '@angular/core';
import {MessageService} from 'primeng/api';
import {User as Customer} from "../../../../core/models/http/user.model";
import {CustomerService} from "../../../../core/sevices/http/customer.service";
import {Toolbar} from "primeng/toolbar";
import {InputText} from "primeng/inputtext";
import {Table, TableModule} from "primeng/table";
import {FormsModule} from "@angular/forms";
import {DialogService} from "primeng/dynamicdialog";
import {Button} from "primeng/button";
import {Router} from "@angular/router";
import {IconField} from "primeng/iconfield";
import {InputIcon} from "primeng/inputicon";

@Component({
  selector: 'app-customer-list',
  templateUrl: './customer-list.component.html',
  imports: [
    Button,
    Toolbar,
    TableModule,
    FormsModule,
    InputText,
    IconField,
    InputIcon,
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

  constructor(private customerService: CustomerService, private messageService: MessageService, private dialogService: DialogService, private router: Router) {
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
    return customer.added_by_id === authUser.id;
  }

  exportCSV() {
    this.customersTable.exportCSV();
  }

  viewCustomerDetails(customer: Customer) {
    if (!customer.id) return;
    this.router.navigate(['/dashboard/customers', customer.id]);
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
}
