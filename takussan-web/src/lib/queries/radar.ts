import { buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { jsonOrThrow } from '@/lib/queries/super-admin-coque';
import type { PaginatedResponse } from '@/types/api';
import type {
  RadarDashboardResponse,
  RadarIntakePayload,
  RadarIntakeResponse,
  RadarListingRow,
  RadarListingStage,
} from '@/types/radar';

/**
 * TCK-2386 (ADR-0077) — le Radar, côté console.
 *
 * Comme le reste de la console, les appels passent par le BFF same-origin `/api/super-admin/*`
 * (`src/app/api/super-admin/[...path]/route.ts`), qui lit le cookie httpOnly et appelle
 * `/api/admin/radar/*` sur Laravel. Geste `platform.radar.operate` (support et au-dessus).
 */

/** Les colonnes de la liste de travail — `extracted` pour le titre, le prix et le quartier. */
export const RADAR_LISTING_FIELDS = [
  'id',
  'source_kind',
  'source_site',
  'source_url',
  'extracted',
  'stage',
  'stage_reason',
  'created_at',
] as const;

export interface RadarListingFilters {
  readonly stage?: RadarListingStage;
  readonly page?: number;
  readonly perPage?: number;
}

export const radarKeys = {
  all: ['super-admin', 'radar'] as const,
  dashboard: () => [...radarKeys.all, 'dashboard'] as const,
  lists: () => [...radarKeys.all, 'list'] as const,
  list: (filters: RadarListingFilters) => [...radarKeys.lists(), filters] as const,
};

export async function fetchRadarDashboard(): Promise<RadarDashboardResponse> {
  const res = await fetch('/api/super-admin/radar/dashboard', { credentials: 'include' });
  return jsonOrThrow<RadarDashboardResponse>(res);
}

/** `sort=-created_at` : la plus récente en tête, ce qui vient d'être saisi se voit d'abord. */
export async function fetchRadarListings(
  filters: RadarListingFilters = {},
): Promise<PaginatedResponse<RadarListingRow>> {
  const qs = buildQueryString({
    fields: { radar_listings: RADAR_LISTING_FIELDS },
    filter: { stage: filters.stage },
    sort: '-created_at',
    page: filters.page ?? 1,
    per_page: filters.perPage ?? 25,
  });
  const res = await fetch(cheminApi`/api/super-admin/radar/listings${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<PaginatedResponse<RadarListingRow>>(res);
}

/**
 * La saisie rapide. URL et texte partent en JSON ; les captures en multipart (`captures[]`), que
 * le relais transporte en octets. `source_site` n'accompagne jamais des URL : l'API le refuse (422),
 * le site s'y déduit de l'hôte.
 */
export async function postRadarListings(payload: RadarIntakePayload): Promise<RadarIntakeResponse> {
  let init: RequestInit;
  if (payload.kind === 'captures') {
    const form = new FormData();
    for (const file of payload.files) form.append('captures[]', file);
    if (payload.sourceSite) form.append('source_site', payload.sourceSite);
    init = { method: 'POST', body: form, headers: { Accept: 'application/json' } };
  } else {
    const body = payload.kind === 'urls'
      ? { urls: payload.urls }
      : { text: payload.text, ...(payload.sourceSite ? { source_site: payload.sourceSite } : {}) };
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    };
  }
  const res = await fetch('/api/super-admin/radar/listings', { ...init, credentials: 'include' });
  return jsonOrThrow<RadarIntakeResponse>(res);
}
