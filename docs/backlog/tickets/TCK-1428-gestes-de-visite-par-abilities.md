---
id: TCK-1428
title: "La fiche d'une visite ne monte les gestes de gestion que sous `abilities.manage`"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-152--gestes-hors-de-appagency-montrés-par-le-rôle-jugés-par-la-capacité"
tags: [back, front, visits, permissions, pistes]
---

## Objectif utilisateur

Le bailleur d'un bien d'agence ne se voit plus offrir « Confirmer », « Marquer effectuée »,
« Marquer absent », « Replanifier » ni « Annuler » sur une visite, que l'API réserve au personnel.

## Contexte

Réf : **P152.04** du fichier de pistes, `retenu · autonome` (A1 : la règle est écrite dans
`PropertyVisitController::agitPourLeBien`).

Mesuré avant correctif (tests ci-dessous, rouges sur `e2959c84c`) : le détail d'une visite ne rend
aucun `abilities` ; la fiche monte les gestes à tout compte `owner`, `agent` ou admin.

## Hypothèses (mode sans humain)

- Comme le recommande la Piste : `PropertyVisitResource` rend `abilities.manage` sur la seule visite
  de la route, calculé comme le contrôleur (`update` ET `agitPourLeBien`). La règle passe dans
  `PropertyVisitPolicy::agitPourLeBien` (statique), que le contrôleur appelle désormais.
- Les cinq gestes qui passent par `agitPourLeBien` (confirmer, clore, absent, déplacer, annuler)
  suivent `manage` ; le visiteur garde l'annulation. Le retour d'agent et la proposition de créneau
  gardent le rôle (le mesureur a établi que `feedback()` admet le propriétaire).

## Delta à produire

- [x] `PropertyVisitPolicy::agitPourLeBien` (déplacée du contrôleur, inchangée).
- [x] `PropertyVisitResource` : `abilities.manage` sur la visite de la route.
- [x] `VisitDetail` : les cinq gestes sous `abilities.manage`.
- [x] Tests : `tests/Feature/Visits/PropertyVisitAbilitiesTest.php`,
  `VisitDetail.abilities.test.tsx` ; les tests du détail qui modélisent le personnel reçoivent
  `manage: true` ; `DateInventoryByValueTest` inscrit la clé.

## Critères d'acceptation

- [x] AC1 — Bailleur d'un bien d'agence : `manage` faux ; personnel : vrai ; propriétaire d'un bien
  sans agence : vrai ; visiteur : faux.
- [x] AC2 — La fiche ne monte les gestes que sous `manage` ; sans `abilities`, aucun (sauf
  l'annulation du visiteur).

## Hors périmètre

- Le retour d'agent (`feedback()` admet le propriétaire).

## Notes d'implémentation

- Ablation : policy, ressource, contrôleur et `VisitDetail` rendus → 2 rouges API, 2 rouges front ;
  remis → 2 + 3 verts.
