import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-906 (P31.06) — le titre d'onglet d'une page d'authentification, que le modèle
 * « %s — Takussan » de `(auth)/layout.tsx` complète.
 *
 * Les pages de `(auth)/auth/` sont `'use client'` : elles ne peuvent pas exporter de
 * métadonnées. Chaque segment porte donc un `layout.tsx` serveur qui ne fait que cela.
 */
export type PageAuth = 'login' | 'register' | 'forgotPassword' | 'resetPassword' | 'verifyEmail';

export function metadonneesDePageAuth(page: PageAuth): () => Promise<Metadata> {
  return async () => {
    const t = await getTranslations('auth.meta.titles');
    return { title: t(page) };
  };
}
