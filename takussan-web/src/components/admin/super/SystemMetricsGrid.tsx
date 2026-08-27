'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { DataState, StatCard } from '@/components/console';
import { fetchSystemMetrics } from '@/lib/queries/super-admin';
import type { SystemMetrics, SystemMetricsResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-360 — les huit métriques plateforme, chacune avec une DESTINATION et, quand elle existe,
 * une tendance.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ, ET POURQUOI
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La grille rendait huit nombres nus, dans huit `<div>` faits main, sans lien ni comparaison.
 * *Une métrique sans tendance et sans destination n'est pas un tableau de bord, c'est un
 * affichage* : elle ne répond pas à « et alors ? ». Chaque tuile porte désormais un `href` vers la
 * liste déjà filtrée qui l'explique, et le rendu passe par `StatCard` (TCK-357).
 *
 * ⚠ **Cinq des huit tuiles n'auront JAMAIS de delta, et c'est voulu.** L'API ne renvoie un point
 * de comparaison que pour les métriques reconstructibles depuis une date de création ; celles qui
 * dérivent d'un statut courant (vérifiées, actives, suspendues, utilisateurs actifs, biens
 * publiés / en modération) n'en ont pas, faute d'historique — le raisonnement est dans le docblock
 * de `SystemMetricsController`. Une clé absente de `trend.previous` ne se remplace donc pas par un
 * zéro : elle supprime le delta.
 */

interface Tile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly href: string;
  /** Valeur brute courante et point de comparaison — `undefined` = pas de période disponible. */
  readonly current?: number;
  readonly previous?: number;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

function formatCurrency(n: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function formatPercent(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 1,
  }).format(n);
}

export function SystemMetricsGrid() {
  const t = useTranslations('superAdmin.metrics');
  const messageErreur = useMessageErreurApi();
  const { data, isPending, isError, error } = useQuery<SystemMetricsResponse, ApiError>({
    queryKey: ['super-admin', 'system-metrics'],
    queryFn: fetchSystemMetrics,
    staleTime: 30_000,
  });

  const periodDays = data?.data.trend?.period_days;

  return (
    <DataState
      loading={isPending}
      error={isError ? messageErreur(error, t('error')) : null}
      skeletonRows={8}
      skeletonRowClassName="h-24 rounded-xl"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="system-metrics-loading"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="system-metrics-grid">
        {(data ? tilesOf(data.data, t) : []).map((tile) => (
          <StatCard
            key={tile.key}
            label={tile.label}
            value={tile.value}
            hint={tile.hint}
            href={tile.href}
            delta={deltaOf(tile, periodDays, t)}
          />
        ))}
      </div>
    </DataState>
  );
}

/**
 * La variation, ou RIEN.
 *
 * Trois portes, et chacune ferme un cas où le pourcentage mentirait : pas de point de
 * comparaison ; un point de comparaison à zéro (dont toute variation vaut « l'infini ») ; pas de
 * durée de période à nommer. Le sens est explicite — pour ces trois métriques, croître est la
 * bonne nouvelle — parce que `StatCard.delta.direction` porte le SENS, jamais le signe.
 */
function deltaOf(
  tile: Tile,
  periodDays: number | undefined,
  t: ReturnType<typeof useTranslations<'superAdmin.metrics'>>,
): { label: string; direction: 'up' | 'down' | 'flat' } | undefined {
  if (tile.current === undefined || tile.previous === undefined) return undefined;
  if (tile.previous === 0) return undefined;
  if (periodDays === undefined) return undefined;

  const variation = ((tile.current - tile.previous) / tile.previous) * 100;
  const rounded = Math.round(variation * 10) / 10;

  return {
    label: t('delta', { value: formatPercent(rounded), days: periodDays }),
    direction: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat',
  };
}

function tilesOf(
  m: SystemMetrics,
  t: ReturnType<typeof useTranslations<'superAdmin.metrics'>>,
): Tile[] {
  const previous = m.trend?.previous;

  return [
    {
      key: 'agenciesTotal',
      label: t('agenciesTotal'),
      value: formatNumber(m.agencies.total),
      href: '/super-admin/agencies',
      current: m.agencies.total,
      previous: previous?.agencies_total,
    },
    {
      key: 'verified',
      label: t('verified'),
      value: formatNumber(m.agencies.verified),
      hint: t('verificationRate', { rate: (m.agencies.verification_rate * 100).toFixed(1) }),
      href: '/super-admin/agencies',
    },
    {
      key: 'agenciesActive',
      label: t('agenciesActive'),
      value: formatNumber(m.agencies.active),
      href: '/super-admin/agencies?status=active',
    },
    {
      key: 'agenciesSuspended',
      label: t('agenciesSuspended'),
      value: formatNumber(m.agencies.suspended),
      href: '/super-admin/agencies?status=suspended',
    },
    {
      // La tuile portait « utilisateurs actifs » en valeur et le total en précision. Elles sont
      // inversées : `active` dérive d'un STATUT COURANT et n'a donc aucune tendance possible,
      // quand le total en a une. Les deux nombres restent affichés — c'est le nombre qui répond
      // à « et alors ? » qui prend la grande typographie.
      key: 'usersTotal',
      label: t('usersTotal'),
      value: formatNumber(m.users.total),
      hint: t('activeOutOf', { active: formatNumber(m.users.active) }),
      href: '/super-admin/users',
      current: m.users.total,
      previous: previous?.users_total,
    },
    {
      key: 'publishedProperties',
      label: t('publishedProperties'),
      value: formatNumber(m.properties.published),
      href: '/super-admin/properties?filter[status]=published',
    },
    {
      key: 'pendingReview',
      label: t('pendingReview'),
      value: formatNumber(m.properties.pending_review),
      href: '/super-admin/properties?filter[status]=pending_review',
    },
    {
      key: 'platformRevenue',
      label: t('platformRevenue'),
      value: formatCurrency(m.revenue.platform_total_paid, m.revenue.currency),
      hint: t('cumulativeRents'),
      href: '/super-admin/reports',
      current: m.revenue.platform_total_paid,
      previous: previous?.revenue_platform_total_paid,
    },
  ];
}
