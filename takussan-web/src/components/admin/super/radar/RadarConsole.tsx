'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, UsersRound } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import type { ApiError } from '@/lib/api';
import { fetchRadarDashboard, radarKeys } from '@/lib/queries/radar';
import type { RadarDashboardResponse } from '@/types/radar';
import { RadarIntakeSheet } from './RadarIntakeSheet';
import { RadarWorkList } from './RadarWorkList';

/**
 * TCK-2386 (ADR-0077) — l'écran du Radar : la liste de travail, et la saisie rapide ouverte depuis
 * l'en-tête. Geste `platform.radar.operate` (support et au-dessus) : l'entrée de menu ne s'affiche
 * qu'avec lui, et l'API rend 403 à tout autre opérateur.
 */
export function RadarConsole() {
  const t = useTranslations('superAdmin.pages.radar');
  const { can } = usePlatformAbilities();
  const [saisie, setSaisie] = useState(false);
  // La même requête que les compteurs de la liste de travail : une seule lecture, deux lecteurs.
  const dashboard = useQuery<RadarDashboardResponse, ApiError>({
    queryKey: radarKeys.dashboard(),
    queryFn: fetchRadarDashboard,
    staleTime: 10_000,
    enabled: can('platform.radar.operate'),
  });
  const relancesDues = dashboard.data?.data.follow_ups_due ?? 0;

  // Un viewer qui tape l'URL : un seul refus, aucun appel (l'API rendrait deux 403).
  if (!can('platform.radar.operate')) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} description={t('subtitle')} />
        <ErrorState message={t('forbidden')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/super-admin/radar/advertisers" className={buttonVariants({ variant: 'outline' })} data-testid="radar-lien-annonceurs">
              <UsersRound className="size-4" aria-hidden="true" />
              {t('advertisersLink')}
              {relancesDues > 0 ? (
                <span
                  className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums"
                  title={t('followUpsDue', { count: relancesDues })}
                  data-testid="radar-relances-dues"
                >
                  <span aria-hidden="true">{relancesDues}</span>
                  <span className="sr-only">{t('followUpsDue', { count: relancesDues })}</span>
                </span>
              ) : null}
            </Link>
            <Button type="button" onClick={() => setSaisie(true)}>
              <Plus className="size-4" aria-hidden="true" />
              {t('openIntake')}
            </Button>
          </div>
        )}
      />
      <RadarWorkList />
      <RadarIntakeSheet open={saisie} onOpenChange={setSaisie} />
    </div>
  );
}
