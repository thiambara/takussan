/**
 * La requête que `/properties` adresse à `GET /api/public/properties/search` — **une seule
 * définition, deux appelants** (TCK-432).
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE MODULE EXISTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Avant TCK-432, la traduction « paramètres d'URL → paramètres d'API » vivait dans le corps de
 * l'effet de `useSearch`, et un seul endroit en avait besoin. Depuis que la page est rendue par le
 * SERVEUR, ils sont deux — et deux traductions écrites séparément produisent le défaut le plus
 * coûteux que ce ticket puisse fabriquer : **le serveur rend une liste, le client en rend une
 * autre**, sans erreur ni test rouge, l'écran clignotant simplement d'un jeu de résultats à
 * l'autre à l'hydratation.
 *
 * C'est le motif que le dépôt a déjà payé deux fois — `filtersToParams` / `filtersFromSearchParams`
 * (TCK-340), `HIDDEN_FROM_TAGS` / `IGNORED_KEYS` (TCK-340) — et la réponse retenue est la même :
 * une définition, dérivée, jamais recopiée.
 *
 * ⚠️ **Ce module ne porte PAS de `'use client'`, et c'est sa raison d'être.** `useSearch.ts` en
 * porte un : un composant serveur qui importerait `normaliserGeo` depuis là traverserait une
 * frontière client. La fonction a donc déménagé ici, et `useSearch` la ré-exporte pour ses
 * appelants existants.
 *
 * ⚠️ **Aucun `fields[properties]` — et c'est MESURÉ, pas déduit.** `PublicPropertyController` ne
 * bâtit ni `search()` ni `discovery()` sur `spatie/laravel-query-builder`. Mesuré le 2026-08-28 sur
 * l'API du dépôt :
 *
 * ```
 * GET /api/public/properties/search?type=villa&per_page=5                              → 200, 5328 o
 * GET /api/public/properties/search?type=villa&per_page=5&fields[properties]=id,title  → 200, 5328 o
 * GET /api/public/properties/discovery?per_row=4                                       → 200, 15640 o
 * GET /api/public/properties/discovery?per_row=4&fields[properties]=id,title           → 200, 15640 o
 * ```
 *
 * Le paramètre est **inerte au octet près**. L'écrire ici ne gagnerait rien, ferait diverger les
 * URL entre l'appelant serveur et l'appelant client — donc casserait la mémoïsation ET l'égalité
 * de clef sur laquelle repose {@link clefDeRecherche} — et porterait la même bombe à retardement
 * que celle documentée dans `queries/public-property.ts` : le jour où ces routes passeraient par
 * `buildQuery()`, spatie répondrait **400 InvalidFieldQuery** sur les attributs calculés.
 *
 * La restriction de charge utile qui compte ici est ailleurs, et elle est réelle : `per_page`, que
 * les deux appelants plafonnent à {@link PER_PAGE_PAR_DEFAUT} par défaut.
 */

/** Le `per_page` que la liste demande quand l'URL n'en porte pas. */
export const PER_PAGE_PAR_DEFAUT = 30;

/**
 * Les trois états géographiques que le SERVEUR refuse — TCK-346, **déplacé ici par TCK-432**.
 *
 * `SearchPublicPropertyRequest` les rend en 422 : `lat`/`lng` s'exigent mutuellement
 * (`required_with`), `radius_km` et `sort=distance` exigent le point complet. Une interface qui
 * peut produire ces états les produira : il suffit d'un retrait de puce, d'un lien hérité, ou
 * d'un critère sauvegardé sous une version antérieure.
 *
 * Le choix ici est de **normaliser plutôt que d'afficher l'erreur**, et il n'est pas
 * symétrique du reste du hook. Sur `furnished=nimportequoi`, le 422 est une information : la
 * demande de l'utilisateur est inintelligible, on la lui rend. Ici il n'y a rien à rendre —
 * une demi-coordonnée n'est pas une demande à moitié comprise, c'est un fragment que **le
 * front lui-même** vient de fabriquer en retirant l'autre moitié. Le seul état honnête est
 * « pas de géographie », et il ne coûte aucun aller-retour.
 *
 * Mutation : rendre cette fonction inerte fait rougir `useSearch.geo.test.ts`.
 */
