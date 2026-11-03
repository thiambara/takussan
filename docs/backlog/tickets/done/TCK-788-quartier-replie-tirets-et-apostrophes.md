---
id: TCK-788
title: "Un quartier tapé avec un tiret ou une apostrophe se replie sur le quartier existant"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#91-geoneighborhood-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-17--qualité-des-adresses--référentiel-ou-texte-libre"
tags: [back, front, geo, referentiel, pistes]
---

## Contexte

Réf : **P17.02** du fichier de pistes, `validé` (critère accordé : V7). `GeoNeighborhoodResolver`
ne repliait que la casse et les espaces : « Grand-Yoff » tapé dans Dakar créait une proposition
`pending` à côté du quartier approuvé « Grand Yoff ». Côté front, la recherche de la liste
(`replierPourRecherche`) ne trouvait pas « Grand Yoff » sous « Grand-Yoff ». La file de modération
ne montrait aucun quartier proche d'une proposition (ADR-0062 § 1 et § 4).

## Décision du porteur

replier tirets et apostrophes des deux côtés ; les accents restent tels qu'ADR-0062 § 1 ; la liste de modération montre les quartiers approuvés dont la clé repliée sans accents coïncide ; reste : replier les accents dans le résolveur, si le porteur amende ADR-0062 § 1

## Reste à faire

replier les accents dans le résolveur, si le porteur amende ADR-0062 § 1

## Delta à produire

- [x] `GeoNeighborhoodResolver::trouver()` : comparaison sur une clé qui replie casse, blancs,
      tirets (ASCII et typographiques) et apostrophes en une espace (`SEPARATEURS`, `cle()`). À
      statut égal, le nom exact l'emporte sur un nom seulement replié.
- [x] `GET /api/admin/geo/neighborhoods` : chaque ligne porte `similar`, la liste `{id, name}` des
      quartiers approuvés et non fusionnés de la même ville dont la clé repliée **sans accents**
      coïncide (`cleSansAccents()`), calculée pour les propositions `pending` de la page en une
      requête ; `[]` sinon.
- [x] Front : `replierPourRecherche` replie les mêmes séparateurs ; la file de propositions affiche
      « Proche de : … » quand `similar` n'est pas vide (clé `superAdmin.propositions.similar`, en
      `wo` le texte français tel quel, wolof en pause).
- [x] Tests : `GeoNeighborhoodPunctuationFoldTest` (5), `combobox.test.tsx` (+2),
      `super-admin-propositions.test.ts` (forme), `FileDePropositions.test.tsx` (+2).

## Critères d'acceptation

- [x] AC1 — « Grand-Yoff » et « grand – yoff » se résolvent sur « Grand Yoff » sans créer de proposition.
- [x] AC2 — « Cité d’Arafat » et « cité d arafat » se résolvent sur « Cité d'Arafat ».
- [x] AC3 — « Medina » reste une proposition distincte de « Médina » (accents non repliés).
- [x] AC4 — La file de modération montre « Médina » pour la proposition « Medina », et ni un
      quartier d'une autre ville ni un quartier refusé.
- [x] AC5 — Dans la liste à recherche, « Grand-Yoff » liste « Grand Yoff » en premier, et Entrée le choisit.

## Hors périmètre

- Le repli des accents dans le résolveur (reste, ADR-0062 § 1).
- `replierPourIdentite` (l'option « Ajouter » de la liste) ne change pas : elle sert aussi aux
  équipements et aux villes, dont les règles serveur ne replient pas les tirets. Un « Grand-Yoff »
  laissé tel quel est replié par le serveur, qui réécrit le texte au nom du quartier trouvé.
- Un geste « fusionner dans ce quartier proche » en un clic : la fusion reste celle de TCK-633.

## Hypothèses (mode sans humain)

- « Apostrophe » couvre `'`, `’` et `ʼ` ; « tiret » couvre `-`, `‐`, `‑`, `‒`, `–`, `—`. Chacun se
  replie en une espace, comme un blanc.
- La liste des proches n'est calculée que pour les propositions `pending` : c'est la file que lit
  la modération ; les cibles de fusion (approuvées) n'en ont pas besoin.

## Notes d'implémentation

- L'expression repliée (`btrim(regexp_replace(LOWER(name COLLATE "und-x-icu"), …))`) n'emprunte pas
  l'index `geo_neighborhoods_city_name_ci_unique` ; la recherche reste bornée par `geo_city_id`
  (index unique `(geo_city_id, slug)`), soit au plus quelques centaines de lignes.
- Ablation API : résolveur et contrôleur remis à `pre-dev` → 3 rouges sur 5 ; remis → 5 verts.
- Ablation front : `combobox.tsx`, `super-admin-propositions.ts` et `FileDePropositions.tsx` remis à
  `pre-dev` → 5 rouges sur 34 ; remis → 34 verts.
