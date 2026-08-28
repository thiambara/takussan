/**
 * La règle de CANONICITÉ des deux index de profils — TCK-436, dans la continuité de TCK-433.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ELLE APPLIQUE LE MÊME CRITÈRE QUE `/properties`, PAS UN AUTRE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `src/lib/canonique.ts` a tranché pour `/properties` : une clé garde son URL indexable si son
 * ensemble de valeurs est **fini et énumérable**, si elle nomme une **intention de recherche**, et
 * si elle a déjà un **libellé traduit**. Les trois pages de ce ticket portent trois clés, et le
 * même critère les partage sans qu'on ait besoin d'en inventer un second :
 *
 * · **`city` GARDE son URL.** L'ensemble est fini et il est même SERVI par l'API (`meta.cities`,
 *   dérivé du catalogue éligible) ; « agences immobilières à Thiès » est une requête qu'un
 *   visiteur formule ; le libellé est le nom de la ville, identique dans les trois langues.
 * · **`q` se replie.** Valeurs libres ⇒ une page indexable par chaîne saisie. C'est exactement le
 *   sort de `q` sur `/properties`.
 * · **`page` se replie**, et pour une raison PLUS forte qu'ailleurs : `?page=3` d'un annuaire ne
 *   nomme rien. Contrairement à `/properties`, l'argument « les profils des pages profondes
 *   deviennent introuvables » ne tient pas non plus — depuis ce même ticket, `/sitemap.xml` liste
 *   chaque profil éligible dans les trois langues.
 *
 * ⚠ Ces pages sont rendues **côté SERVEUR**, contrairement à `/properties` (cf.
 * `TCK-432`). La première des deux raisons qui font replier `page` sur la liste de biens — « un
 * explorateur reçoit la même coque HTML sur `?page=1` et `?page=42` » — ne s'applique donc PAS
 * ici : chaque page rend un document différent. Elles se replient quand même, sur la seconde
 * raison seule, qui suffit : le sitemap rend chaque profil atteignable directement.
 *
 * ⚠ Aucun `sort` n'entre dans la canonique : il n'est même pas exposé dans l'URL de ces pages.
 * Le jour où il le serait, il se replierait — c'est un ordre d'affichage, pas une page.
 */

/** Les clés que ces pages lisent dans l'URL. Écrite ici, dérivée par {@link CLES_ECARTEES_PROFILS}. */
export const CLES_DINDEX_DE_PROFILS = ['city', 'q', 'page'] as const;

export type CleDIndexDeProfils = (typeof CLES_DINDEX_DE_PROFILS)[number];

/** Les clés qui MÉRITENT leur propre URL canonique. */
export const CLES_CANONIQUES_PROFILS: readonly CleDIndexDeProfils[] = ['city'];

/**
 * Les clés écartées — DÉRIVÉES, jamais recopiées.
 *
 * Exporté pour le test de la règle : il vérifie que la partition couvre toutes les clés lues, de
 * sorte qu'une clé ajoutée sans décision de canonicité fasse rougir. C'est le motif de
 * `CLES_ECARTEES` dans `canonique.ts`.
 */
export const CLES_ECARTEES_PROFILS: readonly CleDIndexDeProfils[] = CLES_DINDEX_DE_PROFILS.filter(
  (cle) => !CLES_CANONIQUES_PROFILS.includes(cle),
);

/**
 * Le CHEMIN canonique d'un index de profils — sans langue et sans origine.
 *
 * `/agents?city=Dakar&q=awa&page=3` → `/agents?city=Dakar`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * `villeCertifiee` : POURQUOI LA VILLE NE VIENT PAS DE `params`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La première version lisait `city` directement dans l'URL demandée. Mesuré par la revue
 * adverse : `?city=Zzzinventee-vente-de-liens` produisait alors une page **200, index/follow,
 * canonique d'elle-même**, dont le `<title>` portait la chaîne choisie par l'appelant. L'espace
 * d'URL indexables devenait **non borné** — une page par chaîne qu'on veut bien inventer, sur un
 * domaine réel. C'est le défaut jumeau de `/properties`, et il ne se corrige pas en refusant
 * quelques valeurs : *une garde qui ne connaît que la liste des valeurs valides et écarte le
 * reste ne garde rien — ici « le reste » est infini.*
 *
 * La ville retenue est donc **certifiée par l'API** et passée ici : `null` signifie « cette
 * facette n'existe pas, replie sur la page nue ». Le verdict se prend dans
 * `verdictDeFacette()` (`src/lib/queries/public-profiles.ts`), sur le seul critère qui ne
 * s'énumère pas — *la facette a-t-elle du contenu* — et il rend au passage l'ORTHOGRAPHE de
 * l'API, de sorte que `?city=dakar` et `?city=Dakar` désignent une seule et même canonique.
 *
 * ⚠ Le repliement de `q` et de `page`, lui, reste porté par cette fonction : elles ne sont
 * simplement jamais recopiées.
 */
export function cheminCanoniqueDesProfils(
  base: string,
  params: URLSearchParams,
  villeCertifiee: string | null,
): string {
  const query = new URLSearchParams();

  for (const cle of CLES_CANONIQUES_PROFILS) {
    // `city` est la seule clé canonique, et sa valeur ne vient PAS de `params` : elle vient du
    // verdict. La boucle reste écrite sur la table pour qu'une clé canonique ajoutée demain
    // passe par une décision explicite ici plutôt que d'être recopiée en silence.
    if (cle === 'city') {
      if (villeCertifiee !== null && villeCertifiee !== '') query.set('city', villeCertifiee);
      continue;
    }
    const valeur = params.get(cle)?.trim();
    if (valeur === undefined || valeur === '') continue;
    query.set(cle, valeur);
  }

  const chaine = query.toString();
  return chaine === '' ? base : `${base}?${chaine}`;
}

/** `searchParams` de Next → `URLSearchParams`, une valeur répétée gardant la PREMIÈRE. */
export function versParametresDeProfils(
  brut: Readonly<Record<string, string | readonly string[] | undefined>>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(brut)) {
    if (valeur === undefined) continue;
    params.set(cle, Array.isArray(valeur) ? (valeur[0] ?? '') : String(valeur));
  }
  return params;
}

/** La ville DEMANDÉE dans l'URL — candidate au verdict, jamais retenue telle quelle. */
export function villeDemandee(params: URLSearchParams): string | undefined {
  const brut = params.get('city')?.trim();
  return brut === undefined || brut === '' ? undefined : brut;
}

/** Le numéro de page demandé, borné à 1 — une valeur illisible n'est pas une erreur, c'est la page 1. */
export function pageDemandee(params: URLSearchParams): number {
  const brut = Number.parseInt(params.get('page') ?? '1', 10);
  return Number.isFinite(brut) && brut >= 1 ? brut : 1;
}
