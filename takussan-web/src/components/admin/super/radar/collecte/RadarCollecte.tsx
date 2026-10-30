'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Play, Radar } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { DataState, PageHeader, StatusBadge, type StatusTone } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { useFormatteurs, VALEUR_ABSENTE } from '@/lib/format/useFormatteurs';
import {
  fetchRadarCrawlRuns,
  fetchRadarCrawlSources,
  patchRadarCrawlSource,
  RADAR_POLL_MS,
  radarKeys,
  startRadarCrawlRun,
} from '@/lib/queries/radar';
import type { PaginatedResponse } from '@/types/api';
import {
  RADAR_CRAWL_FREQUENCY_MAX,
  RADAR_CRAWL_FREQUENCY_MIN,
  RADAR_CRAWL_MAX_PAGES_LIMIT,
  type RadarCrawlRun,
  type RadarCrawlSource,
  type RadarCrawlSourceChanges,
  type RadarCrawlSourcesResponse,
  type RadarCrawlStatus,
} from '@/types/radar';
import { codeDeLErreur } from '../fiche/useMessageEchecFiche';
import { ARRETS_COLLECTE_RADAR, ERREURS_COLLECTE_RADAR, MOTIFS_RADAR } from '../codes-radar';

const TON_STATUT: Record<RadarCrawlStatus, StatusTone> = {
  queued: 'neutral',
  running: 'info',
  finished: 'success',
  failed: 'danger',
};

const enCours = (run: RadarCrawlRun) => run.status === 'queued' || run.status === 'running';

/** Le libellé d'un refus de l'onglet, lu par son code ; à défaut, le libellé générique de l'API. */
function useMessageEchecCollecte() {
  const t = useTranslations('superAdmin.pages.radar.crawl');
  const messageErreur = useMessageErreurApi();
  return (erreur: unknown): string => {
    const code = codeDeLErreur(erreur);
    if (code && ERREURS_COLLECTE_RADAR[code]) return t(`errors.${ERREURS_COLLECTE_RADAR[code]}`);
    return messageErreur(erreur, t('errors.generic'));
  };
}

/**
 * Un site collecté : allumé ou non, au nom de qui, sa fréquence et ses pages. Le `super_admin` (`platform.radar.publish`)
 * l'allume, le règle et lance un passage ; les autres lisent.
 */
