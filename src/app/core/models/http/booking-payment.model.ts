import {BaseModelInterface} from "./base/base.model";
import {Booking} from "./booking.model";
import {User} from "./user.model";

export interface BookingPayment extends BaseModelInterface {
  booking_id?: number;
  user_id?: number;
  amount?: number;
  payment_date?: string;
  payment_method?: string;
  reference_number?: string;
  status?: string;
  notes?: string;

  // Relations
  booking?: Booking;
  user?: User;
}
