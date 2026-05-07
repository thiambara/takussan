'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAdminReportGrowth } from '@/lib/queries/super-admin';
import type { GrowthMetric, ReportPeriod } from '@/types/super-admin';
import { ReportExportButton } from './ReportExportButton';

const METRICS: { value: GrowthMetric; label: string }[] = [
  { value: 'agencies', label: 'Agences' },
  { value: 'users', label: 'Utilisateurs' },
  { value: 'listings', label: 'Annonces' },
];

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: '3m', label: '3 mois' },
  { value: '6m', label: '6 mois' },
  { value: '12m', label: '12 mois' },
];

export function GrowthChart() {
  const [metric, setMetric] = useState<GrowthMetric>('agencies');
  const [period, setPeriod] = useState<ReportPeriod>('12m');

  const query = useQuery({
    queryKey: ['super-admin', 'reports', 'growth', metric, period],
    queryFn: () => fetchAdminReportGrowth({ metric, period, granularity: 'month' }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={metric}
            onChange={(event) => setMetric(event.target.value as GrowthMetric)}
            aria-label="Métrique"
          >
            {METRICS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
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
          <span className="ml-auto text-xs text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{query.data?.data.totals.total ?? 0}</span>
          </span>
          <ReportExportButton report="growth" params={{ metric, period, granularity: 'month' }} />
        </CardContent>
      </Card>

      {query.isLoading ? <Skeleton className="h-72 rounded-xl" /> : <BarChart rows={query.data?.data.rows ?? []} />}
    </div>
  );
}

function BarChart({ rows }: { rows: { bucket: string; count: number }[] }) {
  const max = rows.reduce((acc, row) => Math.max(acc, row.count), 0) || 1;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex h-56 items-end gap-2">
          {rows.map((row) => {
            const ratio = (row.count / max) * 100;
            return (
              <div key={row.bucket} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-amber-500/70"
                  style={{ height: `${ratio}%`, minHeight: row.count > 0 ? '4px' : '0' }}
                  title={`${row.bucket}: ${row.count}`}
                />
                <span className="text-[10px] text-muted-foreground">{row.bucket}</span>
                <span className="text-xs font-medium text-foreground">{row.count}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
