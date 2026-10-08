'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { HandCoins } from 'lucide-react';

import { DataTable, Pagination, StatCard, StatusBadge, type DataTableColumn, type StatusTone } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { formatCurrency, formatDate, formatPercent } from '@/lib/format';
import {
  useCancelCommission,
  useCommissionEntries,
  useMarkCommissionPaid,
  type CommissionEntry,
  type CommissionEntryStatus,
} from '@/lib/queries/commissions';
import type { Locale } from '@/i18n/config';

const STATUTS: readonly CommissionEntryStatus[] = ['due', 'paid', 'cancelled'];

const TONS: Record<CommissionEntryStatus, StatusTone> = {
  due: 'attention',
  paid: 'success',
  cancelled: 'neutral',
};

/**
 * TCK-595 (ADR-0049 §3) — le relevé des commissions.
 *
 * L'agent y lit ses lignes ; qui détient `reports.view_agency` y lit toutes celles de l'agence (la
 * portée est décidée par l'API). « Marquer payée » et « Annuler » ne s'offrent qu'avec
 * `payouts.approve`, jamais sur sa propre ligne : la policy refuse au bénéficiaire de solder sa
 * commission, un bouton qui mène à un 403 n'est pas une option.
 */
export function CommissionsLedger() {
  const locale = useLocale() as Locale;
  const t = useTranslations('commissions');
  const messageErreur = useMessageErreurApi();
  const { user } = useAuth();
  const { can: peutSolder } = useCan('payouts.approve');

  const [statut, setStatut] = useState<CommissionEntryStatus | null>(null);
  const [page, setPage] = useState(1);
  const [erreur, setErreur] = useState<string | null>(null);

  const query = useCommissionEntries({ status: statut ?? undefined, page });
  const markPaid = useMarkCommissionPaid();
  const cancel = useCancelCommission();

  const agir = async (fn: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await fn();
    } catch (e) {
      setErreur(messageErreur(e, t('actionFailed')));
    }
  };

  const montant = (row: CommissionEntry, valeur: number) =>
    formatCurrency(valeur, locale, { currency: row.currency || 'XOF' });

  const columns: DataTableColumn<CommissionEntry>[] = [
    {
      id: 'earnedAt',
      header: t('columns.earnedAt'),
      className: 'whitespace-nowrap text-xs tabular-nums',
      cell: (row) => (row.earned_at ? formatDate(row.earned_at, locale) : '—'),
    },
    {
      id: 'lease',
      header: t('columns.lease'),
      className: 'whitespace-nowrap text-xs',
      cell: (row) => (
        <Link
          href={`/app/leases/${row.lease_id}`}
          className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {row.lease?.reference_number ?? t('leaseFallback', { id: row.lease_id })}
        </Link>
      ),
    },
    {
      id: 'beneficiary',
      header: t('columns.beneficiary'),
      className: 'text-xs',
      cell: (row) => (
        <>
          <span className="text-foreground">{row.beneficiary?.name ?? t('beneficiaryFallback', { id: row.beneficiary_id })}</span>
          <span className="block text-muted-foreground">{t(`origins.${row.origin}`)}</span>
        </>
      ),
    },
    {
      id: 'share',
      header: t('columns.share'),
      align: 'end',
      className: 'whitespace-nowrap text-xs tabular-nums',
      cell: (row) => t('shareOf', {
        percent: formatPercent(row.share_percent / 100, locale),
        base: montant(row, row.base_amount),
      }),
    },
    {
      id: 'amount',
      header: t('columns.amount'),
      align: 'end',
      className: 'whitespace-nowrap font-semibold tabular-nums',
      cell: (row) => montant(row, row.amount),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (row) => <StatusBadge tone={TONS[row.status] ?? 'neutral'} label={t(`status.${row.status}`)} />,
    },
  ];

  if (peutSolder) {
    columns.push({
      id: 'actions',
      header: t('columns.actions'),
      headerSrOnly: true,
      align: 'end',
      cell: (row) =>
        row.status === 'due' && row.beneficiary_id !== user?.id ? (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              disabled={markPaid.isPending}
              onClick={() => void agir(() => markPaid.mutateAsync({ id: row.id }))}
            >
              {t('markPaid')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={cancel.isPending}
              onClick={() => void agir(() => cancel.mutateAsync({ id: row.id }))}
            >
              {t('cancel')}
            </Button>
          </div>
        ) : null,
    });
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label={t('filterLabel')} className="flex flex-wrap gap-2">
        {[null, ...STATUTS].map((s) => (
          <Button
            key={s ?? 'all'}
            type="button"
            size="sm"
            variant={statut === s ? 'default' : 'outline'}
            aria-pressed={statut === s}
            onClick={() => {
              setStatut(s);
              setPage(1);
            }}
          >
            {s ? t(`status.${s}`) : t('filterAll')}
          </Button>
        ))}
      </div>

      {erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

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
        {(data) => {
          const totals = data.meta.totals;
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 tabular-nums sm:grid-cols-3">
                {STATUTS.map((s) => (
                  <StatCard
                    key={s}
                    label={t(`totals.${s}`)}
                    value={formatCurrency(totals?.[s] ?? 0, locale)}
                  />
                ))}
              </div>
              {data.data.length === 0 ? (
                <EmptyState
                  icon={<HandCoins className="size-8" aria-hidden="true" />}
                  title={t('emptyTitle')}
                  description={t('emptyDescription')}
                />
              ) : (
                <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
                  <DataTable
                    caption={t('tableCaption')}
                    columns={columns}
                    rows={data.data}
                    rowKey={(row) => row.id}
                    density="compact"
                    className="rounded-none ring-0"
                  />
                </div>
              )}
              {data.meta.last_page > 1 ? (
                <Pagination page={data.meta.current_page} lastPage={data.meta.last_page} onChange={setPage} />
              ) : null}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
