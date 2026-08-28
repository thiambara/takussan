import {
  type CleDeRechercheNom,
  CLES_DE_RECHERCHE,
  definitionDe,
} from '@/types/search';

/**
 * La règle de CANONICITÉ de `/properties` — TCK-433.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST TRANCHÉ, ET POURQUOI CE N'EST PAS « L'URL COURANTE »
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `/properties` porte **23 clés** (`CLES_DE_RECHERCHE`, mesuré le 2026-08-27) : 20 filtres plus
 * `sort`, `page` et `per_page`. Toutes sont sérialisées dans l'URL par `useSearch`, par
 * construction (TCK-340). Un moteur voit donc une page distincte par combinaison, servant
 * essentiellement le même catalogue.
 *
 * Poser `canonical = URL courante` reviendrait à ne rien décider — c'est exactement ce que le
 * ticket refuse. Le partage retenu est le suivant.
 *
 * ── TROIS CLÉS GARDENT LEUR PROPRE URL INDEXABLE ────────────────────────────────────────────────
 *
 * `contract_type`, `type`, `city` — et le critère est le même pour les trois :
 *
 * · **leur ensemble de valeurs est FINI et énumérable** — 2 pour le contrat, 16 pour le type
 *   (`Record<PropertyType, …>` de `jsonld-property.ts`), les villes du catalogue pour la
 *   troisième. Le nombre de pages indexables reste donc borné, ce qui est la seule propriété qui
 *   compte ici : une clé à valeurs libres produit une page par valeur saisie ;
 * · **elles nomment une INTENTION de recherche** — « villas à louer à Dakar » est une requête
 *   qu'un visiteur formule ; « biens entre 45 000 et 47 500 F, triés par surface » ne l'est pas ;
 * · **elles ont déjà un libellé traduit** (`property.types`, `property.contractTypes`), donc le
 *   `<title>` dérivé se dit dans les trois langues sans dictionnaire neuf.
 *
 * ── LES DIX-SEPT AUTRES FILTRES SE REPLIENT SUR LA PAGE NUE ─────────────────────────────────────
 *
 * Texte libre (`q`), rayon géographique (`radius_km`/`lat`/`lng`, à valeurs continues), bornes
 * numériques (`price_min`/`price_max`, `area_min`/`area_max`, `bedrooms`, `bathrooms`,
 * `floor_number`), `furnished`, `featured`, `available_from`, `tags`, `rent_period`, `location`.
 * Chacune multiplie les URL sans changer ce que la page EST : un sous-ensemble du même catalogue.
 *
 * ── LA PAGINATION ET LE TRI SE REPLIENT AUSSI, ET C'EST LE POINT LE PLUS DISCUTABLE ─────────────
 *
 * `page`, `sort`, `per_page` sont écartés : `?page=3` est canonique vers la page 1 du même jeu de
 * filtres. C'est contraire au réflexe habituel (une page de pagination est canonique d'elle-même).
 *
 * ⚠️ **CETTE DÉCISION A ÉTÉ REPRISE PAR TCK-432, ET L'UNE DE SES DEUX RAISONS EST MORTE.**
 * Le paragraphe qui précédait invoquait d'abord ceci :
 *
 * > *la liste est rendue côté CLIENT — `PropertiesDiscoveryPage` lit `useSearchParams` — donc un
 * > explorateur reçoit la MÊME coque HTML sur `?page=1` et sur `?page=42`.*
 *
 * **C'était vrai le 2026-08-27 et c'est FAUX depuis TCK-432** : la page est un composant serveur
 * qui exécute la recherche avec les filtres de l'URL, `page` compris, et `?page=42` rend
 * aujourd'hui quarante-deux biens différents dans le HTML servi (mesuré, cf. le docblock de
 * `(liste)/page.tsx`). *Un commentaire qui affirme encore la mesure que le commit d'à côté vient
 * d'invalider est pire qu'un commentaire absent : on ne s'en méfie pas.*
 *
 * La décision est **maintenue**, sur deux raisons qui ne dépendent d'aucun mode de rendu :
 *
 * · **aucune fiche n'en dépend pour être découverte** : depuis TCK-431, `/sitemap.xml` liste
 *   chaque fiche publiée, dans les trois langues. L'argument habituel contre le repli — « les
 *   biens des pages profondes deviennent introuvables » — ne tient pas ici. C'est la seule des
 *   deux raisons d'origine qui survive, et elle était déjà la plus forte ;
 * · **la découpe est VOLATILE, et c'est ce que le rendu serveur rend visible plutôt qu'il ne
 *   l'introduit** : une publication décale toutes les bornes. Une URL `?page=3` indexée ne
 *   désigne donc pas un contenu, elle désigne un rang — le troisième wagon d'un train dont les
 *   wagons changent. Déclarer canonique une page dont le contenu se renouvelle sans que l'URL
 *   bouge, c'est indexer une adresse et servir autre chose. `sort` et `per_page` sont plus
 *   simples encore : à filtres égaux ils rendent le MÊME ensemble de biens, réordonné ou
 *   redécoupé. C'est la définition du contenu dupliqué, et elle n'a jamais rien eu à voir avec
 *   l'endroit où le HTML est fabriqué.
 *
 * ⚠ Ce qui rouvrirait la question : des **pages de facettes paginées** délibérément indexables
 * (« villas à Dakar, page 2 »), c'est-à-dire une surface produit qui n'existe pas — elle est
 * explicitement hors périmètre, cf. AC5 plus bas. Le point de reprise est ce paragraphe.
 *
 * ── COHÉRENCE AVEC LE SITEMAP (AC5) ─────────────────────────────────────────────────────────────
 *
 * `src/app/sitemap.ts` ne déclare que `/properties` NUE. Aucune URL non canonique n'y entre donc,
 * et les URL de facettes (`?type=villa`) n'y entrent pas non plus : les pages de facettes dédiées
 * sont explicitement hors périmètre du ticket (« surface produit non spécifiée »). Elles restent
 * atteignables par le maillage interne, et se déclarent canoniques d'elles-mêmes quand on y arrive.
 */

