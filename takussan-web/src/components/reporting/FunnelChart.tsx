'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAdminReportFunnel } from '@/lib/queries/super-admin';
import type { ReportPeriod } from '@/types/super-admin';
import { ReportExportButton } from './ReportExportButton';

const STAGE_LABEL: Record<string, string> = {
  listings_published: 'Annonces publiées',
  bookings_requested: 'Réservations demandées',
  bookings_confirmed: 'Réservations confirmées',
  leases_signed: 'Baux signés',
};

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
  { value: '3m', label: '3 mois' },
];

export function FunnelChart() {
  const [period, setPeriod] = useState<ReportPeriod>('30d');

  const query = useQuery({
    queryKey: ['super-admin', 'reports', 'funnel', period],
    queryFn: () => fetchAdminReportFunnel({ period }),
  });

  if (query.isLoading) return <Skeleton className="h-72 rounded-xl" />;

  const rows = query.data?.data.rows ?? [];
  const max = rows.reduce((acc, row) => Math.max(acc, row.count), 0) || 1;
  const conversion = query.data?.data.totals.conversion_rate;

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
          <span className="text-xs text-muted-foreground">
            Conversion globale: <span className="font-semibold text-foreground">{conversion !== null && conversion !== undefined ? `${(Number(conversion) * 100).toFixed(1)}%` : '—'}</span>
          </span>
          <div className="ml-auto">
            <ReportExportButton report="funnel" params={{ period }} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 p-4">
          {rows.map((row) => {
            const ratio = (row.count / max) * 100;
            return (
              <div key={row.stage} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{STAGE_LABEL[row.stage] ?? row.stage}</span>
                  <span className="tabular-nums text-muted-foreground">{row.count}</span>
                </div>
                <div className="h-3 overflow-hidden rounded bg-muted/40">
                  <div className="h-full rounded bg-amber-500/70" style={{ width: `${ratio}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
