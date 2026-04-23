import type { InvoiceStatus, PayoutStatus } from '@/types/invoice';

/**
 * Stable UI labels & variants for every status we render in the payments
 * views (TCK-063). Keep aligned with the backend enums:
 *
 *   - `App\\Models\\Enums\\PaymentStatus`
 *   - `App\\Models\\Enums\\InvoiceStatus`
 *   - `App\\Models\\Enums\\PayoutStatus`
 */

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

/**
 * Must stay aligned with `App\Models\Enums\PaymentStatus` (pending, paid,
 * late, partially_paid, failed, refunded). The backend rejects any other
 * value with HTTP 422 on `GET /api/payments/history?filter[status]=...`.
 */
export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'late'
  | 'partially_paid'
  | 'failed'
  | 'refunded';

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'En attente',
  paid: 'Payé',
  late: 'En retard',
  partially_paid: 'Partiellement payé',
  failed: 'Échec',
  refunded: 'Remboursé',
};

export const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  pending: 'outline',
  paid: 'default',
  late: 'destructive',
  partially_paid: 'secondary',
  failed: 'destructive',
  refunded: 'secondary',
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
  void: 'Annulée',
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  draft: 'outline',
  sent: 'secondary',
  paid: 'default',
  overdue: 'destructive',
  cancelled: 'outline',
  void: 'outline',
};

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: 'En attente',
  scheduled: 'Planifié',
  processing: 'En cours',
  completed: 'Effectué',
  failed: 'Échoué',
  cancelled: 'Annulé',
};

export const PAYOUT_STATUS_VARIANT: Record<PayoutStatus, BadgeVariant> = {
  pending: 'outline',
  scheduled: 'secondary',
  processing: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
};

export const CURRENCY_OPTIONS = [
  { value: 'XOF', label: 'XOF (F CFA)' },
  { value: 'XAF', label: 'XAF' },
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'wave', label: 'Wave' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'free_money', label: 'Free Money' },
  { value: 'check', label: 'Chèque' },
  { value: 'card', label: 'Carte bancaire' },
] as const;

/**
 * Compute the net amount of a payout given gross, commission and fees.
 * Exposed (and pure) so it can be unit-tested separately.
 */
export function computePayoutNet({
  gross,
  commission = 0,
  fees = 0,
}: {
  readonly gross: number;
  readonly commission?: number;
  readonly fees?: number;
}): number {
  const net = Number(gross) - Number(commission) - Number(fees);
  return Number.isFinite(net) ? net : 0;
}

/**
 * Helper — derive the commission amount from a percentage applied on the
 * gross amount. Matches the convention used by `Agency.commission_rate`
 * (stored as a 2-decimal number between 0 and 100).
 */
export function commissionFromRate(gross: number, ratePercent: number): number {
  if (!Number.isFinite(gross) || !Number.isFinite(ratePercent)) return 0;
  const rate = Math.max(0, Math.min(100, ratePercent));
  return Math.round(gross * rate) / 100;
}
