'use client';

import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import type { MatchedPaymentType } from '@/types/reconciliation';

/**
 * TCK-1522 (P110.02) — le statut du payable rapproché ou proposé, avec les libellés que la console
 * emploie déjà pour chaque type : un encaissement remboursé après rapprochement garde sa ligne, et
 * la ligne le dit. Signaler, sans refuser (décision du porteur).
 *
 * Chaque type lit l'espace de ses statuts ; une valeur que l'espace ne connaît pas n'affiche rien,
 * plutôt qu'une clé brute.
 */
const STATUTS: Record<MatchedPaymentType, { readonly espace: string; readonly valeurs: readonly string[] }> = {
  booking_payment: {
    espace: 'payments.status',
    valeurs: ['pending', 'paid', 'late', 'partially_paid', 'failed', 'refunded', 'cancelled'],
  },
  lease_payment: {
    espace: 'payments.status',
    valeurs: ['pending', 'paid', 'late', 'partially_paid', 'failed', 'refunded', 'cancelled'],
  },
  invoice: {
    espace: 'payments.invoiceStatus',
    valeurs: ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'void'],
  },
  payout: {
    espace: 'payments.payoutStatus',
    valeurs: ['awaiting_approval', 'pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled'],
  },
  platform_payout: {
    espace: 'billing.platformPayouts.status',
    valeurs: ['pending', 'approved', 'processing', 'paid', 'failed', 'cancelled'],
  },
};

/** L'argent n'est plus (ou n'a jamais été) acquis : remboursé, annulé, échoué. */
const SORTIS_DE_L_ENCAISSE = new Set(['refunded', 'cancelled', 'void', 'failed']);

export function PayableStatusBadge({
  type,
  status,
  'data-testid': testId,
}: {
  readonly type: MatchedPaymentType;
  readonly status: string | null | undefined;
  readonly 'data-testid'?: string;
}) {
  const t = useTranslations();
  const statuts = STATUTS[type];
  if (!status || !statuts?.valeurs.includes(status)) return null;

  return (
    <StatusBadge
      tone={SORTIS_DE_L_ENCAISSE.has(status) ? 'danger' : 'neutral'}
      label={t(`${statuts.espace}.${status}`)}
      data-testid={testId}
    />
  );
}
