'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { useLeasePropertyOptions, useLeases } from '@/lib/queries/leases';
import { formatCurrency, formatDate } from '@/lib/format';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Lease, LeaseStatus } from '@/types/lease';
import type { Locale } from '@/i18n/config';

const STATUS_LABEL: Record<LeaseStatus, string> = {
  draft: 'Brouillon',
  pending_signature: 'À signer',
  active: 'Actif',
  expired: 'Expiré',
  // TCK-090
  terminating: 'Résiliation en cours',
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
  terminating: 'outline',
  terminated: 'destructive',
  renewed: 'secondary',
};

export function statusFilterLabel(value: string): string {
  return value === 'all' ? 'Tous les statuts' : STATUS_LABEL[value as LeaseStatus] ?? 'Tous les statuts';
}

export function LeasesList() {
  const locale = useLocale() as Locale;
  const t = useTranslations('lease.list');
  const tCommon = useTranslations('common');
  const [status, setStatus] = useState<string>('all');
  const [propertyId, setPropertyId] = useState<string>('all');
  const propertiesQuery = useLeasePropertyOptions();
  const { data, isLoading, isError, refetch } = useLeases({
    status: status === 'all' ? undefined : status,
    property_id: propertyId === 'all' ? undefined : Number(propertyId),
    per_page: 30,
  });
  const propertyOptions = useMemo(() => propertiesQuery.data?.data ?? [], [propertiesQuery.data]);

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
      <ErrorState
        message={t('error')}
        onRetry={() => void refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const leases = data?.data ?? [];
  // Le parc distinguait déjà « vraiment vide » de « rien qui corresponde aux filtres ». Un
  // état vide unique qui perdrait cette nuance ferait régresser l'UX : le message
  // d'encouragement + CTA de `design-guidelines.md:83` n'a de sens que pour le premier cas.
  const hasActiveFilters = status !== 'all' || propertyId !== 'all';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2">
        <Select value={status} onValueChange={(value) => setStatus(value ?? 'all')}>
          <SelectTrigger aria-label="Filtrer par statut">
            <SelectValue>{statusFilterLabel(status)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={propertyId} onValueChange={(value) => setPropertyId(value ?? 'all')}>
          <SelectTrigger aria-label="Filtrer par bien">
            <SelectValue>
              {propertyId === 'all'
                ? 'Tous les biens'
                : propertyOptions.find((property) => String(property.id) === propertyId)?.title ?? 'Tous les biens'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les biens</SelectItem>
            {propertyOptions.map((property) => (
              <SelectItem key={property.id} value={String(property.id)}>
                {property.reference_number ? `${property.reference_number} · ` : ''}
                {property.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {leases.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={<FileText className="size-8" aria-hidden="true" />}
            title={t('empty_filtered_title')}
            description={t('empty_filtered_description')}
          />
        ) : (
          <EmptyState
            icon={<FileText className="size-8" aria-hidden="true" />}
            title={t('empty_title')}
            description={t('empty_description')}
            action={
              <Link href="/app/leases/new" className={buttonVariants()}>
                {t('empty_cta')}
              </Link>
            }
          />
        )
      ) : (
        <ul className="space-y-3">
          {leases.map((lease) => (
            <LeaseRow key={lease.id} lease={lease} locale={locale} />
          ))}
        </ul>
      )}
    </div>
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
