import { cache } from 'react';
import { notFound } from 'next/navigation';

import { ApiError, apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';
import { cheminApi } from '@/lib/chemin-api';
import { fetchDashboardCustomer } from '@/lib/queries/customers';
import { fetchDashboardProperty } from '@/lib/queries/properties-server';

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
 * serveur, et ne partage une promesse qu'entre deux appels de la MÊME fonction, mêmes arguments.
 *
 * ⚠ TCK-1384 (P138.04) — cet en-tête affirmait que « la page qui refait la même lecture partage la
 * promesse », et que le patron était « gratuit en réseau ». C'était faux : aucune page n'appelait
 * `sonderExistence`, chacune lisait par sa propre fonction, et chaque fiche lue au serveur partait
 * deux fois. Ce qui est vrai désormais :
 *
 *  · `properties` et `customers`, dont la page lit la fiche AU SERVEUR, sont sondés par la lecture
 *    même de la page (`LECTURES_DE_PAGE` : `lireBienDuRendu`, `lireClientDuRendu`) : une requête,
 *    partagée, et le même 404 ;
 *  · les six autres, dont la page lit au navigateur, coûtent une lecture du `show` au serveur, en
 *    plus de celle du navigateur. Sans `fields[...]` : un `show` l'ignore (P60.03), et la garde
 *    `show-sans-fields.garde.test.ts` le refuse.
 */

/** Ce que la sonde peut conclure. Trois cas, jamais deux — cf. l'en-tête. */
export type Existence = 'existe' | 'introuvable' | 'indecidable';

/**
 * Les huit ressources de détail de `/app` : le segment d'URL et le chemin d'API.
 *
 * ⚠ Ils ne coïncident pas, et c'est la seule raison d'être de cette table : `/app/visits/12`
 * lit `/api/property-visits/12`. Une écriture déduite du segment aurait produit des 404 d'API —
 * c'est-à-dire de faux introuvables, exactement le défaut que ce module existe pour ne pas
 * commettre. (La table spatie n'y figure plus depuis TCK-1384 : la sonde n'envoie plus de
 * `fields[...]`.)
 */
export const RESSOURCES_DE_DETAIL = {
  bookings: { api: 'bookings' },
  customers: { api: 'customers' },
  documents: { api: 'documents' },
  inventories: { api: 'inventories' },
  leases: { api: 'leases' },
  maintenance: { api: 'maintenance-requests' },
  properties: { api: 'properties' },
  visits: { api: 'property-visits' },
} as const satisfies Record<string, { readonly api: string }>;

export type SegmentDeDetail = keyof typeof RESSOURCES_DE_DETAIL;

/**
 * L'identifiant d'une page de détail, ou `null`.
 *
 * ⚠ `Number.isInteger`, et non `Number.isFinite` que les pages employaient : `/app/bookings/1.5`
 * est un chemin qui ne désigne aucune ligne, et `Number.isFinite(1.5)` l'acceptait.
 *
 * TCK-2119 (P215.03) — des chiffres seuls, sans zéro de tête, et un entier EXACT : `Number`
 * acceptait `1e3`, `0x10`, et lisait `12345678901234567` comme `12345678901234568`, une autre
 * ligne que celle du chemin ; vingt chiffres repartaient vers l'API en `100000000000000000000`.
 */
const ID_DE_DETAIL = /^[1-9][0-9]{0,15}$/;

export function idDeDetail(brut: string): number | null {
  if (!ID_DE_DETAIL.test(brut)) return null;
  const id = Number(brut);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * TCK-1384 (P138.04) — la fiche d'un bien, lue une fois par rendu : par la sonde du layout, puis
 * par la page `properties/[id]`, qui partagent la promesse. Même erreur pour les deux : la sonde
 * en tire l'introuvable, la page le panneau « accès refusé ».
 */
export const lireBienDuRendu = cache((token: string, id: number) => fetchDashboardProperty(token, id));

/** TCK-1384 (P138.04) — de même pour la fiche d'un client (`customers/[id]`). */
export const lireClientDuRendu = cache((token: string, id: number) => fetchDashboardCustomer(token, id));

/** Les segments dont la page lit la fiche au serveur : la sonde passe par sa lecture. */
const LECTURES_DE_PAGE: Partial<Record<SegmentDeDetail, (token: string, id: number) => Promise<unknown>>> = {
  properties: lireBienDuRendu,
  customers: lireClientDuRendu,
};

/**
 * La ressource existe-t-elle ? Une lecture mémoïsée pour la durée de la requête.
 *
 * Là où la page lit la fiche au serveur, la sonde EST cette lecture (`LECTURES_DE_PAGE`). Ailleurs,
 * elle lit le `show`, sans `fields[...]` qu'il ignorerait (P60.03).
 */
export const sonderExistence = cache(
  async (segment: SegmentDeDetail, id: number): Promise<Existence> => {
    const token = await getToken();
    // Sans jeton, la question n'a pas de réponse : le proxy aura déjà renvoyé vers la connexion.
    if (!token) return 'indecidable';

    const lecture = LECTURES_DE_PAGE[segment];
    try {
      if (lecture) {
        await lecture(token, id);
      } else {
        const { api } = RESSOURCES_DE_DETAIL[segment];
        await apiRequest<unknown>(cheminApi`/api/${api}/${id}`, { token });
      }
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
