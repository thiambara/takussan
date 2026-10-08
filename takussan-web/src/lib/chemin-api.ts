import { ApiError } from '@/lib/api';

/**
 * TCK-600 (ADR-0055 §6, verif-600 B1 et B1-bis) — la SEULE façon de mettre une valeur dans le chemin
 * d'une URL de l'API.
 *
 * Une valeur interpolée telle quelle dans un chemin le réécrit : `fetch` (WHATWG URL) lit `?` comme
 * une requête, `#` comme un fragment, et RÉSOUT les `..`. B1 passait par les segments des route
 * handlers, que Next décode ; B1-bis par l'argument d'une server action, que le navigateur choisit
 * librement — le `number` du TypeScript n'existe pas à l'exécution :
 * `createCustomerNoteAction("../admin/users/12/impersonate?reason=…&x=", …)` ouvrait une
 * impersonation et rendait son jeton à la page.
 *
 * Un segment qui porte `/`, `?`, `#` ou `\`, qui vaut `.` ou `..`, ou qui est vide, n'a aucune
 * lecture légitime : il est REFUSÉ, pas nettoyé. Les autres sont encodés.
 */

const REQUETE = Symbol('requete');

/** Un suffixe de requête que le CODE a construit — jamais une chaîne venue du navigateur. */
export type Requete = { readonly [REQUETE]: string };

/**
 * Marque `qs` (sans `?`, tel que le rendent `URLSearchParams#toString` et `buildQueryString`)
 * comme le suffixe de requête d'un {@link cheminApi}. Vide, il n'ajoute rien.
 */
export function requete(qs: string | URLSearchParams): Requete {
  return { [REQUETE]: String(qs) };
}

function suffixeDeRequete(valeur: unknown): string | null {
  if (valeur instanceof URLSearchParams) return valeur.toString();
  if (typeof valeur === 'object' && valeur !== null && REQUETE in valeur) return (valeur as Requete)[REQUETE];
  return null;
}

const INTERDITS = /[/?#\\]/;

/** Le segment encodé, ou `null` s'il doit être refusé. */
export function segmentAmont(segment: string): string | null {
  if (segment === '' || segment === '.' || segment === '..' || INTERDITS.test(segment)) return null;
  return encodeURIComponent(segment);
}

/** Les segments d'un catch-all, encodés et joints par `/`, ou `null` si l'un est refusé. */
export function cheminAmont(segments: readonly string[]): string | null {
  const encodes = segments.map(segmentAmont);
  return encodes.some((s) => s === null) ? null : encodes.join('/');
}

/**
 * Gabarit étiqueté : `` cheminApi`/api/customers/${id}/notes` ``.
 *
 * - Une valeur placée dans le CHEMIN passe par {@link segmentAmont} : encodée, ou refusée par une
 *   `ApiError` 400 `invalid_path` — aucun appel ne part.
 * - Un suffixe de requête ne vient que d'un `URLSearchParams` ou de {@link requete} : vide, il
 *   n'ajoute rien ; sinon `?` et lui, et tout ce qui suit est requête. Une CHAÎNE qui commence par
 *   `?` est un segment comme un autre, donc refusée (verif-600 m-C :
 *   `createCustomerNoteAction("?reason=…&x=", …)` tronquait vers `POST /api/customers/?…`, la
 *   création de la collection).
 * - Une valeur vide n'est refusée que si elle forme un segment vide (entre `/` et `/`, `?` ou la
 *   fin).
 * - Après un `?` écrit dans le gabarit, les valeurs sont des valeurs de requête et passent telles
 *   quelles (elles sont déjà construites par `URLSearchParams` ou `buildQueryString`).
 */
export function cheminApi(gabarit: TemplateStringsArray, ...valeurs: unknown[]): string {
  let chemin = gabarit[0];
  let enRequete = chemin.includes('?');

  valeurs.forEach((valeur, i) => {
    const suffixe = suffixeDeRequete(valeur);
    const texte = suffixe ?? String(valeur);
    const suite = gabarit[i + 1];
    if (enRequete) {
      chemin += texte;
    } else if (suffixe !== null) {
      if (suffixe !== '') {
        chemin += `?${suffixe}`;
        enRequete = true;
      }
    } else if (texte === '') {
      // Un suffixe vide (`/api/customers${…}`) ne change rien ; un SEGMENT vide
      // (`/api/leases//payments`, `/api/leases/`) en change un.
      const segmentVide = chemin.endsWith('/') && (suite === '' || suite.startsWith('/') || suite.startsWith('?'));
      if (segmentVide) throw new ApiError(400, { code: 'invalid_path' });
    } else {
      const segment = segmentAmont(texte);
      if (segment === null) throw new ApiError(400, { code: 'invalid_path' });
      chemin += segment;
    }
    chemin += suite;
    if (suite.includes('?')) enRequete = true;
  });

  return chemin;
}
