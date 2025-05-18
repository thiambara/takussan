import {Injectable} from '@angular/core';
import {Property} from "../../../../core/models/http/property.model";
import {PropertyFormComponent} from "../property-form/property-form.component";
import {DialogService} from "primeng/dynamicdialog";

@Injectable({
  providedIn: 'root'
})
export class PropertyComponentService {

  constructor(private dialogService: DialogService) {
  }

  showPropertyForm(property?: Property) {
    return this.dialogService.open(PropertyFormComponent, {
      header: property?.id ? 'Update property' : 'Create new property',
      width: '40rem',
      closable: true,
      data: {
        property: property ?? {}
      }
    })
  }
}
