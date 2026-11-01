'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Play, Radar, TriangleAlert } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { DataState, PageHeader, StatusBadge, type StatusTone } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WarningBanner } from '@/components/ui/warning-banner';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
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
  RADAR_CRAWL_MAX_START_URLS,
  type RadarCrawlRun,
  type RadarCrawlSource,
  type RadarCrawlSourceChanges,
  type RadarCrawlSourcesResponse,
  type RadarCrawlStatus,
} from '@/types/radar';
import { RadarNav } from '../RadarNav';
import { codeDeLErreur } from '../fiche/useMessageEchecFiche';
import { ARRETS_COLLECTE_RADAR, ERREURS_COLLECTE_RADAR, MOTIFS_RADAR } from '../codes-radar';

const TON_STATUT: Record<RadarCrawlStatus, StatusTone> = {
  queued: 'neutral',
  running: 'info',
  finished: 'success',
  failed: 'danger',
};

const enCours = (run: RadarCrawlRun) => run.status === 'queued' || run.status === 'running';

/** Les paramètres d'un refus codé (`params`), pour son libellé. */
function parametresDeLErreur(erreur: unknown): Record<string, unknown> {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return {};
  const params = (erreur.data as { params?: unknown }).params;
  return params && typeof params === 'object' ? (params as Record<string, unknown>) : {};
}

/**
 * Le libellé d'un refus de l'onglet, lu par son code ; à défaut, le libellé générique de l'API. TCK-2438 : une URL de
 * départ refusée est nommée par son rang (`params.field`, `start_urls.N`), avec les bornes et les hôtes que l'API rend.
 */
function useMessageEchecCollecte() {
  const t = useTranslations('superAdmin.pages.radar.crawl');
  const messageErreur = useMessageErreurApi();
  return (erreur: unknown): string => {
    const code = codeDeLErreur(erreur);
    if (code && ERREURS_COLLECTE_RADAR[code]) {
      const params = parametresDeLErreur(erreur);
      const rang = /^start_urls\.(\d+)$/.exec(String(params.field ?? ''));
      return t(`errors.${ERREURS_COLLECTE_RADAR[code]}`, {
        rank: rang ? Number(rang[1]) + 1 : '',
        max: typeof params.max === 'number' ? params.max : '',
        hosts: Array.isArray(params.hosts) ? params.hosts.join(', ') : '',
      });
    }
    return messageErreur(erreur, t('errors.generic'));
  };
}

/** Les lignes non vides d'un champ, sans leurs espaces de bord : ce que l'API enregistre. */
const lignes = (texte: string): string[] =>
  texte
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '');

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
  const [urls, setUrls] = useState((source.start_urls ?? []).join('\n'));
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
  const idUrls = `radar-collecte-urls-${source.site}`;

  return (
    <li className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border" data-testid={`radar-collecte-source-${source.site}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{tRadar(`sites.${source.site}`)}</h3>
            <StatusBadge tone={source.enabled ? 'success' : 'neutral'} label={source.enabled ? t('enabled') : t('disabled')} />
          </div>
          <p className="text-xs text-muted-foreground">
            {source.operator ? t('operator', { name: source.operator.name }) : t('noOperator')}
          </p>
        </div>
        {regle ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={occupe}
              onClick={() => lancer.mutate()}
              data-testid={`radar-collecte-lancer-${source.site}`}
            >
              <Play className="size-4" aria-hidden="true" />
              {t('runNow')}
            </Button>
            <Button
              type="button"
              variant={source.enabled ? 'outline' : 'default'}
              size="sm"
              disabled={occupe}
              onClick={() => regler.mutate({ enabled: !source.enabled })}
              data-testid={`radar-collecte-bascule-${source.site}`}
            >
              {source.enabled ? t('disable') : t('enable')}
            </Button>
          </div>
        ) : null}
      </div>

      {source.enabled && !source.operator ? (
        <WarningBanner
          icon={<TriangleAlert className="size-4" aria-hidden="true" />}
          data-testid={`radar-collecte-sans-operateur-${source.site}`}
        >
          {t('enabledWithoutOperator')}
        </WarningBanner>
      ) : null}

      {regle ? (
        <form
          className="grid gap-3 sm:grid-cols-2 sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            regler.mutate({ frequency_minutes: Number(frequence), max_pages: Number(pages), start_urls: lignes(urls) });
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
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={idUrls}>{t('startUrls')}</Label>
            <Textarea
              id={idUrls}
              rows={3}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              inputMode="url"
              placeholder={source.default_start_url ?? undefined}
              value={urls}
              onChange={(event) => setUrls(event.target.value)}
              aria-describedby={`${idUrls}-aide`}
              className="font-mono text-xs md:text-xs"
              data-testid={`radar-collecte-urls-${source.site}`}
            />
            <p id={`${idUrls}-aide`} className="text-xs text-muted-foreground">
              {t('startUrlsHint', {
                hosts: source.start_hosts.join(', '),
                max: RADAR_CRAWL_MAX_START_URLS,
                fallback: source.default_start_url ?? VALEUR_ABSENTE,
              })}
            </p>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="outline" size="sm" disabled={occupe}>{t('save')}</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>{t('summary', { frequency: source.frequency_minutes, pages: source.max_pages })}</p>
          {source.start_urls && source.start_urls.length > 0 ? (
            <div data-testid={`radar-collecte-urls-lues-${source.site}`}>
              <p>{t('startUrlsSummary')}</p>
              <ul className="list-inside list-disc text-xs break-all">
                {source.start_urls.map((url) => (
                  <li key={url}>{url}</li>
                ))}
              </ul>
            </div>
          ) : source.default_start_url ? (
            <p className="text-xs break-all" data-testid={`radar-collecte-urls-lues-${source.site}`}>
              {t('startUrlsDefault', { url: source.default_start_url })}
            </p>
          ) : null}
        </div>
      )}

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

  if (!lit) {
    return (
      <div className="space-y-6">
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
      <RadarNav />
      <PageHeader title={t('title')} description={regle ? t('offNote') : t('readOnly')} />

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
                key={`${source.site}:${source.frequency_minutes}:${source.max_pages}:${(source.start_urls ?? []).join(' ')}`}
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
