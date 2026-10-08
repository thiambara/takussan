'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, Receipt } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { StatusBadge } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { usePaymentsHistory } from '@/lib/queries/payments';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { PaymentHistoryRow } from '@/types/invoice';

import { PAYMENT_STATUS_TONE, type PaymentStatus } from './constants';
import { detailMontantDu } from './montant-du';
import { PayOnlineButton } from './PayOnlineButton';

/**
 * TCK-593 (Partie 2) — la page « Paiements » du CLIENT (locataire, acheteur), en lecture seule.
 *
 * Les trois onglets professionnels (historique filtrable, factures, reversements) répondaient à une
 * question que le locataire ne pose pas. La sienne est « combien je dois, et je paie où ? » : le
 * prochain montant dû vient donc en tête, avec « Payer » sans défiler, puis l'historique en cartes
 * — pas de table qui défile sur téléphone.
 *
 * Les dus sont filtrés CÔTÉ SERVEUR (`filter[status]=pending,partially_paid,late,failed`) et le
 * montant affiché est `amount_due` tel que l'API le calcule : la page n'additionne rien.
 *
 * Une pénalité restant due sur un loyer PAYÉ (le cas par défaut, réglage désactivé) n'a pas sa
 * place dans les dus — rien n'est payable en ligne — mais reste rappelée sur sa carte d'historique.
 */
const STATUTS_DUS = 'pending,partially_paid,late,failed';
const PAR_PAGE = 20;

/**
 * Le sélecteur de fournisseurs reçoit `undefined` : la liste des intégrations de l'agence n'est pas
 * lisible par le client (`GET /api/integrations` → 403), et l'API refuse à l'initiation un
 * fournisseur que l'agence n'a pas.
 */
const FOURNISSEURS_INCONNUS = undefined;

function estStatut(valeur: string | null): valeur is PaymentStatus {
  return valeur !== null && valeur in PAYMENT_STATUS_TONE;
}

function montantsDe(row: PaymentHistoryRow) {
  return detailMontantDu({
    amount_due: row.amount_due ?? 0,
    remaining_amount: row.remaining_amount,
    late_fee_outstanding: row.late_fee_outstanding ?? 0,
    late_fee_payable_online: row.late_fee_payable_online ?? false,
  });
}

export function CustomerPayments() {
  const t = useTranslations('payments.customer');
  const tStatus = useTranslations('payments.status');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const [page, setPage] = useState(1);

  const dus = usePaymentsHistory({ status: STATUTS_DUS, sort: 'date', per_page: 50 });
  const historique = usePaymentsHistory({ sort: '-date', page, per_page: PAR_PAGE });

  const aPayer = (dus.data?.data ?? []).filter(
    (row) => row.source === 'lease' && (row.amount_due ?? 0) > 0,
  );
  const [prochain, ...suivants] = aPayer;

  const enDevise = (valeur: number, devise: string | null) =>
    formatCurrency(valeur, locale, { currency: devise ?? 'XOF' });

  const periode = (row: PaymentHistoryRow) =>
    row.period_start && row.period_end
      ? t('period', {
          start: formatDate(row.period_start, locale),
          end: formatDate(row.period_end, locale),
        })
      : null;

  const libelle = (row: PaymentHistoryRow) =>
    row.source === 'lease' ? (periode(row) ?? t('rent')) : t('booking');

  function rappelPenalite(row: PaymentHistoryRow) {
    const { penaliteHorsLigne } = montantsDe(row);
    if (penaliteHorsLigne <= 0) return null;
    return (
      <p className="text-sm text-muted-foreground" data-testid="penalite-hors-ligne">
        {t('lateFeeAtAgency', { amount: enDevise(penaliteHorsLigne, row.currency) })}
      </p>
    );
  }

  function boutonPayer(row: PaymentHistoryRow) {
    return (
      <PayOnlineButton
        paymentType="lease-payments"
        paymentId={row.id}
        currency={row.currency ?? 'XOF'}
        availableProviders={FOURNISSEURS_INCONNUS}
        montant={montantsDe(row)}
      />
    );
  }

  const lignes = historique.data?.data ?? [];
  const dernierePage = historique.data?.meta?.last_page ?? 1;

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="prochain-paiement"
        className="rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <h2
          id="prochain-paiement"
          className="font-display text-base font-semibold tracking-tight text-foreground"
        >
          {t('nextTitle')}
        </h2>
        {dus.isLoading ? (
          <Skeleton className="mt-3 h-20 rounded-lg" />
        ) : dus.isError ? (
          <ErrorState
            message={t('error')}
            onRetry={() => void dus.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        ) : !prochain ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-accent" aria-hidden="true" />
            {t('upToDate')}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="font-display text-3xl font-bold tabular-nums text-foreground"
                  data-testid="montant-du"
                >
                  {enDevise(prochain.amount_due ?? 0, prochain.currency)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {libelle(prochain)}
                  {prochain.due_date
                    ? ` · ${t('dueOn', { date: formatDate(prochain.due_date, locale) })}`
                    : null}
                </p>
              </div>
              {boutonPayer(prochain)}
            </div>
            {rappelPenalite(prochain)}
          </div>
        )}
        {suivants.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <h3 className="text-sm font-medium text-foreground">{t('otherDues')}</h3>
            <ul className="mt-2 divide-y divide-border">
              {suivants.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium tabular-nums text-foreground">
                      {enDevise(row.amount_due ?? 0, row.currency)}
                    </p>
                    <p className="text-muted-foreground">{libelle(row)}</p>
                    {rappelPenalite(row)}
                  </div>
                  {boutonPayer(row)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="historique-paiements">
        <h2
          id="historique-paiements"
          className="mb-3 font-display text-base font-semibold tracking-tight text-foreground"
        >
          {t('historyTitle')}
        </h2>
        {historique.isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : historique.isError ? (
          <ErrorState
            message={t('error')}
            onRetry={() => void historique.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        ) : lignes.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-8" aria-hidden="true" />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        ) : (
          <ul className="space-y-2" data-testid="historique-client">
            {lignes.map((row) => (
              <li
                key={`${row.source}-${row.id}`}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{libelle(row)}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.paid_at
                      ? t('paidOn', { date: formatDate(row.paid_at, locale) })
                      : row.due_date
                        ? t('dueOn', { date: formatDate(row.due_date, locale) })
                        : null}
                  </p>
                  {row.source === 'lease' && row.status === 'paid' && rappelPenalite(row)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums text-foreground">
                    {enDevise(row.amount, row.currency)}
                  </span>
                  {estStatut(row.status) && (
                    <StatusBadge tone={PAYMENT_STATUS_TONE[row.status]} label={tStatus(row.status)} />
                  )}
                  {/* TCK-594 (P5-3) — une caution rendue n'a pas de quittance de loyer. */}
                  {row.source === 'lease' && row.status === 'paid' && row.payment_type !== 'deposit_refund' && row.lease_id !== null && (
                    <BoutonTelechargement
                      chemin={`/api/leases/${row.lease_id}/receipts/${row.id}/pdf`}
                      nomFichier={`quittance-${row.reference_number ?? row.id}.pdf`}
                      size="sm"
                    >
                      {t('receiptPdf')}
                    </BoutonTelechargement>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {dernierePage > 1 && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              {t('previous')}
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('pageOf', { page: String(page), total: String(dernierePage) })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(dernierePage, p + 1))}
              disabled={page >= dernierePage}
            >
              {t('next')}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
