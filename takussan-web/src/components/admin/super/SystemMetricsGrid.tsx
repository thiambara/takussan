'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchSystemMetrics } from '@/lib/queries/super-admin';
import type { SystemMetricsResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

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
    return (
      <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900" role="alert">
        Impossible de charger les KPIs plateforme. {error?.displayMessage}
      </div>
    );
  }

  if (!data) return null;
  const m = data.data;

  const tiles: Tile[] = [
    { label: 'Agences (total)', value: formatNumber(m.agencies.total) },
    {
      label: 'Vérifiées',
      value: formatNumber(m.agencies.verified),
      hint: `${(m.agencies.verification_rate * 100).toFixed(1)} % de vérification`,
    },
    { label: 'Actives', value: formatNumber(m.agencies.active) },
    { label: 'Suspendues', value: formatNumber(m.agencies.suspended) },
    { label: 'Utilisateurs actifs', value: formatNumber(m.users.active), hint: `sur ${formatNumber(m.users.total)}` },
    { label: 'Biens publiés', value: formatNumber(m.properties.published) },
    { label: 'En modération', value: formatNumber(m.properties.pending_review) },
    {
      label: 'Revenu plateforme',
      value: formatCurrency(m.revenue.platform_total_paid, m.revenue.currency),
      hint: 'Loyers encaissés cumulés',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="system-metrics-grid">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{t.label}</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{t.value}</p>
          {t.hint ? <p className="mt-1 text-xs text-stone-500">{t.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
