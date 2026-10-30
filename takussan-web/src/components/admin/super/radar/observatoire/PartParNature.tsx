'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { DataState } from '@/components/console/DataState';
import { EmptyState } from '@/components/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { fetchRadarNatureHistory, radarObservatoireKeys } from '@/lib/queries/radar-observatoire';
import { RADAR_ADVERTISER_NATURES, type RadarAdvertiserNature } from '@/types/radar';
import type { RadarNatureHistoryFilters, RadarObservatoryResponse } from '@/types/radar-observatoire';

/**
 * Un ton de série par nature (`--chart-1..4`, chacun à 3:1 au moins sur `--card`, WCAG 1.4.11) : l'intermédiaire probable
 * porte le premier, c'est la part qu'on suit. La barre double le pourcentage écrit, elle n'en est pas la seule voie.
 */
const TONS: Record<RadarAdvertiserNature, string> = {
  probable_intermediary: 'bg-chart-1',
  probable_owner: 'bg-chart-2',
  agency: 'bg-chart-3',
  unknown: 'bg-chart-4',
};

/**
 * TCK-2431 (ADR-0083) — la part par nature des annonceurs sur une période, depuis les compteurs anonymes figés chaque jour
 * avant la purge : elle survit à l'effacement des annonces, là où la ligne « Intermédiaires probables » ne lit que les
 * annonceurs encore porteurs d'annonces. Période envoyée à l'API (`filter[since|until]`), jamais filtrée ici.
 */
export function PartParNature() {
  const t = useTranslations('superAdmin.pages.radar.observatory.market.natureHistory');
  const tNature = useTranslations('superAdmin.pages.radar.listing.options.natures');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const [periode, setPeriode] = useState<RadarNatureHistoryFilters>({});

  const requete = useQuery<RadarObservatoryResponse, ApiError>({
    queryKey: radarObservatoireKeys.natureHistory(periode),
    queryFn: () => fetchRadarNatureHistory(periode),
    staleTime: 60_000,
  });
  const historique = requete.data?.data.nature_history;
  const total = historique ? RADAR_ADVERTISER_NATURES.reduce((somme, n) => somme + (historique.advertisers[n] ?? 0), 0) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="radar-part-nature-du">{t('from')}</Label>
          <Input
            id="radar-part-nature-du"
            type="date"
            className="h-10"
            value={periode.since ?? ''}
            onChange={(e) => setPeriode((p) => ({ ...p, since: e.target.value || undefined }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="radar-part-nature-au">{t('to')}</Label>
          <Input
            id="radar-part-nature-au"
            type="date"
            className="h-10"
            value={periode.until ?? ''}
            min={periode.since}
            onChange={(e) => setPeriode((p) => ({ ...p, until: e.target.value || undefined }))}
          />
        </div>
      </div>

      <DataState
        loading={requete.isLoading}
        error={requete.isError ? messageErreur(requete.error, t('loadError')) : null}
        onRetry={() => void requete.refetch()}
        retryLabel={tCommon('actions.retry')}
        isEmpty={!historique || historique.days === 0 || total === 0}
        emptyState={<EmptyState title={t('empty')} description={t('emptyHint')} />}
        skeletonRows={4}
      >
        {historique ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('span', { days: historique.days, from: fmt.date(historique.first_day), to: fmt.date(historique.last_day) })}
            </p>
            <ul className="space-y-3">
              {RADAR_ADVERTISER_NATURES.map((n) => {
                const annonceurs = historique.advertisers[n] ?? 0;
                const part = total > 0 ? annonceurs / total : 0;
                return (
                  <li key={n} className="space-y-1" data-testid={`radar-part-nature-${n}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground">{tNature(n)}</span>
                      <span className="tabular-nums font-semibold text-foreground">
                        {fmt.nombre(part, { style: 'percent', maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted/50" aria-hidden="true">
                      <div className={`h-full rounded-full ${TONS[n]}`} style={{ width: `${Math.round(part * 1000) / 10}%` }} />
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {t('counts', { advertisers: annonceurs, listings: historique.listings[n] ?? 0 })}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </DataState>
    </div>
  );
}
