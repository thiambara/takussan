import type { StatusTone } from '@/components/console';
import type { InvoiceStatus, PayoutMethodKind, PayoutStatus, ServiceProviderBillStatus } from '@/types/invoice';

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
 * Ce qui reste ici est ce qui n'est PAS du texte : le ton de `StatusBadge` associé à chaque valeur
 * d'enum, l'ordre d'affichage des valeurs, et deux calculs purs.
 */

/**
 * Must stay aligned with `App\Models\Enums\PaymentStatus` (pending, paid,
 * late, partially_paid, failed, refunded, cancelled). The backend rejects any other
 * value with HTTP 422 on `GET /api/payments/history?filter[status]=...`.
 */
export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'late'
  | 'partially_paid'
  | 'failed'
  | 'refunded'
  | 'cancelled';

/** Ordre d'affichage du filtre de statut — l'ordre EST la donnée, pas un détail. */
export const PAYMENT_STATUS_VALUES: readonly PaymentStatus[] = [
  'pending',
  'paid',
  'late',
  'partially_paid',
  'failed',
  'refunded',
  'cancelled',
];

/*
 * TCK-292 — `PAYMENT_STATUS_LABEL` a été SUPPRIMÉ. C'était un pont de compatibilité réduit à sa
 * seule entrée `late`, laissé le temps que `admin/finances/OverduePaymentsTable.tsx` — qui vivait
 * dans un autre lot — passe à `t('payments.status.late')`. Ce consommateur est converti ; le pont
 * n'a plus de raison d'être, et le vocabulaire des statuts vit désormais UNIQUEMENT sous
 * `payments.status.*` dans les trois dictionnaires.
 */

/*
 * Tons de `StatusBadge` (vocabulaire unique, TCK-358) et non plus variantes de `Badge` : « Payé »
 * était un aplat PRIMAIRE plein — la couleur de l'action — là où il fallait dire « réussi ».
 */
export const PAYMENT_STATUS_TONE: Record<PaymentStatus, StatusTone> = {
  pending: 'attention',
  paid: 'success',
  late: 'danger',
  partially_paid: 'info',
  failed: 'danger',
  refunded: 'neutral',
  cancelled: 'neutral',
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, StatusTone> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'neutral',
  void: 'neutral',
};

export const PAYOUT_STATUS_TONE: Record<PayoutStatus, StatusTone> = {
  // TCK-594 — le reversement au-dessus du seuil de l'agence attend un second membre.
  awaiting_approval: 'attention',
  pending: 'attention',
  scheduled: 'info',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

/** TCK-594 (ADR-0039 §8) — la facture d'intervention attend la validation de l'agence. */
export const SERVICE_PROVIDER_BILL_STATUS_TONE: Record<ServiceProviderBillStatus, StatusTone> = {
  pending_validation: 'attention',
  validated: 'info',
  rejected: 'danger',
  paid: 'success',
  cancelled: 'neutral',
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

/*
 * TCK-594 (ADR-0039 §1) — `computePayoutNet` et `commissionFromRate` ont été SUPPRIMÉS : le brut, la
 * commission et le net d'un reversement se calculent côté serveur, depuis les pièces citées et le
 * taux du bail ou de l'agence. Un calcul de commission côté client était précisément la saisie que
 * l'ADR retire.
 */

/**
 * TCK-594 (ADR-0039 §6) — les moyens de paiement qui partent vers une destination déclarée, et les
 * natures de destination que chacun accepte. Recopie de `PayoutService::DESTINATION_KINDS` : le
 * serveur juge, l'écran ne propose que ce qu'il accepterait.
 */
export const DESTINATION_KINDS_BY_METHOD: Partial<Record<(typeof PAYMENT_METHOD_VALUES)[number], readonly PayoutMethodKind[]>> = {
  wave: ['wave'],
  orange_money: ['orange_money'],
  free_money: ['free_money'],
  mobile_money: ['wave', 'orange_money', 'free_money'],
  bank_transfer: ['bank_transfer'],
};

