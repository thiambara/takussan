import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {Address} from "../../models/http/address.model";
import {Booking} from "../../models/http/booking.model";

@Injectable({
  providedIn: 'root'
})
export class BookingService extends BaseHttpService<Booking> {

  protected override suffix: string = 'bookings';


}
