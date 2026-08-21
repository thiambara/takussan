---
id: TCK-340
title: "Douze listes de clés de filtre côté front, une seule table"
status: doing
phase: P3
family: technique
estimate: L
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: [TCK-335]
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [front, search, dette, refactor]
---

## Objectif utilisateur

Ajouter un filtre sans libellé devient une erreur de compilation.

> ⚠️ **La version d'origine de cette phrase se terminait par « pas une puce muette ». La puce
> muette n'existe pas** — mesuré le 2026-08-21, par ablation. Un libellé manquant faisait rendre
> la **valeur brute** (`furnished: true` → puce « true ») pour seize clés sur dix-sept ; pour la
> dix-septième, `type`, l'accès passait par `FILTER_LABELS['type']!`, une assertion non nulle sur
> une table `Partial<…>`, et retirer l'entrée faisait **planter la page** :
>
> ```
> $ npx tsc --noEmit                                  → 0     (le typage ne voit rien)
> $ npx vitest run …/SearchToolbar.test.tsx           → TypeError: labelFn is not a function
> ```
>
> C'est le seul défaut VIVANT que ce ticket corrige. Tout le reste est de la prévention de
> divergence — ce qui est un objet légitime, mais qu'il fallait cesser de vendre comme un bogue.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md), qui a posé la garde de parité
**front↔back** (`src/types/__tests__/search-filters.parity.test.ts`) mais laissé les listes
**front↔front**.

**Recompté le 2026-08-21 : douze listes**, et non onze — la version d'origine annonçait « onze »
puis en énumérait **treize** dans la phrase suivante. La treizième, `criteriaToQueryString`, n'en
est pas une : elle parcourt `Object.entries` et ne cite aucune clé.

| # | liste | fichier |
|---|---|---|
| 1 | `SearchFilters` | `types/search.ts` |
| 2 | `filtersToParams` | `hooks/useSearch.ts` |
| 3 | `filtersFromSearchParams` | `hooks/useSearch.ts` |
| 4 | `IGNORED_KEYS` | `hooks/useSearch.ts` |
| 5 | le `if (key === 'q') params.delete('search')` de `removeFilter` | `hooks/useSearch.ts` |
| 6 | `FILTER_LABELS` (via `fabriqueEtiquettes`) | `components/search/SearchToolbar.tsx` |
| 7 | `HIDDEN_FROM_TAGS` | `components/search/SearchToolbar.tsx` |
| 8 | les contrôles de `FilterSidebar` | `components/search/FilterSidebar.tsx` |
| 9 | `mapFilters` | `components/property/PropertiesDiscoveryPage.tsx` |
| 10 | `humaniseCriteria` | `components/favorites/SavedSearchesList.tsx` |
| 11 | `filtersToCriteria` | `components/favorites/SaveSearchButton.tsx` |
| 12 | `suggestName` | `components/favorites/SaveSearchButton.tsx` |
| 13 | `UsePropertiesParams` | `hooks/useProperties.ts` |

Une quatorzième — `searchFiltersSchema` — **avait déjà divergé** (18 clés contre 20) et a été
supprimée par TCK-335 : elle n'avait aucun consommateur de production, donc rien ne pouvait le dire.

### ⚠️ L'inversion que la revue adverse a mesurée, et qui renverse le ticket

Vérifié **clé par clé** le 2026-08-21 : les listes réellement redondantes (1-7, 11) sont en accord
**parfait** depuis TCK-335. **Les trois qui avaient DÉRIVÉ étaient précisément hors du delta du
ticket d'origine** :

| liste | la dérive mesurée |
|---|---|
| `humaniseCriteria` | six clés sur dix-sept ; une recherche sauvegardée sur « meublé, quartier Almadies, en vedette » se résumait « Aucun critère » — le repli EXACT d'une recherche vide. Et elle écrivait « Vente », « ch. », « Maximum » en français dur, hors next-intl (principe 5) |
| `filtersToCriteria` | écartait `page` et `per_page` mais **gardait `sort`** : le tri finissait dans le `criteria` d'une recherche sauvegardée, que le digest serveur apparie contre des biens neufs |
| `mapFilters` | quatre clés sur dix-sept passées à `PropertyMap` |
| `suggestName` | quatre clés — **pas une dérive** : un nom suggéré est un RÉSUMÉ, plafonné à 100 caractères. L'unifier le détruirait. Laissé tel quel, avec la justification en docblock |

*Le ticket d'origine unifiait ce qui s'accordait et laissait ce qui divergeait.* Le périmètre est
corrigé en conséquence.

## Contraintes strictes (métier)

- ~~Aucun de ces quatre fichiers n'a de test aujourd'hui.~~ **FAUX**, mesuré le 2026-08-21 :

  ```
  $ npx vitest run src/hooks/__tests__/useSearch.test.ts \
      src/components/favorites/__tests__/SaveSearchButton.test.tsx \
      src/types/__tests__/search-filters.parity.test.ts
    Test Files  3 passed (3)
         Tests  17 passed (17)
  ```

  TCK-335 — la dépendance que ce ticket déclare — les avait posés. `SearchToolbar.tsx` est le
  **seul** des quatre sans test, et c'est aussi le seul qui crashe : les tests commencent donc
  là. (`FilterSidebar.test.tsx`, 7 tests, couvre en plus la liste n° 8.)
