---
id: TCK-908
title: "Domaine des villes : une entrée par ville, casse repliée, graphie la plus fréquente"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#cities-groupe-la-ville-sans-repli-de-casse-et-le-front-retient-alors-la-graphie-la-moins-fréquente"
tags: [back, front, seo, facettes, sitemap, pistes]
---

## Contexte

Réf : **P35.04** du fichier de pistes, `retenu · autonome` (A1 : le repli de casse de la ville est
le contrat écrit de l'appelant, `facettes.ts`, et de son jumeau `neighborhoods()`).

`GET /api/public/properties/cities` groupait sur la valeur brute de `addresses.city` : « Saly » (40)
et « SALY » (2) sortaient en deux entrées. `villesDuCatalogue` et la source `quartiers-et-villes` du
sitemap repliaient en minuscules dans une `Map` où le dernier `set` gagne : la graphie canonique
devenait la moins fréquente, et le sitemap poussait le même chemin canonique une fois par variante.
Le cas suppose une ville hors référentiel (`GeoAddressCanonicalizer` la laisse alors brute).

## Objectif utilisateur

Une ville du catalogue public n'a qu'une page canonique, sous la graphie que porte la majorité de
ses biens, et le sitemap l'annonce une fois.

## Delta à produire

- [x] `PublicPropertyController::cities()` : groupe par `CaseInsensitive::sql('addresses.city')`,
  rend `mode()` comme valeur et le compte total, tri secondaire sur le repli (comme
  `neighborhoods()`).
- [x] `villesDuCatalogue` : la première graphie lue d'une ville repliée gagne.
- [x] `sitemap.ts`, source `quartiers-et-villes` : une entrée par ville repliée, la première lue.

## Critères d'acceptation

- [x] AC1 — Biens publics à « Zzvillé » ×3 et « ZZVILLÉ » ×1 : `cities()` rend
  `{Zzvillé, 4}`, une seule entrée (`PropertyCitiesTest`).
- [x] AC2 — Réponse `[{Saly,40},{SALY,2}]` : `villesDuCatalogue().get('saly')` vaut `Saly`.
- [x] AC3 — Même réponse au sitemap : une seule URL `/fr/properties?city=Saly`.

## Hors périmètre

- Le seuil de la page de ville et les paires contrat × ville (P35.05).
- Les données de préproduction et de production ne sont pas mesurées (le défaut n'est pas
  observable sur la base de dev : une graphie par ville).

Hypothèse (mode sans humain) : à égalité de compte entre deux graphies, `mode()` rend la première
dans l'ordre de la collation, comme pour les quartiers.

## Notes d'implémentation

- Ablation : contrôleur remis à `groupBy('addresses.city')` → le test d'API rougit (deux entrées) ;
  `facettes.ts` et `sitemap.ts` remis au dernier `set` → les deux tests front rougissent
  (« SALY » retenue, chemin poussé deux fois) ; correctifs remis → 11 et 46 verts.
- L'accent du jeu de test (« É ») vérifie que le repli est celui de la collation ICU, pas de
  `lower()` nu sous `--locale=C`.
