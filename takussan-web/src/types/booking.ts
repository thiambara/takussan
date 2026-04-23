/**
 * Booking types.
 * Aligned with `docs/models-spec.md#5-booking` and `#6-bookingpayment`.
 */

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'completed';

export type BookingPaymentType = 'deposit' | 'advance' | 'fee';

export type BookingPaymentStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';

export type BookingPaymentMethod = 'cash' | 'bank_transfer' | 'mobile_money' | 'card';

export type BookingPayment = {
  id: number;
  booking_id: number;
  user_id: number;
  amount: number;
  currency: 'XOF' | 'XAF' | 'EUR' | 'USD';
  payment_method: BookingPaymentMethod;
  payment_type: BookingPaymentType;
  transaction_id: string | null;
  status: BookingPaymentStatus;
  payment_date: string | null;
  confirmed_date: string | null;
  receipt_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Booking = {
  id: number;
  property_id: number;
  customer_id: number;
  created_by_id: number;
  reference_number: string | null;
  status: BookingStatus;
  booking_date: string;
  start_date: string | null;
  end_date: string | null;
  expiration_date: string | null;
  confirmation_date: string | null;
  rejection_date: string | null;
  cancellation_date: string | null;
  completion_date: string | null;
  price_at_booking: number | null;
  total_amount: number | null;
  deposit_amount: number | null;
  deposit_paid: boolean;
  deposit_date: string | null;
  notes: string | null;
  reason_for_rejection: string | null;
  reason_for_cancellation: string | null;
  created_at: string;
  updated_at: string;
  property?: {
    id: number;
    title: string;
    slug: string;
    main_photo_url: string | null;
    price: number;
    currency: string | null;
    contract_type: 'sale' | 'rent' | null;
  };
  booking_payments?: BookingPayment[];
};
