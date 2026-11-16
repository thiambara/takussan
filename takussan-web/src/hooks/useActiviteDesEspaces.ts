'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { ProfilAvecActivite } from '@/lib/activite-des-espaces';
import { CLE_PROFILS } from '@/lib/cache-d-espace';

/**
 * TCK-2848 — la ligne d'activité de chaque espace (« 4 demandes · 2 visites aujourd'hui ») :
 * `GET /api/me/profiles?include=activity` (TCK-2847). Une lecture À PART de `useMyProfiles`, et non
 * l'inclusion ajoutée à `fetchMyProfiles` : les compteurs se calculent sous CHAQUE profil (23 à 50
 * requêtes mesurées par TCK-2847), et la liste des profils se lit sur toutes les pages. Celle-ci ne part
 * qu'à l'ouverture d'une surface qui montre les espaces (`enabled`).
 *
 * La clé est sous `CLE_PROFILS` : le changement d'espace l'épargne (`oublierLeCacheDEspace`) et la
 * relit (`onSettled` de `useSwitchActiveProfile` invalide le préfixe). Erreur ou chargement : `undefined`,
 * et l'appelant ne rend aucune ligne.
 *
 * Dans un module à part, et non dans `useProfiles.ts` : une vingtaine de fichiers de test simulent ce
 * module sans connaître un export neuf.
 */
export const CLE_ACTIVITE_DES_ESPACES = [...CLE_PROFILS, 'activite'] as const;

export function useActiviteDesEspaces(enabled: boolean): readonly ProfilAvecActivite[] | undefined {
  const requete = useApiQuery<{ data: ProfilAvecActivite[] }>(CLE_ACTIVITE_DES_ESPACES, '/api/me/profiles', {
    params: { include: 'activity' },
    enabled,
    staleTime: 60_000,
    retry: false,
  });
  return requete.data?.data;
}
