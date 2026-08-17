'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Activity, CircleCheckBig, Database, HardDrive, Mail, Play, RotateCcw, Trash2, Wifi } from 'lucide-react';
import { EmptyState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  deleteFailedJob,
  fetchFailedJobs,
  fetchPlatformHealth,
  retryAllFailedJobs,
  retryFailedJob,
} from '@/lib/queries/super-admin';
import type { FailedJob, HealthcheckStatus } from '@/types/super-admin';

const CHECKS: Array<{ key: 'db' | 'cache' | 'storage' | 'mail' | 'sms'; label: string; icon: typeof Database }> = [
  { key: 'db', label: 'DB', icon: Database },
  { key: 'cache', label: 'Cache', icon: Activity },
  { key: 'storage', label: 'Storage', icon: HardDrive },
  { key: 'mail', label: 'Mail', icon: Mail },
  { key: 'sms', label: 'SMS', icon: Wifi },
];

export function HealthDashboard() {
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
          return <HealthTile key={check.key} label={check.label} icon={check.icon} status={status} />;
        })}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <QueueMetric label="En attente" value={health.data?.data.queue.pending ?? 0} />
        <QueueMetric label="En cours" value={health.data?.data.queue.processing ?? 0} />
        <QueueMetric label="Échecs 24h" value={health.data?.data.queue.failed_24h ?? 0} tone="danger" />
      </section>

      <FailedJobsTable jobs={jobs.data?.data ?? []} />
    </div>
  );
}

function HealthTile({ label, icon: Icon, status }: { label: string; icon: typeof Database; status?: HealthcheckStatus }) {
  const ok = status?.status === 'ok';
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex items-center justify-between">
        <Icon className="size-5 text-stone-500" aria-hidden="true" />
        <Badge variant={ok ? 'secondary' : 'destructive'}>{status?.status ?? '...'}</Badge>
      </div>
      <p className="mt-3 font-display text-lg font-semibold text-stone-950">{label}</p>
      <p className="mt-1 truncate text-xs text-stone-500">{status?.error ?? status?.driver ?? status?.value ?? `${status?.latency_ms ?? 0}ms`}</p>
    </div>
  );
}

function QueueMetric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'danger' }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <p className="text-sm text-stone-600">{label}</p>
      <p className={tone === 'danger' ? 'mt-2 font-display text-3xl font-bold text-destructive' : 'mt-2 font-display text-3xl font-bold text-stone-950'}>{value}</p>
    </div>
  );
}

function FailedJobsTable({ jobs }: { jobs: FailedJob[] }) {
  const t = useTranslations('superAdmin.systemHealth.failedJobs');
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

  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-stone-950">Jobs échoués</h2>
          <p className="text-sm text-stone-600">Payload tronqué dans la liste.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => retryAll.mutate()} disabled={retryAll.isPending}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Rejouer tout
        </Button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Queue</th>
              <th className="px-3 py-2">Payload</th>
              <th className="px-3 py-2">Échec</th>
              <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="px-3 py-3">{job.queue}</td>
                <td className="max-w-xl truncate px-3 py-3 text-stone-600">{job.payload}</td>
                <td className="px-3 py-3 text-stone-600">{new Date(job.failed_at).toLocaleString('fr-FR')}</td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => retry.mutate(job.id)}>
                      <Play className="size-4" aria-hidden="true" />
                      Rejouer
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => remove.mutate(job.id)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      Supprimer
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-0">
                  <EmptyState
                    className="border-0"
                    icon={<CircleCheckBig className="size-8" aria-hidden="true" />}
                    title={t('empty_title')}
                    description={t('empty_description')}
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
