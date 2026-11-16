import { apiRequest, buildQueryString } from '@/lib/api';
import type { ModerationReasonCode } from '@/lib/moderation-reasons';
import type {
  PaginatedResponse,
  ApiResponse,
  SpatieQueryParams,
} from '@/types/api';
import { cheminApi, requete } from '@/lib/chemin-api';

/**
 * Review moderation queries — TCK-067. Admin queue uses sparse fieldsets
 * and spatie filters (moderation_status, reported, subject_type).
 */

export const MODERATION_REVIEW_FIELDS = [
  'id',
  'rating',
  'content',
  'title',
  'reported_count',
  'created_at',
  'reviewable_type',
  'reviewable_id',
  'author_id',
] as const;

export type ModerationStatus =
  | 'pending'
  | 'flagged'
  | 'approved'
  | 'rejected';

export interface ModerationReviewAuthor {
  id: number | null;
  name: string;
  avatar_url: string | null;
}

/** TCK-2672 — les raisons du risque d'un avis, en codes (`ReviewRiskClassifier`). */
export type ReviewRiskReason = 'low_rating' | 'reported' | 'contact_details';
export type ReviewRiskLevel = 'high' | 'low';

export interface ReviewRisk {
  readonly level: ReviewRiskLevel;
  readonly reasons: readonly ReviewRiskReason[];
}

/**
 * TCK-2672 — le SUJET de l'avis : un bien (sa photo principale et son agent principal), un agent
 * (`user`), l'agence elle-même ou un prestataire. `null` quand le sujet a disparu.
 */
export interface ModerationReviewTarget {
  readonly type: 'property' | 'agency' | 'user' | 'service_provider';
  readonly id: number;
  readonly title: string | null;
  readonly slug: string | null;
  readonly subtitle: string | null;
  readonly photo_url?: string | null;
  readonly agent?: { readonly id: number; readonly name: string | null } | null;
}

export interface ModerationReview {
  id: number;
  rating: number;
  title: string | null;
  content: string | null;
  author: ModerationReviewAuthor;
  reviewable_type: string | null;
  reviewable_id: number | null;
  status: string | null;
  is_approved: boolean;
  /**
   * TCK-2722 — absent sur une ligne que le lecteur ne modère pas (`viewReports` faux : un avis sur
   * l'agence elle-même, dans la file d'agence) ; présent sur toutes les autres.
   */
  reported_count?: number;
  created_at: string;
  /** verif-597 m1 — jugé par la policy de l'API : ce que l'acteur peut trancher. */
  can_moderate?: boolean;
  /**
   * TCK-2931 (TCK-2930, ADR-0043 amendé le 2026-11-15) — supprimer et ignorer les signalements ont
   * leur propre capacité, jugée par l'API : l'admin d'agence les tient aussi sur un avis publié.
   */
  can_delete?: boolean;
  can_dismiss_reports?: boolean;
  /** TCK-2672 — le sujet ; absent quand l'API ne l'a pas chargé. */
  target?: ModerationReviewTarget | null;
  /** TCK-2672 — absent sur une ligne que le lecteur ne modère pas (même garde que `reported_count`). */
  risk?: ReviewRisk;
  /** La réponse publique de l'agence, et qui peut l'écrire (policy `reply`). */
  reply_content?: string | null;
  replied_at?: string | null;
  can_reply?: boolean;
  /** TCK-2522 — le type de la preuve d'éligibilité de l'auteur, jamais son contrat. */
  context_kind?: 'lease' | 'booking' | 'visit' | 'maintenance_request' | null;
}

export interface ModerationQueueMeta {
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
  pending_count: number;
  /** TCK-2672 — calculé sur la file filtrée AVANT le filtre de risque : les deux pastilles se lisent ensemble. */
  risk_counts?: { readonly high: number; readonly low: number };
}

export type ModerationQueueResponse = PaginatedResponse<ModerationReview> & {
  meta: ModerationQueueMeta;
};

export interface FetchModerationQueueParams {
  readonly page?: number;
  readonly perPage?: number;
  readonly sort?: string;
  readonly status?: ModerationStatus;
  readonly reported?: boolean;
  readonly subjectType?: string;
  /** TCK-2672 — `filter[risk]`. */
  readonly risk?: ReviewRiskLevel;
  /** TCK-2931 — `filter[search]` : bien (titre, référence), auteur, agent noté ; cherché par le serveur. */
  readonly search?: string;
}

/**
 * Les paramètres d'une lecture de la file. Exporté pour la garde `a-traiter-lu-par-sa-page.test.ts`
 * (TCK-2479) : la pastille du menu et la page qu'elle ouvre passent par ICI, et la garde compare
 * leurs `filter[...]`.
 */
