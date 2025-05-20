import {Component, OnInit} from '@angular/core';
import {MessageService} from 'primeng/api';
import {CustomerService} from "../../../../core/sevices/http/customer.service";
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";
import {User as Customer} from "../../../../core/models/http/user.model";
import {InputText} from "primeng/inputtext";
import {CommonModule} from "@angular/common";
import {DynamicDialogConfig, DynamicDialogRef} from "primeng/dynamicdialog";
import {Button} from "primeng/button";
import {finalize} from "rxjs";
import {AutoFocus} from "primeng/autofocus";

@Component({
  selector: 'app-customer-form',
  templateUrl: './customer-form.component.html',
  imports: [
    CommonModule,
    FormsModule,
    Button,
    ReactiveFormsModule,
    InputText,
    AutoFocus,
  ],
  standalone: true
})
export class CustomerFormComponent implements OnInit {
  customer: Customer = {};
  customerForm!: FormGroup;
  saving = false;

  constructor(
    private customerService: CustomerService,
    private messageService: MessageService,
    private fb: FormBuilder,
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig
  ) {
  }

  ngOnInit() {
    this.customer = this.config.data.customer;
    this.customer = deepCopy(this.customer);
    this.initializeFormBuilder();
  }

  initializeFormBuilder() {
    this.customerForm = this.fb.group({
      first_name: [this.customer.first_name, [Validators.required]],
      last_name: [this.customer.last_name, [Validators.required]],
      phone: [this.customer.phone, []],
      email: [this.customer.email, [Validators.email]]
    });

  }

  hasError(controlName: string, errorName?: string) {
    if (errorName) return this.customerForm.controls[controlName].hasError(errorName);
    const control = this.customerForm.get(controlName);
    return control && control.invalid && (control.dirty || control.touched);
  }

  saveCustomer() {
    if (this.saving) return;
    this.saving = true;
    const data = {
      ...this.customerForm.value,
      status: 'active',
    };
    (
      this.customer.id
        ? this.customerService.update(this.customer.id, data)
        : this.customerService.create(data)
    )
      .pipe(finalize(() => this.saving = false))
      .subscribe({
        next: (result) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Customer saved successfully',
            life: 3000
          })

          this.close(result)
        },
        error: error => this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'An error has occurred',
          life: 3000
        })
      });
  }

  close(result?: any) {
    this.ref.close(result)
  }
}
