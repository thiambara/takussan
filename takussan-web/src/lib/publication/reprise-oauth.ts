import { destinationInterne } from '@/lib/redirection-interne';

/**
 * TCK-2777 — l'aller-retour Google depuis la feuille de compte de `/publish`.
 *
 * L'annonce n'existe que dans ce navigateur (IndexedDB, ADR-0093) : le visiteur part chez le
 * fournisseur et doit revenir SUR elle, la feuille rouverte. Le rappel ne porte que `code` et
 * `state` : la destination voyage par l'intention de l'onglet (`memoriserIntentionOAuth`, TCK-589),
 * et elle dit aussi COMMENT reprendre (`?reprise=compte`).
 *
 * ⚠ **L'échec chez le fournisseur ramène sur `/publish` seulement par une LISTE BLANCHE de chemins.**
 * Le succès passe par `destinationInterne` (même hôte) puis par `/onboarding/intention`, comme avant.
 * L'échec, lui, n'ouvre aucune session : rien ne justifie de suivre le stockage de l'onglet, que tout
 * script de l'origine peut écrire. Il ne rend donc jamais la chaîne mémorisée, mais une constante
 * choisie par le chemin exact qu'elle désigne — et la connexion, comme avant, pour tout le reste.
 */
export const PARAMETRE_DE_REPRISE = 'reprise';

export type RepriseDePublication = 'compte' | 'echec';

/** La destination mémorisée avant le départ : `/publish`, la feuille à rouvrir connectée. */
export const DESTINATION_REPRISE_COMPTE = `/publish?${PARAMETRE_DE_REPRISE}=compte`;
/** Le retour d'un aller-retour annulé ou refusé : `/publish`, la feuille rouverte au numéro. */
export const DESTINATION_REPRISE_ECHEC = `/publish?${PARAMETRE_DE_REPRISE}=echec`;

/** Chemin exact de l'intention → où revenir quand le fournisseur échoue. Rien d'autre n'y revient. */
const RETOURS_D_ECHEC: Readonly<Record<string, string>> = {
  '/publish': DESTINATION_REPRISE_ECHEC,
};

/**
 * Où revenir après un échec chez le fournisseur : la constante de la liste blanche si l'intention
 * mémorisée vise EXACTEMENT un de ses chemins, `null` sinon (l'appelant garde la connexion).
 */
export function retourApresEchecOAuth(intention: string | null | undefined): string | null {
  const destination = destinationInterne(intention, '');
  if (destination === '') return null;
  const chemin = destination.split(/[?#]/)[0] ?? '';
  return Object.hasOwn(RETOURS_D_ECHEC, chemin) ? RETOURS_D_ECHEC[chemin]! : null;
}

/** La reprise demandée par l'URL de `/publish` — une valeur connue, ou rien. */
export function lireRepriseDePublication(recherche: string): RepriseDePublication | null {
  const valeur = new URLSearchParams(recherche).get(PARAMETRE_DE_REPRISE);
  return valeur === 'compte' || valeur === 'echec' ? valeur : null;
}
