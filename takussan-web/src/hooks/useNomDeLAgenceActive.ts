'use client';

import { skipToken, useQuery } from '@tanstack/react-query';
import { CLE_PROFILS } from '@/lib/cache-d-espace';
import type { MyProfilesResponse } from '@/types/profile';

/**
 * TCK-2830 — le nom de l'agence de l'espace actif, lu dans le cache des espaces (`CLE_PROFILS`, que
 * la coque de `/app` remplit par `useMyProfiles`), sans jamais le demander ni l'écrire.
 *
 * ⚠️ **Pas `useMyProfiles`** : `@/hooks/useProfiles` lit l'espace de traduction `profile`
 * (`useSwitchActiveProfile`), et la table des frontières (`scripts/check-i18n-namespaces.mjs`) suit
 * les imports au FICHIER. Importé par la ligne de détail de la messagerie, que le widget de chat
 * monte à la racine, il faisait servir `profile` à TOUTES les pages, publiques comprises (régression
 * de 196e7908f). Ce module ne lit aucune traduction.
 *
 * Hors de `/app` (cache vide), `null` : l'appelant se replie (« Agent » sans l'agence).
 */
export function useNomDeLAgenceActive(): string | null {
  const { data } = useQuery<MyProfilesResponse>({ queryKey: CLE_PROFILS, queryFn: skipToken });
  return data?.data.find((p) => p.id === data.meta.active_profile_id)?.agency?.name ?? null;
}
