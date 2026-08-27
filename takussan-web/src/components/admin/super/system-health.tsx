'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Activity, CircleCheckBig, Database, HardDrive, Mail, Play, RotateCcw, Trash2, Wifi } from 'lucide-react';
import {
  DataTable,
  StatCard,
  StatusBadge,
  type DataTableColumn,
} from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  deleteFailedJob,
  fetchFailedJobs,
  fetchPlatformHealth,
  retryAllFailedJobs,
  retryFailedJob,
} from '@/lib/queries/super-admin';
import type { FailedJob, HealthcheckStatus } from '@/types/super-admin';

/**
 * TCK-364 — la donnée porte la CLÉ, le rendu la résout (`superAdmin.systemHealth.checks.*`),
 * même patron que `SEVERITIES` de `announcements.tsx` (TCK-286).
 *
 * Cette table portait `label: 'DB' | 'Cache' | 'Storage' | 'Mail' | 'SMS'` — cinq libellés
 * anglais écrits en dur, hors composant, donc hors de portée de tout `useTranslations`. Trois
 * d'entre eux (`Cache`, `Mail`, `SMS`) sont identiques en `fr` et en `en`, ce qui est exactement
 * la raison pour laquelle personne ne les voyait.
 */
const CHECKS: Array<{ key: 'db' | 'cache' | 'storage' | 'mail' | 'sms'; icon: typeof Database }> = [
  { key: 'db', icon: Database },
  { key: 'cache', icon: Activity },
  { key: 'storage', icon: HardDrive },
  { key: 'mail', icon: Mail },
  { key: 'sms', icon: Wifi },
];

export function HealthDashboard() {
  const t = useTranslations('superAdmin.systemHealth');
  const health = useQuery({
    queryKey: ['super-admin', 'health'],
    queryFn: fetchPlatformHealth,
    refetchInterval: 30_000,
  });
  const jobs = useQuery({
    queryKey: ['super-admin', 'failed-jobs'],
    queryFn: () => fetchFailedJobs({ perPage: 20 }),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-5">
        {CHECKS.map((check) => {
          const status = health.data?.data[check.key];
          return <HealthTile key={check.key} label={t(`checks.${check.key}`)} icon={check.icon} status={status} />;
        })}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <QueueMetric label={t('queuePending')} value={health.data?.data.queue.pending ?? 0} />
        <QueueMetric label={t('queueProcessing')} value={health.data?.data.queue.processing ?? 0} />
        <QueueMetric label={t('queueFailed24h')} value={health.data?.data.queue.failed_24h ?? 0} tone="danger" />
      </section>

      <FailedJobsTable jobs={jobs.data?.data ?? []} />
    </div>
  );
}

function HealthTile({ label, icon: Icon, status }: { label: string; icon: typeof Database; status?: HealthcheckStatus }) {
  const t = useTranslations('superAdmin.systemHealth');
  const ok = status?.status === 'ok';
  // ⚠️ L'API émet `ok` | `failed` (`HealthcheckService::check()`), PAS `ok` | `error` : `error`
  //    est le CHAMP voisin qui porte le message. La sonde en attente n'a pas de statut du tout —
  //    d'où `status.loading`, qui garde l'ellipsis comme libellé au lieu de l'écrire en dur.
  const libelleStatut = status ? t(`status.${status.status}`) : t('status.loading');
  return (
    <StatCard
      label={label}
      icon={<Icon className="size-4" aria-hidden="true" />}
      value={<StatusBadge tone={ok ? 'success' : 'danger'} label={libelleStatut} />}
      hint={status?.error ?? status?.driver ?? status?.value ?? `${status?.latency_ms ?? 0}ms`}
    />
  );
}

function QueueMetric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'danger' }) {
  return <StatCard label={label} value={value} tone={tone} />;
}

function FailedJobsTable({ jobs }: { jobs: FailedJob[] }) {
  const t = useTranslations('superAdmin.systemHealth.failedJobs');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: retryFailedJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'failed-jobs'] }),
  });
  const retryAll = useMutation({
    mutationFn: retryAllFailedJobs,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'failed-jobs'] }),
  });
  const remove = useMutation({
    mutationFn: deleteFailedJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'failed-jobs'] }),
  });

  const columns: DataTableColumn<FailedJob>[] = [
    { id: 'queue', header: t('colQueue'), cell: (job) => job.queue },
    {
      id: 'payload',
      header: t('colPayload'),
      className: 'max-w-xl truncate text-muted-foreground',
      cell: (job) => job.payload,
    },
    {
      id: 'failedAt',
      header: t('colFailedAt'),
      className: 'text-muted-foreground',
      cell: (job) => fmt.dateTime(job.failed_at),
    },
    {
      id: 'actions',
      header: t('colActions'),
      headerSrOnly: true,
      align: 'end',
      cell: (job) => (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => retry.mutate(job.id)}>
            <Play className="size-4" aria-hidden="true" />
            {t('retry')}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => remove.mutate(job.id)}>
            <Trash2 className="size-4" aria-hidden="true" />
            {tCommon('actions.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => retryAll.mutate()} disabled={retryAll.isPending}>
          <RotateCcw className="size-4" aria-hidden="true" />
          {t('retryAll')}
        </Button>
      </div>
      <DataTable
        caption={t('tableCaption')}
        columns={columns}
        rows={jobs}
        rowKey={(job) => job.id}
        emptyState={
          <EmptyState
            className="border-0"
            icon={<CircleCheckBig className="size-8" aria-hidden="true" />}
            title={t('empty_title')}
            description={t('empty_description')}
          />
        }
      />
    </section>
  );
}
