'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import type { PropertyListItem } from '@/types/property';

type State = {
  data: PropertyListItem[];
  loading: boolean;
  error: string | null;
};

export function useSimilarProperties(slug: string) {
  const t = useTranslations('property.detail');
  const [state, setState] = useState<State>({ data: [], loading: true, error: null });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    apiFetch<{ data: PropertyListItem[] }>(`/public/properties/${slug}/similar`)
      .then((res) => {
        if (!cancelled) setState({ data: res.data, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setState({ data: [], loading: false, error: t('similarError') });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  return state;
}
