'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Activity, Cloud, Cpu, Database, HardDrive, Images, ListChecks, Mail, Search, Wifi } from 'lucide-react';
import { StatCard, StatusBadge } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { fetchPlatformHealth } from '@/lib/queries/super-admin';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { HealthcheckStatus, HealthLevel } from '@/types/super-admin';

/**
 * TCK-364 — la donnée porte la CLÉ, le rendu la résout (`superAdmin.systemHealth.checks.*`),
 * même patron que `SEVERITIES` de `announcements.tsx` (TCK-286).
 *
 * Cette table portait `label: 'DB' | 'Cache' | 'Storage' | 'Mail' | 'SMS'` — cinq libellés
 * anglais écrits en dur, hors composant, donc hors de portée de tout `useTranslations`. Trois
 * d'entre eux (`Cache`, `Mail`, `SMS`) sont identiques en `fr` et en `en`, ce qui est exactement
 * la raison pour laquelle personne ne les voyait.
 */
type CheckKey = 'db' | 'cache' | 'storage' | 'media_storage' | 'mail' | 'sms' | 'search' | 'queue' | 'workers' | 'cdn';

/** TCK-600 — médias (R2), recherche, files, workers et CDN rejoignent les cinq sondes d'origine. */
const CHECKS: Array<{ key: CheckKey; icon: typeof Database }> = [
  { key: 'db', icon: Database },
  { key: 'cache', icon: Activity },
  { key: 'storage', icon: HardDrive },
  { key: 'media_storage', icon: Images },
  { key: 'mail', icon: Mail },
  { key: 'sms', icon: Wifi },
  { key: 'search', icon: Search },
  { key: 'queue', icon: ListChecks },
  { key: 'workers', icon: Cpu },
  { key: 'cdn', icon: Cloud },
];

const TONE: Record<HealthLevel, 'success' | 'attention' | 'danger'> = {
  ok: 'success',
  degraded: 'attention',
  failed: 'danger',
};

export function HealthDashboard() {
  const t = useTranslations('superAdmin.systemHealth');
  const tCommon = useTranslations('common');
  const tShared = useTranslations('superAdmin.pages.shared');
  const health = useQuery({
    queryKey: ['super-admin', 'health'],
    queryFn: fetchPlatformHealth,
    refetchInterval: 30_000,
  });
  const queue = health.data?.data.queue;
  const echecs = queue?.failed_24h ?? 0;

  if (health.isError && !health.data) {
    return (
      <ErrorState
        message={tShared('loadError')}
        onRetry={() => void health.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const global = health.data?.data.status;

  return (
    <div className="space-y-6">
      {global ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t('global')}
          <StatusBadge tone={TONE[global]} label={t(`status.${global}`)} />
        </p>
      ) : null}
      {/*
        Dix tuiles, cinq par rangée en `xl` seulement — à 768 la coque laisse ~460 px, soit 80 px
        par tuile, où « Base de données » cassait sur deux lignes (TCK-505).
      */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {CHECKS.map((check) => {
          const sonde = health.data?.data[check.key];
          // `queue` porte ses comptes à côté de son statut : sans statut, ce n'est pas une sonde.
          const status = sonde && 'status' in sonde && sonde.status ? (sonde as HealthcheckStatus) : undefined;
          if (!health.isLoading && !status) return null;
          return (
            <HealthTile
              key={check.key}
              label={t(`checks.${check.key}`)}
              icon={check.icon}
              status={status}
              loading={health.isLoading}
            />
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QueueMetric label={t('queuePending')} value={queue?.pending ?? 0} loading={health.isLoading} />
        <QueueMetric label={t('queueProcessing')} value={queue?.processing ?? 0} loading={health.isLoading} />
        <QueueMetric label={t('queueOldestSeconds')} value={queue?.oldest_pending_seconds ?? 0} loading={health.isLoading} />
        <QueueMetric
          label={t('queueFailed24h')}
          value={echecs}
          loading={health.isLoading}
          // Le rouge signale un échec, pas la présence de la tuile : zéro échec reste neutre.
          tone={echecs > 0 ? 'danger' : 'default'}
          href="/super-admin/system/jobs"
        />
      </section>
    </div>
  );
}

function HealthTile({
  label,
  icon: Icon,
  status,
  loading,
}: {
  label: string;
  icon: typeof Database;
  status?: HealthcheckStatus;
  loading: boolean;
}) {
  const t = useTranslations('superAdmin.systemHealth');
  const fmt = useFormatteurs();
  // ⚠️ L'API émet `ok` | `degraded` | `failed` (`HealthcheckService::check()`), PAS `error` :
  //    `error` est le CHAMP voisin qui porte le message. Une sonde sans statut n'est pas une
  //    panne : elle reste neutre — la teinter `danger` annonçait cinq pannes à chaque chargement.
  const tone = !status ? 'neutral' : TONE[status.status];
  const libelleStatut = status ? t(`status.${status.status}`) : t('status.loading');
  const indiceSonde = status ? indice(status, t, fmt.nombre) : undefined;
  // TCK-600 — chaque sonde est datée : un « OK » d'il y a une heure n'est pas un « OK ».
  const sondeA = status?.checked_at ? t('hint.checkedAt', { time: fmt.dateTime(status.checked_at, { timeStyle: 'medium' }) }) : null;
  return (
    <StatCard
      label={label}
      icon={<Icon className="size-4" aria-hidden="true" />}
      loading={loading}
      value={<StatusBadge tone={tone} label={libelleStatut} />}
      hint={loading ? undefined : [indiceSonde, sondeA].filter(Boolean).join(' · ')}
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
  if (status?.reason) return t(`hint.reason.${status.reason}`);
  if (status?.driver) return t('hint.driver', { driver: status.driver });
  if (status?.value) return t('hint.value', { value: status.value });
  return t('hint.latency', { ms: nombre(status?.latency_ms ?? 0) });
}

function QueueMetric({
  label,
  value,
  tone = 'default',
  href,
  loading,
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger';
  href?: string;
  loading: boolean;
}) {
  const fmt = useFormatteurs();
  return <StatCard label={label} value={fmt.nombre(value)} tone={tone} href={href} loading={loading} />;
}
