'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchAdminReportRevenue } from '@/lib/queries/super-admin';
import type { ReportPeriod } from '@/types/super-admin';
import { ReportExportButton } from './ReportExportButton';
import { ReportWindowControls } from './ReportWindowControls';
import { TimeSeriesChart } from './TimeSeriesChart';
import {
  fenetrePrecedente,
  parametresFenetre,
  type FenetreRapport,
  type GranulariteRapport,
} from './window';

/**
 * La granularité est déclarée UNE fois : la requête et la fenêtre de comparaison la lisent
 * toutes deux ici. `fenetrePrecedente` l'exige désormais — un décalage calculé en mois sur des
 * buckets journaliers se tromperait d'un facteur 30 sans lever d'erreur (TCK-361, D8).
 */
const GRANULARITE: GranulariteRapport = 'month';

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
const PERIODS: readonly ReportPeriod[] = ['3m', '6m', '12m'];

export function RevenueChart() {
  const t = useTranslations('reporting');
  const [fenetre, setFenetre] = useState<FenetreRapport>({ period: '12m' });
  const [comparaison, setComparaison] = useState(false);

  const parametres = parametresFenetre(fenetre);

  const query = useQuery({
    queryKey: ['super-admin', 'reports', 'revenue', parametres],
    queryFn: () => fetchAdminReportRevenue({ granularity: GRANULARITE, ...parametres }),
  });

  const rows = query.data?.data.rows ?? [];
  const totals = query.data?.data.totals ?? { latest_mrr: 0, latest_arr: 0, latest_active_subscriptions: 0 };

  // Second appel sur la fenêtre décalée — cf. `fenetrePrecedente`, qui la déduit de la RÉPONSE.
  const fenetreDecalee = fenetrePrecedente(rows, GRANULARITE);
  const queryComparaison = useQuery({
    queryKey: ['super-admin', 'reports', 'revenue', 'comparaison', fenetreDecalee],
    queryFn: () => fetchAdminReportRevenue({ granularity: GRANULARITE, ...fenetreDecalee! }),
    enabled: comparaison && fenetreDecalee !== null,
  });

  const points = rows.map((row) => ({ bucket: row.bucket, value: Number(row.mrr ?? 0) }));
  const pointsComparaison = (queryComparaison.data?.data.rows ?? []).map((row) => ({
    bucket: row.bucket,
    value: Number(row.mrr ?? 0),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <ReportWindowControls
            fenetre={fenetre}
            onFenetreChange={setFenetre}
            periodes={PERIODS}
            comparaison={comparaison}
            onComparaisonChange={setComparaison}
          />
          <KpiPill label={t('revenue.mrrCurrent')} value={formatXof(totals.latest_mrr)} />
          <KpiPill label={t('revenue.arrCurrent')} value={formatXof(totals.latest_arr)} />
          <KpiPill label={t('revenue.activeSubscriptions')} value={String(totals.latest_active_subscriptions ?? 0)} />
          {/* L'export porte EXACTEMENT la fenêtre affichée (AC5) — même source que la requête. */}
          <ReportExportButton report="revenue" params={{ granularity: GRANULARITE, ...parametres }} />
        </CardContent>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <>
          <Card>
            <CardContent className="p-4">
              <TimeSeriesChart
                points={points}
                comparison={comparaison && pointsComparaison.length > 0
                  ? { label: t('chart.previous'), points: pointsComparaison }
                  : null}
                seriesLabel={t('revenue.table.mrr')}
                description={t('revenue.chartAria', { count: points.length })}
                caption={t('revenue.chartCaption')}
                formatValue={formatXof}
              />
            </CardContent>
          </Card>
          <RevenueTable rows={rows} />
        </>
      )}
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

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
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

/** XOF sans sous-unité — la devise n'en a pas (principe non négociable n°3). */
function formatXof(amount: number | string | null): string {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString('fr-FR')} XOF`;
  }
}
