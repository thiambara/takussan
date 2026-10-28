'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowLeft, UsersRound } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { PageHeader, StatusBadge } from '@/components/console';
import { DataState } from '@/components/console/DataState';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { useFormatteurs, VALEUR_ABSENTE } from '@/lib/format/useFormatteurs';
import { fetchRadarAdvertisers, radarKeys, type RadarAdvertiserFilters } from '@/lib/queries/radar';
import type { PaginatedResponse } from '@/types/api';
import { RADAR_ADVERTISER_QUEUES, type RadarAdvertiserQueue, type RadarAdvertiserRow } from '@/types/radar';

const PER_PAGE = 25;

const estFile = (valeur: unknown): valeur is RadarAdvertiserQueue =>
  (RADAR_ADVERTISER_QUEUES as readonly unknown[]).includes(valeur);

/**
 * TCK-2388 — une file d'annonceurs : le tableau, sa pagination et son état vide. Montée par l'onglet actif seulement :
 * un onglet qu'on ne regarde pas ne fait aucune requête.
 */
function FileAnnonceurs({ file, recherche }: { readonly file: RadarAdvertiserQueue; readonly recherche: string }) {
  const t = useTranslations('superAdmin.pages.radar.advertisers');
  const tFiche = useTranslations('superAdmin.pages.radar.listing');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const [page, setPage] = useState(1);

  const filters: RadarAdvertiserFilters = { queue: file, search: recherche || undefined, page, perPage: PER_PAGE };
  const liste = useQuery<PaginatedResponse<RadarAdvertiserRow>, ApiError>({
    queryKey: radarKeys.advertiserList(filters),
    queryFn: () => fetchRadarAdvertisers(filters),
    staleTime: 10_000,
  });

  const colonnes: DataTableColumn<RadarAdvertiserRow>[] = [
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
          {r.do_not_contact_at !== null ? (
            <p className="mt-1"><StatusBadge tone="danger" label={t('doNotContact')} /></p>
          ) : null}
        </>
      ),
    },
    {
      id: 'phone',
      header: t('columns.phone'),
      className: 'font-mono whitespace-nowrap',
      cell: (r) => r.phone ?? t('noPhone'),
    },
    {
      id: 'nature',
      header: t('columns.nature'),
      cell: (r) => tFiche(`options.natures.${r.nature}`),
    },
    {
      id: 'counts',
      header: t('columns.counts'),
      className: 'whitespace-nowrap tabular-nums',
      cell: (r) => (
        <ul className="space-y-0.5 text-xs">
          {(['reviewed', 'contacted', 'consented'] as const).map((etape) => (
            <li key={etape} className="text-muted-foreground">
              {t(`counts.${etape}`)} : <span className="font-medium text-foreground">{r.counts?.[etape] ?? 0}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'due',
      header: t('columns.due'),
      className: 'whitespace-nowrap tabular-nums',
      cell: (r) => {
        const suivi = r.follow_up;
        if (!suivi?.due_at) return VALEUR_ABSENTE;
        return (
          <>
            {fmt.date(suivi.due_at)}
            {suivi.propose_no_answer ? <p className="text-xs text-muted-foreground">{t('proposeNoAnswer')}</p> : null}
          </>
        );
      },
    },
    {
      id: 'claim',
      header: t('columns.claim'),
      cell: (r) => (r.claim ? (r.claim.mine ? t('claimedByMe') : t('claimedBy', { name: r.claim.by.name })) : VALEUR_ABSENTE),
    },
  ];

  const vide = recherche ? 'search' : file;

  return (
    <>
      <DataState
        loading={liste.isLoading}
        error={liste.isError ? messageErreur(liste.error, t('loadError')) : null}
        onRetry={() => void liste.refetch()}
        retryLabel={tCommon('actions.retry')}
        isEmpty={!liste.data || liste.data.data.length === 0}
        skeletonRows={5}
        emptyState={(
          <EmptyState
            icon={<UsersRound className="size-8" aria-hidden="true" />}
            title={t(`empty.${vide}.title`)}
            description={t(`empty.${vide}.description`)}
            data-testid="radar-annonceurs-vide"
          />
        )}
      >
        <DataTable
          caption={t('tableCaption')}
          columns={colonnes}
          rows={liste.data?.data ?? []}
          rowKey={(r) => r.id}
          rowProps={(r) => ({ 'data-testid': `radar-annonceur-${r.id}` })}
        />
      </DataState>
      {liste.data ? (
        <Pagination page={liste.data.meta.current_page} lastPage={liste.data.meta.last_page} onChange={setPage} />
      ) : null}
    </>
  );
}

/**
 * TCK-2388 — les files du démarchage : qui contacter, qui attend une réponse, qui relancer. Trois onglets, une
 * recherche (nom ou numéro) ; chaque ligne mène à la fiche. Les échéances sont celles de l'API.
 */
export function RadarAdvertiserList() {
  const t = useTranslations('superAdmin.pages.radar.advertisers');
  const { can } = usePlatformAbilities();
  const [file, setFile] = useState<RadarAdvertiserQueue>('to_contact');
  const [recherche, setRecherche] = useState('');

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
      <Link
        href="/super-admin/radar"
        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Tabs value={file} onValueChange={(valeur) => { if (estFile(valeur)) setFile(valeur); }}>
        <TabsList aria-label={t('tabsAria')}>
          {RADAR_ADVERTISER_QUEUES.map((q) => <TabsTrigger key={q} value={q}>{t(`tabs.${q}`)}</TabsTrigger>)}
        </TabsList>
        <div className="max-w-md">
          <DebouncedSearchInput
            value={recherche}
            onCommit={setRecherche}
            placeholder={t('search.placeholder')}
            aria-label={t('search.label')}
          />
        </div>
        {RADAR_ADVERTISER_QUEUES.map((q) => (
          <TabsContent key={q} value={q} className="space-y-4">
            {/* La clé suit la recherche : une recherche nouvelle repart de la page 1. */}
            <FileAnnonceurs key={recherche} file={q} recherche={recherche} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
