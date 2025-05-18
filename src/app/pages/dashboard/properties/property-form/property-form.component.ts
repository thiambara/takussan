import {Component, OnInit} from '@angular/core';
import {MessageService} from 'primeng/api';
import {PropertyService} from "../../../../core/sevices/http/property.service";
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from "@angular/forms";
import {Property} from "../../../../core/models/http/property.model";
import {InputText} from "primeng/inputtext";
import {CommonModule} from "@angular/common";
import {DynamicDialogConfig, DynamicDialogRef} from "primeng/dynamicdialog";
import {Button} from "primeng/button";
import {finalize} from "rxjs";
import {Textarea} from "primeng/textarea";

@Component({
  selector: 'app-property-form',
  templateUrl: './property-form.component.html',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    Textarea,
    Button,
    InputText,
  ],
  standalone: true
})
export class PropertyFormComponent implements OnInit {
  property: Property = {};
  propertyForm!: FormGroup;
  saving = false;

  constructor(
    private propertyService: PropertyService,
    private messageService: MessageService,
    private fb: FormBuilder,
    private ref: DynamicDialogRef,
    private config: DynamicDialogConfig
  ) {
  }

  ngOnInit() {
    this.property = this.config.data.property;
    this.property = deepCopy(this.property);
    this.initializeFormBuilder();
  }

  initializeFormBuilder() {
    this.propertyForm = this.fb.group({
      title: [this.property.title, [Validators.required]],
      description: [this.property.description, []]
    });
  }

  hasError(controlName: string, errorName?: string) {
    if (errorName) return this.propertyForm.controls[controlName].hasError(errorName);
    const control = this.propertyForm.get(controlName);
    return control && control.invalid && (control.dirty || control.touched);
  }

  saveProperty() {
    if (this.saving) return;
    this.saving = true;
    const data = {
      ...this.propertyForm.value,
      status: 'pending',
      user_id: authUser.id
    };
    (
      this.property.id
        ? this.propertyService.update(this.property.id, data)
        : this.propertyService.create(data)
    )
      .pipe(finalize(() => this.saving = false))
      .subscribe({
        next: (result) => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Property saved successfully',
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
