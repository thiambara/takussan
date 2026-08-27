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
import { fetchAdminReportGrowth } from '@/lib/queries/super-admin';
import type { GrowthMetric, ReportPeriod } from '@/types/super-admin';
import { ReportExportButton } from './ReportExportButton';
import { ReportWindowControls } from './ReportWindowControls';
import { TimeSeriesChart } from './TimeSeriesChart';
import { fenetrePrecedente, parametresFenetre, type FenetreRapport } from './window';

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
const METRICS: readonly GrowthMetric[] = ['agencies', 'users', 'listings'];

const PERIODS: readonly ReportPeriod[] = ['3m', '6m', '12m'];

export function GrowthChart() {
  const t = useTranslations('reporting');
  const [metric, setMetric] = useState<GrowthMetric>('agencies');
  const [fenetre, setFenetre] = useState<FenetreRapport>({ period: '12m' });
  const [comparaison, setComparaison] = useState(false);
  const metriques = METRICS.map((value) => ({ value, label: t(`metrics.${value}`) }));

  const parametres = parametresFenetre(fenetre);

  const query = useQuery({
    queryKey: ['super-admin', 'reports', 'growth', metric, parametres],
    queryFn: () => fetchAdminReportGrowth({ metric, granularity: 'month', ...parametres }),
  });

  const rows = query.data?.data.rows ?? [];

  /**
   * La comparaison est un SECOND APPEL sur la fenêtre décalée, déduite des bornes que le premier
   * a rendues — jamais recalculée depuis le raccourci, qui ne dit pas quelles dates le serveur a
   * retenues. `enabled` la retient donc jusqu'à ce que la série principale ait répondu.
   */
  const fenetreDecalee = fenetrePrecedente(rows);
  const queryComparaison = useQuery({
    queryKey: ['super-admin', 'reports', 'growth', metric, 'comparaison', fenetreDecalee],
    queryFn: () => fetchAdminReportGrowth({ metric, granularity: 'month', ...fenetreDecalee! }),
    enabled: comparaison && fenetreDecalee !== null,
  });

  const points = rows.map((row) => ({ bucket: row.bucket, value: row.count }));
  const pointsComparaison = (queryComparaison.data?.data.rows ?? []).map((row) => ({
    bucket: row.bucket,
    value: row.count,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Select
            value={metric}
            onValueChange={(value) => setMetric((value ?? metric) as GrowthMetric)}
            items={metriques as unknown as Array<{ value: string; label: string }>}
          >
            <SelectTrigger className="h-9" aria-label={t('filters.metricAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metriques.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ReportWindowControls
            fenetre={fenetre}
            onFenetreChange={setFenetre}
            periodes={PERIODS}
            comparaison={comparaison}
            onComparaisonChange={setComparaison}
          />
          <span className="ml-auto text-xs text-muted-foreground">
            {t('growth.total')} <span className="font-semibold text-foreground tabular-nums">{query.data?.data.totals.total ?? 0}</span>
          </span>
          {/*
            L'export porte EXACTEMENT la fenêtre affichée (AC5) : `parametresFenetre` est la même
            source pour la requête et pour le téléchargement, donc les deux ne peuvent pas diverger.
          */}
          <ReportExportButton
            report="growth"
            params={{ metric, granularity: 'month', ...parametres }}
          />
        </CardContent>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <Card>
          <CardContent className="p-4">
            <TimeSeriesChart
              points={points}
              comparison={comparaison && pointsComparaison.length > 0
                ? { label: t('chart.previous'), points: pointsComparaison }
                : null}
              seriesLabel={t(`metrics.${metric}`)}
              description={t('growth.chartAria', {
                metric: t(`metrics.${metric}`),
                count: points.length,
              })}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
