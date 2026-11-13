'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { CoffreDeDocuments } from '@/lib/documents/coffre';

/**
 * TCK-2656 — le coffre de l'appelant, `GET /api/me/document-vault` (TCK-2655, ADR-0099) : ses
 * dossiers selon le profil actif, chaque entrée jugée par la règle de l'endpoint qui la sert.
 *
 * Pas de `fields[...]` : la réponse n'est pas une ressource spatie, c'est un agrégat de forme fixe.
 */
export const coffreQueryKeys = {
  all: ['documents', 'coffre'] as const,
};

export function useCoffreDeDocuments({ enabled = true }: { readonly enabled?: boolean } = {}) {
  return useApiQuery<{ data: CoffreDeDocuments }>(coffreQueryKeys.all, '/api/me/document-vault', { enabled });
}
