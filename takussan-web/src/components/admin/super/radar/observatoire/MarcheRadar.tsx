'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Building2, CircleOff, Eye, Layers, UsersRound } from 'lucide-react';

import { StatCard, StatusBadge } from '@/components/console';
import { DataState } from '@/components/console/DataState';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { FilterBar } from '@/components/console/FilterBar';
import { EmptyState } from '@/components/feedback';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { useFormatteurs, VALEUR_ABSENTE } from '@/lib/format/useFormatteurs';
import { fetchRadarObservatory, radarObservatoireKeys } from '@/lib/queries/radar-observatoire';
import { RADAR_ADVERTISER_NATURES, RADAR_PROPERTY_TYPES, RADAR_SOURCE_SITES, type RadarContract, type RadarSourceSite } from '@/types/radar';
import type {
  RadarGoneSource,
  RadarNeighborhoodRef,
  RadarObservatoryFilters,
  RadarObservatoryResponse,
  RadarPricePerM2Row,
  RadarSupplyGapRow,
  RadarTimeOnMarketRow,
} from '@/types/radar-observatoire';

const ANY = 'any';
/** Les lignes affichées par tableau : les groupes les plus fournis, l'API les rend déjà triés. */
const LIGNES_MAX = 30;

const CONTRATS: readonly RadarContract[] = ['rent', 'sale'];
const estContrat = (v: unknown): v is RadarContract => (CONTRATS as readonly unknown[]).includes(v);
const estSite = (v: unknown): v is RadarSourceSite => (RADAR_SOURCE_SITES as readonly unknown[]).includes(v);
const estType = (v: unknown): v is string => (RADAR_PROPERTY_TYPES as readonly unknown[]).includes(v);

