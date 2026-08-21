import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLES_DE_RECHERCHE, SEARCH_FILTER_KEYS } from '../search';

/**
 * Garde de PARITÉ front ↔ back sur les clés de filtre de la recherche publique (TCK-335).
 *
 * ## Pourquoi cette garde et pas la case que le ticket demandait
 *
 * Le ticket voulait que `SearchToolbar` « ne compte que les filtres réellement
 * appliqués ». C'était une mauvaise idée : pour trier les puces, le front devrait
 * porter une liste des clés que le SERVEUR applique — une douzième liste de clés de
 * filtre dans un dépôt qui en entretient déjà onze. Et la faute qu'elle installe est
 * PIRE que celle qu'elle corrige : une clé oubliée dans cette liste produit un filtre
 * actif, appliqué, **sans puce et sans moyen de le retirer**. On passe de « l'interface
 * promet trop » à « l'interface cache un état actif ».
 *
 * La divergence front↔back traverse deux runtimes : elle ne peut pas être rendue
 * impossible, seulement DÉTECTÉE. C'est ce que fait ce fichier, sur le gabarit exact de
 * `profile-types.parity.test.ts` (TCK-329) — il lit les FICHIERS PHP, il ne déduit rien
 * d'un docblock.
 *
 * ⚠ CE QU'IL NE PROUVE PAS : que chaque filtre soit correctement APPLIQUÉ. Il vérifie
 * que les trois ensembles coïncident, rien de plus. La justesse de chaque filtre est
 * portée par `PublicPropertySearchFiltersTest` côté API.
 *
 * ⚠ `web-ci.yml` doit déclencher sur les DEUX fichiers PHP lus ici — les deux côtés
 * qu'une garde compare doivent la déclencher, sinon elle dort quand le back bouge seul.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-340 — CE QUE CE FICHIER GARDE EN PLUS, ET POURQUOI AC1 SEUL NE SUFFISAIT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `SEARCH_FILTER_KEYS` rend impossible d'ajouter un filtre sans libellé : `role: 'filtre'` exige
 * `libelle()`, et `tsc` casse. Mais le typage offre une échappatoire d'UN MOT — écrire
 * `role: 'controle'`, qui n'exige aucun libellé et compile. Le filtre devient alors actif,
 * appliqué par le serveur, **invisible et non retirable** : ni compté par `countActiveFilters`,
 * ni affiché en puce, ni sauvegardé en critère. C'est PIRE que l'état d'avant le ticket, où une
 * clé sans libellé rendait au moins sa valeur brute à l'écran.
 *
 * Le troisième `describe` ferme cette porte à l'exécution : toute clé que le serveur accepte,
 * hors carte et hors alias, doit porter `role: 'filtre'` — et la liste des contrôles admis est
 * écrite À LA MAIN ci-dessous, jamais dérivée de la table. Si elle en était dérivée, déclarer
 * `role: 'controle'` suffirait à sortir une clé du contrôle, et la garde serait décorative.
 *
 * `clesDuFront()` ne lit plus le fichier au motif d'expression régulière : `SearchFilters` est
 * désormais DÉRIVÉ de la table par `typeof`, il n'existe plus comme `interface` littérale. La
 * table, elle, est du code — le test l'importe. Une lecture par regex serait ici plus faible :
 * elle a déjà cassé bruyamment sur ce refactor (mesuré : « interface SearchFilters introuvable »).
 */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const REQUETE = join(RACINE, 'takussan-api', 'app', 'Http', 'Requests', 'Public', 'SearchPublicPropertyRequest.php');
const SERVICE = join(RACINE, 'takussan-api', 'app', 'Services', 'Search', 'PropertySearchService.php');
const TYPES = join(RACINE, 'takussan-web', 'src', 'types', 'search.ts');

/**
 * Clés que le back accepte mais que l'interface n'expose pas — et pourquoi.
 * `search` est l'alias historique de `q` ; les quatre bornes géographiques servent la
 * vue carte, qui ne passe pas par `SearchFilters`.
 */
const HORS_INTERFACE = ['search', 'lat_min', 'lat_max', 'lng_min', 'lng_max'];

/** Clés de contrôle de la requête : elles ne produisent pas de clause de filtre moteur. */
const NON_FILTRANTES = ['q', 'search', 'sort', 'page', 'per_page'];

function clesDuFront(): string[] {
  // Une garde qui ne trouve pas sa source doit le DIRE, pas passer au vert sur un
  // ensemble vide — c'est la forme de vacuité qui ressemble le plus à un succès.
  expect(CLES_DE_RECHERCHE.length, `aucune clé dans SEARCH_FILTER_KEYS (${TYPES})`).toBeGreaterThan(5);
  return [...CLES_DE_RECHERCHE];
}

