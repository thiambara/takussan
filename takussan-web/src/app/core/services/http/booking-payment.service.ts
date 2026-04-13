import {Injectable} from '@angular/core';
import {BaseHttpService} from "./base/base-http.service";
import {BookingPayment} from "../../models/http/booking-payment.model";

@Injectable({
  providedIn: 'root'
})
export class BookingPaymentService extends BaseHttpService<BookingPayment> {
  protected override suffix: string = 'booking-payments';
}
