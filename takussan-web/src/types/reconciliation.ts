/**
 * TCK-593 (Partie 4) — rapprochement bancaire, formes rendues par l'API
 * (`BankStatementResource`, `BankStatementLineResource`, `MatchCandidateResource`, mapping CSV).
 *
 * Les libellés de statut que l'API joint (`status_label`, `match_status_label`) ne sont PAS
 * affichés : le front possède le texte (principe n°5), les valeurs d'enum sont des clés.
 */

export type BankStatementStatus =
  | 'processing'
  | 'failed'
  | 'ready_for_review'
  | 'partially_reconciled'
  | 'reconciled'
  | 'archived';

export type BankStatementSourceFormat = 'csv' | 'ofx';

export interface ReconciledRatio {
  confirmed: number;
  ignored: number;
  remaining: number;
  total: number;
}

export interface BankStatement {
  id: number;
  agency_id: number;
  source_format: BankStatementSourceFormat | null;
  bank_name: string | null;
  account_iban_masked: string | null;
  period_start: string | null;
  period_end: string | null;
  lines_count: number | null;
  /** Lignes du fichier que l'analyse n'a pas pu lire — un mapping CSV à vérifier. */
  skipped_lines_count: number | null;
  status: BankStatementStatus | null;
  finalized_at: string | null;
  reconciled_ratio: ReconciledRatio | null;
  created_at: string | null;
}

export type BankLineDirection = 'credit' | 'debit';
export type BankLineMatchStatus = 'unmatched' | 'suggested' | 'confirmed' | 'ignored';
export type MatchedPaymentType =
  | 'booking_payment'
  | 'lease_payment'
  | 'invoice'
  | 'payout'
  // TCK-1421 (P141.02) — le virement de clôture de la plateforme, rapproché d'un crédit.
  | 'platform_payout'
  // TCK-2793 — la pénalité de retard payée seule d'une échéance, rapprochée à part de son loyer.
  | 'lease_payment_late_fee';

export interface BankStatementLine {
  id: number;
  bank_statement_id: number;
  posted_at: string | null;
  amount: number | string;
  direction: BankLineDirection | null;
  currency: string | null;
  label: string | null;
  reference: string | null;
  counterparty: string | null;
  /**
   * TCK-1919 (P157.06) — la ligne d'un autre relevé de l'agence qui porte déjà cette transaction
   * (référence, date, montant, sens) ; nulle sinon. La ligne reste dans le relevé, signalée.
   */
  duplicate_of_line_id?: number | null;
  match_status: BankLineMatchStatus | null;
  matched_payment_type: MatchedPaymentType | null;
  matched_payment_id: number | null;
  /**
   * TCK-1522 (P110.02) — le statut du payable rapproché ou proposé, relu à chaque lecture (un
   * encaissement remboursé après rapprochement le dit). Valeur de l'enum de statut de son type.
   */
  matched_payment_status?: string | null;
  /** 0–1 (ou 0–100 selon l'API) — normalisé à l'affichage. */
  match_confidence: number | string | null;
}

export interface MatchCandidate {
  id: number;
  type: MatchedPaymentType;
  label: string | null;
  amount: number | string;
  currency: string | null;
  reference: string | null;
  paid_at: string | null;
  payer_name: string | null;
  /** TCK-1526 (P110.04) — le statut du payable, valeur de l'enum de son type (un remboursé le dit). */
  status?: string | null;
}

export type SignConvention = 'amount_signed' | 'direction_column';
export type DecimalSeparator = '.' | ',';
export type ThousandsSeparator = null | '.' | ',' | ' ' | "'";

export interface CsvMapping {
  delimiter: string;
  has_header: boolean;
  date_column: string | number | null;
  date_format: string | null;
  amount_column: string | number | null;
  label_column: string | number | null;
  reference_column: string | number | null;
  counterparty_column: string | number | null;
  currency_column: string | number | null;
  sign_convention: SignConvention;
  direction_column: string | number | null;
  decimal_separator: DecimalSeparator | null;
  thousands_separator: ThousandsSeparator;
}

