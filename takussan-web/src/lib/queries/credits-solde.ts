'use client';

import { useEffect } from 'react';
import { hashKey, useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from '@/hooks/useApiQuery';
import type { MyProfilesResponse } from '@/types/profile';

/**
 * TCK-642 — le solde de crédits de l'espace ACTIF, seul : `GET /api/credits/balance`.
 *
 * `GET /api/credits` (TCK-633) rend aussi les lots et un journal paginé — trop lourd pour une barre
 * lue à chaque page. La clé est posée SOUS le préfixe `['credits']` (`CLE_CREDITS`,
 * `components/boost/api.ts`) : l'achat d'un boost, qui invalide ce préfixe, relit donc aussi le
 * solde des barres, sans que ce module ait à le savoir.
 */
export const CLE_SOLDE_CREDITS = ['credits', 'solde'] as const;

/**
 * La clé du cache des profils (`profilesKeys.all`, `hooks/useProfiles.ts`), RECOPIÉE et non
 * importée : ce module est monté par la navbar publique, et importer `useProfiles` y tirait
 * l'espace i18n `profile` (son sélecteur), que la frontière publique ne charge pas —
 * `check:i18n-namespaces` le refuse. `credits-solde.test.tsx` garde l'égalité des deux clés.
 */
export const CLE_PROFILS_ECOUTEE = ['me', 'profiles'] as const;

interface ReponseSolde {
  readonly data: { readonly balance: number };
}

function profilActifDe(donnees: unknown): string | null {
  return (donnees as MyProfilesResponse | undefined)?.meta?.active_profile_id ?? null;
}

/**
 * Le solde, ou `null` tant qu'il n'est pas CONNU : chargement, 403 (le profil actif n'a pas
 * `boost.spend` sur l'espace), 422 `credits.no_space`, panne réseau. L'appelant n'affiche rien sur
 * `null` — jamais un « 0 » qui ne serait pas un solde (TCK-642, AC5).
 *
 * **Le solde suit le changement de profil actif (AC4).** `useSwitchActiveProfile` invalide les
 * profils, les rôles et les permissions, pas les crédits : un solde en cache aurait survécu au
 * changement d'espace. Ce hook écoute donc le cache des profils et relit le solde quand le profil
 * actif CONFIRMÉ PAR LE SERVEUR change. Deux choix, chacun contre une course mesurée dans le code :
 *
 *  - l'écriture OPTIMISTE du sélecteur (`setQueryData`, `action.manual`) est ignorée : elle précède
 *    le `PATCH`, et une relecture déclenchée là pouvait recevoir le solde de l'ANCIEN espace —
 *    puis le garder, la relecture suivante des profils ne changeant plus d'identifiant ;
 *  - seul un CHANGEMENT d'identifiant relit : la relecture des profils au retour sur l'onglet n'en
 *    produit pas, et ne coûte donc aucun appel de plus.
 */
export function useSoldeCredits({ enabled }: { readonly enabled: boolean }): number | null {
  const queryClient = useQueryClient();
  const requete = useApiQuery<ReponseSolde>([...CLE_SOLDE_CREDITS], '/api/credits/balance', {
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    let actifConfirme = profilActifDe(queryClient.getQueryData(CLE_PROFILS_ECOUTEE));
    return queryClient.getQueryCache().subscribe((evenement) => {
      if (evenement.type !== 'updated' || evenement.action.type !== 'success') return;
      if (evenement.action.manual) return;
      if (evenement.query.queryHash !== hashKey(CLE_PROFILS_ECOUTEE)) return;
      const actif = profilActifDe(evenement.query.state.data);
      if (actif === actifConfirme) return;
      const premiereLecture = actifConfirme === null;
      actifConfirme = actif;
      // `reset` et non `invalidate` : le solde de l'ancien espace est OUBLIÉ pendant la relecture
      // — la pastille disparaît un instant plutôt que d'afficher un solde qui n'est plus le sien.
      if (!premiereLecture) void queryClient.resetQueries({ queryKey: [...CLE_SOLDE_CREDITS] });
    });
  }, [enabled, queryClient]);

  return requete.isSuccess && typeof requete.data?.data?.balance === 'number'
    ? requete.data.data.balance
    : null;
}
