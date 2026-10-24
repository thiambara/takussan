'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  useGenerateSchedule,
  useLease,
  useLeasePayments,
  useReviewLeaseRent,
} from '@/lib/queries/leases';
import { formatCurrency, formatDate } from '@/lib/format';
import { ErrorState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import type { Locale } from '@/i18n/config';
import { LeaseSchedule } from './LeaseSchedule';
import { LeasePaymentDialog } from './LeasePaymentDialog';
import { GuarantorSection } from './GuarantorSection';
import { DepositRefundBanner } from './DepositRefundBanner';
import { LeaseRenewalDialog } from './LeaseRenewalDialog';
import { LeaseChainTimeline } from './LeaseChainTimeline';
import { EarlyTerminationDialog } from './EarlyTerminationDialog';
import { EarlyTerminationBanner } from './EarlyTerminationBanner';
import { LeaseSignaturePanel } from './LeaseSignaturePanel';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { LeaveReviewCta } from '@/components/reviews/LeaveReviewCta';
import { canLeaseLeaveReview } from '@/components/reviews/reviewEligibility';
import { useAuth } from '@/context/AuthContext';

// TCK-179 — le libellé remplace la valeur d'enum brute (`Residential Rent`) ; TCK-292 l'a déplacé
// du code vers le dictionnaire (`lease.status.*`, `lease.types.*`). Les valeurs connues sont
// listées ici pour ne pas demander au dictionnaire une clé qu'il n'a pas.
const KNOWN_LEASE_TYPES = new Set([
  'residential_rent',
  'commercial_rent',
  'seasonal_rent',
  'sale',
]);

interface LeaseDetailProps {
  readonly leaseId: number;
}

export function LeaseDetail({ leaseId }: LeaseDetailProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('lease.detail');
  const tLease = useTranslations('lease');
  const tStatus = useTranslations('lease.status');
  const tTypes = useTranslations('lease.types');
  const tRenewal = useTranslations('lease.renewal');
  const tTermination = useTranslations('lease.early_termination');
  const tCommon = useTranslations('common');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [earlyTerminationOpen, setEarlyTerminationOpen] = useState(false);
  const { user } = useAuth();
  const leaseQuery = useLease(leaseId);
  const { data, isLoading, isError } = leaseQuery;
  const { data: paymentsData } = useLeasePayments(leaseId);
  const generateSchedule = useGenerateSchedule(leaseId);
  const reviewRent = useReviewLeaseRent(leaseId);
  const toast = useToast();

  // TCK-173 — les gestes de gestion qu'aucune capacité ne juge (document, échéancier) ne se
  // montrent pas au locataire : tout rôle de gestion les voit. Garants et préavis suivent
  // `abilities` depuis P189.03.
  //
  // P152.02 — renouveler, réviser le loyer, encaisser et restituer le dépôt NE suivent PLUS ce
  // rôle : `LeasePolicy` les juge par capacité (`leases.renew`, `leases.rent_review`,
  // `payments.record`, `leases.refund_deposit`), et le détail rend son verdict dans `abilities`.
  const isAgentSurface = useMemo(() => {
    const roles = user?.roles ?? [];
    return roles.some((r) =>
      ['super_admin', 'agency_admin', 'agent', 'owner'].includes(r),
    );
  }, [user]);


  // TCK-1833 (P183.02) — les échéances que l'API dit échues (`is_overdue`, TCK-1831 : règle de
  // `scopeOverdue`) : ni restitution de caution, ni échéance du jour, `partially_paid` échue
  // comprise. Aucune date n'est comparée à l'horloge du navigateur.
  const latePaymentsCount = (paymentsData?.data ?? []).filter((p) => p.is_overdue).length;

  // TCK-1189 (P101.02) — le seul titre de la page est celui du bail : les écrans de chargement
  // et d'erreur gardent un h1, comme `BookingDetail`.
  const titreDeRepli = (
    <h1 className="sr-only">{tLease('fallbackReference', { id: String(leaseId) })}</h1>
  );
  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        {titreDeRepli}
        <Skeleton className="h-16 w-64 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <>
        {titreDeRepli}
        <ErrorState
          message={t('error')}
          onRetry={() => void leaseQuery.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      </>
    );
  }

  const lease = data.data;
  // TCK-596 — le préavis s'ouvre au gestionnaire (TCK-090) ET au locataire de CE bail
  // (`LeasePolicy::requestEarlyTermination`), jamais à « tout client ». Le statut éligible
  // est vérifié juste avant le rendu du bouton.
  // P189.03 (TCK-1871) — le préavis (et son annulation, même règle) suit le verdict de
  // `LeasePolicy::requestEarlyTermination` ; l'ajout de garant et le lien de paiement celui de
  // `LeasePolicy::update`. Le rôle les ouvrait au bailleur suspendu, et le préavis à l'agent sans
  // `leases.terminate`. Le libellé du préavis garde sa règle (gestionnaire ou locataire).
  const canRequestTermination = lease.abilities?.request_early_termination === true;
  const canManageLease = lease.abilities?.update === true;
  const canRenew = lease.abilities?.renew === true;
  const canReviewRent = lease.abilities?.review_rent === true;
  const canRecordPayment = lease.abilities?.record_payment === true;
  const canRefundDeposit = lease.abilities?.refund_deposit === true;
  const rentOrPrice = lease.type === 'sale' ? lease.sale_price : lease.monthly_rent;

  async function handleRentReview() {
    const rawRent = window.prompt(t('rentPromptAmount'), String(lease.monthly_rent ?? ''))?.trim();
    if (!rawRent) return;
    const newRent = Number(rawRent);
    if (!Number.isFinite(newRent) || newRent <= 0) return;
    const reason = window.prompt(t('rentPromptReason'))?.trim();
    if (!reason) return;
    await reviewRent.mutateAsync({ new_rent: newRent, reason });
    toast.add({
      title: t('rentReviewedToastTitle'),
      description: t('rentReviewedToastBody'),
      type: 'success',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/leases"
            className="-my-1 inline-flex min-h-8 items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t('backToList')}
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-balance text-foreground">
            {lease.reference_number || tLease('fallbackReference', { id: String(lease.id) })}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge>{tStatus(lease.status)}</Badge>
            {lease.type && (
              <span>{KNOWN_LEASE_TYPES.has(lease.type) ? tTypes(lease.type) : lease.type}</span>
            )}
            {latePaymentsCount > 0 && (
              <Badge variant="destructive">
                {t('latePayments', { count: String(latePaymentsCount) })}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAgentSurface && (
            <>
              <AddDocumentButton
                documentableType="lease"
                documentableId={leaseId}
                size="default"
                displayLabel={lease.reference_number || tLease('fallbackReference', { id: String(lease.id) })}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => generateSchedule.mutate({})}
                disabled={generateSchedule.isPending || lease.status === 'draft'}
              >
                {generateSchedule.isPending ? t('generating') : t('generateSchedule')}
              </Button>
            </>
          )}
          {canReviewRent && lease.status === 'active' && lease.type !== 'sale' && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRentReview}
              disabled={reviewRent.isPending}
            >
              {t('reviewRent')}
            </Button>
          )}
          {canRecordPayment && (
            <Button type="button" onClick={() => setPaymentOpen(true)}>
              {t('recordPayment')}
            </Button>
          )}
          {!isAgentSurface && (
            <BoutonTelechargement
              chemin={`/api/leases/${leaseId}/contract/pdf`}
              nomFichier={`bail-${lease.reference_number ?? lease.id}.pdf`}
            >
              {t('downloadContract')}
            </BoutonTelechargement>
          )}
          {canRenew && (lease.status === 'active' || lease.status === 'expired') && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenewalOpen(true)}
            >
              {tRenewal('cta')}
            </Button>
          )}
          {canRequestTermination &&
            (lease.status === 'active' || lease.status === 'expired') && (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setEarlyTerminationOpen(true)}
              >
                {isAgentSurface ? tTermination('cta') : tTermination('cta_tenant')}
              </Button>
            )}
        </div>
      </div>

      <LeaseChainTimeline leaseId={leaseId} currentId={leaseId} />

      {/* TCK-596 §4B (ADR-0042) — la signature par code remplace l'« Activer » sans preuve. */}
      <LeaseSignaturePanel lease={lease} />

      <EarlyTerminationBanner lease={lease} canCancel={canRequestTermination} />

      <DepositRefundBanner lease={lease} canRefund={canRefundDeposit} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <dl className="rounded-xl border border-border bg-card p-4 text-sm sm:p-5">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('duration')}</dt>
          <dd className="mt-1 text-foreground">
            {formatDate(lease.start_date, locale)}
            {lease.end_date
              ? ` → ${formatDate(lease.end_date, locale)}`
              : ` → ${t('openEnded')}`}
          </dd>
        </dl>
        <dl className="rounded-xl border border-border bg-card p-4 text-sm sm:p-5">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {lease.type === 'sale' ? t('price') : t('rent')}
          </dt>
          <dd className="mt-1 text-lg font-semibold whitespace-nowrap text-foreground tabular-nums">
            {typeof rentOrPrice === 'number'
              ? formatCurrency(rentOrPrice, locale)
              : '—'}
            {lease.type !== 'sale' && (
              <span className="ml-1 text-xs text-muted-foreground">{tLease('perMonth')}</span>
            )}
          </dd>
        </dl>
        <dl className="rounded-xl border border-border bg-card p-4 text-sm sm:col-span-2 sm:p-5 lg:col-span-1">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('deposit')}</dt>
          <dd className="mt-1 whitespace-nowrap text-foreground tabular-nums">
            {typeof lease.deposit_amount === 'number'
              ? formatCurrency(lease.deposit_amount, locale)
              : '—'}
          </dd>
        </dl>
      </div>

      <section>
        <h2 className="mb-3 font-display text-base font-semibold text-foreground">{t('schedule')}</h2>
        {lease.status === 'draft' ? (
          <p className="mb-3 rounded-lg border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
            {t('activateBeforeSchedule')}
          </p>
        ) : null}
        <LeaseSchedule
          leaseId={leaseId}
          agencyId={lease.agency_id ?? null}
          landlordId={lease.landlord_id}
          canManage={canManageLease}
          canRecordPayment={canRecordPayment}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-display text-base font-semibold text-foreground">{t('deposit')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('depositInitialAmount')}{' '}
          <span className="font-medium whitespace-nowrap text-foreground tabular-nums">
            {typeof lease.deposit_amount === 'number'
              ? formatCurrency(lease.deposit_amount, locale)
              : '—'}
          </span>
          {lease.deposit_refunded_at ? (
            <> · {t('depositRefundedOn', { date: formatDate(lease.deposit_refunded_at, locale) })}</>
          ) : (
            <> · {t('depositNoRefund')}</>
          )}
        </p>
      </section>

      <GuarantorSection
        leaseId={leaseId}
        canManage={canManageLease}
      />

      {(lease.terms || lease.special_conditions) && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-display text-base font-semibold text-foreground">{t('clauses')}</h2>
          {lease.terms && (
            <div className="mt-3">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                {tLease('terms')}
              </h3>
              <p className="mt-1 max-w-prose whitespace-pre-line text-sm leading-relaxed text-pretty text-muted-foreground">
                {lease.terms}
              </p>
            </div>
          )}
          {lease.special_conditions && (
            <div className="mt-4">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
                {tLease('specialConditions')}
              </h3>
              <p className="mt-1 max-w-prose whitespace-pre-line text-sm leading-relaxed text-pretty text-muted-foreground">
                {lease.special_conditions}
              </p>
            </div>
          )}
        </section>
      )}

      {/* P201.02 (TCK-2035) — le dépôt n'accepte que le locataire du bail : la gestion ne voit pas
          l'appel, comme sur la fiche de réservation (`!isDashboardAgent`). */}
      {!isAgentSurface && canLeaseLeaveReview(lease) && lease.property?.slug && (
        <LeaveReviewCta
          slug={lease.property.slug}
          context={
            lease.status === 'active'
              ? t('reviewContextActive')
              : t('reviewContextEnded')
          }
          propertyTitle={lease.property.title}
        />
      )}

      <LeasePaymentDialog
        leaseId={leaseId}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />

      <LeaseRenewalDialog
        open={renewalOpen}
        onOpenChange={setRenewalOpen}
        parent={lease}
      />

      <EarlyTerminationDialog
        open={earlyTerminationOpen}
        onOpenChange={setEarlyTerminationOpen}
        lease={lease}
      />
    </div>
  );
}
