'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { BarChart3 } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { fetchAdminAiDashboard } from '@/lib/queries/super-admin';
import type { AdminAiDashboardResponse, AiDashboardDay } from '@/types/super-admin';

function jour(decalage: number): string {
  const date = new Date();
  date.setDate(date.getDate() + decalage);
  return date.toISOString().slice(0, 10);
}

/** TCK-2385 — coût, latence, erreurs par usage et par jour ; le taux d'acceptation des suggestions. */
export function AiDashboardPanel() {
  const t = useTranslations('superAdmin.pages.ai.dashboard');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const [from, setFrom] = useState(() => jour(-6));
  const [to, setTo] = useState(() => jour(0));
  const query = useQuery<AdminAiDashboardResponse, ApiError>({
    queryKey: ['super-admin', 'ai', 'dashboard', from, to],
    queryFn: () => fetchAdminAiDashboard(from, to),
  });

  const columns: DataTableColumn<AiDashboardDay>[] = [
    { id: 'date', header: t('date'), cell: (row) => row.date },
    { id: 'usage', header: t('usage'), cell: (row) => <code className="text-sm">{row.usage_key}</code> },
    { id: 'calls', header: t('calls'), align: 'end', cell: (row) => <span className="tabular-nums">{row.calls}</span> },
    { id: 'cost', header: t('cost'), align: 'end', cell: (row) => <span className="tabular-nums">{row.cost_xof.toFixed(2)}</span> },
    { id: 'latency', header: t('latency'), align: 'end', cell: (row) => <span className="tabular-nums">{row.avg_duration_ms ?? '—'}</span> },
    { id: 'errors', header: t('errors'), align: 'end', cell: (row) => <span className="tabular-nums">{row.errors}</span> },
    { id: 'refusals', header: t('refusals'), align: 'end', cell: (row) => <span className="tabular-nums">{row.refusals}</span> },
  ];
  const data = query.data?.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="ai-from">{t('from')}</Label><Input id="ai-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ai-to">{t('to')}</Label><Input id="ai-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {query.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : query.isError ? (
        <ErrorState message={`${tShared('loadError')} ${messageErreur(query.error)}`} onRetry={() => void query.refetch()} retryLabel={tCommon('actions.retry')} />
      ) : (
        <>
          <p className="text-sm">
            {data?.today.daily_budget_xof != null
              ? t('today', { spent: data.today.spent_xof.toFixed(2), budget: data.today.daily_budget_xof })
              : t('todayNoBudget', { spent: (data?.today.spent_xof ?? 0).toFixed(2) })}
          </p>
          {(data?.days ?? []).length === 0 ? (
            <EmptyState icon={<BarChart3 className="size-8" aria-hidden="true" />} title={t('emptyTitle')} description={t('emptyDescription')} />
          ) : (
            <DataTable caption={t('caption')} columns={columns} rows={data?.days ?? []} rowKey={(row) => `${row.date}-${row.usage_key}`} density="compact" />
          )}
          {Object.keys(data?.acceptance ?? {}).length > 0 ? (
            <table className="w-full text-sm">
              <caption className="text-left font-medium">{t('acceptanceCaption')}</caption>
              <thead><tr><th scope="col" className="text-left">{t('usage')}</th><th scope="col" className="text-right">{t('acceptance')}</th><th scope="col" className="text-right">{t('decided')}</th></tr></thead>
              <tbody>
                {Object.entries(data?.acceptance ?? {}).map(([key, rate]) => (
                  <tr key={key}>
                    <td><code>{key}</code></td>
                    <td className="text-right tabular-nums">{rate.rate === null ? '—' : `${Math.round(rate.rate * 100)} %`}</td>
                    <td className="text-right tabular-nums">{rate.decided}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      )}
    </div>
  );
}
