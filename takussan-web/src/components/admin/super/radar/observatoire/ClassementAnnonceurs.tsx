'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Trophy } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { DataState } from '@/components/console/DataState';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { FilterBar } from '@/components/console/FilterBar';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState } from '@/components/feedback';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { useFormatteurs, VALEUR_ABSENTE } from '@/lib/format/useFormatteurs';
import { fetchRadarRanking, radarObservatoireKeys } from '@/lib/queries/radar-observatoire';
import type { PaginatedResponse } from '@/types/api';
import { RADAR_ADVERTISER_NATURES, type RadarAdvertiserNature } from '@/types/radar';
import type { RadarPipelineStage, RadarRankingFilters, RadarRankingRow } from '@/types/radar-observatoire';

const PER_PAGE = 25;
const ANY = 'any';

const TON_PISTE: Record<RadarPipelineStage, 'neutral' | 'info' | 'attention' | 'success' | 'danger'> = {
  prospect: 'neutral',
  contacted: 'info',
  account: 'info',
  upgrade_pending: 'attention',
  agency: 'success',
  do_not_contact: 'danger',
};

/** Un compte existe, la nature dit « agence » ou « intermédiaire », et aucune demande : la piste à proposer. */
const aProposer = (r: RadarRankingRow) =>
  r.pipeline === 'account' && (r.nature === 'agency' || r.nature === 'probable_intermediary');

const estNature = (v: unknown): v is RadarAdvertiserNature => (RADAR_ADVERTISER_NATURES as readonly unknown[]).includes(v);

/**
 * TCK-2393 — le classement des annonceurs : par volume d'annonces vivantes, avec leurs quartiers, leurs gammes de prix, leurs
 * sites, leur nature présumée et la piste commerciale jusqu'à la demande de passage en agence. Tri et filtres par l'API.
 */
