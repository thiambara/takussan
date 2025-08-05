import {BaseModelInterface} from "./base/base.model";
import {User} from "./user.model";
import {Address} from "./address.model";
import {Booking} from "./booking.model";

export interface Customer extends BaseModelInterface {
  user_id?: number;
  added_by_id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  type?: string;

  // Relations
  user?: User;
  added_by?: User;
  addresses?: Address[];
  bookings?: Booking[];
  related_users?: User[];
}
