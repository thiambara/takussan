'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

export type ReviewStatus = 'pending' | 'approved' | 'reported' | 'rejected';

export type Review = {
  id: number;
  reviewable_type: string;
  reviewable_id: number;
  target?: {
    type: 'property' | 'agency' | 'user' | 'service_provider';
    id: number;
    title: string;
    slug: string | null;
    subtitle: string | null;
  } | null;
  author_id: number;
  author: {
    id: number | null;
    name: string;
    avatar_url: string | null;
  };
  rating: number;
  title: string | null;
  content: string | null;
  is_approved: boolean;
  status: ReviewStatus | null;
  reported_count: number;
  reply_content: string | null;
  replied_at: string | null;
  created_at: string | null;
  /** verif-597 m1 — jugés par les policies de l'API ; absents sur une lecture anonyme. */
  can_reply?: boolean;
  can_moderate?: boolean;
};

export type OwnerReviewProperty = Pick<
  PropertyListItem,
  'id' | 'reference_number' | 'title' | 'slug' | 'status' | 'visibility' | 'created_at'
>;

export function useOwnerReviewProperties() {
  const spatieParams: SpatieQueryParams = {
    fields: {
      properties: [
        'id',
        'reference_number',
        'title',
        'slug',
        'status',
        'visibility',
        'created_at',
      ],
    },
    sort: ['title'],
    per_page: 100,
  };

  return useApiQuery<PaginatedResponse<OwnerReviewProperty>>(
    ['owner-reviews', 'properties'],
    '/api/properties',
    { params: spatieParams },
  );
}

export function useAuthoredReviews() {
  const spatieParams: SpatieQueryParams = {
    filter: { author_id: 'me' },
    sort: '-created_at',
    per_page: 50,
  };

  return useApiQuery<PaginatedResponse<Review>>(
    ['profile-reviews', 'authored'],
    '/api/reviews',
    { params: spatieParams },
  );
}

/**
 * TCK-597 (A15) — la boîte des avis reçus : UNE requête paginée, filtrée par le serveur
 * (`GET /api/reviews/received`). Elle remplace une requête par bien, filtrée côté client.
 */
export type ReceivedSubjectType = 'property' | 'agent' | 'agency' | 'service_provider';
export type ReceivedStatus = 'pending' | 'approved' | 'reported';

export interface ReceivedReviewsParams {
  readonly propertyId?: number;
  readonly replied?: boolean;
  readonly status?: ReceivedStatus;
  readonly subjectType?: ReceivedSubjectType;
  readonly page?: number;
}

export const RECEIVED_REVIEWS_PER_PAGE = 20;

export function useReceivedReviews(params: ReceivedReviewsParams) {
  const filter: Record<string, string> = {};
  if (params.propertyId) filter.property_id = String(params.propertyId);
  if (params.replied !== undefined) filter.replied = params.replied ? '1' : '0';
  if (params.status) filter.status = params.status;
  if (params.subjectType) filter.subject_type = params.subjectType;

  const spatieParams: SpatieQueryParams = {
    filter,
    page: params.page ?? 1,
    per_page: RECEIVED_REVIEWS_PER_PAGE,
  };

  return useApiQuery<PaginatedResponse<Review>>(
    ['received-reviews', params],
    '/api/reviews/received',
    { params: spatieParams },
  );
}

/**
 * TCK-597 (C18, P20) — ce que l'utilisateur peut noter, calculé par le serveur
 * (`GET /api/me/review-opportunities`) : un bien, un agent, une agence ou un prestataire, avec la
 * preuve (visite, bail, réservation, intervention) qui l'y autorise. Remplace l'assemblage
 * réservations + baux fait ici.
 */
export type ReviewOpportunityType = 'property' | 'agent' | 'agency' | 'service_provider';
export type ReviewContextType = 'visit' | 'lease' | 'booking' | 'maintenance_request';

export interface ReviewOpportunity {
  readonly type: ReviewOpportunityType;
  readonly subject: { readonly id: number; readonly title: string | null; readonly slug: string | null };
  readonly context: { readonly type: ReviewContextType; readonly id: number };
}

export function useReviewOpportunities() {
  return useApiQuery<{ data: ReviewOpportunity[] }>(
    ['profile-reviews', 'opportunities'],
    '/api/me/review-opportunities',
  );
}

export interface PostReviewVariables {
  readonly opportunity: ReviewOpportunity;
  readonly rating: number;
  readonly content?: string;
}

/** L'endpoint de dépôt de chaque cible. Le prestataire nomme l'intervention qui l'autorise. */
export function reviewStorePath(opportunity: ReviewOpportunity): string {
  const id = opportunity.subject.id;
  switch (opportunity.type) {
    case 'property':
      return `/api/properties/${id}/reviews`;
    case 'agent':
      return `/api/agents/${id}/reviews`;
    case 'agency':
      return `/api/agencies/${id}/reviews`;
    case 'service_provider':
      return `/api/service-providers/${id}/reviews`;
  }
}

export function usePostReview() {
  return useApiMutation<ApiResponse<Review>, PostReviewVariables>(
    {
      path: ({ opportunity }) => reviewStorePath(opportunity),
      method: 'POST',
      body: ({ opportunity, rating, content }) => ({
        rating,
        content: content || undefined,
        ...(opportunity.type === 'service_provider'
          ? { maintenance_request_id: opportunity.context.id }
          : {}),
      }),
    },
    { invalidate: [['profile-reviews']] },
  );
}

export function useReplyReview() {
  return useApiMutation<ApiResponse<Review>, { reviewId: number; reply_content: string }>(
    {
      path: ({ reviewId }) => `/api/reviews/${reviewId}/reply`,
      method: 'POST',
      body: ({ reply_content }) => ({ reply_content }),
    },
    { invalidate: [['received-reviews']] },
  );
}
