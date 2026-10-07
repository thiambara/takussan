'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import { useLeasePayments, useMarkLateFeePaid } from '@/lib/queries/leases';
import { EmptyState, ErrorState } from '@/components/feedback';
import { formatCurrency, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/config';
import type { LeasePayment } from '@/types/lease';
import { cn } from '@/lib/utils';
import { PayOnlineButton } from '@/components/payments/PayOnlineButton';
import { detailMontantDu } from '@/components/payments/montant-du';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useToast } from '@/components/ui/toast';
import { checkoutEnCours, type CheckoutEnCours } from '@/components/payments/checkout-en-cours';
import { PasserOutreDialog } from './PasserOutreDialog';

interface LeaseScheduleProps {
  readonly leaseId: number;
  /** Agency owning the lease — drives which gateway providers are available. */
  readonly agencyId?: number | null;
  /**
   * TCK-593 — le lecteur gère le bail (agent, admin d'agence, propriétaire) : il peut constater
   * qu'une pénalité a été réglée à l'agence. Le locataire ne le peut pas (403 côté API).
   */
  readonly canManage?: boolean;
}

/**
 * Derived display status — `late` payments are computed client-side when
 * the server hasn't flagged them yet (due date in the past and status ≠ paid).
 */
function displayStatus(p: LeasePayment): 'paid' | 'late' | 'pending' | 'other' {
  if (p.status === 'paid') return 'paid';
  if (p.status === 'pending' && p.due_date) {
    const due = new Date(p.due_date);
    if (!Number.isNaN(due.getTime()) && due < new Date()) return 'late';
  }
  if (p.status === 'late') return 'late';
  if (p.status === 'pending') return 'pending';
  return 'other';
}

/**
 * Échéancier du bail.
 *
 * TCK-593 — une LISTE, plus une table : à 390 px, la table de TCK-505 défilait en X pour montrer la
 * colonne d'actions, qui porte désormais jusqu'à trois gestes (payer, quittance, pénalité réglée).
 * Chaque échéance est une ligne qui se replie en carte sur téléphone et s'aligne en colonnes à
 * partir de `lg` ; le conteneur ne défile plus du tout.
 */
export function LeaseSchedule({ leaseId, agencyId, canManage = false }: LeaseScheduleProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('lease.schedule');
  const tScheduleStatus = useTranslations('lease.schedule.status');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const paymentsQuery = useLeasePayments(leaseId);
  const { data, isLoading, isError } = paymentsQuery;
  const { providers } = usePaymentProviders(agencyId ?? null);
  const markLateFeePaid = useMarkLateFeePaid(leaseId);
  // Passe 2 (M5) — l'échéance dont un checkout en ligne bloque l'enregistrement de la pénalité.
  const [bloquee, setBloquee] = useState<{
    paymentId: number;
    checkout: CheckoutEnCours;
  } | null>(null);

  const payments = useMemo(() => data?.data ?? [], [data]);

  if (isLoading) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  if (isError) {
    return (
      <ErrorState
        message={t('error')}
        onRetry={() => void paymentsQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }
  if (payments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="size-8" aria-hidden="true" />}
        title={t('empty_title')}
        description={t('empty_description')}
      />
    );
  }

  async function constaterPenaliteReglee(paymentId: number, motifPassageOutre?: string) {
    try {
      await markLateFeePaid.mutateAsync(
        motifPassageOutre === undefined
          ? { paymentId }
          : { paymentId, override_open_checkout: true, override_reason: motifPassageOutre },
      );
      setBloquee(null);
      toast.add({ title: t('lateFee.markedPaid'), type: 'success' });
    } catch (err) {
      // Un checkout en ligne vit : on propose de passer outre au lieu d'un refus nu.
      const enCours = motifPassageOutre === undefined ? checkoutEnCours(err) : null;
      if (enCours) {
        setBloquee({ paymentId, checkout: enCours });
        return;
      }
      toast.add({ title: messageErreur(err, t('lateFee.markFailed')), type: 'error' });
    }
  }

  return (
    <>
      <ul
        className="divide-y divide-border rounded-xl border border-border bg-card text-sm tabular-nums"
        aria-label={t('listLabel')}
        data-testid="echeancier"
      >
        {payments.map((p) => {
          const st = displayStatus(p);
          const enDevise = (valeur: number) =>
            formatCurrency(valeur, locale, { currency: p.currency });
          const penaliteHorsLigne = p.late_fee_outstanding > 0 && !p.late_fee_payable_online;
          return (
            <li
              key={p.id}
              className={cn(
                'flex flex-col gap-3 px-4 py-3 transition-colors lg:flex-row lg:items-center lg:gap-6',
                st === 'late' && 'bg-destructive/10',
              )}
            >
              <div className="min-w-0 lg:w-64 lg:shrink-0">
                <p className="font-medium text-foreground">
                  {formatDate(p.period_start, locale)} → {formatDate(p.period_end, locale)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('dueOn', {
                    date: p.due_date ? formatDate(p.due_date, locale) : '—',
                  })}
                </p>
              </div>

              <div className="min-w-0 lg:flex-1">
                <p className="font-medium text-foreground">
                  {enDevise(p.amount)}
                  {typeof p.late_fee_amount === 'number' && p.late_fee_amount > 0 && (
                    <span className="ml-1 text-xs text-destructive" data-testid="penalite">
                      +{enDevise(p.late_fee_amount)}
                    </span>
                  )}
                </p>
                {typeof p.late_fee_amount === 'number' && p.late_fee_amount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {p.late_fee_paid_at
                      ? t('lateFee.settled')
                      : penaliteHorsLigne
                        ? t('lateFee.atAgency')
                        : t('lateFee.label')}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Badge
                  variant={st === 'paid' ? 'default' : st === 'late' ? 'destructive' : 'outline'}
                >
                  {tScheduleStatus(st)}
                </Badge>
                {p.amount_due > 0 && (
                  <PayOnlineButton
                    paymentType="lease-payments"
                    paymentId={p.id}
                    currency={p.currency}
                    availableProviders={providers}
                    montant={detailMontantDu(p)}
                  />
                )}
                {p.receipt_available && (
                  <BoutonTelechargement
                    chemin={`/api/leases/${leaseId}/receipts/${p.id}/pdf`}
                    nomFichier={`quittance-${p.reference_number ?? p.id}.pdf`}
                    size="sm"
                  >
                    {t('receiptPdf')}
                  </BoutonTelechargement>
                )}
                {canManage && p.late_fee_outstanding > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void constaterPenaliteReglee(p.id)}
                    disabled={markLateFeePaid.isPending}
                  >
                    {t('lateFee.markPaid')}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <PasserOutreDialog
        checkout={bloquee?.checkout ?? null}
        occupe={markLateFeePaid.isPending}
        onAnnuler={() => setBloquee(null)}
        onConfirmer={(motif) => {
          if (bloquee) void constaterPenaliteReglee(bloquee.paymentId, motif);
        }}
      />
    </>
  );
}
