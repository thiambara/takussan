'use client';

import { voitLePortefeuille } from '@/lib/navigation/acces-app';
import { useSoldeCredits } from '@/lib/queries/credits-solde';
import type { User } from '@/types/user';

/**
 * TCK-642, repris par TCK-2493 — le solde de crédits de l'espace actif, pour « Moi » et « Mon
 * espace ». Lu SEULEMENT pour qui voit le portefeuille (admin d'agence, hôte) : `useSoldeCredits`
 * interroge l'API dès qu'il est armé. `null` tant que le solde n'est pas CONNU (chargement, refus,
 * panne) — l'appelant ne montre alors ni rangée « Crédits », ni « 0 » qui ne serait pas un solde.
 */
export function useSoldeDuPortefeuille(user: User): number | null {
  const voit = voitLePortefeuille(user.roles);
  const solde = useSoldeCredits({ enabled: voit });
  return voit ? solde : null;
}
