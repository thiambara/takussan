'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useLease, useGenerateSchedule, useLeasePayments } from '@/lib/queries/leases';
import { formatCurrency, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/i18n/config';
import type { LeaseStatus } from '@/types/lease';
import { LeaseSchedule } from './LeaseSchedule';
import { LeasePaymentDialog } from './LeasePaymentDialog';
import { GuarantorSection } from './GuarantorSection';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { LeaveReviewCta } from '@/components/reviews/LeaveReviewCta';
import { canLeaseLeaveReview } from '@/components/reviews/reviewEligibility';

const STATUS_LABEL: Record<LeaseStatus, string> = {
  draft: 'Brouillon',
  pending_signature: 'À signer',
  active: 'Actif',
  expired: 'Expiré',
  terminated: 'Résilié',
  renewed: 'Renouvelé',
};

interface LeaseDetailProps {
  readonly leaseId: number;
}

export function LeaseDetail({ leaseId }: LeaseDetailProps) {
  const locale = useLocale() as Locale;
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { data, isLoading, isError } = useLease(leaseId);
  const { data: paymentsData } = useLeasePayments(leaseId);
  const generateSchedule = useGenerateSchedule(leaseId);

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
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Bail introuvable.
      </p>
    );
  }

  const lease = data.data;
  const rentOrPrice = lease.type === 'sale' ? lease.sale_price : lease.monthly_rent;

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
            {lease.type && <span className="capitalize">{lease.type.replace(/_/g, ' ')}</span>}
            {latePaymentsCount > 0 && (
              <Badge variant="destructive">{latePaymentsCount} en retard</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AddDocumentButton
            documentableType="lease"
            documentableId={leaseId}
            displayLabel={lease.reference_number || `Bail #${lease.id}`}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => generateSchedule.mutate({})}
            disabled={generateSchedule.isPending}
          >
            {generateSchedule.isPending ? 'Génération…' : 'Générer l’échéancier'}
          </Button>
          <Button type="button" onClick={() => setPaymentOpen(true)}>
            Enregistrer un paiement
          </Button>
        </div>
      </div>

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
        <LeaseSchedule leaseId={leaseId} agencyId={lease.agency_id ?? null} />
      </section>

      <GuarantorSection
        leaseId={leaseId}
        guarantor={lease.guarantor ?? null}
        guarantorsCount={lease.guarantor ? 1 : 0}
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
    </div>
  );
}
