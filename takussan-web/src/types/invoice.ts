/**
 * Invoice & Payout types — aligned with `InvoiceResource` / `PayoutResource`
 * on the backend (TCK-028). Used by the payments frontend (TCK-063).
 */

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'void';

export type Invoice = {
  id: number;
  reference_number: string | null;
  invoiceable_id: number | null;
  invoiceable_type: string | null;
  customer_id: number;
  issued_by_id: number;
  agency_id: number | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  tax_rate: number | null;
  tax_amount: number | null;
  total_amount: number;
  currency: string | null;
  notes: string | null;
  created_at: string | null;
};

export type PayoutStatus =
  | 'pending'
  | 'scheduled'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type Payout = {
  id: number;
  reference_number: string | null;
  lease_id: number | null;
  booking_id: number | null;
  agency_id: number | null;
  landlord_id: number;
  issued_by_id: number;
  status: PayoutStatus;
  period_start: string | null;
  period_end: string | null;
  gross_amount: number;
  commission_amount: number;
  fees_amount: number | null;
  net_amount: number;
  currency: string | null;
  payment_method: string | null;
  transaction_id: string | null;
  scheduled_at: string | null;
  processed_at: string | null;
  failed_reason: string | null;
  notes: string | null;
  created_at: string | null;
};

/**
 * Unified payment-history row returned by `GET /api/payments/history`.
 * Merges BookingPayment + LeasePayment into a single shape.
 */
export type PaymentHistoryRow = {
  source: 'booking' | 'lease';
  id: number;
  reference_number: string | null;
  amount: number;
  currency: string | null;
  payment_method: string | null;
  payment_type: string | null;
  status: string | null;
  paid_amount: number;
  remaining_amount: number;
  date: string | null;
  paid_at: string | null;
  period_start?: string | null;
  period_end?: string | null;
  due_date?: string | null;
  booking_id: number | null;
  lease_id: number | null;
  property_id: number | null;
  customer_id: number | null;
  created_at: string | null;
};

export type PaymentHistoryTotals = {
  count: number;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
};
