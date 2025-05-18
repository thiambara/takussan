import {Property} from "./property.model";
import {BaseModelInterface} from "./base/base.model";
import {Address} from "./address.model";
import {Booking} from "./booking.model";
import {Customer} from "./customer.model";
import {BookingPayment} from "./booking-payment.model";
import {Role} from "./role.model";

export interface User extends BaseModelInterface {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  email_verified_at?: string;
  phone?: string;
  username?: string;
  password?: string;
  status?: 'active' | 'inactive' | 'blocked' | 'deleted';
  type?: string;
  added_by_id?: number;
  google_id?: string;
  roles?: ('admin' | 'super_admin' | 'customer' | 'vendor')[];
  remember_token?: string;
  metadata?: any;
  
  // Relations
  addresses?: Address[];
  properties?: Property[];
  customers?: Customer[];
  bookings?: Booking[];
  booking_payments?: BookingPayment[];
  added_by?: User;
  customer_relationships?: any[];
  related_customers?: Customer[];
  assigned_roles?: Role[];
}
