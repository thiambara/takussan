'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Activity, Database, HardDrive, Mail, Wifi } from 'lucide-react';
import { StatCard, StatusBadge } from '@/components/console';
import { fetchPlatformHealth } from '@/lib/queries/super-admin';
import type { HealthcheckStatus } from '@/types/super-admin';

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
