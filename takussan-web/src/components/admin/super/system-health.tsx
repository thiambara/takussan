'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Activity, Database, HardDrive, Mail, Wifi } from 'lucide-react';
import { StatCard, StatusBadge } from '@/components/console';
import { fetchPlatformHealth } from '@/lib/queries/super-admin';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
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
  const fmt = useFormatteurs();
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
      hint={indice(status, t, fmt.nombre)}
    />
  );
}

/**
 * L'INDICE de la tuile — quatre charges différentes, une seule ligne de rendu.
 *
 * ⚠️ Cette ligne était `status?.error ?? status?.driver ?? status?.value ?? `${latency}ms``, et
 * l'AC2 de TCK-364 (« aucun libellé affiché n'est une chaîne littérale ») se lisait plus fort
 * qu'il n'était vrai : elle affichait NUE une valeur d'API — un pilote (`log`, `redis`, `s3`), une
 * charge de sonde (`miss`), un message d'exception — et collait un suffixe `ms` littéral sur un
 * nombre qui ne passait par aucun formateur.
 *
 * Ce que le front peut posséder, il le possède maintenant : le CADRE de chaque indice est une
 * clé, et la latence passe par `fmt.nombre` (donc par la locale : `1 200` en `fr`, `1,200` en
 * `en`).
 *
 * ⚠️ Ce que le front ne peut PAS posséder, et qui reste tel quel : le CORPS de `error`. L'API
 * émet un message d'exception en clair (`HealthcheckService` renvoie `$e->getMessage()`), pas un
 * code — un anglais technique non traduisible côté front tant qu'il n'y a pas de code à traduire.
 * Le corriger vraiment demande que l'API émette un code d'erreur, ce qui est un delta d'API, pas
 * de rendu (principe 5 du CLAUDE.md : *le front possède le texte affiché* — encore faut-il que
 * l'API lui envoie autre chose que du texte). Idem pour `driver` et `value`, qui sont des
 * IDENTIFIANTS techniques : les traduire serait une faute, les encadrer suffit.
 */
function indice(
  status: HealthcheckStatus | undefined,
  t: (cle: string, valeurs?: Record<string, string>) => string,
  nombre: (value: number | null | undefined) => string,
): string {
  if (status?.error) return t('hint.error', { message: status.error });
  if (status?.driver) return t('hint.driver', { driver: status.driver });
  if (status?.value) return t('hint.value', { value: status.value });
  return t('hint.latency', { ms: nombre(status?.latency_ms ?? 0) });
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
