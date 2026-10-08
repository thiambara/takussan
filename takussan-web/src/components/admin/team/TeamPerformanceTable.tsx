'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Users } from 'lucide-react';

import { DataTable, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useTeamPerformance, type TeamPerformanceRow } from '@/lib/queries/agency-reporting';
import type { Locale } from '@/i18n/config';

type Colonne = Exclude<keyof TeamPerformanceRow, 'user_id'>;

const NUMERIQUES: readonly Exclude<Colonne, 'name'>[] = [
  'leases_signed',
  'sales_signed',
  'visits_completed',
  'customers_added',
  'commissions_earned',
  'properties_managed',
  'tasks_overdue',
];

/**
 * Le mois courant au format `Y-m` que l'API attend. `Africa/Dakar` (`TIMEZONE` de `@/i18n/config`) est UTC+0
 * toute l'année, sans heure d'été : le mois UTC EST le mois de Dakar.
 */
function moisCourant(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * TCK-595 (AD16) — l'onglet « Performance » de l'équipe : une ligne par agent actif, un tableau
 * comparatif sobre, trié par colonne (§ Direction UX).
 *
 * Le tri se fait ici, sur la réponse entière : l'API rend une ligne par agent, sans pagination —
 * ce n'est pas une liste filtrée côté client, c'est l'ordre d'affichage d'un agrégat complet.
 */
export function TeamPerformanceTable({ agencyId }: { readonly agencyId: number }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('team.performance');
  const [periode, setPeriode] = useState(moisCourant);
  const [tri, setTri] = useState('-commissions_earned');

  const query = useTeamPerformance(agencyId, periode);

  const columns: DataTableColumn<TeamPerformanceRow>[] = [
    {
      id: 'name',
      header: t('columns.name'),
      sortKey: 'name',
      sortLabel: t('sortBy', { column: t('columns.name') }),
      cell: (row) => row.name || t('unknown'),
    },
    ...NUMERIQUES.map((cle): DataTableColumn<TeamPerformanceRow> => ({
      id: cle,
      header: t(`columns.${cle}`),
      sortKey: cle,
      sortLabel: t('sortBy', { column: t(`columns.${cle}`) }),
      align: 'end',
      className: 'whitespace-nowrap tabular-nums',
      cell: (row) =>
        cle === 'commissions_earned' ? formatCurrency(row[cle], locale) : formatNumber(row[cle], locale),
    })),
  ];

  return (
    <section aria-labelledby="team-performance-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="team-performance-title" className="text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t('period')}
          <Input
            type="month"
            value={periode}
            onChange={(e) => e.target.value && setPeriode(e.target.value)}
            className="w-44"
          />
        </label>
      </div>
      <QueryBoundary
        query={query}
        loadingFallback={
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        }
      >
        {(reponse) => (
          <Tableau rows={reponse.data.agents} columns={columns} tri={tri} onTri={setTri} t={t} />
        )}
      </QueryBoundary>
    </section>
  );
}

function Tableau({
  rows,
  columns,
  tri,
  onTri,
  t,
}: {
  readonly rows: readonly TeamPerformanceRow[];
  readonly columns: DataTableColumn<TeamPerformanceRow>[];
  readonly tri: string;
  readonly onTri: (next: string) => void;
  readonly t: (cle: string) => string;
}) {
  const tries = useMemo(() => {
    const desc = tri.startsWith('-');
    const cle = (desc ? tri.slice(1) : tri) as Colonne;
    return [...rows].sort((a, b) => {
      const ecart = cle === 'name'
        ? (a.name ?? '').localeCompare(b.name ?? '')
        : (a[cle] as number) - (b[cle] as number);
      return desc ? -ecart : ecart;
    });
  }, [rows, tri]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-8" aria-hidden="true" />}
        title={t('emptyTitle')}
        description={t('emptyDescription')}
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
      <DataTable
        caption={t('caption')}
        columns={columns}
        rows={tries}
        rowKey={(row) => row.user_id}
        sort={{ value: tri, onChange: onTri }}
        density="compact"
        className="rounded-none ring-0"
      />
    </div>
  );
}
