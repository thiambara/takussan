'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { reportReview, submitReview, submitReviewReply } from '@/app/actions/property';
import type { PropertyReviewsResponse } from '@/types/review';

type State = {
  data: PropertyReviewsResponse | null;
  loading: boolean;
  error: string | null;
};

export function usePropertyReviews(slug: string, propertyId: number) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    apiFetch<PropertyReviewsResponse>(`/public/properties/${slug}/reviews`)
      .then((res) => {
        if (!cancelled) setState({ data: res, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setState({ data: null, loading: false, error: 'Impossible de charger les avis.' });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, reloadTick]);

  const refetch = useCallback(() => setReloadTick((t) => t + 1), []);

  const submit = useCallback(
    async (payload: { rating: number; title?: string; content?: string }) => {
      const res = await submitReview(propertyId, payload);
      if (!res.ok) throw new Error(res.message);
      refetch();
    },
    [propertyId, refetch],
  );

  const report = useCallback(async (reviewId: number, reason: string) => {
    const res = await reportReview(reviewId, reason);
    if (!res.ok) throw new Error(res.message);
  }, []);

  const reply = useCallback(
    async (reviewId: number, replyContent: string) => {
      const res = await submitReviewReply(reviewId, replyContent);
      if (!res.ok) throw new Error(res.message);
      refetch();
    },
    [refetch],
  );

  return { ...state, submit, report, reply, refetch };
}
