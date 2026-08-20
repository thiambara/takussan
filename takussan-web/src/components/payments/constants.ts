import type { InvoiceStatus, PayoutStatus } from '@/types/invoice';

/**
 * Variantes de badge et helpers purs des vues « paiements » (TCK-063). À garder
 * alignés sur les enums backend :
 *
 *   - `App\\Models\\Enums\\PaymentStatus`
 *   - `App\\Models\\Enums\\InvoiceStatus`
 *   - `App\\Models\\Enums\\PayoutStatus`
 *
 * ⚠ Les tables de LIBELLÉS françaises (`*_STATUS_LABEL`, `PAYMENT_METHOD_OPTIONS`) qui vivaient
 * ici ont été retirées par TCK-292 : le texte affiché appartient au front, mais il appartient au
 * DICTIONNAIRE, pas à un module de constantes. Les libellés se résolvent désormais sous
 * `payments.status.*`, `payments.invoiceStatus.*`, `payments.payoutStatus.*` et
 * `payments.methods.*` — la clé étant la valeur d'enum elle-même, un composant écrit
 * `t(`status.${status}`)`.
 *
 * Ce qui reste ici est ce qui n'est PAS du texte : la variante de badge associée à chaque valeur
 * d'enum, l'ordre d'affichage des valeurs, et deux calculs purs.
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

/** Ordre d'affichage du filtre de statut — l'ordre EST la donnée, pas un détail. */
export const PAYMENT_STATUS_VALUES: readonly PaymentStatus[] = [
  'pending',
  'paid',
  'late',
  'partially_paid',
  'failed',
  'refunded',
];

/*
 * TCK-292 — `PAYMENT_STATUS_LABEL` a été SUPPRIMÉ. C'était un pont de compatibilité réduit à sa
 * seule entrée `late`, laissé le temps que `admin/finances/OverduePaymentsTable.tsx` — qui vivait
 * dans un autre lot — passe à `t('payments.status.late')`. Ce consommateur est converti ; le pont
 * n'a plus de raison d'être, et le vocabulaire des statuts vit désormais UNIQUEMENT sous
 * `payments.status.*` dans les trois dictionnaires.
 */

export const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  pending: 'outline',
  paid: 'default',
  late: 'destructive',
  partially_paid: 'secondary',
  failed: 'destructive',
  refunded: 'secondary',
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, BadgeVariant> = {
  draft: 'outline',
  sent: 'secondary',
  paid: 'default',
  overdue: 'destructive',
  cancelled: 'outline',
  void: 'outline',
};

export const PAYOUT_STATUS_VARIANT: Record<PayoutStatus, BadgeVariant> = {
  pending: 'outline',
  scheduled: 'secondary',
  processing: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
};

// TCK-084 — labels derived from the central currency metadata so the picker
// always advertises the right symbol next to the ISO code. Ce n'est PAS du texte
// traduisible : « XOF (F CFA) » se lit à l'identique dans les trois langues.
import { CURRENCY_METADATA } from '@/lib/format/currency';

export const CURRENCY_OPTIONS = (
  ['XOF', 'EUR', 'USD', 'XAF'] as const
).map((code) => ({
  value: code,
  label: `${code} (${CURRENCY_METADATA[code].symbol})`,
}));

/** Valeurs d'enum du mode de paiement — le libellé se résout sous `payments.methods.*`. */
export const PAYMENT_METHOD_VALUES = [
  'cash',
  'bank_transfer',
  'mobile_money',
  'wave',
  'orange_money',
  'free_money',
  'check',
  'card',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];

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