/**
 * TCK-2674 / TCK-2675 — le rapprochement vu par paiement, sur un mois (`period=YYYY-MM`) :
 * `GET /api/agencies/{a}/reconciliation/overview`. Une table vide arrive en objet (`{}`).
 */
export interface ReconciliationOverview {
  period: string;
  payments_total: number;
  confirmed_automatically: { total: number; by_provider: Record<string, number> };
  to_reconcile: { total: number; by_method: Record<string, number> };
  reconciled_manually: number;
  /**
   * TCK-2932 / TCK-2933 — les paiements sortis du reste à rapprocher (« Ignorer » : espèces gardées,
   * autre compte…). La somme des quatre classes reste `payments_total` ; ils ne sont PAS rapprochés.
   */
  ignored: number;
}

/** La ligne de banque que l'API propose pour un paiement (la meilleure, sur un relevé ouvert). */
export interface SuggestedBankLine {
  id: number;
  statement_id: number;
  date: string | null;
  label: string | null;
  amount: number | string;
  confidence: number | string | null;
}

/** Un paiement encaissé sans passerelle et pas encore rapproché (`…/reconciliation/pending-payments`). */
export interface PendingPayment {
  type: 'lease_payment' | 'booking_payment';
  id: number;
  reference: string | null;
  payer: { id: number; name: string | null } | null;
  property: { id: number; title: string | null } | null;
  amount: number | string;
  /**
   * Ce que la banque doit porter (la règle du matcher) : la pénalité réglée le même jour comprise, ou
   * le montant figé d'un règlement en ligne. Absent d'une API antérieure : `amount`.
   */
  expected_bank_amount?: number | string | null;
  currency: string | null;
  paid_at: string | null;
  payment_method: string | null;
  suggested_line: SuggestedBankLine | null;
}

/** Le filtre de la liste : tout, avec ou sans ligne proposée, ou un moyen de paiement. */
export type FiltreDuReste =
  | { readonly type: 'tout' }
  | { readonly type: 'suggestion' }
  | { readonly type: 'sans' }
  | { readonly type: 'moyen'; readonly moyen: string };

/* ─────────────── TCK-2933 — ignorer un paiement, aperçu d'un relevé, formats lus (TCK-2932) ─────────────── */

/** Pourquoi un paiement n'aura jamais de ligne de banque (`IgnoredPaymentReason`) ; `other` exige une note. */
export type MotifDIgnorer = 'cash_kept' | 'other_account' | 'other';

/** Un geste « Ignorer » encore en effet (`…/reconciliation/ignored-payments`) ; `id` est celui du geste. */
export interface PaiementIgnore {
  id: number;
  reason: MotifDIgnorer | string | null;
  note: string | null;
  ignored_at: string | null;
  ignored_by: { id: number; first_name: string | null; last_name: string | null } | null;
  payment: PendingPayment | null;
}

/** Une ligne lue par l'aperçu (`POST …/bank-statements/preview`) : montant en chaîne décimale. */
export interface LigneDApercu {
  date: string;
  amount: string;
  direction: BankLineDirection;
  currency: string | null;
  label: string | null;
  reference: string | null;
  counterparty: string | null;
}

/** Ce que l'import LIRAIT du fichier — rien n'est écrit. */
export interface ApercuDuReleve {
  source_format: BankStatementSourceFormat;
  read: number;
  skipped: number;
  /** Une table vide arrive en objet (`{}`). Codes : `missing_value`, `invalid_date`… */
  skipped_by_reason: Record<string, number>;
  /** Le rang de la ligne dans le fichier et sa raison (50 au plus). */
  skipped_lines: { line: number; reason: string }[];
  period: { start: string | null; end: string | null };
  lines: LigneDApercu[];
  /** Le même fichier a déjà été importé (hors relevé en échec) : l'import le refuserait. */
  already_imported: boolean;
}

/** `GET …/reconciliation/supported-formats` — les banques ne sont listées qu'à préréglage éprouvé (D-67). */
export interface FormatsPrisEnCharge {
  formats: { code: BankStatementSourceFormat; extensions: string[]; configurable_columns: boolean }[];
  banks: { code: string; name: string; format: BankStatementSourceFormat }[];
}
