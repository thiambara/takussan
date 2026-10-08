'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CircleCheckBig } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { DataTable, StatCard, type DataTableColumn } from '@/components/console';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/format';
import {
  AGING_BUCKETS,
  useAgingBalance,
  type AgingBalance,
  type AgingGroupBy,
} from '@/lib/queries/agency-reporting';
import type { Locale } from '@/i18n/config';

type Ligne = AgingBalance['rows'][number];

/**
 * TCK-595 (AD17) — l'onglet « Impayés » de `/admin/finances` : la BALANCE ÂGÉE.
 *
 * Il listait `/api/payments/history` avec `filter[status]=late` épinglé. Or un loyer échu reste
 * `pending` tant que le job de retard ne l'a pas basculé — et ne le bascule jamais sur un bail sans
 * `late_fee_percent` : l'onglet rendait 0 ligne quand la tuile « Impayés » du tableau de bord en
 * comptait 4 (consigné par `AgingBalanceTest`). Il lit désormais
 * `GET /api/agencies/{agency}/finance/aging`, qui applique la règle *Impayé* du tableau de bord :
 * quatre tranches de retard, puis le détail par locataire ou par bailleur, et les cautions détenues.
 *
 * Le nom du composant est conservé : c'est l'onglet qu'il rend, et ses consommateurs ne changent pas.
 */
export function OverduePaymentsTable() {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.finances.aging');
  const { user } = useAuth();
  const agencyId = user?.agency_id ?? undefined;
  const [groupBy, setGroupBy] = useState<AgingGroupBy>('tenant');

  const query = useAgingBalance(agencyId, groupBy);

  const montant = (valeur: number) => formatCurrency(valeur, locale);

  const columns: readonly DataTableColumn<Ligne>[] = [
    {
      id: 'name',
      header: groupBy === 'tenant' ? t('columns.tenant') : t('columns.landlord'),
      className: 'text-sm',
      cell: (row) => {
        const nom = row.name || t('unknown');
        // Un locataire mène à sa fiche client, d'où se lisent ses échéances. Un bailleur n'a pas de
        // fiche dans la console d'agence.
        return groupBy === 'tenant' && row.id !== null ? (
          <Link
            href={`/app/customers/${row.id}`}
            className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {nom}
          </Link>
        ) : (
          <span>{nom}</span>
        );
      },
    },
    ...AGING_BUCKETS.map((bucket): DataTableColumn<Ligne> => ({
      id: bucket,
      header: t(`buckets.${bucket}`),
      align: 'end',
      className: 'whitespace-nowrap tabular-nums',
      cell: (row) => (row.buckets[bucket].count > 0 ? montant(row.buckets[bucket].amount) : '—'),
    })),
    {
      id: 'total',
      header: t('columns.total'),
      align: 'end',
      className: 'whitespace-nowrap font-semibold tabular-nums',
      cell: (row) => montant(row.total.amount),
    },
  ];

  return (
    <div className="space-y-4">
      <div role="group" aria-label={t('groupByLabel')} className="flex flex-wrap gap-2">
        {(['tenant', 'landlord'] as const).map((g) => (
          <Button
            key={g}
            type="button"
            size="sm"
            variant={groupBy === g ? 'default' : 'outline'}
            aria-pressed={groupBy === g}
            onClick={() => setGroupBy(g)}
          >
            {t(`groupBy.${g}`)}
          </Button>
        ))}
      </div>

      <QueryBoundary
        query={query}
        loadingFallback={
          <div className="space-y-3" data-testid="overdue-payments-loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        }
      >
        {(reponse) => {
          const data = reponse.data;
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 tabular-nums sm:grid-cols-2 lg:grid-cols-4">
                {AGING_BUCKETS.map((bucket) => (
                  <StatCard
                    key={bucket}
                    label={t(`buckets.${bucket}`)}
                    value={montant(data.buckets[bucket].amount)}
                    hint={t('count', { count: data.buckets[bucket].count })}
                    tone={bucket === '90_plus' && data.buckets[bucket].count > 0 ? 'danger' : 'default'}
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 tabular-nums sm:grid-cols-2">
                <StatCard
                  label={t('total')}
                  value={montant(data.total.amount)}
                  hint={t('count', { count: data.total.count })}
                />
                <StatCard
                  label={t('depositsHeld')}
                  value={montant(data.deposits_held.total)}
                  hint={t('depositsHeldHint', { count: data.deposits_held.by_landlord.length })}
                />
              </div>

              {data.rows.length === 0 ? (
                <EmptyState
                  data-testid="overdue-payments-empty"
                  icon={<CircleCheckBig className="size-8" aria-hidden="true" />}
                  title={t('emptyTitle')}
                  description={t('emptyDescription')}
                />
              ) : (
                <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                  <DataTable
                    caption={groupBy === 'tenant' ? t('captionTenant') : t('captionLandlord')}
                    columns={columns}
                    rows={data.rows}
                    rowKey={(row) => row.id ?? 0}
                    density="compact"
                    data-testid="overdue-payments-table"
                    className="rounded-none ring-0"
                  />
                </div>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
