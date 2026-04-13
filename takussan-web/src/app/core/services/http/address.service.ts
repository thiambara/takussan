import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {Address} from "../../models/http/address.model";

@Injectable({
  providedIn: 'root'
})
export class AddressService extends BaseHttpService<Address> {

  protected override suffix: string = 'addresses';


}