function clesDuBack(): string[] {
  const php = readFileSync(REQUETE, 'utf8');
  const bloc = /public function rules\(\): array\s*\{\s*return \[([\s\S]*?)\n\s*\];/.exec(php);
  expect(bloc, `rules() introuvable dans ${REQUETE}`).not.toBeNull();
  const cles = [...bloc![1].matchAll(/^\s*'([a-z_]+)'\s*=>/gm)].map((m) => m[1]);
  expect(cles.length, 'aucune clé extraite de rules()').toBeGreaterThan(5);
  return cles;
}

function clesConsommeesParLeService(): Set<string> {
  const php = readFileSync(SERVICE, 'utf8');
  const cles = [...php.matchAll(/\$(?:p|params|params\[)?\w*\['([a-z_]+)'\]/g)].map((m) => m[1]);
  // `hasGeoBounds()` cite ses quatre bornes dans un tableau littéral, pas en accès direct.
  const litterales = [...php.matchAll(/'(lat_min|lat_max|lng_min|lng_max)'/g)].map((m) => m[1]);
  const ensemble = new Set([...cles, ...litterales]);
  expect(ensemble.size, `aucune clé extraite de ${SERVICE}`).toBeGreaterThan(5);
  return ensemble;
}

describe('TCK-335 — parité SearchFilters ↔ SearchPublicPropertyRequest::rules()', () => {
  it('l’interface n’expose aucun filtre que le serveur ignorerait', () => {
    const orphelinesCoteFront = clesDuFront().filter((c) => !clesDuBack().includes(c));
    // C'est LE défaut d'origine : `area_min`, `area_max` et `featured` étaient produits
    // par le front et supprimés par `validated()` avant d'atteindre le service.
    expect(orphelinesCoteFront).toEqual([]);
  });

  it('le serveur n’accepte aucun filtre que l’interface ignorerait, hors carte et alias', () => {
    const orphelinesCoteBack = clesDuBack()
      .filter((c) => !clesDuFront().includes(c))
      .filter((c) => !HORS_INTERFACE.includes(c));
    expect(orphelinesCoteBack).toEqual([]);
  });
});

describe('TCK-335 — toute clé acceptée est consommée', () => {
  it('chaque règle de validation produit une clause dans PropertySearchService', () => {
    const consommees = clesConsommeesParLeService();
    const acceptesSansEffet = clesDuBack()
      .filter((c) => !NON_FILTRANTES.includes(c))
      .filter((c) => !consommees.has(c));
    // Une clé validée que le service ne lit pas est un filtre que l'interface peut
    // afficher comme actif et qui ne filtre rien : c'est le défaut de TCK-335, vu
    // depuis l'autre bout.
    expect(acceptesSansEffet).toEqual([]);
  });
});

/**
 * Les seules clés que le serveur accepte SANS qu'elles filtrent quoi que ce soit.
 *
 * Écrite à la main, et elle doit le rester : c'est la contrepartie du `role: 'controle'`, qui
 * est une sortie de secours d'un mot. Ajouter une entrée ici est un geste délibéré, qu'une revue
 * voit passer ; le dériver de la table rendrait le test tautologique.
 */
const CONTROLES_ADMIS = ['sort', 'page', 'per_page'] as const;

describe('TCK-340 — le rôle déclaré, et l’échappatoire d’un mot qu’il ouvre', () => {
  it('toute clé que le serveur accepte est déclarée `filtre`, hors carte, alias et contrôles', () => {
    const attenduesFiltrantes = clesDuBack()
      .filter((c) => !HORS_INTERFACE.includes(c))
      .filter((c) => !(CONTROLES_ADMIS as readonly string[]).includes(c));

    const malDeclarees = attenduesFiltrantes.filter(
      (c) => SEARCH_FILTER_KEYS[c as keyof typeof SEARCH_FILTER_KEYS]?.role !== 'filtre',
    );

    // Une clé de filtre déclarée `controle` est appliquée par le serveur et INVISIBLE dans
    // l'interface : ni comptée, ni affichée en puce, ni retirable.
    expect(malDeclarees).toEqual([]);
  });

  it('aucun `role: \'controle\'` n’a été ajouté en douce', () => {
    const declares = CLES_DE_RECHERCHE
      .filter((c) => SEARCH_FILTER_KEYS[c].role === 'controle')
      .sort();
    expect(declares).toEqual([...CONTROLES_ADMIS].sort());
  });

  it('toute clé `filtre` porte réellement une fabrique de libellé', () => {
    // Le typage l'exige déjà ; cette assertion attrape ce que `tsc` ne voit pas — un `as`,
    // un `@ts-expect-error`, ou un objet construit ailleurs qu'au littéral.
    const sansLibelle = CLES_DE_RECHERCHE.filter((c) => {
      const def = SEARCH_FILTER_KEYS[c];
      return def.role === 'filtre' && typeof (def as { libelle?: unknown }).libelle !== 'function';
    });
    expect(sansLibelle).toEqual([]);
  });
});
