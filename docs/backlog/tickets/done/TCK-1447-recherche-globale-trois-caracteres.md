---
id: TCK-1447
title: "La recherche globale de la console demande 3 caractères, le seuil du texte libre"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-159--exemples-et-formats-montrés-à-la-saisie-face-à-la-règle-qui-jugera-la-valeur"
tags: [back, front, console, recherche, pistes]
---

## Objectif utilisateur

Un opérateur qui tape deux lettres dans la recherche globale n'obtient plus « Aucun résultat » :
l'écran lui demande un troisième caractère, et l'API refuse une requête qu'aucune voie ne peut
servir.

## Contexte

Réf : **P159.01** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé).

Mesuré avant correctif sur `58c404ecf` : `GlobalSearchRequest` accepte `q` dès 2 caractères
(`min:2`), l'écran interroge dès 2 (`MIN = 2`) et dit « Au moins 2 caractères. », mais le texte
libre du service ne commence qu'à `FREE_TEXT_MIN = 3` et les voies exactes plus loin encore :
`q=Ba` rend 200 et une liste vide.

## Décision du porteur (déléguée)

> monter l'écran et la requête à 3 caractères, sur le seuil du texte libre que TCK-600 a écrit : `MIN = 3` dans `GlobalSearch.tsx` (l'écran n'interroge pas en dessous), `min:3` dans `GlobalSearchRequest`, aide « Au moins 3 caractères. » en `fr` et « At least 3 characters. » en `en` (le `wo` n'est pas réécrit, pause du wolof) ; test : `q=Ba` rend 422 et l'écran n'appelle pas l'API à deux caractères ; reste : abaisser le texte libre à 2 caractères pour les noms courts (Ba, Sy, Ka), après mesure du coût d'un `LIKE` sur deux lettres

## Hypothèses (mode sans humain)

- `min:3` s'écrit `'min:'.AdminGlobalSearchService::FREE_TEXT_MIN` : la valeur est 3, et les
  deux seuils ne peuvent plus diverger.
- Le texte `wo` (« Ñaari araf lu néew. ») reste tel quel : il dit encore deux caractères.

## Delta à produire

- [x] `GlobalSearchRequest` : `min` au seuil du texte libre (3).
- [x] `GlobalSearch.tsx` : `MIN = 3`.
- [x] `superAdmin.globalSearch.hint` en `fr` et `en`.
- [x] Tests : `AdminGlobalSearchTest` (`q=Ba` → 422, `q=Ba Sy` → 200), `GlobalSearch.test.tsx`
  (aucun appel à `Ba`, appel à `Bai`).

## Critères d'acceptation

- [x] AC1 — `GET /api/admin/search?q=Ba` rend 422.
- [x] AC2 — L'écran affiche « Au moins 3 caractères. » et n'appelle pas l'API à deux caractères.

## Reste à faire

> abaisser le texte libre à 2 caractères pour les noms courts (Ba, Sy, Ka), après mesure du coût d'un `LIKE` sur deux lettres

## Notes d'implémentation

- Ablation : `GlobalSearchRequest.php`, `GlobalSearch.tsx` et les deux JSON rendus à leur état
  antérieur → 1 rouge API (`q=Ba` rend 200), 1 rouge front ; remis → 13 et 5 verts.
