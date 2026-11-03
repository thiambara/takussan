---
id: TCK-911
title: "Recherche publique : des suggestions dans l'état vide"
status: done
phase: P2
family: applicatif
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#une-recherche-dun-seul-mot-sans-résultat-na-aucun-repli"
tags: [front, search, pistes]
---

## Contexte

Réf : **P01.09** du fichier de pistes, `validé` (V7 accordé).

Une recherche sans résultat n'offrait que le retrait des critères et la sauvegarde
(`SearchEmpty`, TCK-558) : le repli conjonctif de l'API exige deux termes utiles
(`PropertySearchService`), et la tolérance aux fautes commence à cinq lettres. Les suggestions de
`SuggestService` (`GET /api/search/suggest`), servies à la barre de recherche, n'y étaient pas
proposées.

## Décision du porteur

validé — des suggestions dans l'état vide

## Objectif utilisateur

Un visiteur dont le terme ne trouve rien voit les villes, quartiers et types que la barre lui
aurait suggérés, et y va d'un geste.

## Contrat de données

`GET /api/search/suggest` existant (`useSuggest`) ; aucun changement d'API.

## Delta à produire

- [x] `SearchEmpty` : quand les critères sont en cause et qu'un terme `q` est posé, un bloc
  « Essayez plutôt » liste au plus 6 suggestions (villes, puis quartiers « nom, ville », puis
  types), en liens.
- [x] `SearchAutocomplete` : la construction d'URL d'une suggestion est exportée
  (`urlDeSuggestion`) et partagée, au lieu d'être recopiée.
- [x] Clé `search.results.vide_suggestions` en fr, en, et en wo le texte français tel quel
  (wolof en pause depuis le 2026-10-16).
- [x] Tests.

## Hypothèses (mode sans humain)

- **Une suggestion remplace le terme** : `q` et son alias `search` sont retirés de l'URL, puisque
  c'est le terme qui ne trouve rien ; les autres critères restent, comme depuis la barre.
- **Aucun compte affiché** : celui de `SuggestService` est pris sur tout le catalogue public, et
  les critères gardés le réduisent.
- **Rien n'est rendu** pendant le chargement ni sur une réponse vide : c'est une issue facultative.

## Critères d'acceptation

- [x] AC1 — À zéro résultat sur un terme, les suggestions du terme sont rendues en liens sous
  « Essayez plutôt ».
- [x] AC2 — Le lien d'une ville, d'un quartier ou d'un type pose le filtre correspondant, retire
  `q`, `search` et `page`, et garde les autres critères ; il porte la langue de la page.
- [x] AC3 — Sans terme, au-delà de la dernière page, ou sans suggestion : aucun bloc, et sans
  terme aucune requête de suggestion.

## Hors périmètre

- Abaisser le seuil du repli conjonctif ou la tolérance aux fautes du moteur.
- Une suggestion par sous-chaîne (`ker` → « Keur Massar ») : `SuggestService` reste en préfixe
  et ne tolère pas de faute sous cinq lettres ; le bloc n'apparaît que si le service suggère.
- La justesse du texte wolof.

## Notes d'implémentation

- Ablation : `SearchEmpty.tsx` de `pre-dev` remis → 5 des 8 tests rouges (les 3 cas « rien »
  restent verts, ce qui est attendu) ; correctif remis → 8 verts.
