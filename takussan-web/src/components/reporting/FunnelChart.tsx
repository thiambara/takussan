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
import { fetchAdminReportFunnel } from '@/lib/queries/super-admin';
import type { ReportPeriod } from '@/types/super-admin';
import { ReportExportButton } from './ReportExportButton';

/**
 * Les étapes que `reporting.funnel.stages` sait nommer. La table portait les libellés ; elle ne
 * porte plus que le DOMAINE, ce qui préserve le repli d'origine (`?? row.stage`) pour une étape
 * inconnue de l'API — sans lui, `t(row.stage)` rendrait le chemin de la clé.
 */
const STAGES_NOMMEES = new Set<string>([
  'listings_published',
  'bookings_requested',
  'bookings_confirmed',
  'leases_signed',
]);

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
const PERIODS: readonly ReportPeriod[] = ['30d', '90d', '3m'];

export function FunnelChart() {
  const t = useTranslations('reporting');
  const [period, setPeriod] = useState<ReportPeriod>('30d');
  const periodes = PERIODS.map((value) => ({ value, label: t(`periods.${value}`) }));

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
          <span className="text-xs text-muted-foreground">
            {t('funnel.conversion')} <span className="font-semibold text-foreground">{conversion !== null && conversion !== undefined ? `${(Number(conversion) * 100).toFixed(1)}%` : '—'}</span>
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
                  <span className="font-medium text-foreground">{STAGES_NOMMEES.has(row.stage) ? t(`funnel.stages.${row.stage}`) : row.stage}</span>
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
