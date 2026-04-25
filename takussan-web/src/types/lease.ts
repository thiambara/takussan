/**
 * Lease, LeasePayment and Guarantor types.
 * Aligned with `docs/models-spec.md#14-lease-`, `#15-leasepayment-`, `#27-guarantor-`.
 */

export type LeaseStatus =
  | 'draft'
  | 'pending_signature'
  | 'active'
  | 'expired'
  | 'terminated'
  | 'renewed';

export type LeaseType = 'residential_rent' | 'commercial_rent' | 'seasonal_rent' | 'sale';

export type PaymentFrequency = 'monthly' | 'quarterly' | 'yearly';

export type Currency = 'XOF' | 'XAF' | 'EUR' | 'USD';

export type LeasePaymentType =
  | 'rent'
  | 'charges'
  | 'deposit'
  | 'deposit_refund'
  | 'regularization'
  | 'penalty';

export type LeasePaymentStatus = 'pending' | 'paid' | 'late' | 'partial' | 'cancelled' | 'refunded';

export type LeasePaymentMethod = 'cash' | 'bank_transfer' | 'mobile_money' | 'check' | 'card';

export type Lease = {
  id: number;
  property_id: number;
  landlord_id: number;
  tenant_id: number;
  agency_id: number | null;
  booking_id: number | null;
  renewed_from_lease_id: number | null;
  reference_number: string;
  type: LeaseType;
  status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  renewal_date: string | null;
  monthly_rent: number | null;
  sale_price: number | null;
  currency: Currency;
  deposit_amount: number | null;
  deposit_refunded_amount: number | null;
  deposit_refunded_at: string | null;
  deposit_refund_reason: string | null;
  commission_amount: number | null;
  commission_rate: number | null;
  payment_frequency: PaymentFrequency;
  payment_day: number | null;
  terms: string | null;
  special_conditions: string | null;
  guarantor_id: number | null;
  signed_at: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type LeasePayment = {
  id: number;
  lease_id: number;
  payer_id: number;
  collector_id: number | null;
  reference_number: string | null;
  amount: number;
  currency: Currency;
  payment_method: LeasePaymentMethod | null;
  payment_type: LeasePaymentType;
  period_start: string;
  period_end: string;
  due_date: string | null;
  paid_at: string | null;
  status: LeasePaymentStatus;
  late_fee: number | null;
  transaction_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Guarantor = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  id_type: 'id_card' | 'passport' | 'driving_license' | null;
  id_number: string | null;
  occupation: string | null;
  employer: string | null;
  monthly_income: number | null;
  relationship_to_tenant: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