export function ClassementAnnonceurs() {
  const t = useTranslations('superAdmin.pages.radar.observatory.ranking');
  const tNature = useTranslations('superAdmin.pages.radar.listing.options.natures');
  const tSites = useTranslations('superAdmin.pages.radar.sites');
  const tContrats = useTranslations('superAdmin.pages.radar.listing.options.contracts');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const [nature, setNature] = useState<RadarAdvertiserNature | ''>('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);

  const filters: RadarRankingFilters = { nature: nature || undefined, search: recherche || undefined, page, perPage: PER_PAGE };
  const liste = useQuery<PaginatedResponse<RadarRankingRow>, ApiError>({
    queryKey: radarObservatoireKeys.ranking(filters),
    queryFn: () => fetchRadarRanking(filters),
    staleTime: 30_000,
  });

  const rangDe = (index: number) => ((liste.data?.meta.current_page ?? 1) - 1) * PER_PAGE + index + 1;
  const lignes = liste.data?.data ?? [];

  const colonnes: DataTableColumn<RadarRankingRow>[] = [
    {
      id: 'rank',
      header: t('columns.rank'),
      className: 'w-12 tabular-nums text-muted-foreground',
      cell: (r) => rangDe(lignes.indexOf(r)),
    },
    {
      id: 'name',
      header: t('columns.name'),
      className: 'min-w-44',
      cell: (r) => (
        <>
          <Link
            href={`/super-admin/radar/advertisers/${r.id}`}
            className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {r.display_name || t('unnamed')}
          </Link>
          <p className="font-mono text-xs text-muted-foreground">{r.phone ?? t('noPhone')}</p>
        </>
      ),
    },
    {
      id: 'nature',
      header: t('columns.nature'),
      cell: (r) => (r.nature ? tNature(r.nature) : VALEUR_ABSENTE),
    },
    {
      id: 'listings',
      header: t('columns.listings'),
      align: 'end',
      className: 'whitespace-nowrap tabular-nums',
      cell: (r) => (
        <>
          <span className="font-medium">{fmt.nombre(r.listings_count)}</span>
          {r.published_count > 0 ? <p className="text-xs text-muted-foreground">{t('published', { count: r.published_count })}</p> : null}
        </>
      ),
    },
    {
      id: 'neighborhoods',
      header: t('columns.neighborhoods'),
      className: 'min-w-40',
      cell: (r) => {
        if (r.top_neighborhoods.length === 0) return VALEUR_ABSENTE;
        const reste = r.neighborhoods_count - r.top_neighborhoods.length;
        return (
          <span className="text-sm">
            {r.top_neighborhoods.map((n) => n.name ?? t('unknownNeighborhood')).join(', ')}
            {reste > 0 ? <span className="text-muted-foreground"> {t('moreNeighborhoods', { count: reste })}</span> : null}
          </span>
        );
      },
    },
    {
      id: 'prices',
      header: t('columns.prices'),
      className: 'whitespace-nowrap tabular-nums',
      cell: (r) => {
        const gammes = Object.entries(r.price_ranges);
        if (gammes.length === 0) return VALEUR_ABSENTE;
        return (
          <ul className="space-y-0.5 text-xs">
            {gammes.map(([contrat, g]) => (
              <li key={contrat}>
                <span className="text-muted-foreground">{contrat === 'rent' || contrat === 'sale' ? tContrats(contrat) : t('unknownContract')} </span>
                {g && g.min === g.max ? fmt.montant(g.min, 'XOF') : t('range', { min: fmt.montant(g?.min, 'XOF'), max: fmt.montant(g?.max, 'XOF') })}
              </li>
            ))}
          </ul>
        );
      },
    },
    {
      id: 'sites',
      header: t('columns.sites'),
      cell: (r) => (r.sites.length === 0 ? VALEUR_ABSENTE : r.sites.map((s) => tSites(s)).join(', ')),
    },
    {
      id: 'pipeline',
      header: t('columns.pipeline'),
      cell: (r) => (
        <>
          <StatusBadge tone={TON_PISTE[r.pipeline]} label={t(`pipeline.${r.pipeline}`)} />
          {aProposer(r) ? <p className="mt-1 text-xs text-primary">{t('proposeUpgrade')}</p> : null}
        </>
      ),
    },
  ];

  const natureOptions = [
    { value: ANY, label: t('filters.anyNature') },
    ...RADAR_ADVERTISER_NATURES.map((n) => ({ value: n, label: tNature(n) })),
  ];

  return (
    <div className="space-y-4">
      <FilterBar
        controlsClassName="sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2"
        resultCount={liste.data ? t('results', { count: liste.data.meta.total }) : undefined}
        onReset={() => { setNature(''); setRecherche(''); setPage(1); }}
        resetLabel={t('filters.reset')}
        resetDisabled={nature === '' && recherche === ''}
      >
        <DebouncedSearchInput
          value={recherche}
          onCommit={(v) => { setRecherche(v); setPage(1); }}
          placeholder={t('filters.searchPlaceholder')}
          aria-label={t('filters.searchLabel')}
        />
        <Select
          value={nature || ANY}
          onValueChange={(v) => { setNature(estNature(v) ? v : ''); setPage(1); }}
          items={natureOptions}
        >
          <SelectTrigger className="w-full" aria-label={t('filters.natureAria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {natureOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>
      <DataState
        loading={liste.isLoading}
        error={liste.isError ? messageErreur(liste.error, t('loadError')) : null}
        onRetry={() => void liste.refetch()}
        retryLabel={tCommon('actions.retry')}
        isEmpty={lignes.length === 0}
        skeletonRows={6}
        emptyState={(
          <EmptyState
            icon={<Trophy className="size-8" aria-hidden="true" />}
            title={t('empty.title')}
            description={t('empty.description')}
            data-testid="radar-classement-vide"
          />
        )}
      >
        <DataTable
          caption={t('tableCaption')}
          columns={colonnes}
          rows={lignes}
          rowKey={(r) => r.id}
          rowProps={(r) => ({ 'data-testid': `radar-classement-${r.id}` })}
        />
      </DataState>
      {liste.data ? <Pagination page={liste.data.meta.current_page} lastPage={liste.data.meta.last_page} onChange={setPage} /> : null}
    </div>
  );
}
