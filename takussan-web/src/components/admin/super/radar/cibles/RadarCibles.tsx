'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Crosshair, Pin, Plus } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { DataState, PageHeader, StatusBadge } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { FilterBar } from '@/components/console/FilterBar';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { useFormatteurs, VALEUR_ABSENTE } from '@/lib/format/useFormatteurs';
import { fetchRadarTargets, radarKeys, type RadarTargetFilters } from '@/lib/queries/radar';
import type { PaginatedResponse } from '@/types/api';
import {
  RADAR_TARGET_ORIGINS,
  RADAR_TARGET_STATUSES,
  type RadarTarget,
  type RadarTargetOrigin,
  type RadarTargetStatus,
} from '@/types/radar';
import { RadarNav } from '../RadarNav';
import { morceauxDuResume, SEPARATEUR_DU_RESUME } from './criteres';
import { PanneauCible } from './PanneauCible';
import { TON_DE_LA_CIBLE } from './tons';

const ANY = '__any__';
const PER_PAGE = 25;

/**
 * TCK-2469 (ADR-0087 §5) — les cibles du Radar : ce que la collecte cherche, et ce que chaque recherche rapporte. Une
 * ligne par cible — nom, résumé des critères, origine, état, épinglage, annonces trouvées, dernière trouvaille —, filtrée
 * côté serveur par état et par origine.
 *
 * Lecture `platform.radar.operate` (support et au-dessus) ; créer : `platform.radar.publish` (`super_admin`). Le support
 * voit tout, sans aucun bouton d'écriture.
 */
