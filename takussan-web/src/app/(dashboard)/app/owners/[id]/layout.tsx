import type { ReactNode } from 'react';

import { getMeAction } from '@/app/actions/auth';
import { assertCanReachOwnerAccount } from '@/lib/auth/guards';
import { exigerRessource } from '@/lib/detail/ressource-de-detail';

/**
 * TCK-2641 — **le refus et l'introuvable de la fiche d'un bailleur se décident ICI**, et c'est la
 * seule place où ils rendent 404 (TCK-442) : sous un `loading.tsx`, un `notFound()` de page rend 200
 * et l'écran introuvable s'affiche quand même. Le `loading.tsx` du carnet a donc descendu dans le
 * groupe `(liste)` : un repli d'ANCÊTRE effacerait aussi le statut de ce layout.
 *
 *  1. La fiche est celle de l'admin de l'agence (décision 3a, `assertCanReachOwnerAccount`) ; la
 *     garde d'agence (jeton, rôle, agence `standard`) reste celle du layout du carnet (TCK-426).
 *  2. Un bailleur que l'API ne rend pas (404 : autre agence, ou inexistant) est introuvable ; une
 *     panne n'en est pas un (`exigerRessource`, TCK-442). La sonde est la lecture même de la page
 *     (`LECTURES_DE_PAGE.owners`, le mois en cours) : une requête, partagée.
 */
export default async function Layout({ params, children }: { readonly params: Promise<{ id: string }>; readonly children: ReactNode }) {
  const { roles } = await getMeAction();
  assertCanReachOwnerAccount(roles);
  await exigerRessource('owners', (await params).id);
  return <>{children}</>;
}
