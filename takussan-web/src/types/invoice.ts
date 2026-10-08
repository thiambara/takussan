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
  /** TCK-594 (ADR-0039 §5) — une facture ou un avoir ; l'avoir porte la facture qu'il annule. */
  kind?: InvoiceKind;
  credited_invoice_id?: number | null;
  credit_notes?: Array<Pick<Invoice, 'id' | 'reference_number' | 'total_amount' | 'currency' | 'issue_date'>>;
};

export type InvoiceKind = 'invoice' | 'credit_note';

export type PayoutStatus =
  | 'awaiting_approval'
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
  /** TCK-594 (ADR-0039 §2) — le bénéficiaire explicite ; une caution rendue est `tenant`. */
  payee_role?: PayeeRole | null;
  service_provider_bill_id?: number | null;
  approved_by_id?: number | null;
  approved_at?: string | null;
  processed_by_id?: number | null;
  issuer?: { id: number; name: string } | null;
  payout_method_id?: number | null;
  /** La destination n'est jamais rendue en clair (ADR-0039 §6). */
  destination_masked?: string | null;
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

export type PayeeRole = 'landlord' | 'tenant' | 'service_provider';

export type PayoutMethodKind = 'wave' | 'orange_money' | 'free_money' | 'bank_transfer';

/**
 * TCK-594 (ADR-0039 §6) — une destination de paiement. Le titulaire lit son numéro en clair
 * (`account_identifier`) ; l'agence n'en voit que la forme masquée.
 */
export type PayoutMethod = {
  id: number;
  user_id?: number;
  kind: PayoutMethodKind;
  masked_identifier: string | null;
  account_identifier?: string | null;
  account_holder_name?: string | null;
  is_default: boolean;
  verified: boolean;
  verified_at?: string | null;
};

type PreparationLine = {
  id: number;
  reference_number: string | null;
  property_id: number | null;
  amount: number;
};

/** `GET /api/payouts/preparation` — la lecture qui précède un reversement : rien ne s'y saisit. */
export type PayoutPreparation = {
  agency_id: number;
  landlord_id: number;
  period_start: string;
  period_end: string;
  currency: string;
  lines: {
    lease_payments: Array<PreparationLine & {
      payment_type: string | null;
      lease_id: number;
      lease_reference: string | null;
      paid_at: string | null;
      commission_rate: number;
      commission_rate_source: 'lease' | 'agency';
      commission: number;
    }>;
    booking_payments: Array<PreparationLine & {
      payment_type: string | null;
      booking_id: number;
      booking_reference: string | null;
      paid_at: string | null;
      commission_rate: number;
      commission: number;
    }>;
    service_provider_bills: Array<PreparationLine & { maintenance_request_id: number | null }>;
  };
  totals: { gross: number; commission: number; fees: number; net: number };
  requires_approval: boolean;
  approval_threshold: number | null;
  payout_methods: Array<Pick<PayoutMethod, 'id' | 'kind' | 'masked_identifier' | 'is_default' | 'verified'>>;
};

/**
 * TCK-594 (ADR-0039 §3) — le relevé de gérance d'un bailleur pour un mois (`YYYY-MM`) ou une année
 * (`YYYY`, l'attestation annuelle). Le même calcul nourrit le JSON, le PDF et le CSV.
 */
export type OwnerStatement = {
  agency: { id: number; name: string };
  landlord: { id: number; name: string };
  period: string;
  annual: boolean;
  period_start: string;
  period_end: string;
  currency: string;
  totals: { gross: number; commission: number; fees: number; net: number; paid_out: number };
  payouts: Array<{
    id: number;
    reference_number: string | null;
    status: PayoutStatus;
    net_amount: number;
    transaction_id: string | null;
    processed_at: string | null;
  }>;
};

/** TCK-594 (ADR-0039 §8) — la facture d'un prestataire pour une intervention terminée. */
export type ServiceProviderBillStatus = 'pending_validation' | 'validated' | 'rejected' | 'paid' | 'cancelled';

export type ServiceProviderBill = {
  id: number;
  maintenance_request_id: number | null;
  agency_id: number | null;
  property_id: number | null;
  provider_id: number;
  reference_number: string | null;
  provider_reference: string | null;
  amount: number;
  currency: string;
  /** Le montant dépasse le devis approuvé : l'agence le lit avant de valider. */
  exceeds_quote: boolean;
  status: ServiceProviderBillStatus;
  validated_at: string | null;
  rejection_reason: string | null;
  rechargeable_to_landlord: boolean;
  imputed_payout_id: number | null;
  created_at: string | null;
};

