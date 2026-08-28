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
 * qui exécute la recherche avec les filtres de l'URL, `page` compris. Mesuré le 2026-08-28,
 * `?page=1` et `?page=2` rendent trente slugs chacun, **recouvrement 0**. *Un commentaire qui
 * affirme encore la mesure que le commit d'à côté vient d'invalider est pire qu'un commentaire
 * absent : on ne s'en méfie pas.*
 *
 * ⚠️⚠️ **ET CE PARAGRAPHE A RÉCIDIVÉ ICI MÊME — TROISIÈME AFFIRMATION FAUSSE DE LA LIGNÉE.**
 * La version du 2026-08-28 écrivait, deux lignes plus haut : *« `?page=42` rend aujourd'hui
 * quarante-deux biens différents dans le HTML servi (mesuré, cf. le docblock de
 * `(liste)/page.tsx`) »*. **Les deux moitiés étaient fausses**, et il faut nommer les deux
 * séparément parce qu'elles ne se détectent pas de la même façon :
 *
 * · **le chiffre** — `?page=42` ne rend pas quarante-deux biens, il en rend **zéro** (relevé
 *   ci-dessous) ;
 * · **le renvoi** — `grep -c 'page=42' (liste)/page.tsx` rend **0**. Il ne menait à rien.
 *   *Un renvoi vide donne l'apparence de la preuve à ce qui n'en a pas, et il est plus difficile
 *   à détecter qu'une affirmation nue : il décourage la vérification au lieu de l'appeler.*
 *
 * ⚠️ **D'où venait le chiffre : d'une figure de style.** La prémisse d'origine citée ci-dessus
 * employait `?page=42` comme **exemple rhétorique** d'une page profonde — elle n'affirmait rien
 * de son contenu. La réécriture qui la corrigeait a lu l'illustration comme un compte.
 * *Un ornement de rhétorique promu au rang de mesure par la réécriture qui le cite* : c'est une
 * voie de contamination distincte de la déduction écrite au présent, et elle survit précisément
 * parce qu'on croit ne faire que citer.
 *
 * ── CE QUE `?page=42` REND VRAIMENT ─────────────────────────────────────────────────────────────
 *
 * Mesuré le 2026-08-28 sur `GET /api/public/properties/search` — **l'endpoint que la page appelle**,
 * et non `/public/properties`, qui est un autre contrôleur — puis sur le HTML servi. 251 biens
 * publiés, `per_page` à 30 :
 *
 * | URL | biens rendus | `current_page` | `last_page` | HTTP |
 * |---|---|---|---|---|
 * | `?page=1` | 30 | 1 | 9 | 200 |
 * | `?page=9` (la dernière) | **11** | 9 | 9 | 200 |
 * | `?page=10` | **0** | 10 | 9 | 200 |
 * | `?page=42` | **0** | **42** | 9 | 200 |
 *
 * Et dans le HTML servi : `/fr/properties?page=42` rend **HTTP 200, zéro lien de fiche, et l'état
 * vide** (« Aucun bien » présent dans le balisage hors `<script>` sur `?page=42`, absent sur
 * `?page=1` et `?page=9`).
 *
 * **Ce résultat RENFORCE le repli au lieu de l'affaiblir**, et c'est plus intéressant qu'un simple
 * « la donnée est vide » : la pagination **accepte un rang qui n'existe pas** et le renvoie tel
 * quel (`current_page: 42` sous `last_page: 9`), en 200. Il existe donc une infinité d'URL
 * profondes servables, indexables et vides. Les déclarer canoniques d'elles-mêmes reviendrait à
 * offrir à l'indexation un espace d'adresses sans fond.
 *
 * ── LES DEUX RAISONS QUI PORTENT LA DÉCISION ────────────────────────────────────────────────────
 *
 * ⚠️ **Ce qui suit distingue explicitement le MESURÉ du DÉDUIT.** C'est la leçon de la lignée
 * ci-dessus : trois fois, une phrase d'illustration a emprunté le ton de la mesure. Une raison
 * déduite reste une bonne raison — elle ne doit simplement pas se présenter comme un relevé.
 *
 * · **[EN PARTIE MESURÉ] Aucune fiche ne dépend de la pagination pour être découverte, PARCE QUE
 *   le sitemap les énumère.** Ce que la branche CONTIENT est vérifiable ici même : la route
 *   `properties/sitemap` est déclarée (`takussan-api/routes/api/public.php:64`) **au-dessus** de
 *   `properties/{slug}` (ligne 99), ce que son propre commentaire exige — sans quoi « sitemap »
 *   est avalé comme un slug.
 *
 *   ⚠️ **Ce qui n'est PAS vérifié : que le sitemap servi liste effectivement les fiches.** Mesuré
 *   le 2026-08-28, `/sitemap.xml` rend **6 `<loc>`, ZÉRO fiche, en HTTP 200** — parce que l'API
 *   en service pour cette mesure ne portait pas la route (elle rend `404 No query results for
 *   model [Property]`, c'est-à-dire « sitemap » pris pour un slug : la signature exacte du défaut
 *   que l'ordre des routes ci-dessus évite). **C'est donc un artefact de l'API mesurée, pas un
 *   défaut de cette branche** — et ça n'a pas pu être levé, faute de pouvoir exécuter l'API de
 *   cette branche depuis un arbre de travail front seul.
 *
 *   Ce qu'il faut en retenir tient en une phrase : **cette raison est CONDITIONNÉE au déploiement
 *   effectif de l'endpoint, et sa panne est SILENCIEUSE** — `src/app/sitemap.ts` attrape l'erreur,
 *   la journalise (« ses URL sont absentes ») et sert quand même un sitemap valide, amputé, en
 *   200. Le jour où cet endpoint ne répond pas en production, la raison qui porte tout ce
 *   paragraphe disparaît sans que rien ne rougisse.
 *
 * · **[DÉDUIT, et assumé comme tel] Ces trois clés désignent un RANG, pas un contenu.** Le fait
 *   mesuré est celui du haut : `?page=1` et `?page=2` n'ont aucun bien en commun. Qu'une
 *   publication décale ensuite toutes les bornes en découle par construction de l'ordre — mais
 *   **ce n'est pas mesuré ici** : publier un bien demande une écriture qu'une campagne de lecture
 *   ne fait pas. Une URL `?page=3` indexée nomme donc le troisième wagon d'un train dont les
 *   wagons changent, et déclarer canonique une adresse dont le contenu se renouvelle sans qu'elle
 *   bouge, c'est indexer une adresse et servir autre chose.
 *
 *   ⚠️ **`sort` relève du même argument, et NON de l'argument plus simple qu'on serait tenté de
 *   lui appliquer.** Ce paragraphe a d'abord écrit qu'« à filtres égaux, `sort` et `per_page`
 *   rendent le MÊME ensemble de biens, réordonné ou redécoupé ». *C'était faux pour `sort`, et
 *   écrit dans le geste même qui remplaçait une autre affirmation non mesurée.* Mesuré le
 *   2026-08-28 sur 251 biens publiés, `per_page` à 30, en comparant les slugs servis :
 *
 *   | URL | slugs rendus | absents de la page nue |
 *   |---|---|---|
 *   | `?sort=relevance` | 30 | **0** — c'est l'ordre par défaut |
 *   | `?sort=price_asc` | 30 | **26** |
 *   | `?sort=price_desc` | 30 | **27** |
 *   | `?sort=created_desc` | 30 | **25** |
 *   | `?per_page=12` | 12 | **0** — préfixe exact de `?per_page=48` |
 *
 *   `per_page` REDÉCOUPE bien le même ordre (12 ⊂ 30 ⊂ 48, préfixes exacts vérifiés). `sort`,
 *   lui, **ne réordonne pas un ensemble** : la page 1 d'un tri est un AUTRE sous-ensemble du
 *   catalogue. Ce qui fonde son repli n'est donc pas « le même contenu sous un autre ordre »,
 *   c'est la volatilité du rang — exactement comme `?page=3`.
 *
 *   ⚠️ Les valeurs de tri sont `relevance|price_asc|price_desc|created_desc|distance` : `sort=-created_at`
 *   et consorts rendent **422**, et une campagne qui les interroge lit « 0 bien » puis conclut de
 *   travers. *Vérifier le code HTTP de l'API avant de lire le HTML.*
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
