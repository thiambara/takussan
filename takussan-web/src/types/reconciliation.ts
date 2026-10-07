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
export type MatchedPaymentType = 'booking_payment' | 'lease_payment' | 'invoice' | 'payout';

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
  match_status: BankLineMatchStatus | null;
  matched_payment_type: MatchedPaymentType | null;
  matched_payment_id: number | null;
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
