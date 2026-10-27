'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Eye, PhoneOutgoing, Radar, Wallet } from 'lucide-react';

import { DataState, StatCard, StatusBadge, type StatusTone } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { FilterBar } from '@/components/console/FilterBar';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { useFormatteurs, VALEUR_ABSENTE } from '@/lib/format/useFormatteurs';
import { fetchRadarDashboard, fetchRadarListings, radarKeys, type RadarListingFilters } from '@/lib/queries/radar';
import type { PaginatedResponse } from '@/types/api';
import {
  RADAR_LISTING_STAGES,
  type RadarDashboardResponse,
  type RadarListingRow,
  type RadarListingStage,
} from '@/types/radar';
import { MOTIFS_RADAR, suggereTexteOuCaptures } from './codes-radar';

const ANY = '__any__';
const PER_PAGE = 25;
/** Tant qu'une annonce attend son extraction, la liste et les compteurs se relisent à ce rythme. */
export const RADAR_POLL_MS = 10_000;

const STAGE_TONE: Record<RadarListingStage, StatusTone> = {
  captured: 'neutral',
  extracted: 'attention',
  reviewed: 'info',
  contacted: 'info',
  consented: 'success',
  published: 'success',
  extraction_failed: 'danger',
  duplicate: 'neutral',
  refused: 'neutral',
  do_not_contact: 'neutral',
  purged: 'neutral',
};

const PERIODES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
type Periode = (typeof PERIODES)[number];
const estPeriode = (valeur: unknown): valeur is Periode => PERIODES.includes(valeur as Periode);

/**
 * TCK-2386 (ADR-0077) — la liste de travail du Radar : les compteurs qui disent quoi faire
 * (relire, contacter, débloquer), le coût IA du jour, puis les annonces, filtrées par étape côté
 * serveur (`filter[stage]`).
 *
 * Tant qu'une annonce est `captured` (extraction en file ou en attente), la requête se relit toutes
 * les {@link RADAR_POLL_MS} ms, et s'arrête d'elle-même quand il n'y en a plus.
 */
