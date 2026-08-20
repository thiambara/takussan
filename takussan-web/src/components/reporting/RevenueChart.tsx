'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAdminReportRevenue } from '@/lib/queries/super-admin';
import type { ReportPeriod } from '@/types/super-admin';
import { ReportExportButton } from './ReportExportButton';

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
const PERIODS: readonly ReportPeriod[] = ['3m', '6m', '12m'];

export function RevenueChart() {
  const t = useTranslations('reporting');
  const [period, setPeriod] = useState<ReportPeriod>('12m');
  const periodes = PERIODS.map((value) => ({ value, label: t(`periods.${value}`) }));

  const query = useQuery({
    queryKey: ['super-admin', 'reports', 'revenue', period],
    queryFn: () => fetchAdminReportRevenue({ period, granularity: 'month' }),
  });

  const totals = query.data?.data.totals ?? { latest_mrr: 0, latest_arr: 0, latest_active_subscriptions: 0 };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Select
            value={period}
            onValueChange={(value) => setPeriod((value ?? period) as ReportPeriod)}
            items={periodes as unknown as Array<{ value: string; label: string }>}
          >
            <SelectTrigger className="h-9" aria-label={t('filters.periodAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodes.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <KpiPill label={t('revenue.mrrCurrent')} value={`${formatXof(totals.latest_mrr)}`} />
          <KpiPill label={t('revenue.arrCurrent')} value={`${formatXof(totals.latest_arr)}`} />
          <KpiPill label={t('revenue.activeSubscriptions')} value={String(totals.latest_active_subscriptions ?? 0)} />
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
  const t = useTranslations('reporting.revenue');

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">{t('table.period')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('table.mrr')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('table.arr')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('activeSubscriptions')}</th>
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
