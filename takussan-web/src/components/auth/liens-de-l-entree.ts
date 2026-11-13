import { avecRedirection } from '@/lib/redirection-interne';

import { lireActionDEntree, type ActionDEntree } from './lien-connexion';

/**
 * TCK-2606 — un écran d'entrée vers un autre, sans perdre ce que le visiteur faisait.
 *
 * La connexion, l'oubli et la vérification de l'adresse se passent la page à rouvrir (`redirect`,
 * filtrée par `destinationInterne`) ET le geste interrompu (`intention`, liste fermée) : sans le
 * second, la barre du bien quitté disparaissait dès « Mot de passe oublié ? » ; sans le premier,
 * l'oubli renvoyait à `/app`.
 */
export interface IntentionDeLUrl {
  /** La page à rouvrir, brute : chaque relais l'assainit (`avecRedirection`). */
  readonly redirect: string | null;
  readonly action: ActionDEntree | null;
}

export function cheminDEntree(chemin: string, { redirect, action }: IntentionDeLUrl, extra?: Record<string, string>): string {
  let href = avecRedirection(chemin, redirect);
  const params = new URLSearchParams();
  // Une action sans page à rouvrir ne dit rien : la barre du bien la lit avec `redirect`.
  if (action && href !== chemin) params.set('intention', action);
  for (const [cle, valeur] of Object.entries(extra ?? {})) params.set(cle, valeur);
  const suite = params.toString();
  if (suite) href += `${href.includes('?') ? '&' : '?'}${suite}`;
  return href;
}

/** L'intention lue dans l'URL d'un écran d'entrée — l'action seulement si elle est de la liste. */
export function intentionDeLUrl(params: { get(nom: string): string | null }): IntentionDeLUrl {
  return { redirect: params.get('redirect'), action: lireActionDEntree(params.get('intention')) };
}
