'use client';

import { useQueries } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { apiRequest } from '@/lib/api';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

export type ReviewStatus = 'pending' | 'approved' | 'reported' | 'rejected';

export type Review = {
  id: number;
  reviewable_type: string;
  reviewable_id: number;
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

export function usePropertyReviewsForOwner(properties: readonly OwnerReviewProperty[]) {
  const { token } = useAuth();
  const locale = useLocale();

  return useQueries({
    queries: properties.map((property) => ({
      queryKey: ['owner-reviews', 'property', property.id],
      enabled: Boolean(token),
      queryFn: async () =>
        apiRequest<PaginatedResponse<Review>>(
          `/api/properties/${property.id}/reviews?per_page=50`,
          { token: token ?? undefined, locale },
        ),
    })),
  });
}

export function useReplyReview() {
  return useApiMutation<ApiResponse<Review>, { reviewId: number; reply_content: string }>(
    {
      path: ({ reviewId }) => `/api/reviews/${reviewId}/reply`,
      method: 'POST',
      body: ({ reply_content }) => ({ reply_content }),
    },
    { invalidate: [['owner-reviews']] },
  );
}

export function useReportReview() {
  return useApiMutation<{ message: string }, { reviewId: number; reason: string }>(
    {
      path: ({ reviewId }) => `/api/reviews/${reviewId}/report`,
      method: 'POST',
      body: ({ reason }) => ({ reason }),
    },
    { invalidate: [['owner-reviews']] },
  );
}
