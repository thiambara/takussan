/**
 * Lease, LeasePayment and Guarantor types.
 * Aligned with `docs/models-spec.md#14-lease-`, `#15-leasepayment-`, `#27-guarantor-`.
 */

export type LeaseStatus =
  | 'draft'
  | 'pending_signature'
  | 'active'
  | 'expired'
  // TCK-090 — early-termination request in flight (notice period running).
  | 'terminating'
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

// TCK-593 — les valeurs de `PaymentStatus` côté API, à l'identique (`partial` n'y a jamais
// existé ; `partially_paid` et `failed`, si). VERIF-596 passe 5 (M-E) — `cancelled` : une échéance
// d'un bail parent que son renouvellement a remplacée.
export type LeasePaymentStatus =
  | 'pending'
  | 'paid'
  | 'late'
  | 'partially_paid'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type LeasePaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'mobile_money'
  | 'wave'
  | 'orange_money'
  | 'free_money'
  | 'check'
  | 'card';

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
  // TCK-090 — early-termination workflow snapshot. Always present on the
  // resource (the columns exist; null when no request is open).
  early_termination_requested_at?: string | null;
  early_termination_requested_by?: number | null;
  early_termination_effective_date?: string | null;
  early_termination_penalty_amount?: number | null;
  early_termination_reason?: string | null;
  early_termination_invoice_id?: number | null;
  notice_period_days?: number | null;
  // TCK-596 §4B (ADR-0042) — le contrat figé et les preuves de consentement. Rendus par le détail.
  contract_sha256?: string | null;
  signature_requested_at?: string | null;
  signatures?: readonly LeaseSignature[];
  /** Les rôles pour lesquels l'utilisateur courant peut signer — jugés par l'API. */
  can_sign_as?: readonly LeaseSignatureRole[];
  /** L'utilisateur courant peut figer le contrat et lancer la signature (gestionnaire du bail). */
  can_request_signature?: boolean;
  /** La voie papier : gestionnaire ET signataire possible pour le bailleur (`leases.sign`). */
  can_activate_on_paper?: boolean;
  created_at: string;
  updated_at: string;
};

export type LeaseSignatureRole = 'tenant' | 'landlord';

/**
 * TCK-596 §4B (ADR-0042 §3) — une preuve de consentement. Jamais l'IP ni l'agent utilisateur :
 * l'API ne les rend pas. `current` : la preuve porte sur le contrat figé en vigueur.
 */
export type LeaseSignature = {
  id: number;
  role: LeaseSignatureRole;
  method: 'otp' | 'paper';
  signed_at: string | null;
  document_sha256: string;
  current: boolean;
  signer_name: string | null;
  on_behalf_of_name: string | null;
  otp_channel: 'sms' | 'mail' | null;
};

/**
 * TCK-593 — aligné CLÉ PAR CLÉ sur `LeasePaymentResource` (`takussan-api`,
 * `LeasePaymentResourceContractTest::KEYS`). Le type déclarait `late_fee` là où l'API envoie
 * `late_fee_amount` : le « +X FCFA » de l'échéancier ne s'affichait jamais. Il déclarait aussi
 * `transaction_id` et `updated_at`, que la ressource n'envoie pas.
 *
 * Les montants dus sont calculés UNE fois, par l'API : `amount_due` est exactement ce que la
 * passerelle demandera, pénalité comprise si `late_fee_payable_online`. Aucun écran ne refait
 * l'addition.
 */
export type LeasePayment = {
  id: number;
  reference_number: string | null;
  lease_id: number;
  payer_id: number;
  collector_id: number | null;
  amount: number;
  currency: Currency;
  payment_method: LeasePaymentMethod | null;
  payment_type: LeasePaymentType;
  period_start: string;
  period_end: string;
  due_date: string | null;
  paid_at: string | null;
  status: LeasePaymentStatus;
  paid_amount: number;
  remaining_amount: number;
  late_fee_amount: number | null;
  late_fee_applied_at: string | null;
  late_fee_paid_at: string | null;
  /** Pénalité restant due (0 si aucune, ou réglée). Ne se lit jamais dans `status`. */
  late_fee_outstanding: number;
  /** La pénalité restant due est INCLUSE dans `amount_due`. */
  late_fee_payable_online: boolean;
  /** Ce que le paiement en ligne demandera ; 0 si l'échéance n'est pas payable. */
  amount_due: number;
  receipt_available: boolean;
  notes: string | null;
  created_at: string;
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
