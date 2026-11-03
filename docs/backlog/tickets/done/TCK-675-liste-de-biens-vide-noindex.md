---
id: TCK-675
title: "Une liste publique de biens sans résultat est servie en noindex, follow (soft-404 des facettes)"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-9--pages-publiques--seo-et-partage
tags: [front, seo, pistes]
---

## Contexte

Réf : **P09.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`filtresCanoniques` juge chaque facette seule contre son domaine (TCK-433, TCK-598), jamais leur
combinaison : `/fr/properties?type=factory&contract_type=rent&city=Dakar` rendait 200, le titre
« Usine à louer à Dakar », une canonique vers elle-même et `index, follow` hérité du layout public,
sur une liste vide. Types × contrats × villes × quartiers × 3 langues donnent autant de pages vides
indexables. `generateMetadata` de `(public)/properties/(liste)/page.tsx` ne posait aucun `robots`.

## Décision du porteur

noindex, follow quand total === 0

## Objectif

Quand la recherche de la liste rend `meta.total === 0`, la page déclare
`robots: { index: false, follow: true }`. Sinon, rien ne change.

## Delta à produire

- [x] `generateMetadata` de `(public)/properties/(liste)/page.tsx` appelle `rechercherBiensPublics`
      avec la clef et la langue exactes de la page (`clefDeRecherche(parametresDeRecherche(parametresDepuisNext(…)))`),
      pour que `cache()` partage l'appel : aucun aller-retour de plus par rendu.
- [x] `robots: { index: false, follow: true }` quand le résultat n'est pas `null` et que
      `meta.total === 0` ; la clé est omise sinon (héritage du layout).
- [x] Tests dans `(liste)/__tests__/metadata.test.ts`.

## Critères d'acceptation

- [x] AC1 — Recherche à `total: 0` : `meta.robots` vaut `{ index: false, follow: true }`.
- [x] AC2 — Recherche à `total: 1` : `meta.robots` est absent.
- [x] AC3 — Recherche en panne (`null`) : `meta.robots` est absent.
- [x] AC4 — La recherche demandée par `generateMetadata` est la même chaîne et la même langue que
      celle de la page, paramètres répétés compris (`tags=a&tags=b`).

## Hypothèses (mode sans humain)

- Une panne de la recherche (`null`, y compris un 422) n'affirme pas que la liste est vide : la page
  garde l'indexation héritée. Mettre `noindex` sur une panne passagère désindexerait des pages
  réelles.
- `total` est lu tel quel, y compris sous le régime `widened` d'ADR-0024 : la décision dit
  « total === 0 », et sous `widened` `meta.total` décrit les biens réellement affichés.
- La règle vaut pour toute page de la liste (`page=2` comprise) : une page au-delà de la dernière
  rend `data: []` mais `total > 0`, et reste donc indexable ; sa canonique la replie déjà sur la
  page nue des facettes.

## Hors périmètre

- La canonique d'une liste vide reste celle des facettes : la décision ne porte que sur `robots`.
- Le sitemap n'est pas touché : il n'énumère pas les combinaisons de facettes.

## Notes d'implémentation

- Rouge avant correctif : AC1 (`robots` absent) et AC4 (aucune recherche demandée) ; AC2 et AC3
  verts d'emblée, ils gardent la borne de la règle.
- Ablation : `const vide = false` → AC1 rouge (1 échec sur 40) ; remis → 40 verts.
- Les tests du fichier doublent désormais `@/lib/queries/public-search` : sans ce double, chaque cas
  existant de `generateMetadata` tirerait sur le réseau.
