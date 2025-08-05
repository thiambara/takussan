import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {Customer} from "../../models/http/customer.model";

@Injectable({
  providedIn: 'root'
})
export class CustomerService extends BaseHttpService<Customer> {

  protected override suffix: string = 'customers';


}