export function RadarWorkList() {
  const t = useTranslations('superAdmin.pages.radar');
  const tFiltres = useTranslations('console.filterBar');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();

  const [stage, setStage] = useState<RadarListingStage | ''>('');
  const [page, setPage] = useState(1);
  const filters: RadarListingFilters = { stage: stage || undefined, page, perPage: PER_PAGE };

  const dashboard = useQuery<RadarDashboardResponse, ApiError>({
    queryKey: radarKeys.dashboard(),
    queryFn: fetchRadarDashboard,
    staleTime: 10_000,
    refetchInterval: (query) => ((query.state.data?.data.stages.captured ?? 0) > 0 ? RADAR_POLL_MS : false),
  });
  const list = useQuery<PaginatedResponse<RadarListingRow>, ApiError>({
    queryKey: radarKeys.list(filters),
    queryFn: () => fetchRadarListings(filters),
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data?.data.some((row) => row.stage === 'captured') ? RADAR_POLL_MS : false),
  });

  const compteurs = dashboard.data?.data;
  const ai = compteurs?.ai;
  const plafondAtteint = ai?.daily_budget_xof != null && ai.spent_today_xof >= ai.daily_budget_xof;

  const motif = (code: string) => (MOTIFS_RADAR[code] ? t(`reasons.${MOTIFS_RADAR[code]}`) : code);

  const stageOptions = [
    { value: ANY, label: t('filters.anyStage') },
    ...RADAR_LISTING_STAGES.map((s) => ({ value: s, label: t(`stages.${s}`) })),
  ];

  const columns: DataTableColumn<RadarListingRow>[] = [
    {
      id: 'stage',
      header: t('columns.stage'),
      cell: (r) => <StatusBadge tone={STAGE_TONE[r.stage]} label={t(`stages.${r.stage}`)} className="whitespace-nowrap" />,
    },
    {
      id: 'site',
      header: t('columns.site'),
      className: 'whitespace-nowrap',
      cell: (r) => (
        <>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            {t(`sites.${r.source_site}`)}
            {r.source_url ? (
              <a
                href={r.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={r.source_url}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </span>
          <p className="text-xs text-muted-foreground">{t(`kinds.${r.source_kind}`)}</p>
        </>
      ),
    },
    {
      id: 'title',
      header: t('columns.title'),
      className: 'min-w-48',
      cell: (r) => {
        const titre = r.extracted?.title?.value;
        return titre
          ? <span className="font-medium text-foreground">{titre}</span>
          : <span className="text-muted-foreground">{t('untitled')}</span>;
      },
    },
    {
      id: 'price',
      header: t('columns.price'),
      align: 'end',
      className: 'whitespace-nowrap tabular-nums',
      cell: (r) => {
        const prix = r.extracted?.price?.value;
        if (prix == null) return VALEUR_ABSENTE;
        const periode = r.extracted?.rent_period?.value ?? r.extracted?.price?.period;
        return (
          <>
            {fmt.montant(prix, 'XOF')}
            {estPeriode(periode) ? <span className="ml-1 text-xs text-muted-foreground">{t(`periods.${periode}`)}</span> : null}
          </>
        );
      },
    },
    {
      id: 'neighborhood',
      header: t('columns.neighborhood'),
      cell: (r) => {
        const quartier = r.extracted?.neighborhood;
        if (!quartier?.value) return VALEUR_ABSENTE;
        return (
          <>
            <span className="text-foreground">{quartier.value}</span>
            {quartier.neighborhood_id == null ? (
              <p className="text-xs text-muted-foreground">{t('neighborhoodUnmatched')}</p>
            ) : null}
          </>
        );
      },
    },
    {
      id: 'reason',
      header: t('columns.reason'),
      className: 'min-w-56',
      cell: (r) => {
        if (r.stage === 'captured' && r.stage_reason === null) {
          return <span className="text-muted-foreground">{t('extracting')}</span>;
        }
        if (r.stage_reason === null) return VALEUR_ABSENTE;
        return (
          <>
            <span className="text-foreground">
              {r.stage === 'captured' ? t('pending', { reason: motif(r.stage_reason) }) : motif(r.stage_reason)}
            </span>
            {r.stage === 'extraction_failed' && suggereTexteOuCaptures(r.stage_reason) ? (
              <p className="text-xs text-muted-foreground">{t('tryTextOrCaptures')}</p>
            ) : null}
          </>
        );
      },
    },
    {
      id: 'date',
      header: t('columns.date'),
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      cell: (r) => fmt.dateTime(r.created_at),
    },
  ];

  return (
    <div className="space-y-6">
      {dashboard.isError ? (
        <ErrorState
          message={`${t('loadError')} ${messageErreur(dashboard.error)}`}
          onRetry={() => void dashboard.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="radar-counters">
          <StatCard label={t('counters.toReview')} value={compteurs?.stages.extracted ?? 0} loading={dashboard.isLoading} icon={<Eye className="size-4" aria-hidden="true" />} />
          <StatCard label={t('counters.pending')} value={compteurs?.pending_extraction ?? 0} loading={dashboard.isLoading} icon={<Clock3 className="size-4" aria-hidden="true" />} />
          <StatCard
            label={t('counters.failed')}
            value={compteurs?.stages.extraction_failed ?? 0}
            loading={dashboard.isLoading}
            tone={(compteurs?.stages.extraction_failed ?? 0) > 0 ? 'danger' : 'default'}
            icon={<AlertTriangle className="size-4" aria-hidden="true" />}
          />
          <StatCard label={t('counters.toContact')} value={compteurs?.stages.reviewed ?? 0} loading={dashboard.isLoading} icon={<PhoneOutgoing className="size-4" aria-hidden="true" />} />
          <StatCard label={t('counters.published')} value={compteurs?.stages.published ?? 0} loading={dashboard.isLoading} icon={<CheckCircle2 className="size-4" aria-hidden="true" />} />
          <StatCard
            label={t('counters.aiCost')}
            value={fmt.montant(ai?.spent_today_xof ?? 0, 'XOF')}
            hint={ai?.daily_budget_xof != null
              ? t('counters.aiCostBudget', { budget: fmt.montant(ai.daily_budget_xof, 'XOF') })
              : t('counters.aiCostNoBudget')}
            loading={dashboard.isLoading}
            tone={plafondAtteint ? 'danger' : 'default'}
            icon={<Wallet className="size-4" aria-hidden="true" />}
          />
        </div>
      )}

      <FilterBar
        controlsClassName="sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3"
        resultCount={list.data ? tFiltres('results', { count: list.data.meta.total }) : undefined}
        onReset={() => { setStage(''); setPage(1); }}
        resetLabel={tFiltres('reset')}
        resetDisabled={stage === ''}
      >
        <Select
          value={stage || ANY}
          onValueChange={(next) => {
            setStage(!next || next === ANY ? '' : (next as RadarListingStage));
            setPage(1);
          }}
          items={stageOptions}
        >
          <SelectTrigger className="h-10 w-full" aria-label={t('filters.stageAria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stageOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataState
        loading={list.isLoading}
        error={list.isError ? messageErreur(list.error, t('loadError')) : null}
        onRetry={() => void list.refetch()}
        retryLabel={tCommon('actions.retry')}
        isEmpty={!list.data || list.data.data.length === 0}
        skeletonRows={6}
        skeletonRowClassName="h-12"
        emptyState={(
          <EmptyState
            icon={<Radar className="size-8" aria-hidden="true" />}
            title={stage ? t('emptyFiltered.title') : t('empty.title')}
            description={stage ? t('emptyFiltered.description') : t('empty.description')}
          />
        )}
      >
        <DataTable
          caption={t('tableCaption')}
          columns={columns}
          rows={list.data?.data ?? []}
          rowKey={(r) => r.id}
          rowProps={(r) => ({ 'data-testid': `radar-listing-${r.id}` })}
        />
      </DataState>

      {list.data ? (
        <Pagination page={list.data.meta.current_page} lastPage={list.data.meta.last_page} onChange={setPage} />
      ) : null}
    </div>
  );
}
