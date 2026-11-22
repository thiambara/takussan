import { cache } from 'react';

import { fetchOwner } from '@/lib/queries/owners';

/**
 * TCK-2641 — la fiche d'un bailleur, lue une fois par rendu : le `layout.tsx` de `owners/[id]` la
 * lit pour décider de l'introuvable (404 de l'API → `notFound()`), la page la relit pour l'afficher.
 * `cache()` partage la promesse quand les arguments sont les mêmes — d'où `period` omis pour le mois
 * en cours, que l'API prend par défaut (`OwnerProfileController::show`, `$request->period()`).
 */
export const lireBailleurDuRendu = cache((token: string, id: number, period?: string) => fetchOwner(token, id, period));
