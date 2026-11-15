'use client';

import { keepPreviousData } from '@tanstack/react-query';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { CibleDAgence, CoffreDeLAgence, EntreeGenereeDeLAgence } from '@/lib/documents/coffre-de-l-agence';
import { DUREE_URL_SIGNEE_MEDIA_MS, rafraichirAvantExpiration } from '@/lib/url-signee';
import type { PaginatedResponse } from '@/types/api';
import type { Document } from '@/types/document';

import { DOCUMENT_LIST_FIELDS } from './documents';

/**
 * TCK-2896 — les lectures du coffre de l'agence (TCK-2895, ADR-0099 amendé le 2026-11-15).
 *
 * Toutes les clés commencent par `['documents', …]` : l'ajout et la suppression d'un document
 * (`useUploadDocument`, `useDeleteDocument`, qui invalident `['documents']`) relisent l'arbre et ses
 * comptes avec la liste.
 */
export const coffreDeLAgenceQueryKeys = {
  arbre: ['documents', 'agence', 'arbre'] as const,
  liste: (p: ParametresDeLaListe) => ['documents', 'agence', 'liste', p] as const,
};

/** La fenêtre « expire bientôt » de l'API (`Document::EXPIRING_SOON_DAYS`, `meta.expiring_soon`). */
export const JOURS_D_EXPIRATION_PROCHE = 60;

/** Les puces : `tous`, `expire` (`filter[expiring_within_days]`), `nonVerifies` (`filter[is_verified]=false`), `generes`. */
export type FiltreDeLAgence = 'tous' | 'expire' | 'nonVerifies' | 'generes';

export interface ParametresDeLaListe {
  readonly filtre: FiltreDeLAgence;
  readonly q: string;
  readonly page: number;
  /** Un dossier téléversé de l'arbre (pièces du bien, du locataire, de l'agence) ; absent : toute l'agence. */
  readonly cible?: CibleDAgence | null;
  readonly enabled?: boolean;
}

/** `GET /api/agency/document-vault` : l'arbre compté et les totaux de l'en-tête. Agrégat de forme fixe : pas de `fields`. */
export function useCoffreDeLAgence() {
  return useApiQuery<{ data: CoffreDeLAgence }>(coffreDeLAgenceQueryKeys.arbre, '/api/agency/document-vault');
}

export type ListeDeLAgence = PaginatedResponse<Document> & {
  meta: PaginatedResponse<Document>['meta'] & { expiring_soon?: number; unverified?: number; generated?: number };
};

export type GeneresDeLAgence = PaginatedResponse<EntreeGenereeDeLAgence> & {
  meta: PaginatedResponse<EntreeGenereeDeLAgence>['meta'] & { generated?: number };
};

/**
 * `GET /api/documents?filter[agency]=current` : les pièces téléversées de l'agence, filtrées et
 * cherchées par le SERVEUR (jamais un filtre d'une liste déjà lue). `generes` part à
 * `filter[generated]=1` et rend des entrées du coffre, pas des `Document`.
 */
export function useListeDeLAgence({ filtre, q, page, cible = null, enabled = true }: ParametresDeLaListe) {
  const filter: Record<string, string | number | boolean> = { agency: 'current' };
  if (filtre === 'generes') filter.generated = 1;
  if (filtre === 'expire') filter.expiring_within_days = JOURS_D_EXPIRATION_PROCHE;
  if (filtre === 'nonVerifies') filter.is_verified = false;
  if (q !== '') filter.search = q;
  if (cible && filtre !== 'generes') {
    filter.documentable_type = cible.type;
    filter.documentable_id = cible.id;
  }

  return useApiQuery<ListeDeLAgence | GeneresDeLAgence>(coffreDeLAgenceQueryKeys.liste({ filtre, q, page, cible }), '/api/documents', {
    params: {
      fields: { documents: DOCUMENT_LIST_FIELDS },
      filter,
      sort: filtre === 'generes' ? undefined : '-created_at',
      page,
      per_page: 20,
    },
    enabled,
    placeholderData: keepPreviousData,
    // TCK-1024 — `file_url` est une URL signée de 30 min.
    ...rafraichirAvantExpiration(DUREE_URL_SIGNEE_MEDIA_MS),
  });
}
