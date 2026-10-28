import { buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { jsonOrThrow } from '@/lib/queries/super-admin-coque';
import type { PaginatedResponse } from '@/types/api';
import type {
  RadarDashboardResponse,
  RadarIntakePayload,
  RadarIntakeResponse,
  RadarDiscardReason,
  RadarDuplicateTarget,
  RadarListingChanges,
  RadarListingDetailResponse,
  RadarListingRow,
  RadarMatchesResponse,
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

/** Tant qu'une extraction ou un calcul d'empreintes tourne, les écrans se relisent à ce rythme. */
export const RADAR_POLL_MS = 10_000;

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
  details: () => [...radarKeys.all, 'detail'] as const,
  detail: (id: number) => [...radarKeys.details(), id] as const,
  matches: (id: number) => [...radarKeys.all, 'matches', id] as const,
  next: (excludeId: number) => [...radarKeys.all, 'next', excludeId] as const,
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

/** TCK-2387 — la fiche complète : source, champs lus, captures (URL signées), annonceur, quartier rattaché. */
export async function fetchRadarListing(id: number): Promise<RadarListingDetailResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/listings/${id}`, { credentials: 'include' });
  return jsonOrThrow<RadarListingDetailResponse>(res);
}

/**
 * TCK-2387 — la correction d'une fiche `extracted` : les seuls champs modifiés, pas la fiche entière
 * (l'API refuse un corps vide, et chaque clé envoyée marque son champ « corrigé »). Rend la fiche relue.
 */
export async function patchRadarListing(id: number, changes: RadarListingChanges): Promise<RadarListingDetailResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/listings/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(changes),
  });
  return jsonOrThrow<RadarListingDetailResponse>(res);
}

/**
 * TCK-2387 — les rapprochements d'une fiche, calculés à l'ouverture. Tant que `photos.status` vaut
 * `pending`, le signal photo peut manquer : l'écran relit toutes les {@link RADAR_POLL_MS} ms.
 */
export async function fetchRadarMatches(id: number): Promise<RadarMatchesResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/listings/${id}/matches`, { credentials: 'include' });
  return jsonOrThrow<RadarMatchesResponse>(res);
}

/** Le chemin vient de {@link cheminApi} chez l'appelant : un segment `/…` passé en valeur serait refusé. */
async function envoyer(chemin: string, method: 'POST' | 'PUT', body?: unknown): Promise<RadarListingDetailResponse> {
  const res = await fetch(chemin, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return jsonOrThrow<RadarListingDetailResponse>(res);
}

/** Valider : décide la suggestion (`accepted` ou `edited`) et fige les rapprochements. */
export function reviewRadarListing(id: number): Promise<RadarListingDetailResponse> {
  return envoyer(cheminApi`/api/super-admin/radar/listings/${id}/review`, 'POST');
}

/** « Doublon de » : exactement une cible, une annonce OU un bien. */
export function markRadarListingDuplicate(id: number, target: RadarDuplicateTarget): Promise<RadarListingDetailResponse> {
  return envoyer(cheminApi`/api/super-admin/radar/listings/${id}/duplicate`, 'POST', target.of_listing_id !== undefined
    ? { of_listing_id: target.of_listing_id }
    : { of_property_id: target.of_property_id });
}

export function discardRadarListing(id: number, reason: RadarDiscardReason): Promise<RadarListingDetailResponse> {
  return envoyer(cheminApi`/api/super-admin/radar/listings/${id}/discard`, 'POST', { reason });
}

/** AC6 : rattacher l'annonce à un numéro qu'elle a lu (retenu ou écarté). */
export function setRadarListingAdvertiser(id: number, phone: string): Promise<RadarListingDetailResponse> {
  return envoyer(cheminApi`/api/super-admin/radar/listings/${id}/advertiser`, 'PUT', { phone });
}

/**
 * La prochaine fiche à relire : la plus ancienne `extracted`, hors celle-ci (qui peut encore l'être au
 * moment de la lecture, la liste étant relue avant l'écriture du geste). `null` : plus rien à relire.
 */
export async function fetchNextRadarListingId(excludeId: number): Promise<number | null> {
  const qs = buildQueryString({
    fields: { radar_listings: ['id'] },
    filter: { stage: 'extracted' },
    sort: 'created_at',
    page: 1,
    per_page: 2,
  });
  const res = await fetch(cheminApi`/api/super-admin/radar/listings${requete(qs)}`, { credentials: 'include' });
  const liste = await jsonOrThrow<PaginatedResponse<Pick<RadarListingRow, 'id'>>>(res);
  return liste.data.find((row) => row.id !== excludeId)?.id ?? null;
}
