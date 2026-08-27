/**
 * La table des LISTES de `/app`, et la règle qui remonte d'une URL de détail vers la sienne.
 *
 * Elle sert le `not-found.tsx` du tableau de bord : quand un identifiant ne désigne rien, le
 * chemin de retour ne peut pas être « la page précédente » (l'utilisateur y arrive souvent par
 * un lien collé) ni « l'accueil » seul (il perd le contexte). C'est la liste dont l'objet
 * manquant relève.
 *
 * ⚠ Cette table est écrite à la main et ne peut donc pas être juste toute seule — c'est
 * exactement le motif que l'INDEX du backlog a payé. Elle est GARDÉE :
 * `src/app/(dashboard)/app/__tests__/introuvable.test.tsx` échoue si un segment `[id]` apparaît
 * sous `/app` sans y figurer, et si une destination citée n'a pas de `page.tsx` sur le disque.
 */
export const LISTES_PAR_SECTION: Readonly<Record<string, string>> = {
  bookings: '/app/bookings',
  customers: '/app/customers',
  documents: '/app/documents',
  inventories: '/app/inventories',
  leases: '/app/leases',
  maintenance: '/app/maintenance',
  properties: '/app/properties',
  visits: '/app/visits',
};

/**
 * Rend la liste dont relève `pathname`, ou `null` quand l'URL ne désigne aucune section connue —
 * auquel cas l'appelant n'offre que le retour au tableau de bord. Rendre `/app/<inconnu>` serait
 * proposer un second introuvable comme remède au premier.
 */
export function listePour(pathname: string | null | undefined): string | null {
  const [espace, section] = (pathname ?? '').split('/').filter(Boolean);
  // `espace` est vérifié : sans lui, `/admin/properties/9` rendait `/app/properties`. La frontière
  // `not-found` de ce répertoire ne voit que `/app`, mais une fonction exportée finit ailleurs.
  if (espace !== 'app' || !section) return null;
  return LISTES_PAR_SECTION[section] ?? null;
}
