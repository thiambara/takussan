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

/**
 * TCK-1483 (P103.07) — `donneesInitiales` : les similaires lus par le serveur avec la fiche
 * (modèle `donneesInitiales` de l'accueil, TCK-432). Présentes, elles sont rendues tout de suite
 * et le navigateur ne les redemande pas ; `null`, il les lit comme avant.
 */
export function useSimilarProperties(slug: string, donneesInitiales: PropertyListItem[] | null = null) {
  const t = useTranslations('property.detail');
  const [state, setState] = useState<State>(
    donneesInitiales !== null
      ? { data: donneesInitiales, loading: false, error: null }
      : { data: [], loading: true, error: null },
  );
  const dejaServies = donneesInitiales !== null;

  useEffect(() => {
    if (!slug || dejaServies) return;
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
  }, [slug, t, dejaServies]);

  return state;
}