export function buildQueueParams({
  page,
  perPage,
  sort,
  status,
  reported,
  subjectType,
  risk,
  search,
}: FetchModerationQueueParams): SpatieQueryParams {
  const filter: Record<string, string> = {};
  if (status) filter.moderation_status = status;
  if (reported) filter.reported = '1';
  if (subjectType) filter.subject_type = subjectType;
  if (risk) filter.risk = risk;
  // TCK-2931 — une recherche vide n'est pas envoyée : la file entière.
  if (search && search.trim() !== '') filter.search = search.trim();

  return {
    // P100.05 (TCK-1186) — `fields` inerte : `ReviewController` lit ses filtres et son tri à la main, sans
    // `buildQuery` (`Review::$queryFields` vide).
    fields: { reviews: MODERATION_REVIEW_FIELDS },
    filter,
    // TCK-597 — les avis à trancher d'abord (en attente, puis signalés), trié par le serveur.
    sort: sort ?? 'pending_first,-reported_count,-created_at',
    page: page ?? 1,
    per_page: perPage ?? 20,
  };
}

export async function fetchModerationQueue(
  token: string,
  params: FetchModerationQueueParams = {},
): Promise<ModerationQueueResponse> {
  const qs = buildQueryString(buildQueueParams(params));
  return apiRequest<ModerationQueueResponse>(
    cheminApi`/api/reviews${requete(qs)}`,
    { token },
  );
}

export type ModerationDecision = 'approve' | 'hide' | 'delete' | 'ignore';

export interface ModeratePayload {
  readonly decision: ModerationDecision;
  /** Requis pour tout autre geste qu'approuver (TCK-597, ADR-0043 §7). */
  readonly reason_code?: ModerationReasonCode;
  readonly reason?: string;
}

export interface ModerateResponse {
  readonly data: ModerationReview | { id: number; deleted: boolean };
}

export async function moderateReview(
  reviewId: number,
  payload: ModeratePayload,
  token: string,
): Promise<ModerateResponse> {
  return apiRequest(cheminApi`/api/reviews/${reviewId}/moderate`, {
    method: 'PATCH',
    body: payload,
    token,
  });
}

export interface ReviewReport {
  user_id: number | null;
  user: { id: number; name: string; email: string } | null;
  reason: string | null;
  reported_at: string | null;
}

export async function fetchReviewReports(
  reviewId: number,
  token: string,
): Promise<ApiResponse<ReviewReport[]> & { meta: { total: number } }> {
  return apiRequest(cheminApi`/api/reviews/${reviewId}/reports`, { token });
}

/** TCK-2672 — `ModerateReviewBatchRequest::MAX_REVIEWS` : un lot publie au plus 100 avis. */
export const MAX_AVIS_PAR_LOT = 100;

export interface ModerateBatchResponse {
  readonly data: { readonly decision: 'approve'; readonly review_ids: readonly number[]; readonly count: number };
}

/**
 * TCK-2672 — publier un LOT d'avis en attente (`approve` seul, 100 au plus). L'API refuse le lot
 * entier (422 `review.batch_not_moderatable`) dès qu'un avis n'est pas en attente ou pas modérable
 * par l'appelant : rien ne change alors.
 */
export async function moderateReviewBatch(reviewIds: readonly number[], token: string): Promise<ModerateBatchResponse> {
  return apiRequest<ModerateBatchResponse>('/api/reviews/moderate-batch', {
    method: 'POST',
    body: { review_ids: [...reviewIds], decision: 'approve' },
    token,
  });
}

/**
 * La réponse publique de l'agence (`ReplyReviewRequest`, 2000 caractères côté API ; l'écran en
 * permet 600, la maquette). Refusée sur un avis rejeté (`review.reply_rejected`).
 */
export const LONGUEUR_MAX_DE_LA_REPONSE = 600;

export async function replyToReview(reviewId: number, replyContent: string, token: string): Promise<ApiResponse<ModerationReview>> {
  return apiRequest<ApiResponse<ModerationReview>>(cheminApi`/api/reviews/${reviewId}/reply`, {
    method: 'POST',
    body: { reply_content: replyContent },
    token,
  });
}

/**
 * TCK-2931 — `GET /api/reviews/{review}/subject-summary` (TCK-2930) : ce que le modérateur lit à côté
 * d'un avis. La moyenne et le compte des avis PUBLIÉS du sujet, ses 3 derniers autres avis publiés,
 * et le début du premier bail de l'auteur dans l'agence (« Locataire depuis … »), date calendaire.
 */
export interface ReviewSubjectSummary {
  readonly review_id: number;
  readonly subject: {
    readonly type: string | null;
    readonly id: number | null;
    readonly average_rating: number | null;
    readonly reviews_count: number;
  };
  readonly others: readonly {
    readonly id: number;
    readonly rating: number;
    readonly excerpt: string;
    readonly author_name: string | null;
    readonly created_at: string | null;
  }[];
  readonly author: { readonly id: number | null; readonly tenant_since: string | null };
}

/** Sous `['reviews-moderation', …]` : une décision, qui invalide la file, relit aussi le résumé. */
export const reviewSubjectSummaryKey = (reviewId: number) => ['reviews-moderation', 'subject-summary', reviewId] as const;

export async function fetchReviewSubjectSummary(reviewId: number, token: string): Promise<ApiResponse<ReviewSubjectSummary>> {
  return apiRequest<ApiResponse<ReviewSubjectSummary>>(cheminApi`/api/reviews/${reviewId}/subject-summary`, { token });
}
