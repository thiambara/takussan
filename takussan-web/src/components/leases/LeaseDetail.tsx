'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  useActivateLease,
  useGenerateSchedule,
  useLease,
  useLeasePayments,
  useReviewLeaseRent,
} from '@/lib/queries/leases';
import { formatCurrency, formatDate } from '@/lib/format';
import { ErrorState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type { Locale } from '@/i18n/config';
import type { LeaseStatus } from '@/types/lease';
import { LeaseSchedule } from './LeaseSchedule';
import { LeasePaymentDialog } from './LeasePaymentDialog';
import { GuarantorSection } from './GuarantorSection';
import { DepositRefundBanner } from './DepositRefundBanner';
import { LeaseRenewalDialog } from './LeaseRenewalDialog';
import { LeaseChainTimeline } from './LeaseChainTimeline';
import { EarlyTerminationDialog } from './EarlyTerminationDialog';
import { EarlyTerminationBanner } from './EarlyTerminationBanner';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { LeaveReviewCta } from '@/components/reviews/LeaveReviewCta';
import { canLeaseLeaveReview } from '@/components/reviews/reviewEligibility';
import { useAuth } from '@/context/AuthContext';

const STATUS_LABEL: Record<LeaseStatus, string> = {
  draft: 'Brouillon',
  pending_signature: 'À signer',
  active: 'Actif',
  expired: 'Expiré',
  // TCK-090 — early-termination request in flight.
  terminating: 'Résiliation en cours',
  terminated: 'Résilié',
  renewed: 'Renouvelé',
};

// TCK-179 — display the FR label instead of the raw `Residential Rent`
// snake_case enum value. Aligns with the type definition in
// `models-spec.md#13-lease`.
const LEASE_TYPE_LABEL: Record<string, string> = {
  residential_rent: 'Bail d’habitation',
  commercial_rent: 'Bail commercial',
  seasonal_rent: 'Location saisonnière',
  sale: 'Vente',
};

interface LeaseDetailProps {
  readonly leaseId: number;
}

export function LeaseDetail({ leaseId }: LeaseDetailProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('lease.detail');
  const tCommon = useTranslations('common');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [earlyTerminationOpen, setEarlyTerminationOpen] = useState(false);
  const { user } = useAuth();
  const leaseQuery = useLease(leaseId);
  const { data, isLoading, isError } = leaseQuery;
  const { data: paymentsData } = useLeasePayments(leaseId);
  const generateSchedule = useGenerateSchedule(leaseId);
  const activateLease = useActivateLease(leaseId);
  const reviewRent = useReviewLeaseRent(leaseId);
  const toast = useToast();

  // TCK-088 — display the refund action only to roles that hold
  // `leases.refund_deposit` server-side. Backend re-checks scope
  // (landlord_id / agency_id) and will 403 if it doesn't match.
  const canRefundDeposit = useMemo(() => {
    const roles = user?.roles ?? [];
    return roles.some((r) =>
      ['super_admin', 'agency_admin', 'agent', 'owner'].includes(r),
    );
  }, [user]);

  // TCK-173 — agent-only management CTAs (add document, generate schedule,
  // record a manual payment, add a guarantor) must not surface to a tenant.
  // The same role gate as refund_deposit is reused: anyone with a managing
  // role can act, the tenant cannot.
  const isAgentSurface = canRefundDeposit;

  // TCK-089 — same role gate as refund_deposit (server checks `leases.renew`).
  const canRenew = canRefundDeposit;

  // TCK-090 — Same role gate; the API additionally allows a tenant on
  // their own lease, but tenants don't reach this dashboard surface — they
  // hit the public/tenant flow. Status-eligibility is checked just before
  // rendering the button.
  const canRequestTermination = canRefundDeposit;

  const latePaymentsCount = useMemo(() => {
    const list = paymentsData?.data ?? [];
    return list.filter((p) => {
      if (p.status === 'late') return true;
      if (p.status === 'pending' && p.due_date) {
        const due = new Date(p.due_date);
        return !Number.isNaN(due.getTime()) && due < new Date();
      }
      return false;
    }).length;
  }, [paymentsData]);

  if (isLoading) {
    return <div className="h-60 animate-pulse rounded-xl bg-app-surface-1" />;
  }
  if (isError || !data) {
    return (
      <ErrorState
        message={t('error')}
        onRetry={() => void leaseQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const lease = data.data;
  const rentOrPrice = lease.type === 'sale' ? lease.sale_price : lease.monthly_rent;

  async function handleActivate() {
    await activateLease.mutateAsync();
    toast.add({
      title: 'Bail activé',
      description: 'L’échéancier peut maintenant être généré ou consulté.',
      type: 'success',
    });
  }

  async function handleRentReview() {
    const rawRent = window.prompt('Nouveau loyer mensuel', String(lease.monthly_rent ?? ''))?.trim();
    if (!rawRent) return;
    const newRent = Number(rawRent);
    if (!Number.isFinite(newRent) || newRent <= 0) return;
    const reason = window.prompt('Motif de révision du loyer')?.trim();
    if (!reason) return;
    await reviewRent.mutateAsync({ new_rent: newRent, reason });
    toast.add({
      title: 'Loyer révisé',
      description: 'La révision est journalisée dans l’historique du bail.',
      type: 'success',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app/leases" className="text-xs text-stone-500 hover:text-stone-700">
            ← Retour aux baux
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-app-ink">
            {lease.reference_number || `Bail #${lease.id}`}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
            <Badge>{STATUS_LABEL[lease.status]}</Badge>
            {lease.type && <span>{LEASE_TYPE_LABEL[lease.type] ?? lease.type}</span>}
            {latePaymentsCount > 0 && (
              <Badge variant="destructive">{latePaymentsCount} en retard</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAgentSurface && (
            <>
              <AddDocumentButton
                documentableType="lease"
                documentableId={leaseId}
                displayLabel={lease.reference_number || `Bail #${lease.id}`}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => generateSchedule.mutate({})}
                disabled={generateSchedule.isPending || lease.status === 'draft'}
              >
                {generateSchedule.isPending ? 'Génération…' : 'Générer l’échéancier'}
              </Button>
              {lease.status === 'draft' && (
                <Button
                  type="button"
                  onClick={handleActivate}
                  disabled={activateLease.isPending}
                >
                  {activateLease.isPending ? 'Activation…' : 'Activer le bail'}
                </Button>
              )}
              {lease.status === 'active' && lease.type !== 'sale' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRentReview}
                  disabled={reviewRent.isPending}
                >
                  Réviser le loyer
                </Button>
              )}
              <Button type="button" onClick={() => setPaymentOpen(true)}>
                Enregistrer un paiement reçu
              </Button>
            </>
          )}
          {!isAgentSurface && (
            <Link
              href={`/api/leases/${leaseId}/contract/pdf`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Télécharger le contrat PDF
            </Link>
          )}
          {canRenew && (lease.status === 'active' || lease.status === 'expired') && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenewalOpen(true)}
            >
              Renouveler le bail
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
                Résilier le bail
              </Button>
            )}
        </div>
      </div>

      <LeaseChainTimeline leaseId={leaseId} currentId={leaseId} />

      <EarlyTerminationBanner lease={lease} canCancel={canRequestTermination} />

      <DepositRefundBanner lease={lease} canRefund={canRefundDeposit} />

      <div className="grid gap-4 sm:grid-cols-3">
        <dl className="rounded-xl border border-stone-200 bg-white p-5 text-sm">
          <dt className="text-xs uppercase tracking-wide text-stone-500">Durée</dt>
          <dd className="mt-1 text-stone-900">
            {formatDate(lease.start_date, locale)}
            {lease.end_date ? ` → ${formatDate(lease.end_date, locale)}` : ' → indéterminée'}
          </dd>
        </dl>
        <dl className="rounded-xl border border-stone-200 bg-white p-5 text-sm">
          <dt className="text-xs uppercase tracking-wide text-stone-500">
            {lease.type === 'sale' ? 'Prix' : 'Loyer'}
          </dt>
          <dd className="mt-1 text-lg font-semibold text-stone-900">
            {typeof rentOrPrice === 'number'
              ? formatCurrency(rentOrPrice, locale)
              : '—'}
            {lease.type !== 'sale' && (
              <span className="ml-1 text-xs text-stone-500">/ mois</span>
            )}
          </dd>
        </dl>
        <dl className="rounded-xl border border-stone-200 bg-white p-5 text-sm">
          <dt className="text-xs uppercase tracking-wide text-stone-500">Caution</dt>
          <dd className="mt-1 text-stone-900">
            {typeof lease.deposit_amount === 'number'
              ? formatCurrency(lease.deposit_amount, locale)
              : '—'}
          </dd>
        </dl>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-app-ink">Échéancier</h2>
        {lease.status === 'draft' ? (
          <p className="mb-3 rounded-lg border border-dashed border-stone-200 bg-white p-3 text-sm text-stone-500">
            Activez le bail avant de générer l’échéancier.
          </p>
        ) : null}
        <LeaseSchedule leaseId={leaseId} agencyId={lease.agency_id ?? null} />
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Caution</h2>
        <p className="mt-2 text-sm text-stone-600">
          Montant initial :{' '}
          <span className="font-medium text-stone-900">
            {typeof lease.deposit_amount === 'number'
              ? formatCurrency(lease.deposit_amount, locale)
              : '—'}
          </span>
          {lease.deposit_refunded_at ? (
            <> · Remboursée le {formatDate(lease.deposit_refunded_at, locale)}</>
          ) : (
            <> · Aucun remboursement enregistré</>
          )}
        </p>
      </section>

      <GuarantorSection
        leaseId={leaseId}
        guarantor={lease.guarantor ?? null}
        guarantorsCount={lease.guarantor ? 1 : 0}
        canManage={isAgentSurface}
      />

      {(lease.terms || lease.special_conditions) && (
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">Clauses</h2>
          {lease.terms && (
            <div className="mt-3">
              <h3 className="text-xs uppercase tracking-wide text-stone-500">
                Conditions générales
              </h3>
              <p className="mt-1 whitespace-pre-line text-sm text-stone-700">
                {lease.terms}
              </p>
            </div>
          )}
          {lease.special_conditions && (
            <div className="mt-4">
              <h3 className="text-xs uppercase tracking-wide text-stone-500">
                Conditions particulières
              </h3>
              <p className="mt-1 whitespace-pre-line text-sm text-stone-700">
                {lease.special_conditions}
              </p>
            </div>
          )}
        </section>
      )}

      {canLeaseLeaveReview(lease) && lease.property?.slug && (
        <LeaveReviewCta
          slug={lease.property.slug}
          context={
            lease.status === 'active'
              ? 'Votre bail est en cours.'
              : 'Votre bail est terminé.'
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
