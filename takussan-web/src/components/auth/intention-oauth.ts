import { destinationInterne } from '@/lib/redirection-interne';

/**
 * TCK-589 — l'intention d'origine (`?redirect=`) à travers l'aller-retour OAuth.
 *
 * Le fournisseur rappelle `/auth/oauth/{provider}/callback` avec `code` et `state`, rien d'autre :
 * l'URL de rappel est déclarée chez lui et ne transporte pas la page qu'on voulait atteindre. Un
 * visiteur venu réserver repartait donc de `/app`. L'intention est posée dans l'onglet juste avant
 * de partir, et relue au retour quand l'URL n'en porte pas.
 *
 * `sessionStorage` : elle vaut pour l'onglet qui part chez le fournisseur et qui en revient. Il
 * peut manquer (navigation privée, stockage bloqué) : chaque accès est gardé, et son absence
 * ramène au comportement d'avant.
 */
export const CLE_INTENTION_OAUTH = 'takussan:intention-oauth';

export function memoriserIntentionOAuth(brute: string | null | undefined): void {
  const destination = destinationInterne(brute, '');
  try {
    if (destination === '') window.sessionStorage.removeItem(CLE_INTENTION_OAUTH);
    else window.sessionStorage.setItem(CLE_INTENTION_OAUTH, destination);
  } catch {
    // Stockage indisponible : le retour retombera sur `/app`, comme avant.
  }
}

/**
 * L'intention mémorisée, REFILTRÉE à la lecture : le stockage est modifiable par n'importe quel
 * script de la même origine, et ce qu'il rend devient une destination de navigation.
 */
export function intentionOAuthMemorisee(): string | null {
  try {
    const destination = destinationInterne(window.sessionStorage.getItem(CLE_INTENTION_OAUTH), '');
    return destination === '' ? null : destination;
  } catch {
    return null;
  }
}

export function oublierIntentionOAuth(): void {
  try {
    window.sessionStorage.removeItem(CLE_INTENTION_OAUTH);
  } catch {
    // Rien à oublier.
  }
}
