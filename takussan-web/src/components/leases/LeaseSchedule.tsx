'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Link2 } from 'lucide-react';
import { useIssuePaymentLink, useLeasePayments, useMarkLateFeePaid } from '@/lib/queries/leases';
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
import { useAuth } from '@/context/AuthContext';
import { useMyProfiles } from '@/hooks/useProfiles';
import { PasserOutreDialog } from './PasserOutreDialog';
import { peutPasserOutreAuCheckout } from './passer-outre';

interface LeaseScheduleProps {
  readonly leaseId: number;
  /** Agency owning the lease — drives which gateway providers are available. */
  readonly agencyId?: number | null;
  /** TCK-593 (passe 3, m3) — sur un bail sans agence, c'est son bailleur qui passe outre. */
  readonly landlordId?: number | null;
  /**
   * TCK-593 — le lecteur gère le bail (agent, admin d'agence, propriétaire) : il peut constater
   * qu'une pénalité a été réglée à l'agence. Le locataire ne le peut pas (403 côté API).
   */
  readonly canManage?: boolean;
  /**
   * P152.02 — constater la pénalité réglée se juge par `LeasePolicy::recordPayment`
   * (`MarkLateFeePaidRequest`), pas par le rôle de gestion : le drapeau `abilities.record_payment`.
   */
  readonly canRecordPayment?: boolean;
}

/**
 * Statut affiché. Une échéance `pending` s'affiche « en retard » quand l'API la dit échue
 * (`is_overdue`, TCK-1831, P183.01 : règle de `scopeOverdue`, due AVANT aujourd'hui — l'échéance
 * du jour reste « en attente »). Le statut `late` seul ne suffit pas : l'API ne l'écrit que
 * lorsqu'elle applique une pénalité de retard (`LateFeeCalculator`, bail à `late_fee_percent`
 * positif, délai de grâce écoulé), et sans pénalité configurée aucune échéance n'est jamais
 * marquée `late` côté serveur (TCK-1829, P183.05). Aucune date n'est comparée ici à l'horloge du
 * navigateur.
 *
 * TCK-1264 (P146.02) — suit chaque cas de `PaymentStatus` : `refunded`, `failed` et
 * `partially_paid` ne retombent plus sur « Autre ». Une restitution de dépôt (`deposit_refund`)
 * n'est jamais dite échue par l'API (`is_overdue` faux) : c'est l'agence qui la doit, pas le
 * locataire (features.md, TCK-595).
 */
function displayStatus(
  p: LeasePayment,
): 'paid' | 'late' | 'pending' | 'cancelled' | 'partially_paid' | 'failed' | 'refunded' | 'other' {
  // VERIF-596 passe 6 (m-i) — une échéance d'un bail parent que son renouvellement a reprise : plus
  // due, ni loyer ni pénalité. Jugée AVANT l'échéance passée, qui la dirait « en retard ».
  if (p.status === 'cancelled') return 'cancelled';
  if (p.status === 'paid') return 'paid';
  if (p.status === 'refunded') return 'refunded';
  if (p.status === 'failed') return 'failed';
  if (p.status === 'partially_paid') return 'partially_paid';
  if (p.status === 'pending' && p.is_overdue) return 'late';
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
export function LeaseSchedule({
  leaseId,
  agencyId,
  landlordId,
  canManage = false,
  canRecordPayment = false,
}: LeaseScheduleProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('lease.schedule');
  const tScheduleStatus = useTranslations('lease.schedule.status');
  const tCommon = useTranslations('common');
  const tGateway = useTranslations('payments.gateway');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const paymentsQuery = useLeasePayments(leaseId);
  const { data, isLoading, isError } = paymentsQuery;
  const markLateFeePaid = useMarkLateFeePaid(leaseId);
  const issuePaymentLink = useIssuePaymentLink();
  const { user } = useAuth();
  const { data: mesProfils } = useMyProfiles();
  // Passe 3 (m3) — l'offre de passer outre suit la règle de l'API : un bailleur d'agence gère le
  // bail (`canManage`) mais n'y a pas droit, et saisissait un motif pour un 403.
  const peutPasserOutre = peutPasserOutreAuCheckout(
    { agencyId: agencyId ?? null, landlordId: landlordId ?? null },
    user?.id,
    mesProfils?.data ?? [],
  );
  // Passe 2 (M5) — l'échéance dont un checkout en ligne bloque l'enregistrement de la pénalité.
  const [bloquee, setBloquee] = useState<{
    paymentId: number;
    checkout: CheckoutEnCours;
  } | null>(null);

  const payments = useMemo(() => data?.data ?? [], [data]);
  // TCK-602 — les fournisseurs ne dépendent que de l'agence et de la devise du bail : la première
  // échéance due suffit à les lire, une requête par échéancier et non par ligne.
  const { providers } = usePaymentProviders('lease-payments', payments.find((p) => p.status !== 'cancelled' && p.amount_due > 0)?.id ?? null);

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

  /**
   * TCK-602 — le lien de paiement d'une échéance, copié pour être transmis au locataire sans
   * compte (la relance le porte déjà quand un fournisseur sert l'agence).
   */
  async function copierLienDePaiement(paymentId: number) {
    try {
      const { data: lien } = await issuePaymentLink.mutateAsync({ paymentId });
      let copie = false;
      try {
        await navigator.clipboard.writeText(lien.url);
        copie = true;
      } catch {
        // Presse-papiers refusé (contexte non sécurisé, permission) : le lien s'affiche à la place.
      }
      toast.add({
        title: copie ? t('paymentLink.copied') : t('paymentLink.ready'),
        description: copie ? undefined : lien.url,
        type: 'success',
      });
    } catch (err) {
      toast.add({ title: messageErreur(err, t('paymentLink.failed')), type: 'error' });
    }
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
      // Un checkout en ligne vit : à qui le peut, on propose de passer outre au lieu d'un refus
      // nu ; aux autres, on dit lequel et jusqu'à quand (passe 3, m3).
      const enCours = motifPassageOutre === undefined ? checkoutEnCours(err) : null;
      if (enCours && peutPasserOutre) {
        setBloquee({ paymentId, checkout: enCours });
        return;
      }
      toast.add({
        title: enCours
          ? tGateway('error.checkoutInProgress', {
              amount: formatCurrency(enCours.montant, locale, { currency: enCours.devise }),
              time: formatDate(enCours.reessayerApres, locale, { dateStyle: undefined, timeStyle: 'short' }),
            })
          : messageErreur(err, t('lateFee.markFailed')),
        type: 'error',
      });
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
          const annulee = st === 'cancelled';
          const penalite = !annulee && typeof p.late_fee_amount === 'number' && p.late_fee_amount > 0 ? p.late_fee_amount : null;
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
                <p className={cn('font-medium text-foreground', annulee && 'text-muted-foreground line-through')}>
                  {enDevise(p.amount)}
                  {penalite !== null && (
                    <span className="ml-1 text-xs text-destructive" data-testid="penalite">
                      +{enDevise(penalite)}
                    </span>
                  )}
                </p>
                {penalite !== null && (
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
                {!annulee && p.amount_due > 0 && (
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
                {canManage && !annulee && p.amount_due > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copierLienDePaiement(p.id)}
                    disabled={issuePaymentLink.isPending}
                    data-testid="lien-de-paiement"
                  >
                    <Link2 className="size-4" aria-hidden="true" />
                    {t('paymentLink.copy')}
                  </Button>
                )}
                {canRecordPayment && !annulee && p.late_fee_outstanding > 0 && (
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
