import { buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { jsonOrThrow } from '@/lib/queries/super-admin-coque';
import type { PaginatedResponse } from '@/types/api';
import type {
  RadarAccountReleaseResponse,
  RadarAdvertiserQueue,
  RadarAdvertiserResponse,
  RadarAdvertiserRow,
  RadarClaimResponse,
  RadarCrawlRun,
  RadarCrawlRunResponse,
  RadarCrawlSourceChanges,
  RadarCrawlSourceResponse,
  RadarCrawlSourcesResponse,
  RadarConsent,
  RadarOutcomeRequest,
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
  RadarOutreachChanges,
  RadarOutreachResponse,
  RadarMessageLocale,
  RadarPrepareRequest,
  RadarPreparedOutreachResponse,
  RadarPublicationPreviewResponse,
  RadarPublicationResponse,
  RadarPublishedMessageResponse,
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

/**
 * Les colonnes d'une ligne de file demandées au sparse fieldset (`RadarAdvertiser::$queryFields`). La prise en charge
 * n'en est pas une : l'API lit ses colonnes d'elle-même et rend `claim` quand même.
 */
export const RADAR_ADVERTISER_FIELDS = ['id', 'phone', 'display_name', 'nature', 'do_not_contact_at'] as const;

export interface RadarAdvertiserFilters {
  readonly queue: RadarAdvertiserQueue;
  readonly search?: string;
  readonly page?: number;
  readonly perPage?: number;
}

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
  advertisers: () => [...radarKeys.all, 'advertiser'] as const,
  advertiser: (id: number) => [...radarKeys.advertisers(), id] as const,
  advertiserLists: () => [...radarKeys.advertisers(), 'list'] as const,
  advertiserList: (filters: RadarAdvertiserFilters) => [...radarKeys.advertiserLists(), filters] as const,
  publication: (advertiserId: number) => [...radarKeys.all, 'publication', advertiserId] as const,
  crawlSources: () => [...radarKeys.all, 'crawl', 'sources'] as const,
  crawlRuns: (page: number) => [...radarKeys.all, 'crawl', 'runs', page] as const,
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

// ─── L'annonceur et son message d'accord (TCK-2388) ──────────────────────────────────────────

const JSON_ACCEPT = { 'Content-Type': 'application/json', Accept: 'application/json' } as const;

/** La fiche annonceur : identité, annonces (hors purgées), messages du plus récent au plus ancien, prise en charge. */
export async function fetchRadarAdvertiser(id: number): Promise<RadarAdvertiserResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/advertisers/${id}`, { credentials: 'include' });
  return jsonOrThrow<RadarAdvertiserResponse>(res);
}

/** Prendre l'annonceur en charge : l'API refuse (409) s'il est tenu par un autre. Rend la prise. */
export async function claimRadarAdvertiser(id: number): Promise<RadarClaimResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/advertisers/${id}/claim`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return jsonOrThrow<RadarClaimResponse>(res);
}

/**
 * Rendre la prise. L'API répond 204 SANS corps : `jsonOrThrow` lirait un JSON qui n'existe pas, la réponse
 * est donc jugée ici — un échec porte son `{code, params}` comme partout.
 */
export async function releaseRadarAdvertiser(id: number): Promise<void> {
  const res = await fetch(cheminApi`/api/super-admin/radar/advertisers/${id}/claim`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) await jsonOrThrow<unknown>(res);
}

/**
 * TCK-2413 — délier l'annonceur du compte supprimé que le Radar avait créé : il peut de nouveau réclamer ses annonces.
 * `platform.radar.publish` ; refusé (409) sur un annonceur révoqué ou dont le compte n'est pas supprimé. Le motif part s'il est écrit.
 */
export async function releaseRadarAdvertiserAccount(
  id: number,
  reason: string,
): Promise<RadarAccountReleaseResponse> {
  const motif = reason.trim();
  const res = await fetch(cheminApi`/api/super-admin/radar/advertisers/${id}/release-account`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_ACCEPT,
    body: JSON.stringify(motif ? { reason: motif } : {}),
  });
  return jsonOrThrow<RadarAccountReleaseResponse>(res);
}