function CarteSource({ source, regle }: { readonly source: RadarCrawlSource; readonly regle: boolean }) {
  const t = useTranslations('superAdmin.pages.radar.crawl');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const messageEchec = useMessageEchecCollecte();
  const queryClient = useQueryClient();
  const [frequence, setFrequence] = useState(String(source.frequency_minutes));
  const [pages, setPages] = useState(String(source.max_pages));
  const [retour, setRetour] = useState<string | null>(null);

  const regler = useMutation<unknown, ApiError, RadarCrawlSourceChanges>({
    mutationFn: (changes) => patchRadarCrawlSource(source.site, changes),
    onSuccess: () => {
      setRetour(t('saved'));
      void queryClient.invalidateQueries({ queryKey: radarKeys.crawlSources() });
    },
    onError: () => setRetour(null),
  });
  const lancer = useMutation<unknown, ApiError, void>({
    mutationFn: () => startRadarCrawlRun(source.site),
    onSuccess: () => {
      setRetour(t('runQueued'));
      void queryClient.invalidateQueries({ queryKey: [...radarKeys.all, 'crawl', 'runs'] });
    },
    onError: () => setRetour(null),
  });
  const erreur = regler.error ?? lancer.error;
  const occupe = regler.isPending || lancer.isPending;
  const idFrequence = `radar-collecte-frequence-${source.site}`;
  const idPages = `radar-collecte-pages-${source.site}`;

  return (
    <li className="space-y-3 rounded-lg border bg-card p-4" data-testid={`radar-collecte-source-${source.site}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-foreground">{tRadar(`sites.${source.site}`)}</span>
        <StatusBadge tone={source.enabled ? 'success' : 'neutral'} label={source.enabled ? t('enabled') : t('disabled')} />
        <span className="text-xs text-muted-foreground">
          {source.operator ? t('operator', { name: source.operator.name }) : t('noOperator')}
        </span>
      </div>

      {regle ? (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            regler.mutate({ frequency_minutes: Number(frequence), max_pages: Number(pages) });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={idFrequence}>{t('frequency')}</Label>
            <Input
              id={idFrequence}
              type="number"
              inputMode="numeric"
              min={RADAR_CRAWL_FREQUENCY_MIN}
              max={RADAR_CRAWL_FREQUENCY_MAX}
              value={frequence}
              onChange={(event) => setFrequence(event.target.value)}
              aria-describedby={`${idFrequence}-aide`}
            />
            <p id={`${idFrequence}-aide`} className="text-xs text-muted-foreground">
              {t('frequencyHint', { min: RADAR_CRAWL_FREQUENCY_MIN, max: RADAR_CRAWL_FREQUENCY_MAX })}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={idPages}>{t('maxPages')}</Label>
            <Input
              id={idPages}
              type="number"
              inputMode="numeric"
              min={1}
              max={RADAR_CRAWL_MAX_PAGES_LIMIT}
              value={pages}
              onChange={(event) => setPages(event.target.value)}
              aria-describedby={`${idPages}-aide`}
            />
            <p id={`${idPages}-aide`} className="text-xs text-muted-foreground">
              {t('maxPagesHint', { max: RADAR_CRAWL_MAX_PAGES_LIMIT })}
            </p>
          </div>
          <Button type="submit" variant="outline" disabled={occupe} className="sm:mb-5">{t('save')}</Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('summary', { frequency: source.frequency_minutes, pages: source.max_pages })}
        </p>
      )}

      {regle ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={source.enabled ? 'outline' : 'default'}
            disabled={occupe}
            onClick={() => regler.mutate({ enabled: !source.enabled })}
            data-testid={`radar-collecte-bascule-${source.site}`}
          >
            {source.enabled ? t('disable') : t('enable')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={occupe}
            onClick={() => lancer.mutate()}
            data-testid={`radar-collecte-lancer-${source.site}`}
          >
            <Play className="size-4" aria-hidden="true" />
            {t('runNow')}
          </Button>
        </div>
      ) : null}

      {erreur ? (
        <p role="alert" className="text-sm text-destructive">{messageEchec(erreur)}</p>
      ) : retour ? (
        <p role="status" className="text-sm text-muted-foreground">{retour}</p>
      ) : null}
    </li>
  );
}

/**
 * TCK-2392 (ADR-0077 §10) — l'onglet Collecte du Radar : les sites lus d'office et leurs derniers passages. Lecture
 * `platform.radar.operate` ; allumer, régler et lancer : `platform.radar.publish` (`super_admin`). Tant qu'un passage
 * est en file ou en cours, la liste se relit.
 */
export function RadarCollecte() {
  const t = useTranslations('superAdmin.pages.radar.crawl');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const tStatut = useTranslations('superAdmin.pages.radar.crawl.status');
  const tCommon = useTranslations('common');
  const { can } = usePlatformAbilities();
  const messageErreur = useMessageErreurApi();
  const fmt = useFormatteurs();
  const [page, setPage] = useState(1);
  const lit = can('platform.radar.operate');
  const regle = can('platform.radar.publish');

  const sources = useQuery<RadarCrawlSourcesResponse, ApiError>({
    queryKey: radarKeys.crawlSources(),
    queryFn: fetchRadarCrawlSources,
    enabled: lit,
    staleTime: 10_000,
  });
  const passages = useQuery<PaginatedResponse<RadarCrawlRun>, ApiError>({
    queryKey: radarKeys.crawlRuns(page),
    queryFn: () => fetchRadarCrawlRuns(page),
    enabled: lit,
    staleTime: 5_000,
    refetchInterval: (query) => (query.state.data?.data.some(enCours) ? RADAR_POLL_MS : false),
  });

  const retour = (
    <Link
      href="/super-admin/radar"
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('back')}
    </Link>
  );

  if (!lit) {
    return (
      <div className="space-y-6">
        {retour}
        <PageHeader title={t('title')} description={t('subtitle')} />
        <ErrorState message={tRadar('forbidden')} />
      </div>
    );
  }

  const arret = (code: string | null): string => {
    if (code === null) return VALEUR_ABSENTE;
    if (ARRETS_COLLECTE_RADAR[code]) return t(`stops.${ARRETS_COLLECTE_RADAR[code]}`);
    if (MOTIFS_RADAR[code]) return tRadar(`reasons.${MOTIFS_RADAR[code]}`);
    return code;
  };

  const columns: DataTableColumn<RadarCrawlRun>[] = [
    {
      id: 'site',
      header: t('columns.site'),
      cell: (r) => (
        <span className="whitespace-nowrap">
          {tRadar(`sites.${r.site}`)}
          <span className="block text-xs text-muted-foreground">{t(`triggers.${r.trigger}`)}</span>
        </span>
      ),
    },
    { id: 'started', header: t('columns.started'), cell: (r) => fmt.dateTime(r.started_at ?? r.created_at) },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (r) => <StatusBadge tone={TON_STATUT[r.status]} label={tStatut(r.status)} className="whitespace-nowrap" />,
    },
    { id: 'pages', header: t('columns.pages'), align: 'end', cell: (r) => fmt.nombre(r.pages_read) },
    { id: 'cards', header: t('columns.cards'), align: 'end', cell: (r) => fmt.nombre(r.cards_seen) },
    { id: 'created', header: t('columns.created'), align: 'end', cell: (r) => fmt.nombre(r.listings_created) },
    { id: 'known', header: t('columns.known'), align: 'end', cell: (r) => fmt.nombre(r.listings_known) },
    { id: 'snapshots', header: t('columns.snapshots'), align: 'end', cell: (r) => fmt.nombre(r.snapshots_opened) },
    {
      id: 'stop',
      header: t('columns.stop'),
      cell: (r) => (
        <span className="text-sm">
          {arret(r.stop_reason)}
          {r.reached_end && r.stop_reason !== 'radar.crawl.end' ? (
            <span className="block text-xs text-muted-foreground">{t('reachedEnd')}</span>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {retour}
      <PageHeader title={t('title')} description={t('subtitle')} />
      <p className="max-w-3xl text-sm text-muted-foreground">{regle ? t('offNote') : t('readOnly')}</p>

      <section aria-labelledby="radar-collecte-sites" className="space-y-3">
        <h2 id="radar-collecte-sites" className="text-base font-semibold text-foreground">{t('sourcesHeading')}</h2>
        <DataState
          loading={sources.isLoading}
          error={sources.isError ? messageErreur(sources.error, t('loadError')) : null}
          onRetry={() => void sources.refetch()}
          retryLabel={tCommon('actions.retry')}
          skeletonRows={2}
          skeletonRowClassName="h-32"
        >
          <ul className="grid gap-3 lg:grid-cols-2">
            {(sources.data?.data ?? []).map((source) => (
              <CarteSource
                // Les champs du formulaire repartent de la valeur enregistrée quand elle change.
                key={`${source.site}:${source.frequency_minutes}:${source.max_pages}`}
                source={source}
                regle={regle}
              />
            ))}
          </ul>
        </DataState>
      </section>

      <section aria-labelledby="radar-collecte-passages" className="space-y-3">
        <h2 id="radar-collecte-passages" className="text-base font-semibold text-foreground">{t('runsHeading')}</h2>
        <DataState
          loading={passages.isLoading}
          error={passages.isError ? messageErreur(passages.error, t('loadError')) : null}
          onRetry={() => void passages.refetch()}
          retryLabel={tCommon('actions.retry')}
          isEmpty={!passages.data || passages.data.data.length === 0}
          skeletonRows={4}
          skeletonRowClassName="h-12"
          emptyState={<EmptyState icon={<Radar className="size-8" aria-hidden="true" />} title={t('emptyRuns')} />}
        >
          <DataTable
            caption={t('tableCaption')}
            columns={columns}
            rows={passages.data?.data ?? []}
            rowKey={(r) => r.id}
            rowProps={(r) => ({ 'data-testid': `radar-collecte-passage-${r.id}` })}
          />
        </DataState>
        {passages.data ? (
          <Pagination page={passages.data.meta.current_page} lastPage={passages.data.meta.last_page} onChange={setPage} />
        ) : null}
      </section>
    </div>
  );
}