function Section({ titre, description, children }: { readonly titre: string; readonly description: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border">
      <div>
        <h2 className="font-heading text-base font-semibold text-foreground">{titre}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * TCK-2393 (ADR-0083) — le marché vu par le Radar : ce qui est suivi, les quartiers où Takussan manque d'annonces, le prix au
 * m², le temps de mise sur le marché, la part d'intermédiaires, et les sources disparues de biens publiés. Tout se calcule et
 * se filtre côté API, sur les instantanés anonymes.
 */
export function MarcheRadar() {
  const t = useTranslations('superAdmin.pages.radar.observatory.market');
  const tSites = useTranslations('superAdmin.pages.radar.sites');
  const tPeriodes = useTranslations('superAdmin.pages.radar.periods');
  const tContrats = useTranslations('superAdmin.pages.radar.listing.options.contracts');
  const tNature = useTranslations('superAdmin.pages.radar.listing.options.natures');
  const tTypes = useTranslations('property.types');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const [filtres, setFiltres] = useState<RadarObservatoryFilters>({});

  const marche = useQuery<RadarObservatoryResponse, ApiError>({
    queryKey: radarObservatoireKeys.market(filtres),
    queryFn: () => fetchRadarObservatory(filtres),
    staleTime: 60_000,
  });
  const data = marche.data?.data;
  // Le nombre de passages complets qui constate une disparition est réglable côté API : l'écran le lit, jamais en dur.
  const passages = { runs: marche.data?.meta.confirm_runs ?? 2 };

  const quartier = (n: RadarNeighborhoodRef | null) => (n ? (n.name ?? t('unknownNeighborhood')) : t('unmatchedNeighborhood'));
  const type = (v: string | null) => (v && estType(v) ? tTypes(v) : VALEUR_ABSENTE);
  const contrat = (v: string | null) => (v && estContrat(v) ? tContrats(v) : VALEUR_ABSENTE);
  const xof = (v: number) => fmt.montant(v, 'XOF');
  const jours = (v: number | null) => (v === null ? VALEUR_ABSENTE : t('days', { count: v }));

  const colonnesEcart: DataTableColumn<RadarSupplyGapRow>[] = [
    { id: 'neighborhood', header: t('columns.neighborhood'), cell: (r) => quartier(r.neighborhood) },
    { id: 'radar', header: t('columns.radarOnline'), align: 'end', className: 'tabular-nums', cell: (r) => fmt.nombre(r.radar_online) },
    { id: 'catalog', header: t('columns.catalogPublic'), align: 'end', className: 'tabular-nums', cell: (r) => fmt.nombre(r.catalog_public) },
    {
      id: 'gap',
      header: t('columns.gap'),
      align: 'end',
      className: 'tabular-nums',
      cell: (r) => <span className={r.gap > 0 ? 'font-semibold text-primary' : 'text-muted-foreground'}>{fmt.nombre(r.gap)}</span>,
    },
  ];

  const colonnesPrix: DataTableColumn<RadarPricePerM2Row>[] = [
    { id: 'neighborhood', header: t('columns.neighborhood'), cell: (r) => quartier(r.neighborhood) },
    { id: 'type', header: t('columns.type'), cell: (r) => type(r.property_type) },
    {
      id: 'contract',
      header: t('columns.contract'),
      cell: (r) => (
        <>
          {contrat(r.contract)}
          {r.rent_period && ['daily', 'weekly', 'monthly', 'yearly'].includes(r.rent_period)
            ? <span className="text-muted-foreground"> {tPeriodes(r.rent_period as 'daily' | 'weekly' | 'monthly' | 'yearly')}</span>
            : null}
        </>
      ),
    },
    { id: 'listings', header: t('columns.listings'), align: 'end', className: 'tabular-nums', cell: (r) => fmt.nombre(r.listings) },
    { id: 'median', header: t('columns.median'), align: 'end', className: 'whitespace-nowrap tabular-nums', cell: (r) => <span className="font-medium">{xof(r.median_xof_per_m2)}</span> },
    {
      id: 'spread',
      header: t('columns.spread'),
      align: 'end',
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      cell: (r) => t('range', { min: xof(r.p25_xof_per_m2), max: xof(r.p75_xof_per_m2) }),
    },
  ];

  const colonnesDuree: DataTableColumn<RadarTimeOnMarketRow>[] = [
    { id: 'neighborhood', header: t('columns.neighborhood'), cell: (r) => quartier(r.neighborhood) },
    { id: 'type', header: t('columns.type'), cell: (r) => type(r.property_type) },
    { id: 'contract', header: t('columns.contract'), cell: (r) => contrat(r.contract) },
    { id: 'gone', header: t('columns.gone'), align: 'end', className: 'tabular-nums', cell: (r) => fmt.nombre(r.gone) },
    { id: 'online', header: t('columns.online'), align: 'end', className: 'tabular-nums', cell: (r) => fmt.nombre(r.online) },
    { id: 'median', header: t('columns.medianDays'), align: 'end', className: 'whitespace-nowrap tabular-nums', cell: (r) => <span className="font-medium">{jours(r.median_days)}</span> },
  ];

  const colonnesDisparues: DataTableColumn<RadarGoneSource>[] = [
    { id: 'property', header: t('columns.property'), className: 'min-w-44', cell: (r) => r.property.title ?? t('untitledProperty') },
    { id: 'site', header: t('columns.site'), cell: (r) => tSites(r.source_site) },
    { id: 'gone_at', header: t('columns.goneAt'), className: 'whitespace-nowrap tabular-nums', cell: (r) => (r.gone_at ? fmt.date(r.gone_at) : VALEUR_ABSENTE) },
    {
      id: 'public',
      header: t('columns.propertyStatus'),
      cell: (r) => <StatusBadge tone={r.property.public ? 'attention' : 'neutral'} label={r.property.public ? t('stillPublic') : t('notPublic')} />,
    },
  ];

  const natures = data?.natures;
  const totalNatures = natures ? Object.values(natures).reduce((a, b) => a + b, 0) : 0;
  const partIntermediaires = natures && totalNatures > 0 ? natures.probable_intermediary / totalNatures : null;

  const typeOptions = [{ value: ANY, label: t('filters.anyType') }, ...RADAR_PROPERTY_TYPES.map((v) => ({ value: v, label: tTypes(v) }))];
  const contratOptions = [{ value: ANY, label: t('filters.anyContract') }, ...CONTRATS.map((v) => ({ value: v, label: tContrats(v) }))];
  const siteOptions = [{ value: ANY, label: t('filters.anySite') }, ...RADAR_SOURCE_SITES.map((v) => ({ value: v, label: tSites(v) }))];
  const filtrer = (patch: Partial<RadarObservatoryFilters>) => setFiltres((f) => ({ ...f, ...patch }));
  const vide = (titre: string) => <EmptyState title={titre} description={t('emptyHint')} />;

  return (
    <div className="space-y-6">
      <FilterBar
        controlsClassName="sm:grid-cols-2 lg:grid-cols-4"
        onReset={() => setFiltres({})}
        resetLabel={t('filters.reset')}
        resetDisabled={Object.values(filtres).every((v) => v === undefined)}
      >
        <div className="space-y-1">
          <Label htmlFor="radar-observatoire-depuis">{t('filters.since')}</Label>
          <Input
            id="radar-observatoire-depuis"
            type="date"
            className="h-10"
            value={filtres.since ?? ''}
            onChange={(e) => filtrer({ since: e.target.value || undefined })}
          />
        </div>
        {([
          ['contract', t('filters.contractAria'), contratOptions, filtres.contract, (v: string) => filtrer({ contract: estContrat(v) ? v : undefined })],
          ['type', t('filters.typeAria'), typeOptions, filtres.propertyType, (v: string) => filtrer({ propertyType: estType(v) ? v : undefined })],
          ['site', t('filters.siteAria'), siteOptions, filtres.sourceSite, (v: string) => filtrer({ sourceSite: estSite(v) ? v : undefined })],
        ] as const).map(([cle, aria, options, valeur, changer]) => (
          <div key={cle} className="flex items-end">
            <Select value={valeur ?? ANY} onValueChange={(v) => changer(String(v ?? ANY))} items={[...options]}>
              <SelectTrigger className="h-10 w-full" aria-label={aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </FilterBar>

      <DataState
        loading={marche.isLoading}
        error={marche.isError ? messageErreur(marche.error, t('loadError')) : null}
        onRetry={() => void marche.refetch()}
        retryLabel={tCommon('actions.retry')}
        isEmpty={!data}
        skeletonRows={4}
      >
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label={t('stats.listings')} value={fmt.nombre(data?.summary?.listings ?? 0)} hint={t('stats.listingsHint')} icon={<Layers className="size-4" aria-hidden="true" />} />
            <StatCard label={t('stats.online')} value={fmt.nombre(data?.summary?.online ?? 0)} icon={<Eye className="size-4" aria-hidden="true" />} />
            <StatCard label={t('stats.gone')} value={fmt.nombre(data?.summary?.gone ?? 0)} icon={<CircleOff className="size-4" aria-hidden="true" />} />
            <StatCard label={t('stats.inCatalog')} value={fmt.nombre(data?.summary?.in_catalog ?? 0)} icon={<Building2 className="size-4" aria-hidden="true" />} />
            <StatCard
              label={t('stats.intermediaries')}
              value={partIntermediaires === null ? VALEUR_ABSENTE : fmt.nombre(partIntermediaires, { style: 'percent', maximumFractionDigits: 0 })}
              hint={natures ? t('stats.intermediariesHint', { count: totalNatures }) : undefined}
              icon={<UsersRound className="size-4" aria-hidden="true" />}
            />
          </div>

          {natures ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" data-testid="radar-observatoire-natures">
              {RADAR_ADVERTISER_NATURES.map((n) => (
                <li key={n}>{t('natureLine', { nature: tNature(n), count: natures[n] ?? 0 })}</li>
              ))}
            </ul>
          ) : null}

          <Section titre={t('gap.title')} description={t('gap.description')}>
            {data?.supply_gap?.length
              ? <DataTable caption={t('gap.title')} columns={colonnesEcart} rows={data.supply_gap.slice(0, LIGNES_MAX)} rowKey={(r) => r.neighborhood.id} density="compact" />
              : vide(t('gap.empty'))}
          </Section>

          <Section titre={t('price.title')} description={t('price.description')}>
            {data?.price_per_m2?.length
              ? (
                <DataTable
                  caption={t('price.title')}
                  columns={colonnesPrix}
                  rows={data.price_per_m2.slice(0, LIGNES_MAX)}
                  rowKey={(r) => `${r.neighborhood?.id ?? 0}-${r.property_type}-${r.contract}-${r.rent_period}`}
                  density="compact"
                />
              )
              : vide(t('price.empty'))}
          </Section>

          <Section titre={t('time.title')} description={t('time.description', passages)}>
            {data?.time_on_market?.length
              ? (
                <DataTable
                  caption={t('time.title')}
                  columns={colonnesDuree}
                  rows={data.time_on_market.slice(0, LIGNES_MAX)}
                  rowKey={(r) => `${r.neighborhood?.id ?? 0}-${r.property_type}-${r.contract}`}
                  density="compact"
                />
              )
              : vide(t('time.empty'))}
          </Section>

          <Section titre={t('goneSources.title')} description={t('goneSources.description', passages)}>
            {data?.gone_sources?.length
              ? <DataTable caption={t('goneSources.title')} columns={colonnesDisparues} rows={data.gone_sources} rowKey={(r) => r.listing_id} density="compact" />
              : vide(t('goneSources.empty'))}
          </Section>
        </div>
      </DataState>
    </div>
  );
}
