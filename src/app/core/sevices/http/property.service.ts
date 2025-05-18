import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {Property} from "../../models/http/property.model";

@Injectable({
  providedIn: 'root'
})
export class PropertyService extends BaseHttpService<Property> {

  protected override suffix: string = 'properties';

}
