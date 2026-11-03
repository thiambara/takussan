'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { BarChart3 } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { fetchAdminAiDashboard } from '@/lib/queries/super-admin';
import type { AdminAiDashboardResponse, AiDashboardDay, AiEvalBaseline } from '@/types/super-admin';
import { AiEvaluationSuitePanel } from './AiEvaluationSuitePanel';
import { useMontantIa } from './useMontantIa';

type LigneAcceptation = AdminAiDashboardResponse['data']['acceptance'][string];

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
  const format = useFormatter();
  const messageErreur = useMessageErreurApi();
  const montant = useMontantIa();
  const [from, setFrom] = useState(() => jour(-6));
  const [to, setTo] = useState(() => jour(0));
  const query = useQuery<AdminAiDashboardResponse, ApiError>({
    queryKey: ['super-admin', 'ai', 'dashboard', from, to],
    queryFn: () => fetchAdminAiDashboard(from, to),
  });

  const nombre = (valeur: number) => format.number(valeur, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const taux = query.data?.data.usd_to_xof;
  const columns: DataTableColumn<AiDashboardDay>[] = [
    { id: 'date', header: t('date'), cell: (row) => row.date },
    { id: 'usage', header: t('usage'), cell: (row) => <code className="text-sm">{row.usage_key}</code> },
    { id: 'calls', header: t('calls'), align: 'end', cell: (row) => <span className="tabular-nums">{row.calls}</span> },
    { id: 'cost', header: t('cost'), align: 'end', cell: (row) => <span className="tabular-nums">{montant(row.cost_usd, taux)}</span> },
    { id: 'latency', header: t('latency'), align: 'end', cell: (row) => <span className="tabular-nums">{row.avg_duration_ms ?? '—'}</span> },
    { id: 'errors', header: t('errors'), align: 'end', cell: (row) => <span className="tabular-nums">{row.errors}</span> },
    { id: 'refusals', header: t('refusals'), align: 'end', cell: (row) => <span className="tabular-nums">{row.refusals}</span> },
    { id: 'providerRejections', header: t('providerRejections'), align: 'end', cell: (row) => <span className="tabular-nums">{row.provider_rejections}</span> },
  ];
  const data = query.data?.data;
  // TCK-2449 — un fournisseur cassé s'efface derrière le secours : sans cette phrase, rien ne le dirait.
  const refusFournisseur = (data?.days ?? []).reduce((total, row) => total + row.provider_rejections, 0);
  const acceptance = Object.entries(data?.acceptance ?? {});
  const baselines = Object.entries(data?.baselines ?? {});
  const colonnesAcceptation: DataTableColumn<[string, LigneAcceptation]>[] = [
    { id: 'usage', header: t('usage'), cell: ([key]) => <code className="text-sm">{key}</code> },
    { id: 'acceptance', header: t('acceptance'), align: 'end', cell: ([, rate]) => <span className="tabular-nums">{rate.rate === null ? '—' : `${Math.round(rate.rate * 100)} %`}</span> },
    { id: 'decided', header: t('decided'), align: 'end', cell: ([, rate]) => <span className="tabular-nums">{rate.decided}</span> },
  ];
  const colonnesReferences: DataTableColumn<[string, AiEvalBaseline]>[] = [
    { id: 'usage', header: t('usage'), cell: ([key]) => <code className="text-sm">{key}</code> },
    { id: 'global', header: t('baselineGlobal'), align: 'end', cell: ([, baseline]) => <span className="tabular-nums">{nombre(baseline.global)}</span> },
    { id: 'model', header: t('baselineModel'), cell: ([, baseline]) => baseline.model ?? '—' },
    {
      id: 'date',
      header: t('baselineDate'),
      cell: ([, baseline]) => (baseline.updated_at ? format.dateTime(new Date(baseline.updated_at), { dateStyle: 'medium' }) : '—'),
    },
  ];

  return (
    <div className="space-y-4">
      <AiEvaluationSuitePanel />
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
            {data?.today.daily_budget_usd != null
              ? t('today', { spent: montant(data.today.spent_usd, taux), budget: montant(data.today.daily_budget_usd, taux) })
              : t('todayNoBudget', { spent: montant(data?.today.spent_usd ?? '0', taux) })}
          </p>
          {refusFournisseur > 0 ? <p role="status" className="text-sm font-medium">{t('providerRejectionsNotice', { count: refusFournisseur })}</p> : null}
          {(data?.days ?? []).length === 0 ? (
            <EmptyState icon={<BarChart3 className="size-8" aria-hidden="true" />} title={t('emptyTitle')} description={t('emptyDescription')} />
          ) : (
            <DataTable caption={t('caption')} columns={columns} rows={data?.days ?? []} rowKey={(row) => `${row.date}-${row.usage_key}`} density="compact" />
          )}
          {acceptance.length > 0 ? (
            <DataTable caption={t('acceptanceCaption')} columns={colonnesAcceptation} rows={acceptance} rowKey={([key]) => key} density="compact" />
          ) : null}
          {baselines.length > 0 ? (
            <DataTable caption={t('baselinesCaption')} columns={colonnesReferences} rows={baselines} rowKey={([key]) => key} density="compact" />
          ) : null}
        </>
      )}
    </div>
  );
}