export function normaliserGeo(params: URLSearchParams): URLSearchParams {
  const aPoint = params.has('lat') && params.has('lng');

  if (!aPoint) {
    // Une demi-coordonnée n'est jamais un filtre à moitié appliqué : c'est un 422.
    params.delete('lat');
    params.delete('lng');
    params.delete('radius_km');
    if (params.get('sort') === 'distance') params.delete('sort');
    return params;
  }

  // Point complet mais plus personne pour le consommer : ni rayon, ni tri par distance.
  // Le laisser serait pire que le retirer — il est INVISIBLE (aucune puce ne le décrit) et
  // il repartirait dans la prochaine recherche sauvegardée sans que rien ne l'ait annoncé.
  if (!params.has('radius_km') && params.get('sort') !== 'distance') {
    params.delete('lat');
    params.delete('lng');
  }

  return params;
}

/**
 * Les paramètres d'URL de `/properties` traduits en requête d'API — la fonction que le rendu
 * serveur et `useSearch` appellent tous les deux.
 *
 * Trois transformations, dans cet ordre, et aucune n'est décorative :
 *
 * 1. **`normaliserGeo`** — un état géographique que le serveur rendrait en 422 n'atteint jamais
 *    le réseau (TCK-346) ;
 * 2. **l'alias hérité `search=` → `q=`** — la clé `q` possède les deux paramètres depuis TCK-335,
 *    et un lien externe peut parfaitement porter `?search=villa` ;
 * 3. **le `per_page` par défaut** — sans lui, l'API pagine à 20 quand la grille en attend 30.
 *
 * ⚠️ L'objet reçu n'est PAS muté : la copie est faite ici, une fois, pour que l'appelant serveur
 * puisse passer les `searchParams` de Next sans se demander qui les possède.
 */
export function parametresDeRecherche(brut: URLSearchParams): URLSearchParams {
  const params = normaliserGeo(new URLSearchParams(brut.toString()));

  if (!params.has('q') && params.has('search')) {
    params.set('q', params.get('search') ?? '');
  }
  if (!params.has('per_page')) params.set('per_page', String(PER_PAGE_PAR_DEFAUT));

  return params;
}

/**
 * L'identité d'une requête de recherche — **triée**, pour que deux écritures du même jeu de
 * paramètres se reconnaissent.
 *
 * C'est ce qui permet au client de savoir que **le serveur a déjà répondu à CETTE requête-là** et
 * de ne pas la relancer à l'hydratation (TCK-432 · AC5). Le tri n'est pas une coquetterie :
 *
 * · Next rend `searchParams` sous forme d'OBJET (`{ type: 'villa', page: '2' }`), le navigateur
 *   rend une CHAÎNE (`?page=2&type=villa`). Les deux décrivent la même requête et ne produisent
 *   pas la même sérialisation ;
 * · `URLSearchParams.sort()` trie par clé **en conservant l'ordre relatif des valeurs d'une même
 *   clé**, donc `?type=a&type=b` garde son sens (`type=a,b` ≠ `type=b,a` pour l'API).
 *
 * Une clef qui ne coïnciderait pas est **sans danger** : le client refait simplement l'appel, comme
 * avant TCK-432. C'est une optimisation qui échoue en sûreté, jamais une garantie de correction.
 */
export function clefDeRecherche(params: URLSearchParams): string {
  const copie = new URLSearchParams(params.toString());
  copie.sort();
  return copie.toString();
}

/**
 * Les `searchParams` de Next → `URLSearchParams`, **en gardant les valeurs répétées**.
 *
 * ⚠️ Ce n'est PAS `versParametres` de `lib/canonique.ts`, qui garde délibérément la première
 * valeur seulement : la canonique lit des clés à valeur unique, la recherche transmet tout ce que
 * l'URL porte. Écrire ici un `set()` au lieu d'un `append()` ferait silencieusement disparaître la
 * seconde moitié de `?tags=a&tags=b` du rendu serveur — et le client, lui, l'enverrait. Les deux
 * listes différeraient à l'hydratation.
 */
export function parametresDepuisNext(
  brut: Readonly<Record<string, string | readonly string[] | undefined>>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(brut)) {
    if (valeur === undefined) continue;
    if (Array.isArray(valeur)) {
      for (const v of valeur) params.append(cle, String(v));
    } else {
      params.append(cle, String(valeur));
    }
  }
  return params;
}
