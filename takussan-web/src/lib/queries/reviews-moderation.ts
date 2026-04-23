import { apiRequest, buildQueryString } from '@/lib/api';
import type {
  PaginatedResponse,
  ApiResponse,
  SpatieQueryParams,
} from '@/types/api';

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
    sort: sort ?? '-reported_count,-created_at',
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
    `/api/reviews${qs ? `?${qs}` : ''}`,
    { token },
  );
}

export type ModerationDecision = 'approve' | 'hide' | 'delete' | 'ignore';

export interface ModeratePayload {
  readonly decision: ModerationDecision;
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
  return apiRequest(`/api/reviews/${reviewId}/moderate`, {
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
  return apiRequest(`/api/reviews/${reviewId}/reports`, { token });
}
