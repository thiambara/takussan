import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";
import {Address} from "./address.model";
import {Booking} from "./booking.model";
import {CustomerStatus} from "./enum-models";

export interface Customer extends BaseModelInterface {
  user_id?: number;
  added_by_id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  status?: CustomerStatus;
  metadata?: any;

  // Relations
  user?: User;
  added_by?: User;
  addresses?: Address[];
  bookings?: Booking[];
  related_users?: User[];
}