export function RadarCibles() {
  const t = useTranslations('superAdmin.pages.radar.targets');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const tTypes = useTranslations('property.types');
  const tSites = useTranslations('superAdmin.pages.radar.sites');
  const tFiltres = useTranslations('console.filterBar');
  const tCommon = useTranslations('common');
  const { can } = usePlatformAbilities();
  const messageErreur = useMessageErreurApi();
  const fmt = useFormatteurs();
  const lit = can('platform.radar.operate');
  const ecrit = can('platform.radar.publish');

  const [statut, setStatut] = useState<RadarTargetStatus | ''>('');
  const [origine, setOrigine] = useState<RadarTargetOrigin | ''>('');
  const [page, setPage] = useState(1);
  const [creation, setCreation] = useState(false);
  const filtres: RadarTargetFilters = { status: statut || undefined, origin: origine || undefined, page, perPage: PER_PAGE };

  const liste = useQuery<PaginatedResponse<RadarTarget>, ApiError>({
    queryKey: radarKeys.targetList(filtres),
    queryFn: () => fetchRadarTargets(filtres),
    enabled: lit,
    staleTime: 10_000,
  });

  if (!lit) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} description={t('subtitle')} />
        <ErrorState message={tRadar('forbidden')} />
      </div>
    );
  }

  const resume = (cible: RadarTarget) => morceauxDuResume(cible.criteria, { t, tTypes, tSites, fmt }).join(SEPARATEUR_DU_RESUME);
  const filtre = Boolean(statut || origine);
  const reinitialiser = () => {
    setStatut('');
    setOrigine('');
    setPage(1);
  };

  const optionsStatut = [
    { value: ANY, label: t('filters.anyStatus') },
    ...RADAR_TARGET_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
  ];
  const optionsOrigine = [
    { value: ANY, label: t('filters.anyOrigin') },
    ...RADAR_TARGET_ORIGINS.map((o) => ({ value: o, label: t(`origin.${o}`) })),
  ];

  const nomEtResume = (cible: RadarTarget) => (
    <>
      <span className="flex items-center gap-1.5">
        <Link
          href={`/super-admin/radar/targets/${cible.id}`}
          className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {cible.name}
        </Link>
        {cible.pinned ? (
          <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('pinned')} data-testid={`radar-cible-epinglee-${cible.id}`} />
        ) : null}
      </span>
      <p className="text-xs text-pretty text-muted-foreground">{resume(cible)}</p>
    </>
  );

  const badges = (cible: RadarTarget) => (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusBadge tone={TON_DE_LA_CIBLE[cible.status]} label={t(`status.${cible.status}`)} className="whitespace-nowrap" />
      <span className="text-xs whitespace-nowrap text-muted-foreground">{t(`origin.${cible.origin}`)}</span>
    </span>
  );

  const derniere = (cible: RadarTarget) => (cible.last_matched_at ? fmt.dateTime(cible.last_matched_at) : VALEUR_ABSENTE);

  const columns: DataTableColumn<RadarTarget>[] = [
    { id: 'name', header: t('columns.name'), className: 'min-w-64', cell: nomEtResume },
    { id: 'status', header: t('columns.status'), cell: badges },
    {
      id: 'matches',
      header: t('columns.matches'),
      align: 'end',
      className: 'whitespace-nowrap tabular-nums',
      cell: (cible) => fmt.nombre(cible.matches_count),
    },
    {
      id: 'last',
      header: t('columns.lastMatch'),
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      cell: derniere,
    },
  ];

  return (
    <div className="space-y-6">
      <RadarNav />
      <PageHeader
        title={t('title')}
        description={ecrit ? t('subtitle') : t('readOnly')}
        actions={ecrit ? (
          <Button type="button" onClick={() => setCreation(true)} data-testid="radar-cibles-creer">
            <Plus className="size-4" aria-hidden="true" />
            {t('create')}
          </Button>
        ) : undefined}
      />

      <FilterBar
        controlsClassName="sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3"
        resultCount={liste.data ? tFiltres('results', { count: liste.data.meta.total }) : undefined}
        onReset={reinitialiser}
        resetLabel={tFiltres('reset')}
        resetDisabled={!filtre}
      >
        <Select
          value={statut || ANY}
          onValueChange={(suivant) => {
            setStatut(!suivant || suivant === ANY ? '' : (suivant as RadarTargetStatus));
            setPage(1);
          }}
          items={optionsStatut}
        >
          <SelectTrigger className="w-full" aria-label={t('filters.statusAria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {optionsStatut.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={origine || ANY}
          onValueChange={(suivant) => {
            setOrigine(!suivant || suivant === ANY ? '' : (suivant as RadarTargetOrigin));
            setPage(1);
          }}
          items={optionsOrigine}
        >
          <SelectTrigger className="w-full" aria-label={t('filters.originAria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {optionsOrigine.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataState
        loading={liste.isLoading}
        error={liste.isError ? messageErreur(liste.error, t('loadError')) : null}
        onRetry={() => void liste.refetch()}
        retryLabel={tCommon('actions.retry')}
        isEmpty={!liste.data || liste.data.data.length === 0}
        skeletonRows={5}
        skeletonRowClassName="h-14"
        emptyState={(
          <EmptyState
            icon={<Crosshair className="size-8" aria-hidden="true" />}
            title={filtre ? t('emptyFiltered.title') : t('empty.title')}
            description={filtre ? t('emptyFiltered.description') : ecrit ? t('empty.description') : t('empty.descriptionReadOnly')}
            action={!filtre && ecrit ? (
              <Button type="button" variant="outline" onClick={() => setCreation(true)}>
                <Plus className="size-4" aria-hidden="true" />
                {t('create')}
              </Button>
            ) : undefined}
          />
        )}
      >
        <DataTable
          caption={t('tableCaption')}
          columns={columns}
          rows={liste.data?.data ?? []}
          rowKey={(cible) => cible.id}
          rowProps={(cible) => ({ 'data-testid': `radar-cible-${cible.id}` })}
          carteMobile={(cible) => (
            <div className="space-y-2" data-testid={`radar-cible-carte-${cible.id}`}>
              {nomEtResume(cible)}
              {badges(cible)}
              <p className="text-xs text-muted-foreground tabular-nums">
                {t('mobileMatches', { count: cible.matches_count, last: derniere(cible) })}
              </p>
            </div>
          )}
        />
      </DataState>

      {liste.data ? (
        <Pagination page={liste.data.meta.current_page} lastPage={liste.data.meta.last_page} onChange={setPage} />
      ) : null}

      {ecrit ? (
        // Créée, la cible rejoint la liste (relue) : on peut en poser une autre sans quitter l'écran.
        <PanneauCible open={creation} onOpenChange={setCreation} />
      ) : null}
    </div>
  );
}
