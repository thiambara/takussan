import { cache } from 'react';
import { notFound } from 'next/navigation';

import { ApiError, apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * TCK-442 — **remonter la REQUÊTE, pas seulement la décision.**
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE TCK-426 A LAISSÉ, ET POURQUOI CE MODULE EXISTE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-426 a rendu son statut à chaque refus fondé sur l'**utilisateur** en le remontant dans le
 * `layout.tsx` de son segment, au-dessus de la frontière de suspension ouverte par `loading.tsx`.
 * Il n'a pas pu traiter l'autre moitié, et la coupure n'était pas arbitraire :
 *
 * > Un refus fondé sur l'utilisateur se décide avant toute donnée : il peut toujours monter dans un
 * > layout. Un refus fondé sur la RÉPONSE de l'API — « ce bail n'existe pas » — ne monte pas sans
 * > que la **requête** monte avec lui.
 *
 * C'est cette requête-là. Elle est appelée par les huit `[id]/layout.tsx` de `/app`, chacun
 * strictement au-dessus du `loading.tsx` de son propre segment. Le tableau mesuré de TCK-426 (Next
 * 16.3.1, sondes jetables, `curl -w '%{http_code}'`) en donne l'effet :
 *
 *     notFound() de PAGE   + repli du même segment ou d'un ancêtre → 200   ← le défaut
 *     notFound() de LAYOUT + repli DU MÊME SEGMENT                 → 404, et le repli couvre la page
 *     notFound() de LAYOUT + repli d'un ANCÊTRE                    → 200
 *
 * La deuxième ligne est tout l'intérêt du patron **(a)** : le squelette de TCK-382 continue d'être
 * servi (AC2), et le statut survit. La troisième explique pourquoi ce ticket a aussi dû descendre
 * six `loading.tsx` de segment parent dans un groupe `(liste)` — un repli d'ancêtre efface le
 * statut d'un layout descendant aussi sûrement que celui d'une page.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * TROIS ISSUES, PAS DEUX — et c'est la troisième qui compte
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `existe` / `introuvable` / `indecidable`. La troisième est la leçon déjà payée sur la fiche
 * publique (TCK-335) : un `try { … } catch { notFound() }` rend « ce bail n'existe pas » pour une
 * API éteinte comme pour un identifiant supprimé. *On ne dit pas qu'une ressource n'existe pas
 * quand on l'ignore.* Seul un **404 franc** de l'API produit un introuvable ; une panne, un 500, un
 * réseau coupé laissent la page se rendre et afficher son propre état d'erreur.
 *
 * Le 401/403 est `indecidable` lui aussi, et délibérément : « ce dossier n'est pas le vôtre » n'est
 * pas « ce dossier n'existe pas », et les pages qui savent le dire le disent mieux — c'est le
 * panneau « accès refusé » de `customers/[id]` et, depuis ce ticket, de `properties/[id]`.
 *
 * ⚠ **`cache()` de React, pas un cache HTTP.** La mémoïsation vaut pour la durée d'UNE requête
 * serveur : le layout sonde, et la page qui refait la même lecture partage la promesse. C'est ce
 * qui rend le patron (a) gratuit en réseau — le point que le ticket demandait de mesurer avant
 * d'écrire.
 */

/** Ce que la sonde peut conclure. Trois cas, jamais deux — cf. l'en-tête. */
export type Existence = 'existe' | 'introuvable' | 'indecidable';

/**
 * Les huit ressources de détail de `/app` : le segment d'URL, le chemin d'API, la table spatie.
 *
 * ⚠ Les trois ne coïncident pas, et c'est la seule raison d'être de cette table : `/app/visits/12`
 * lit `/api/property-visits/12` et demande `fields[property_visits]`. Une écriture déduite du
 * segment aurait produit trois 404 d'API — c'est-à-dire trois faux introuvables, exactement le
 * défaut que ce module existe pour ne pas commettre.
 */
export const RESSOURCES_DE_DETAIL = {
  bookings: { api: 'bookings', table: 'bookings' },
  customers: { api: 'customers', table: 'customers' },
  documents: { api: 'documents', table: 'documents' },
  inventories: { api: 'inventories', table: 'inventories' },
  leases: { api: 'leases', table: 'leases' },
  maintenance: { api: 'maintenance-requests', table: 'maintenance_requests' },
  properties: { api: 'properties', table: 'properties' },
  visits: { api: 'property-visits', table: 'property_visits' },
} as const satisfies Record<string, { readonly api: string; readonly table: string }>;

export type SegmentDeDetail = keyof typeof RESSOURCES_DE_DETAIL;

/**
 * L'identifiant d'une page de détail, ou `null`.
 *
 * ⚠ `Number.isInteger`, et non `Number.isFinite` que les pages employaient : `/app/bookings/1.5`
 * est un chemin qui ne désigne aucune ligne, et `Number.isFinite(1.5)` l'acceptait.
 */
export function idDeDetail(brut: string): number | null {
  const id = Number(brut);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * La ressource existe-t-elle ? Une lecture minimale, mémoïsée pour la durée de la requête.
 *
 * Le sparse fieldset est réduit à `id` — c'est le contrat de lecture du dépôt (spatie), et c'est
 * aussi la plus petite réponse possible. Si l'API refusait ce champ, elle rendrait un 400 : traité
 * comme `indecidable`, donc sans jamais inventer un introuvable.
 */
export const sonderExistence = cache(
  async (segment: SegmentDeDetail, id: number): Promise<Existence> => {
    const token = await getToken();
    // Sans jeton, la question n'a pas de réponse : le proxy aura déjà renvoyé vers la connexion.
    if (!token) return 'indecidable';

    const { api, table } = RESSOURCES_DE_DETAIL[segment];
    try {
      await apiRequest<unknown>(`/api/${api}/${id}?fields[${table}]=id`, { token });
      return 'existe';
    } catch (erreur) {
      if (erreur instanceof ApiError && erreur.status === 404) return 'introuvable';
      return 'indecidable';
    }
  },
);

/**
 * **Le point d'appel des huit `[id]/layout.tsx`.** Rend l'identifiant, ou lève l'introuvable.
 *
 * Deux causes d'introuvable, et le ticket insiste sur la seconde : un identifiant illisible (le
 * seul cas que les pages traitaient, et `/app/bookings/999999` n'en fait pas partie), et un **404
 * de l'API** — c'est-à-dire le cas que rencontre réellement un utilisateur.
 */
export async function exigerRessource(segment: SegmentDeDetail, brut: string): Promise<number> {
  const id = idDeDetail(brut);
  if (id === null) notFound();
  if ((await sonderExistence(segment, id)) === 'introuvable') notFound();
  return id;
}
