import { buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { radarKeys } from '@/lib/queries/radar';
import { jsonOrThrow } from '@/lib/queries/super-admin-coque';
import type { PaginatedResponse } from '@/types/api';
import type {
  RadarNatureHistoryFilters,
  RadarObservatoryFilters,
  RadarObservatoryResponse,
  RadarObservatorySection,
  RadarRankingFilters,
  RadarRankingRow,
} from '@/types/radar-observatoire';

/**
 * TCK-2393 (ADR-0083) — l'observatoire du marché et le classement des annonceurs, par le BFF `/api/super-admin/*` qui
 * appelle `/api/admin/radar/observatory*`. Geste `platform.radar.operate`. Les filtres partent à l'API : rien ne se filtre
 * sur une liste déjà reçue.
 */

/** Les colonnes de l'annonceur que la ligne du classement affiche (`RadarAdvertiser::$queryFields`). */
export const RADAR_RANKING_FIELDS = ['id', 'display_name', 'phone', 'nature'] as const;

/**
 * Les sections que l'onglet « Marché » affiche. `fields[radar_observatory]` est inerte pour `HasQueryBuilder` (aucune table de
 * ce nom) : ce sont les sections, lues par `RadarObservatoryRequest`, et l'API ne calcule que celles-là.
 */
export const RADAR_MARKET_SECTIONS: readonly RadarObservatorySection[] = [
  'summary', 'price_per_m2', 'time_on_market', 'supply_gap', 'natures', 'gone_sources',
];

export const radarObservatoireKeys = {
  all: () => [...radarKeys.all, 'observatory'] as const,
  market: (filters: RadarObservatoryFilters) => [...radarObservatoireKeys.all(), 'market', filters] as const,
  ranking: (filters: RadarRankingFilters) => [...radarObservatoireKeys.all(), 'ranking', filters] as const,
  natureHistory: (filters: RadarNatureHistoryFilters) => [...radarObservatoireKeys.all(), 'nature-history', filters] as const,
};

export async function fetchRadarObservatory(filters: RadarObservatoryFilters = {}): Promise<RadarObservatoryResponse> {
  const qs = buildQueryString({
    fields: { radar_observatory: RADAR_MARKET_SECTIONS },
    filter: {
      since: filters.since,
      contract: filters.contract,
      property_type: filters.propertyType,
      source_site: filters.sourceSite,
    },
  });
  const res = await fetch(cheminApi`/api/super-admin/radar/observatory${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<RadarObservatoryResponse>(res);
}

/**
 * TCK-2431 — la part par nature sur une période : la seule section `nature_history`, bornée par `filter[since]` et
 * `filter[until]` (que les autres sections ignorent). Une requête à part : changer la période ne recalcule pas le marché.
 */
export async function fetchRadarNatureHistory(filters: RadarNatureHistoryFilters = {}): Promise<RadarObservatoryResponse> {
  const qs = buildQueryString({
    fields: { radar_observatory: ['nature_history'] },
    filter: { since: filters.since, until: filters.until },
  });
  const res = await fetch(cheminApi`/api/super-admin/radar/observatory${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<RadarObservatoryResponse>(res);
}

/** Le classement : par volume d'annonces vivantes (`sort=-listings_count`), le plus gros en tête. */
export async function fetchRadarRanking(filters: RadarRankingFilters = {}): Promise<PaginatedResponse<RadarRankingRow>> {
  const qs = buildQueryString({
    fields: { radar_advertisers: RADAR_RANKING_FIELDS },
    filter: { nature: filters.nature, search: filters.search },
    sort: '-listings_count',
    page: filters.page ?? 1,
    per_page: filters.perPage ?? 25,
  });
  const res = await fetch(cheminApi`/api/super-admin/radar/observatory/advertisers${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<PaginatedResponse<RadarRankingRow>>(res);
}