/** Préparer un message : l'API compose le texte (clauses figées + salutation et résumé que l'IA rédige). */
export async function prepareRadarOutreach(
  advertiserId: number,
  request: RadarPrepareRequest,
): Promise<RadarPreparedOutreachResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/outreaches`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_ACCEPT,
    body: JSON.stringify(request),
  });
  return jsonOrThrow<RadarPreparedOutreachResponse>(res);
}

/** Retoucher la salutation et/ou le résumé : les seules parties modifiées. Rend le message RELU, texte compris. */
export async function retouchRadarOutreach(id: number, changes: RadarOutreachChanges): Promise<RadarOutreachResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/outreaches/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: JSON_ACCEPT,
    body: JSON.stringify(changes),
  });
  return jsonOrThrow<RadarOutreachResponse>(res);
}

/** « J'ai envoyé le message » : le message passe `sent`, les annonces `contacted`. */
export async function markRadarOutreachSent(id: number): Promise<RadarOutreachResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/outreaches/${id}/sent`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return jsonOrThrow<RadarOutreachResponse>(res);
}

/**
 * Les files du démarchage : `filter[queue]` (à contacter, en attente, à relancer), `filter[search]` (nom ou numéro,
 * écrit comme on veut). Le message ouvert (`follow_up`, avec son échéance `due_at`) et les comptes par étape sont
 * calculés par l'API.
 */
export async function fetchRadarAdvertisers(filters: RadarAdvertiserFilters): Promise<PaginatedResponse<RadarAdvertiserRow>> {
  const search = filters.search?.trim();
  const qs = buildQueryString({
    fields: { radar_advertisers: RADAR_ADVERTISER_FIELDS },
    filter: { queue: filters.queue, search: search || undefined },
    page: filters.page ?? 1,
    per_page: filters.perPage ?? 25,
  });
  const res = await fetch(cheminApi`/api/super-admin/radar/advertisers${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<PaginatedResponse<RadarAdvertiserRow>>(res);
}

/**
 * Déposer la réponse d'un annonceur : les captures de la conversation, en multipart (`captures[]`, comme la saisie ;
 * le relais transporte les octets). L'API rend la réponse (201), vérifiée en file : `verification_status` vaut `pending`.
 */
export async function depositRadarReply(outreachId: number, files: readonly File[]): Promise<{ readonly data: RadarConsent }> {
  const form = new FormData();
  for (const file of files) form.append('captures[]', file);
  const res = await fetch(cheminApi`/api/super-admin/radar/outreaches/${outreachId}/reply`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    body: form,
  });
  return jsonOrThrow<{ readonly data: RadarConsent }>(res);
}

/**
 * L'issue d'un message : le seul geste qui CONFIRME une réponse. Le motif n'est envoyé que s'il est écrit ; l'API
 * l'exige (422 `radar.consent.reason_required`) pour un accord que le verdict ne soutient pas. Rend le message relu.
 */
export async function recordRadarOutcome(outreachId: number, request: RadarOutcomeRequest): Promise<RadarOutreachResponse> {
  const reason = request.reason?.trim();
  const res = await fetch(cheminApi`/api/super-admin/radar/outreaches/${outreachId}/outcome`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_ACCEPT,
    body: JSON.stringify({ outcome: request.outcome, ...(reason ? { reason } : {}) }),
  });
  return jsonOrThrow<RadarOutreachResponse>(res);
}

// ─── « Publier pour lui » (TCK-2389) ─────────────────────────────────────────────────────────
// Le geste de publier est `platform.radar.publish` (`super_admin`) ; la réserve de photos reste `platform.radar.operate`.

/**
 * L'aperçu de la publication : le compte qui serait créé, les annonces couvertes par un accord valide, leurs photos,
 * ce qui bloque. Il n'écrit rien ; il se relit tant qu'une préparation de photos tourne.
 */
export async function fetchRadarPublicationPreview(advertiserId: number): Promise<RadarPublicationPreviewResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/publication-preview`, { credentials: 'include' });
  return jsonOrThrow<RadarPublicationPreviewResponse>(res);
}

/**
 * Publier les annonces cochées. `cleIdempotence` part dans `Idempotency-Key` (ADR-0072) : l'appelant en garde UNE par
 * ouverture de la confirmation et la réutilise sur réessai ; rejouée, la requête rend le résultat de la première
 * (un seul compte, un seul bien par annonce). Le relais BFF transmet l'en-tête.
 */
export async function publishRadarAdvertiser(
  advertiserId: number,
  listingIds: readonly number[],
  cleIdempotence: string,
): Promise<RadarPublicationResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/publish`, {
    method: 'POST',
    credentials: 'include',
    headers: { ...JSON_ACCEPT, 'Idempotency-Key': cleIdempotence },
    body: JSON.stringify({ listing_ids: [...listingIds] }),
  });
  return jsonOrThrow<RadarPublicationResponse>(res);
}

/** Le second message (« vos annonces sont en ligne… ») et son lien `wa.me`, dans la langue demandée. */
export async function fetchRadarPublishedMessage(
  advertiserId: number,
  locale: RadarMessageLocale,
): Promise<RadarPublishedMessageResponse> {
  const qs = new URLSearchParams({ locale });
  const res = await fetch(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/published-message${requete(qs)}`, {
    credentials: 'include',
  });
  return jsonOrThrow<RadarPublishedMessageResponse>(res);
}

