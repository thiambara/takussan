'use client';

import { useApiQuery } from '@/hooks/useApiQuery';

/**
 * TCK-642 — le solde de crédits de l'espace ACTIF, seul : `GET /api/credits/balance`.
 *
 * `GET /api/credits` (TCK-633) rend aussi les lots et un journal paginé — trop lourd pour une barre
 * lue à chaque page. La clé est posée SOUS le préfixe `['credits']` (`CLE_CREDITS`,
 * `components/boost/api.ts`) : l'achat d'un boost, qui invalide ce préfixe, relit donc aussi le
 * solde des barres, sans que ce module ait à le savoir.
 */
export const CLE_SOLDE_CREDITS = ['credits', 'solde'] as const;

interface ReponseSolde {
  readonly data: { readonly balance: number };
}

/**
 * Le solde, ou `null` tant qu'il n'est pas CONNU : chargement, 403 (le profil actif n'a pas
 * `boost.spend` sur l'espace), 422 `credits.no_space`, panne réseau. L'appelant n'affiche rien sur
 * `null` — jamais un « 0 » qui ne serait pas un solde (TCK-642, AC5).
 *
 * **Le solde suit le changement de profil actif (AC4)** : `useSwitchActiveProfile` oublie tout le
 * cache hors des profils quand le serveur confirme le changement (TCK-2091, P197.05), ce solde
 * compris. Ce hook n'écoute plus rien lui-même.
 */
export function useSoldeCredits({ enabled }: { readonly enabled: boolean }): number | null {
  const requete = useApiQuery<ReponseSolde>([...CLE_SOLDE_CREDITS], '/api/credits/balance', {
    enabled,
  });

  return requete.isSuccess && typeof requete.data?.data?.balance === 'number'
    ? requete.data.data.balance
    : null;
}
