'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Activity, Database, HardDrive, Mail, Wifi } from 'lucide-react';
import { StatCard, StatusBadge } from '@/components/console';
import { fetchPlatformHealth } from '@/lib/queries/super-admin';
import type { HealthcheckStatus } from '@/types/super-admin';

const CHECKS: Array<{ key: 'db' | 'cache' | 'storage' | 'mail' | 'sms'; label: string; icon: typeof Database }> = [
  { key: 'db', label: 'DB', icon: Database },
  { key: 'cache', label: 'Cache', icon: Activity },
  { key: 'storage', label: 'Storage', icon: HardDrive },
  { key: 'mail', label: 'Mail', icon: Mail },
  { key: 'sms', label: 'SMS', icon: Wifi },
];

export function HealthDashboard() {
  const t = useTranslations('superAdmin.systemHealth');
  const health = useQuery({
    queryKey: ['super-admin', 'health'],
    queryFn: fetchPlatformHealth,
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
        <QueueMetric label={t('queuePending')} value={health.data?.data.queue.pending ?? 0} />
        <QueueMetric label={t('queueProcessing')} value={health.data?.data.queue.processing ?? 0} />
        <QueueMetric
          label={t('queueFailed24h')}
          value={health.data?.data.queue.failed_24h ?? 0}
          tone="danger"
          href="/super-admin/system/jobs"
        />
      </section>
    </div>
  );
}

function HealthTile({ label, icon: Icon, status }: { label: string; icon: typeof Database; status?: HealthcheckStatus }) {
  const ok = status?.status === 'ok';
  return (
    <StatCard
      label={label}
      icon={<Icon className="size-4" aria-hidden="true" />}
      value={<StatusBadge tone={ok ? 'success' : 'danger'} label={status?.status ?? '…'} />}
      hint={status?.error ?? status?.driver ?? status?.value ?? `${status?.latency_ms ?? 0}ms`}
    />
  );
}

function QueueMetric({
  label,
  value,
  tone = 'default',
  href,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger';
  href?: string;
}) {
  return <StatCard label={label} value={value} tone={tone} href={href} />;
}
