'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAdminReportRevenue } from '@/lib/queries/super-admin';
import type { ReportPeriod } from '@/types/super-admin';
import { ReportExportButton } from './ReportExportButton';

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: '3m', label: '3 mois' },
  { value: '6m', label: '6 mois' },
  { value: '12m', label: '12 mois' },
];

export function RevenueChart() {
  const [period, setPeriod] = useState<ReportPeriod>('12m');

  const query = useQuery({
    queryKey: ['super-admin', 'reports', 'revenue', period],
    queryFn: () => fetchAdminReportRevenue({ period, granularity: 'month' }),
  });

  const totals = query.data?.data.totals ?? { latest_mrr: 0, latest_arr: 0, latest_active_subscriptions: 0 };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={period}
            onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
            aria-label="Période"
          >
            {PERIODS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <KpiPill label="MRR courant" value={`${formatXof(totals.latest_mrr)}`} />
          <KpiPill label="ARR courant" value={`${formatXof(totals.latest_arr)}`} />
          <KpiPill label="Souscriptions actives" value={String(totals.latest_active_subscriptions ?? 0)} />
          <ReportExportButton report="revenue" params={{ period, granularity: 'month' }} />
        </CardContent>
      </Card>

      {query.isLoading ? <Skeleton className="h-72 rounded-xl" /> : <RevenueTable rows={query.data?.data.rows ?? []} />}
    </div>
  );
}

function KpiPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-1 text-xs">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function RevenueTable({ rows }: { rows: { bucket: string; mrr: number; arr: number; active_subscriptions: number }[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Période</th>
              <th className="px-4 py-2 text-right font-medium">MRR</th>
              <th className="px-4 py-2 text-right font-medium">ARR</th>
              <th className="px-4 py-2 text-right font-medium">Souscriptions actives</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bucket} className="border-b border-border/40 last:border-b-0">
                <td className="px-4 py-2 font-medium text-foreground">{row.bucket}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatXof(Number(row.mrr ?? 0))}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatXof(Number(row.arr ?? 0))}</td>
                <td className="px-4 py-2 text-right tabular-nums">{row.active_subscriptions ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function formatXof(amount: number | string | null): string {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString('fr-FR')} XOF`;
  }
}