- La moitié front↔back **ne peut pas** être rendue impossible (deux runtimes) : elle reste gardée
  par la parité de TCK-335. Ce ticket ne traite que la moitié front.

## Delta à produire

- [x] Tests sur `SearchToolbar.tsx` — **écrits en premier**, seul fichier des quatre sans test
- [x] Une table `SEARCH_FILTER_KEYS` unique portant, par clé : `role: 'filtre' | 'controle'`
      (discriminant obligatoire), `params: readonly string[]` (⚠ `q` en possède **deux**),
      `lire`/`ecrire`, et `libelle` si `role === 'filtre'`
- [x] `SearchFilters` en dérive par `typeof`, ainsi que les listes 2-7 et 11
- [x] `humaniseCriteria` (liste 10) passe par la même fabrique de libellé que les puces
- [x] La moitié **runtime** d'AC1 dans `search-filters.parity.test.ts`

### La borne du `satisfies`, mesurée

Elle ne peut **pas** être `Record<string, CleDeRecherche<never>>` : `lire()` rend `V | undefined`,
donc `V` y est covariant et `CleFiltre<string>` n'est pas assignable à `CleFiltre<never>` (TS2322).
`unknown` marche — à condition que `ecrire()` et `libelle()` soient déclarées en **syntaxe de
méthode** (bivariante) et non en propriété-flèche, qui serait contravariante sous
`strictFunctionTypes` et rejetterait la table entière.

## Critères d'acceptation

- [x] **AC1 — ajouter une clé `role: 'filtre'` sans libellé fait échouer `tsc --noEmit`.**
      Prouvé par ablation le 2026-08-21 : clé `pool` sans `libelle` → **sortie 1**,
      `TS2322 … Property 'libelle' is missing in type … but required in type 'CleFiltre<unknown>'` ;
      la même clé **avec** `libelle` → **sortie 0**.
- [x] **AC1bis — la sortie de secours d'un mot est fermée à l'exécution.**
      ⚠ AC1 seul était insuffisant, et de la pire manière : écrire `role: 'controle'` compile,
      n'exige aucun libellé, et rend le filtre **actif, invisible et non retirable** — PIRE que
      l'état d'avant le ticket. `search-filters.parity.test.ts` exige donc que toute clé de
      `SearchPublicPropertyRequest::rules()` (PHP, lu à l'exécution) hors carte, alias et
      contrôles admis porte `role: 'filtre'`, la liste des contrôles admis étant écrite **à la
      main** — la dériver de la table rendrait le test tautologique.
      Ablation : `q` passé en `'controle'` → `tsc` **sortie 0**, test **rouge** sur deux
      assertions.
- [x] **AC2 — aucune liste de clés de filtre n'est écrite deux fois dans les fichiers du
      périmètre.** Restent hors périmètre et documentées ci-dessous : `mapFilters`,
      `UsePropertiesParams`, `FilterSidebar`, `suggestName`.

## Hors périmètre

- La parité front↔back, déjà gardée.
- **Listes 8, 9, 13** (`FilterSidebar`, `mapFilters`, `UsePropertiesParams`) — fichiers tenus par
  d'autres agents sur cette branche. `mapFilters` est l'une des trois listes qui ont réellement
  dérivé : **elle mérite un ticket de suite.**
- **Liste 12** (`suggestName`) — non unifiée délibérément (cf. tableau ci-dessus).
- `SORT_VALUES` (`SearchToolbar.tsx`), doublon de `sortSchema` (`lib/schemas/search.ts`) et de
  `in:relevance,…` côté PHP : c'est une liste de VALEURS, pas de clés — hors sujet ici, réel
  ailleurs.
- Le bloc `search: { strategy, terms_unmatched, widened_total }` que TCK-338 ajoute à la réponse
  n'est **pas** déclaré dans `SearchResult` : il relève de TCK-338, pas d'ici.

## Notes d'implémentation

Fichiers touchés : `src/types/search.ts` (la table), `src/hooks/useSearch.ts`,
`src/components/search/SearchToolbar.tsx`, `src/components/favorites/SaveSearchButton.tsx`,
`src/components/favorites/SavedSearchesList.tsx`,
`src/types/__tests__/search-filters.parity.test.ts` (réécrit : `SearchFilters` n'est plus une
`interface` littérale, la lecture par regex cassait — bruyamment, comme son auteur l'avait prévu),
`src/components/search/__tests__/SearchToolbar.test.tsx` et
`src/components/search/__tests__/criteres-de-recherche-sauvegardee.test.tsx` (neufs).

⚠️ Un docblock de `components/property-dashboard/PropertyListFilters.tsx` (~ligne 495) cite
`SearchToolbar.fabriqueEtiquettes`, qui n'existe plus. Hors périmètre de l'agent, à corriger.
