import {BaseModelInterface} from "./base/base.model";
import {Booking} from "./booking.model";
import {User} from "./user.model";

export interface BookingPayment extends BaseModelInterface {
  booking_id?: number;
  user_id?: number;
  amount?: number;
  payment_method?: string;
  payment_type?: string;
  transaction_id?: string;
  status?: string;
  payment_date?: string;
  confirmed_date?: string;
  receipt_number?: string;
  notes?: string;
  metadata?: any;

  // Relations
  booking?: Booking;
  user?: User;
}