/** « Récupérer les photos de la source » : remet la lecture en file (202). La fiche se relit ensuite. */
export async function refetchRadarListingPhotos(listingId: number): Promise<RadarListingDetailResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/listings/${listingId}/photos/fetch`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return jsonOrThrow<RadarListingDetailResponse>(res);
}

/** Déposer des photos à la main dans la réserve : multipart (`photos[]`), au plus `RADAR_PHOTOS_PAR_ENVOI_MAX` par envoi. */
export async function uploadRadarListingPhotos(listingId: number, files: readonly File[]): Promise<RadarListingDetailResponse> {
  const form = new FormData();
  for (const file of files) form.append('photos[]', file);
  const res = await fetch(cheminApi`/api/super-admin/radar/listings/${listingId}/photos`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    body: form,
  });
  return jsonOrThrow<RadarListingDetailResponse>(res);
}

/** Retirer une photo de la réserve. L'API répond 204 SANS corps : un échec porte son `{code, params}`. */
export async function deleteRadarListingPhoto(listingId: number, mediaId: number): Promise<void> {
  const res = await fetch(cheminApi`/api/super-admin/radar/listings/${listingId}/photos/${mediaId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) await jsonOrThrow<unknown>(res);
}

// ─── Collecte automatique (TCK-2392) ─────────────────────────────────────────────────────────

/** Les colonnes d'un site collecté (`RadarCrawlSource::$queryFields`), et son opérateur (`include=operator`). */
export const RADAR_CRAWL_SOURCE_FIELDS = ['id', 'site', 'enabled', 'frequency_minutes', 'max_pages', 'operator_id', 'enabled_at'] as const;

/** Les colonnes d'un passage (`RadarCrawlRun::$queryFields`). */
export const RADAR_CRAWL_RUN_FIELDS = [
  'id',
  'site',
  'trigger',
  'status',
  'started_at',
  'finished_at',
  'pages_read',
  'cards_seen',
  'listings_created',
  'listings_known',
  'snapshots_opened',
  'reached_end',
  'stop_reason',
  'created_at',
] as const;

export async function fetchRadarCrawlSources(): Promise<RadarCrawlSourcesResponse> {
  const qs = buildQueryString({
    fields: { radar_crawl_sources: RADAR_CRAWL_SOURCE_FIELDS, users: ['id', 'first_name', 'last_name', 'username'] },
    include: 'operator',
  });
  const res = await fetch(cheminApi`/api/super-admin/radar/crawl/sources${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<RadarCrawlSourcesResponse>(res);
}

/** `sort=-created_at` : le dernier passage en tête. */
export async function fetchRadarCrawlRuns(page = 1, perPage = 20): Promise<PaginatedResponse<RadarCrawlRun>> {
  const qs = buildQueryString({
    fields: { radar_crawl_runs: RADAR_CRAWL_RUN_FIELDS },
    sort: '-created_at',
    page,
    per_page: perPage,
  });
  const res = await fetch(cheminApi`/api/super-admin/radar/crawl/runs${requete(qs)}`, { credentials: 'include' });
  return jsonOrThrow<PaginatedResponse<RadarCrawlRun>>(res);
}

/** Allumer, éteindre, régler un site (`super_admin`). Allumer en fait l'opérateur de celui qui l'allume. */
export async function patchRadarCrawlSource(site: string, changes: RadarCrawlSourceChanges): Promise<RadarCrawlSourceResponse> {
  const qs = buildQueryString({ include: 'operator' });
  const res = await fetch(cheminApi`/api/super-admin/radar/crawl/sources/${site}${requete(qs)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(changes),
  });
  return jsonOrThrow<RadarCrawlSourceResponse>(res);
}

/** Lancer un passage maintenant (202) ; 409 `radar.crawl.active` si un passage tourne déjà sur ce site. */
export async function startRadarCrawlRun(site: string): Promise<RadarCrawlRunResponse> {
  const res = await fetch(cheminApi`/api/super-admin/radar/crawl/sources/${site}/run`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  return jsonOrThrow<RadarCrawlRunResponse>(res);
}

/** Séparer une fusion AUTOMATIQUE : l'annonce revient à relire ; 409 `radar.merge.not_automatic` pour un doublon posé à la main. */
export function unmergeRadarListing(id: number): Promise<RadarListingDetailResponse> {
  return envoyer(cheminApi`/api/super-admin/radar/listings/${id}/unmerge`, 'POST');
}
