---
id: TCK-2165
title: "La file de modération et la bibliothèque de documents comptent chaque type sur toute la liste, pas sur la page"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#110-documents--contrats"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-199--listes-chargées-par-morceaux-puis-comptées-groupées-ou-triées-sur-la-seule-page-chargée"
tags: [back, front, moderation, documents, pagination, pistes]
---

## Objectif utilisateur

Le modérateur lit, dans les tuiles « Biens » et « Avis », le nombre d'éléments de toute la file, et
le titulaire d'une bibliothèque de documents lit, au badge d'un groupe, le nombre de documents de ce
type sur toute sa liste — et non celui des lignes de la page affichée.

## Contexte

Réfs : **P199.02** et **P199.03** du fichier de pistes, `validé`. Même cause (un compte pris sur la
page chargée) et même correctif (comptes par type calculés par l'API dans `meta`).

Décision du porteur (P199.02) : comptes par type calculés par l'API dans `meta` (même filtre que la file), lus par les tuiles « Biens » et « Avis », comme `meta.unread_total` de TCK-1387 ; « Total page » devient « Total » ; même forme de champ que P199.03

Décision du porteur (P199.03) : comptes par type dans `meta`, lus par le badge de chaque groupe ; tri par date inchangé ; même forme de champ que P199.02

Avant (lu) : `ModerationStats` comptait `items.filter(…).length` sur la page de 20 sous un total
de toute la file titré « Total page » ; `DocumentsLibrary` rendait au badge `docs.length` des 30
lignes de la page ; ni `UnifiedModerationService::paginate` ni `DocumentController::index` ne
rendaient de compte par type.

## Hypothèses (mode sans humain)

- **Forme du champ, commune aux deux** : `meta.counts`, un objet type → entier, chaque type
  présent, à zéro s'il n'a aucun élément (la forme que recommandait le délégué pour P199.02,
  `meta.counts.property` / `meta.counts.review`). Pour les documents, les types sont les cas de
  `DocumentType`.
- « Même filtre que la file » : les comptes suivent tous les filtres de la liste, `filter[type]`
  compris (un filtre sur les avis rend `property: 0`).
- L'avertissement « … de cette page attendent depuis plus de 7 jours » reste pris sur la page et le
  dit déjà : il n'est pas touché.
- Le libellé « Total » est une clé neuve `statTotal`, qui remplace `statTotalPage` ; en `wo`, le
  texte français tel quel (wolof en pause).

## Delta à produire

- [x] `UnifiedModerationService::countsByType()`, sur la file filtrée que `paginate()` lit aussi
  (`filteredQuery()`), rendu par `ModerationQueueController::index` en `meta.counts`.
- [x] `DocumentController::index` : `meta.counts` par type, sur la requête filtrée de la liste.
- [x] Front : `ModerationStats` lit `meta.counts` ; tuile « Total » ; badge de groupe de
  `DocumentsLibrary` lu dans `meta.counts`.
- [x] Tests : `ModerationQueueCountsTest`, `DocumentIndexCountsTest`, `ModerationStats.test.tsx`,
  un cas de `DocumentsLibrary.test.tsx`.

## Critères d'acceptation

- [x] AC1 — File de 6 éléments lue par pages de 2 : `meta.counts` vaut `{property: 4, review: 2}`,
  et suit `filter[agency_id]` et `filter[type]`.
- [x] AC2 — 35 documents de deux types lus par pages de 30 : `meta.counts` rend 20 et 15, tous les
  types présents, et suit `filter[type]` ; les documents d'un tiers n'y sont pas.
- [x] AC3 — Les tuiles rendent les comptes de `meta.counts`, pas ceux de la page, sous « Total »,
  « Biens », « Avis ».
- [x] AC4 — Le badge d'un groupe rend le compte du type de `meta.counts`.

## Hors périmètre

- Le tri de la bibliothèque (par date, inchangé) et l'absence en page 1 d'un type dont tous les
  documents sont plus anciens.
- L'accueil serveur de la console qui lit la même file (TCK-1828).

## Notes d'implémentation

- **Ablation** : `meta.counts` retiré des deux contrôleurs → 4 rouges sur 4 (API) ; tuiles remises
  au compte de la page → rouge (« Biens1 ») ; badge remis à `docs.length` → rouge ; correctifs
  remis → verts.
- **Piège** : les comptes des documents se prennent sur `getEloquentBuilder()->clone()->toBase()`
  avec `reorder()`, pour défaire le tri de pertinence de `filter[search]` (ses liaisons d'ordre)
  avant le `GROUP BY`.
