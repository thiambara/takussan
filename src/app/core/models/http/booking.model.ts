import {BaseModelInterface} from "./base/base.model";
import {Property} from "./property.model";
import {Customer} from "./customer.model";
import {User} from "./user.model";
import {BookingPayment} from "./booking-payment.model";

export interface Booking extends BaseModelInterface {
  property_id?: number;
  customer_id?: number;
  user_id?: number;
  reference_number?: string;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  booking_date?: string;
  start_date?: string; // Start date of the booking period
  end_date?: string; // End date of the booking period
  expiration_date?: string;
  approval_date?: string;
  rejection_date?: string;
  cancellation_date?: string;
  completion_date?: string;
  price_at_booking?: number;
  total_amount?: number; // Total amount for the booking
  deposit_amount?: number;
  deposit_paid?: boolean;
  deposit_date?: string;
  notes?: string;
  reason_for_rejection?: string;
  reason_for_cancellation?: string;
  cancellation_by?: string;

  // Relations
  property?: Property;
  customer?: Customer;
  user?: User;
  booking_payments?: BookingPayment[];
}

