'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/feedback';
import { fetchSystemMetrics } from '@/lib/queries/super-admin';
import type { SystemMetricsResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface Tile {
  label: string;
  value: string;
  hint?: string;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

function formatCurrency(n: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export function SystemMetricsGrid() {
  const t = useTranslations('superAdmin.metrics');
  const messageErreur = useMessageErreurApi();
  const { data, isLoading, isError, error } = useQuery<SystemMetricsResponse, ApiError>({
    queryKey: ['super-admin', 'system-metrics'],
    queryFn: fetchSystemMetrics,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="system-metrics-loading">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-stone-200" aria-hidden="true" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState message={messageErreur(error, t('error'))} />;
  }

  if (!data) return null;
  const m = data.data;

  const tiles: Tile[] = [
    { label: t('agenciesTotal'), value: formatNumber(m.agencies.total) },
    {
      label: t('verified'),
      value: formatNumber(m.agencies.verified),
      hint: t('verificationRate', { rate: (m.agencies.verification_rate * 100).toFixed(1) }),
    },
    { label: t('agenciesActive'), value: formatNumber(m.agencies.active) },
    { label: t('agenciesSuspended'), value: formatNumber(m.agencies.suspended) },
    {
      label: t('activeUsers'),
      value: formatNumber(m.users.active),
      hint: t('outOfTotal', { total: formatNumber(m.users.total) }),
    },
    { label: t('publishedProperties'), value: formatNumber(m.properties.published) },
    { label: t('pendingReview'), value: formatNumber(m.properties.pending_review) },
    {
      label: t('platformRevenue'),
      value: formatCurrency(m.revenue.platform_total_paid, m.revenue.currency),
      hint: t('cumulativeRents'),
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="system-metrics-grid">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{tile.label}</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{tile.value}</p>
          {tile.hint ? <p className="mt-1 text-xs text-stone-500">{tile.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
