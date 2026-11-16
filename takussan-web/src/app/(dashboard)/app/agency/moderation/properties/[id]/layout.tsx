import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api';
import { idDeDetail } from '@/lib/detail/ressource-de-detail';
import { getToken } from '@/lib/session';

import { lireBienAValiderDuRendu } from './lecture';

/**
 * TCK-2931 — l'aperçu complet d'un bien à valider : **l'introuvable se décide ICI** (TCK-442 : un
 * `notFound()` de layout garde son 404, celui d'une page le perd sous un repli).
 *
 *  · un identifiant illisible → introuvable ;
 *  · la lecture de modération répond **404** (aucun bien) ou **403** (ce bien n'est pas à modérer
 *    par ce compte : autre agence, ou aucun droit de modérer — `reject-property`) → introuvable.
 *    Le 403 est rendu introuvable, et non « accès refusé » : l'aperçu d'un bien NON PUBLIÉ ne dit
 *    pas à qui ne le modère pas qu'il existe (contrainte du ticket) ;
 *  · toute autre panne (500, réseau) laisse la page se rendre et dire son erreur : *on ne dit pas
 *    qu'une ressource n'existe pas quand on l'ignore* (`ressource-de-detail.ts`).
 *
 * Le rôle, lui, est jugé par `garderPageAdmin` dans la page, comme toute page de `/app/agency`
 * (un compte sans page d'administration est RENVOYÉ, par le layout d'`agency` puis par la garde).
 *
 * ⚠ Ce layout ne rend rien de lui-même : transparent pour le dictionnaire, sans repli.
 */
export default async function Layout({
  params,
  children,
}: {
  readonly params: Promise<{ id: string }>;
  readonly children: ReactNode;
}) {
  const id = idDeDetail((await params).id);
  if (id === null) notFound();
  const token = await getToken();
  if (token) {
    try {
      await lireBienAValiderDuRendu(token, id);
    } catch (erreur) {
      if (erreur instanceof ApiError && (erreur.status === 403 || erreur.status === 404)) notFound();
    }
  }
  return <>{children}</>;
}
