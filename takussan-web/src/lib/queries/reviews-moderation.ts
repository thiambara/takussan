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
  reported_count: number;
  created_at: string;
  /** verif-597 m1 — jugé par la policy de l'API : ce que l'acteur peut trancher. */
  can_moderate?: boolean;
}

export interface ModerationQueueMeta {
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
  pending_count: number;
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
}

function buildQueueParams({
  page,
  perPage,
  sort,
  status,
  reported,
  subjectType,
}: FetchModerationQueueParams): SpatieQueryParams {
  const filter: Record<string, string> = {};
  if (status) filter.moderation_status = status;
  if (reported) filter.reported = '1';
  if (subjectType) filter.subject_type = subjectType;

  return {
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
