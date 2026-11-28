import { buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { appelBff } from '@/lib/bff';
import type { PaginatedResponse } from '@/types/api';
import type {
  RadarAccountReleaseResponse,
  RadarActivationReminderResponse,
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
  RadarTarget,
  RadarTargetChanges,
  RadarTargetCreation,
  RadarTargetListingRow,
  RadarTargetOrigin,
  RadarTargetResponse,
  RadarTargetStatus,
  RadarDemandSettingResponse,
  RadarTargetRevision,
  RadarTargetRevisionResponse,
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
 * TCK-2426 — tant qu'un message envoyé par l'API attend son issue, la fiche annonceur se relit à ce rythme : la réponse
 * arrive par le webhook de Meta, et rien d'autre ne la signale à l'écran. Plus lent que {@link RADAR_POLL_MS} : on attend
 * un humain, pas une file.
 */
export const RADAR_REPLY_POLL_MS = 30_000;

/**
 * TCK-2426 — la relecture à {@link RADAR_REPLY_POLL_MS} ne dure pas plus que cette fenêtre, ouverte à l'arrivée sur la
 * fiche, au retour sur l'onglet et à chaque envoi par l'API : une page oubliée ouverte ne relit pas la fiche pendant des
 * jours.
 */
export const RADAR_REPLY_WINDOW_MS = 15 * 60_000;

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

/** TCK-2469 — les filtres de la liste des cibles (`filter[status]`, `filter[origin]`). */
export interface RadarTargetFilters {
  readonly status?: RadarTargetStatus;
  readonly origin?: RadarTargetOrigin;
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
  activation: (advertiserId: number, locale: RadarMessageLocale) => [...radarKeys.advertiser(advertiserId), 'activation', locale] as const,
  targets: () => [...radarKeys.all, 'target'] as const,
  targetLists: () => [...radarKeys.targets(), 'list'] as const,
  targetList: (filters: RadarTargetFilters) => [...radarKeys.targetLists(), filters] as const,
  target: (id: number) => [...radarKeys.targets(), id] as const,
  targetListings: (id: number, page: number) => [...radarKeys.target(id), 'listings', page] as const,
  // TCK-2470 — sous `targets()` : invalider les cibles relit aussi l'historique de leurs révisions.
  targetRevisions: (page: number) => [...radarKeys.targets(), 'revisions', page] as const,
  demand: () => [...radarKeys.all, 'demand'] as const,
};

export async function fetchRadarDashboard(): Promise<RadarDashboardResponse> {
  return appelBff<RadarDashboardResponse>('/api/super-admin/radar/dashboard');
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
  return appelBff<PaginatedResponse<RadarListingRow>>(cheminApi`/api/super-admin/radar/listings${requete(qs)}`);
}

/**
 * La saisie rapide. URL et texte partent en JSON ; les captures en multipart (`captures[]`), que
 * le relais transporte en octets. `source_site` n'accompagne jamais des URL : l'API le refuse (422),
 * le site s'y déduit de l'hôte.
 */
export async function postRadarListings(payload: RadarIntakePayload): Promise<RadarIntakeResponse> {
  let body: FormData | object;
  if (payload.kind === 'captures') {
    const form = new FormData();
    for (const file of payload.files) form.append('captures[]', file);
    if (payload.sourceSite) form.append('source_site', payload.sourceSite);
    body = form;
  } else {
    body = payload.kind === 'urls'
      ? { urls: payload.urls }
      : { text: payload.text, ...(payload.sourceSite ? { source_site: payload.sourceSite } : {}) };
  }
  return appelBff<RadarIntakeResponse>('/api/super-admin/radar/listings', { method: 'POST', body });
}

/** TCK-2387 — la fiche complète : source, champs lus, captures (URL signées), annonceur, quartier rattaché. */
export async function fetchRadarListing(id: number): Promise<RadarListingDetailResponse> {
  return appelBff<RadarListingDetailResponse>(cheminApi`/api/super-admin/radar/listings/${id}`);
}

/**
 * TCK-2387 — la correction d'une fiche `extracted` : les seuls champs modifiés, pas la fiche entière
 * (l'API refuse un corps vide, et chaque clé envoyée marque son champ « corrigé »). Rend la fiche relue.
 */
export async function patchRadarListing(id: number, changes: RadarListingChanges): Promise<RadarListingDetailResponse> {
  return appelBff<RadarListingDetailResponse>(cheminApi`/api/super-admin/radar/listings/${id}`, { method: 'PATCH', body: changes });
}

/**
 * TCK-2387 — les rapprochements d'une fiche, calculés à l'ouverture. Tant que `photos.status` vaut
 * `pending`, le signal photo peut manquer : l'écran relit toutes les {@link RADAR_POLL_MS} ms.
 */
export async function fetchRadarMatches(id: number): Promise<RadarMatchesResponse> {
  return appelBff<RadarMatchesResponse>(cheminApi`/api/super-admin/radar/listings/${id}/matches`);
}

/** Le chemin vient de {@link cheminApi} chez l'appelant : un segment `/…` passé en valeur serait refusé. */
async function envoyer(chemin: string, method: 'POST' | 'PUT', body?: unknown): Promise<RadarListingDetailResponse> {
  return appelBff<RadarListingDetailResponse>(chemin, { method, body });
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
  const liste = await appelBff<PaginatedResponse<Pick<RadarListingRow, 'id'>>>(cheminApi`/api/super-admin/radar/listings${requete(qs)}`);
  return liste.data.find((row) => row.id !== excludeId)?.id ?? null;
}

// ─── L'annonceur et son message d'accord (TCK-2388) ──────────────────────────────────────────

/** La fiche annonceur : identité, annonces (hors purgées), messages du plus récent au plus ancien, prise en charge. */
export async function fetchRadarAdvertiser(id: number): Promise<RadarAdvertiserResponse> {
  return appelBff<RadarAdvertiserResponse>(cheminApi`/api/super-admin/radar/advertisers/${id}`);
}

/** Prendre l'annonceur en charge : l'API refuse (409) s'il est tenu par un autre. Rend la prise. */
export async function claimRadarAdvertiser(id: number): Promise<RadarClaimResponse> {
  return appelBff<RadarClaimResponse>(cheminApi`/api/super-admin/radar/advertisers/${id}/claim`, { method: 'POST' });
}

/** Rendre la prise. L'API répond 204 SANS corps ; un échec porte son `{code, params}` comme partout. */
export async function releaseRadarAdvertiser(id: number): Promise<void> {
  await appelBff<null>(cheminApi`/api/super-admin/radar/advertisers/${id}/claim`, { method: 'DELETE' });
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
  return appelBff<RadarAccountReleaseResponse>(cheminApi`/api/super-admin/radar/advertisers/${id}/release-account`, { method: 'POST', body: motif ? { reason: motif } : {} });
}

/** Préparer un message : l'API compose le texte (clauses figées + salutation et résumé que l'IA rédige). */
export async function prepareRadarOutreach(
  advertiserId: number,
  request: RadarPrepareRequest,
): Promise<RadarPreparedOutreachResponse> {
  return appelBff<RadarPreparedOutreachResponse>(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/outreaches`, { method: 'POST', body: request });
}

/** Retoucher la salutation et/ou le résumé : les seules parties modifiées. Rend le message RELU, texte compris. */
export async function retouchRadarOutreach(id: number, changes: RadarOutreachChanges): Promise<RadarOutreachResponse> {
  return appelBff<RadarOutreachResponse>(cheminApi`/api/super-admin/radar/outreaches/${id}`, { method: 'PATCH', body: changes });
}

/** « J'ai envoyé le message » : le message passe `sent`, les annonces `contacted`. */
export async function markRadarOutreachSent(id: number): Promise<RadarOutreachResponse> {
  return appelBff<RadarOutreachResponse>(cheminApi`/api/super-admin/radar/outreaches/${id}/sent`, { method: 'POST' });
}

/**
 * TCK-2426 (TCK-2395) — « Envoyer par l'API » : le message part du numéro WhatsApp du Radar, et l'API le rend envoyé
 * (`channel = whatsapp_cloud`, `provider_status`). Synchrone : la réponse arrive après celle de Meta. Un refus porte son
 * code (`radar.whatsapp.*`, `radar.outreach.reply_pending`) ; 502 `radar.whatsapp.send_failed` : rien n'est écrit.
 */
export async function sendRadarOutreach(id: number): Promise<RadarOutreachResponse> {
  return appelBff<RadarOutreachResponse>(cheminApi`/api/super-admin/radar/outreaches/${id}/send`, { method: 'POST' });
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
  return appelBff<PaginatedResponse<RadarAdvertiserRow>>(cheminApi`/api/super-admin/radar/advertisers${requete(qs)}`);
}

/**
 * Déposer la réponse d'un annonceur : les captures de la conversation, en multipart (`captures[]`, comme la saisie ;
 * le relais transporte les octets). L'API rend la réponse (201), vérifiée en file : `verification_status` vaut `pending`.
 */
export async function depositRadarReply(outreachId: number, files: readonly File[]): Promise<{ readonly data: RadarConsent }> {
  const form = new FormData();
  for (const file of files) form.append('captures[]', file);
  return appelBff<{ readonly data: RadarConsent }>(cheminApi`/api/super-admin/radar/outreaches/${outreachId}/reply`, { method: 'POST', body: form });
}

/**
 * L'issue d'un message : le seul geste qui CONFIRME une réponse. Le motif n'est envoyé que s'il est écrit ; l'API
 * l'exige (422 `radar.consent.reason_required`) pour un accord que le verdict ne soutient pas. Rend le message relu.
 */
export async function recordRadarOutcome(outreachId: number, request: RadarOutcomeRequest): Promise<RadarOutreachResponse> {
  const reason = request.reason?.trim();
  return appelBff<RadarOutreachResponse>(cheminApi`/api/super-admin/radar/outreaches/${outreachId}/outcome`, { method: 'POST', body: { outcome: request.outcome, ...(reason ? { reason } : {}) } });
}

// ─── « Publier pour lui » (TCK-2389) ─────────────────────────────────────────────────────────
// Le geste de publier est `platform.radar.publish` (`super_admin`) ; la réserve de photos reste `platform.radar.operate`.

/**
 * L'aperçu de la publication : le compte qui serait créé, les annonces couvertes par un accord valide, leurs photos,
 * ce qui bloque. Il n'écrit rien ; il se relit tant qu'une préparation de photos tourne.
 */
export async function fetchRadarPublicationPreview(advertiserId: number): Promise<RadarPublicationPreviewResponse> {
  return appelBff<RadarPublicationPreviewResponse>(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/publication-preview`);
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
  return appelBff<RadarPublicationResponse>(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/publish`, { method: 'POST', cleIdempotence: cleIdempotence, body: { listing_ids: [...listingIds] } });
}

/**
 * TCK-2394 (ADR-0079, proposé) — publier sous mandat Takussan : les mêmes annonces, la même clé d'idempotence par
 * ouverture de la confirmation, mais aucun compte : les biens naissent dans l'espace des mandats. Refusé (422
 * `radar.mandate.disabled`) tant que le drapeau `radar_mandate` est éteint.
 */
export async function publishRadarAdvertiserUnderMandate(
  advertiserId: number,
  listingIds: readonly number[],
  cleIdempotence: string,
): Promise<RadarPublicationResponse> {
  return appelBff<RadarPublicationResponse>(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/publish-mandate`, { method: 'POST', cleIdempotence: cleIdempotence, body: { listing_ids: [...listingIds] } });
}

/** Le second message (« vos annonces sont en ligne… ») et son lien `wa.me`, dans la langue demandée. */
export async function fetchRadarPublishedMessage(
  advertiserId: number,
  locale: RadarMessageLocale,
): Promise<RadarPublishedMessageResponse> {
  const qs = new URLSearchParams({ locale });
  return appelBff<RadarPublishedMessageResponse>(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/published-message${requete(qs)}`);
}

/** « Récupérer les photos de la source » : remet la lecture en file (202). La fiche se relit ensuite. */
export async function refetchRadarListingPhotos(listingId: number): Promise<RadarListingDetailResponse> {
  return appelBff<RadarListingDetailResponse>(cheminApi`/api/super-admin/radar/listings/${listingId}/photos/fetch`, { method: 'POST' });
}

/** Déposer des photos à la main dans la réserve : multipart (`photos[]`), au plus `RADAR_PHOTOS_PAR_ENVOI_MAX` par envoi. */
export async function uploadRadarListingPhotos(listingId: number, files: readonly File[]): Promise<RadarListingDetailResponse> {
  const form = new FormData();
  for (const file of files) form.append('photos[]', file);
  return appelBff<RadarListingDetailResponse>(cheminApi`/api/super-admin/radar/listings/${listingId}/photos`, { method: 'POST', body: form });
}

/** Retirer une photo de la réserve. L'API répond 204 SANS corps : un échec porte son `{code, params}`. */
export async function deleteRadarListingPhoto(listingId: number, mediaId: number): Promise<void> {
  await appelBff<null>(cheminApi`/api/super-admin/radar/listings/${listingId}/photos/${mediaId}`, { method: 'DELETE' });
}

// ─── Collecte automatique (TCK-2392) ─────────────────────────────────────────────────────────

/** Les colonnes d'un site collecté (`RadarCrawlSource::$queryFields`), et son opérateur (`include=operator`). */
export const RADAR_CRAWL_SOURCE_FIELDS = [
  'id',
  'site',
  'enabled',
  'frequency_minutes',
  'max_pages',
  'operator_id',
  'enabled_at',
  // TCK-2438 — avec `site`, la ressource rend aussi `default_start_url` et `start_hosts`.
  'start_urls',
  // TCK-2469 — la portée (`targeted` | `all`, TCK-2468).
  'scope',
  // TCK-2467 — la découverte effective (`lists` | `sitemap`) ; `sitemap_available` vient avec `site`.
  'discovery',
] as const;

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
  // TCK-2469 — les cartes qu'une source ciblée a laissées (TCK-2468).
  'cards_skipped',
  'reached_end',
  'stop_reason',
  'created_at',
] as const;

export async function fetchRadarCrawlSources(): Promise<RadarCrawlSourcesResponse> {
  const qs = buildQueryString({
    fields: { radar_crawl_sources: RADAR_CRAWL_SOURCE_FIELDS, users: ['id', 'first_name', 'last_name', 'username'] },
    include: 'operator',
  });
  return appelBff<RadarCrawlSourcesResponse>(cheminApi`/api/super-admin/radar/crawl/sources${requete(qs)}`);
}

/** `sort=-created_at` : le dernier passage en tête. */
export async function fetchRadarCrawlRuns(page = 1, perPage = 20): Promise<PaginatedResponse<RadarCrawlRun>> {
  const qs = buildQueryString({
    fields: { radar_crawl_runs: RADAR_CRAWL_RUN_FIELDS },
    sort: '-created_at',
    page,
    per_page: perPage,
  });
  return appelBff<PaginatedResponse<RadarCrawlRun>>(cheminApi`/api/super-admin/radar/crawl/runs${requete(qs)}`);
}

/** Allumer, éteindre, régler un site (`super_admin`). Allumer en fait l'opérateur de celui qui l'allume. */
export async function patchRadarCrawlSource(site: string, changes: RadarCrawlSourceChanges): Promise<RadarCrawlSourceResponse> {
  const qs = buildQueryString({ include: 'operator' });
  return appelBff<RadarCrawlSourceResponse>(cheminApi`/api/super-admin/radar/crawl/sources/${site}${requete(qs)}`, { method: 'PATCH', body: changes });
}

/** Lancer un passage maintenant (202) ; 409 `radar.crawl.active` si un passage tourne déjà sur ce site. */
export async function startRadarCrawlRun(site: string): Promise<RadarCrawlRunResponse> {
  return appelBff<RadarCrawlRunResponse>(cheminApi`/api/super-admin/radar/crawl/sources/${site}/run`, { method: 'POST' });
}

/** Séparer une fusion AUTOMATIQUE : l'annonce revient à relire ; 409 `radar.merge.not_automatic` pour un doublon posé à la main. */
export function unmergeRadarListing(id: number): Promise<RadarListingDetailResponse> {
  return envoyer(cheminApi`/api/super-admin/radar/listings/${id}/unmerge`, 'POST');
}

// ─── La relance d'activation (TCK-2394) ──────────────────────────────────────────────────────
// Geste `platform.radar.operate` : relancer est du démarchage. Marquer envoyée exige la prise en charge.

/** L'aperçu de la relance : chiffres de la période, blocages, texte fixe et lien `wa.me`. Il n'écrit rien. */
export async function fetchRadarActivationReminder(
  advertiserId: number,
  locale: RadarMessageLocale,
): Promise<RadarActivationReminderResponse> {
  const qs = new URLSearchParams({ locale });
  return appelBff<RadarActivationReminderResponse>(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/activation-reminder${requete(qs)}`);
}

/**
 * L'opérateur a envoyé la relance par WhatsApp : l'API rejuge tout sous verrou (STOP, activation, intervalle), pose la
 * ligne de base des vues, journalise les chiffres cités et rend l'aperçu relu.
 */
export async function markRadarActivationReminderSent(
  advertiserId: number,
  locale: RadarMessageLocale,
): Promise<RadarActivationReminderResponse> {
  return appelBff<RadarActivationReminderResponse>(cheminApi`/api/super-admin/radar/advertisers/${advertiserId}/activation-reminder/sent`, { method: 'POST', body: { locale } });
}

// ─── Les cibles (TCK-2469, routes de TCK-2468) ───────────────────────────────────────────────
// Lire : `platform.radar.operate` (support et au-dessus) ; créer, modifier, retirer : `platform.radar.publish`.

/** Les colonnes d'une cible (`RadarTarget::$queryFields`) : la liste et la fiche lisent les mêmes. */
export const RADAR_TARGET_FIELDS = [
  'id',
  'name',
  'origin',
  'status',
  'pinned',
  'criteria',
  'demand_count',
  'matches_count',
  'last_matched_at',
  'created_at',
] as const;

/** Les colonnes de la carte compacte d'une annonce trouvée : photo, prix, quartier, site, étape. */
export const RADAR_TARGET_LISTING_FIELDS = [
  'id',
  'source_site',
  'source_url',
  'photo_urls',
  'extracted',
  'stage',
  'created_at',
] as const;

/** `sort=-created_at` : la dernière posée en tête. Une cible retirée se lit par `filter[status]=retired`. */
export async function fetchRadarTargets(filters: RadarTargetFilters = {}): Promise<PaginatedResponse<RadarTarget>> {
  const qs = buildQueryString({
    fields: { radar_targets: RADAR_TARGET_FIELDS },
    filter: { status: filters.status, origin: filters.origin },
    sort: '-created_at',
    page: filters.page ?? 1,
    per_page: filters.perPage ?? 25,
  });
  return appelBff<PaginatedResponse<RadarTarget>>(cheminApi`/api/super-admin/radar/targets${requete(qs)}`);
}

export async function fetchRadarTarget(id: number): Promise<RadarTargetResponse> {
  // P60.03 — un `show` rend la ressource entière : aucun `fields[...]` (l'API l'ignorerait).
  return appelBff<RadarTargetResponse>(cheminApi`/api/super-admin/radar/targets/${id}`);
}

/** Les annonces rattachées à une cible, les plus récentes d'abord. */
export async function fetchRadarTargetListings(
  id: number,
  page = 1,
  perPage = 24,
): Promise<PaginatedResponse<RadarTargetListingRow>> {
  const qs = buildQueryString({
    fields: { radar_listings: RADAR_TARGET_LISTING_FIELDS },
    sort: '-created_at',
    page,
    per_page: perPage,
  });
  return appelBff<PaginatedResponse<RadarTargetListingRow>>(cheminApi`/api/super-admin/radar/targets/${id}/listings${requete(qs)}`);
}

/** 201 ; 422 codé `radar.targets.*` (critères, doublon, plafond). */
export async function createRadarTarget(payload: RadarTargetCreation): Promise<RadarTargetResponse> {
  return appelBff<RadarTargetResponse>('/api/super-admin/radar/targets', { method: 'POST', body: payload });
}

/** Les seuls champs modifiés. Modifier les critères d'une cible de la demande l'épingle (l'API le fait). */
export async function updateRadarTarget(id: number, changes: RadarTargetChanges): Promise<RadarTargetResponse> {
  return appelBff<RadarTargetResponse>(cheminApi`/api/super-admin/radar/targets/${id}`, { method: 'PATCH', body: changes });
}

/** Retire la cible (`status: retired`) : rien n'est jamais supprimé. */
export async function retireRadarTarget(id: number): Promise<RadarTargetResponse> {
  return appelBff<RadarTargetResponse>(cheminApi`/api/super-admin/radar/targets/${id}`, { method: 'DELETE' });
}

// ─── Les cibles de la demande (TCK-2470, `RadarDemandController`) ────────────────────────────
// Lire : `platform.radar.operate` ; allumer, éteindre, rafraîchir, défaire : `platform.radar.publish`.

/** Le réglage : allumé, opérateur, ce qui bloque un passage, le dernier passage et la dernière révision. */
export async function fetchRadarDemand(): Promise<RadarDemandSettingResponse> {
  return appelBff<RadarDemandSettingResponse>('/api/super-admin/radar/demand');
}

/** Allumer fait de l'appelant l'opérateur (et le reprend si l'opérateur a disparu) ; éteindre garde l'opérateur affiché. */
export async function setRadarDemandEnabled(enabled: boolean): Promise<RadarDemandSettingResponse> {
  return appelBff<RadarDemandSettingResponse>('/api/super-admin/radar/demand', { method: 'PATCH', body: { enabled } });
}

/** 202 : le passage part en file, la réponse le précède ; 409 `radar.demand.disabled|operator_missing`. */
export async function refreshRadarDemand(): Promise<RadarDemandSettingResponse> {
  return appelBff<RadarDemandSettingResponse>('/api/super-admin/radar/demand/refresh', { method: 'POST' });
}

/** Les colonnes de l'historique (`RadarTargetRevision::$queryFields`, sans `ai_call_id` ni `updated_at`). */
export const RADAR_TARGET_REVISION_FIELDS = [
  'id',
  'operations',
  'discarded',
  'before',
  'signals_count',
  'reverted_at',
  'reverted_by_id',
  'created_at',
] as const;

/** L'historique des révisions, la plus récente en tête, avec qui en a défait une. */
export async function fetchRadarTargetRevisions(page = 1, perPage = 20): Promise<PaginatedResponse<RadarTargetRevision>> {
  const qs = buildQueryString({
    fields: { radar_target_revisions: RADAR_TARGET_REVISION_FIELDS },
    include: 'revertedBy',
    sort: '-id',
    page,
    per_page: perPage,
  });
  return appelBff<PaginatedResponse<RadarTargetRevision>>(cheminApi`/api/super-admin/radar/targets/revisions${requete(qs)}`);
}

/** Défait la révision ; 409 `radar.targets.revision_superseded` (`params.revision_id` ou `params.target_id`) ou `revision_reverted`. */
export async function revertRadarTargetRevision(id: number): Promise<RadarTargetRevisionResponse> {
  return appelBff<RadarTargetRevisionResponse>(cheminApi`/api/super-admin/radar/targets/revisions/${id}/revert`, { method: 'POST' });
}
