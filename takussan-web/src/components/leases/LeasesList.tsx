'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useLeases } from '@/lib/queries/leases';
import { formatCurrency, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { Lease, LeaseStatus } from '@/types/lease';
import type { Locale } from '@/i18n/config';

const STATUS_LABEL: Record<LeaseStatus, string> = {
  draft: 'Brouillon',
  pending_signature: 'À signer',
  active: 'Actif',
  expired: 'Expiré',
  terminated: 'Résilié',
  renewed: 'Renouvelé',
};

const STATUS_VARIANT: Record<
  LeaseStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'outline',
  pending_signature: 'outline',
  active: 'default',
  expired: 'secondary',
  terminated: 'destructive',
  renewed: 'secondary',
};

export function LeasesList() {
  const locale = useLocale() as Locale;
  const { data, isLoading, isError } = useLeases({ per_page: 30 });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-app-surface-1" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Impossible de charger les baux.
      </p>
    );
  }

  const leases = data?.data ?? [];

  if (leases.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
        Aucun bail pour l&apos;instant.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {leases.map((lease) => (
        <LeaseRow key={lease.id} lease={lease} locale={locale} />
      ))}
    </ul>
  );
}

function LeaseRow({ lease, locale }: { lease: Lease; locale: Locale }) {
  const rentOrPrice = lease.type === 'sale' ? lease.sale_price : lease.monthly_rent;
  return (
    <li>
      <Link
        href={`/app/leases/${lease.id}`}
        className="block rounded-xl border border-stone-200 bg-white p-4 transition-shadow hover:shadow-sm"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-stone-900">
                {lease.reference_number || `Bail #${lease.id}`}
              </h3>
              <Badge variant={STATUS_VARIANT[lease.status]}>
                {STATUS_LABEL[lease.status]}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {formatDate(lease.start_date, locale)}
              {lease.end_date && <> → {formatDate(lease.end_date, locale)}</>}
            </p>
          </div>
          {typeof rentOrPrice === 'number' && (
            <div className="text-right">
              <p className="text-sm font-semibold text-stone-900">
                {formatCurrency(rentOrPrice, locale)}
              </p>
              <p className="text-xs text-stone-500">
                {lease.type === 'sale' ? 'Prix de vente' : '/ mois'}
              </p>
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