/**
 * Les clés qui MÉRITENT leur propre URL canonique, dans l'ordre où elles sont écrites.
 *
 * L'ordre est fixe et fait partie de la règle : sans lui, `?type=villa&city=Dakar` et
 * `?city=Dakar&type=villa` produiraient deux canoniques différentes pour la même page, ce qui est
 * précisément le défaut qu'on corrige.
 */
export const CLES_CANONIQUES: readonly CleDeRechercheNom[] = ['contract_type', 'type', 'city'];

/** Le chemin de la liste, sans langue et sans paramètre. */
export const CHEMIN_LISTE = '/properties';

/**
 * Les valeurs retenues pour la canonique, lues par les MÊMES fonctions que `useSearch`.
 *
 * ⚠ Réutiliser `definitionDe(cle).lire` n'est pas une économie de lignes : c'est ce qui fait que
 * `?search=villa` et `?q=villa` se comportent identiquement (la clé `q` possède les deux
 * paramètres depuis TCK-335), et qu'une clé ajoutée à la table est lue ici sans qu'on y pense.
 * Une seconde lecture écrite à la main divergerait, et la divergence produirait deux canoniques
 * pour une même page.
 */
export function filtresCanoniques(params: URLSearchParams): Map<CleDeRechercheNom, string> {
  const retenus = new Map<CleDeRechercheNom, string>();

  for (const cle of CLES_CANONIQUES) {
    const definition = definitionDe(cle);
    const valeur = definition.lire(params);
    if (valeur === undefined || valeur === null) continue;

    // `type` est MULTI-VALUÉ (`type=villa,house`). Une sélection multiple est une vue composée par
    // l'utilisateur, pas une facette : elle se replie sur la page nue. Une seule valeur est une
    // facette et garde son URL.
    if (Array.isArray(valeur)) {
      if (valeur.length !== 1) continue;
    }

    const ecrit = definition.ecrire(valeur);
    if (ecrit === undefined || ecrit === '') continue;
    retenus.set(cle, ecrit);
  }

  return retenus;
}

/**
 * Le CHEMIN canonique de `/properties` pour une requête donnée — sans langue et sans origine.
 *
 * `/properties?type=villa&page=3&sort=-created_at&per_page=48` → `/properties?type=villa`.
 */
export function cheminCanoniqueDeLaListe(params: URLSearchParams): string {
  const retenus = filtresCanoniques(params);
  if (retenus.size === 0) return CHEMIN_LISTE;

  const query = new URLSearchParams();
  // On réécrit dans l'ordre de `CLES_CANONIQUES`, pas dans celui de la requête.
  for (const cle of CLES_CANONIQUES) {
    const valeur = retenus.get(cle);
    if (valeur !== undefined) query.set(definitionDe(cle).params[0], valeur);
  }

  return `${CHEMIN_LISTE}?${query.toString()}`;
}

/** `searchParams` de Next → `URLSearchParams`, une valeur répétée gardant la PREMIÈRE. */
export function versParametres(
  brut: Readonly<Record<string, string | readonly string[] | undefined>>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(brut)) {
    if (valeur === undefined) continue;
    // Next rend un tableau quand le paramètre est répété (`?type=a&type=b`). `litTexte` attend une
    // chaîne : on garde la première, comme le ferait `URLSearchParams.get`.
    params.set(cle, Array.isArray(valeur) ? (valeur[0] ?? '') : String(valeur));
  }
  return params;
}

/**
 * Les clés que la canonique ÉCARTE — dérivé, jamais recopié.
 *
 * Exporté pour le test de la règle : il vérifie que la partition couvre les 23 clés de la table,
 * de sorte qu'une clé ajoutée à `SEARCH_FILTER_KEYS` sans décision de canonicité fasse rougir.
 */
export const CLES_ECARTEES: readonly CleDeRechercheNom[] = CLES_DE_RECHERCHE.filter(
  (cle) => !CLES_CANONIQUES.includes(cle),
);
