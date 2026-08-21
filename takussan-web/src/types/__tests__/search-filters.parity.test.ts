import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const ts = readFileSync(TYPES, 'utf8');
  const bloc = /export interface SearchFilters \{([\s\S]*?)\n\}/.exec(ts);
  // Une garde qui ne trouve pas sa source doit le DIRE, pas passer au vert sur un
  // ensemble vide — c'est la forme de vacuité qui ressemble le plus à un succès.
  expect(bloc, `interface SearchFilters introuvable dans ${TYPES}`).not.toBeNull();
  const cles = [...bloc![1].matchAll(/^\s{2}([a-z_]+)\??:/gm)].map((m) => m[1]);
  expect(cles.length, 'aucune clé extraite de SearchFilters').toBeGreaterThan(5);
  return cles;
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
