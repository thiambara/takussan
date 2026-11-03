---
id: TCK-865
title: "Liste pro des biens : le compte « loués » n’attend plus celui des « vendus »"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes"
tags: [front, performance, properties, pistes]
---

## Contexte

Réf : **P02.08** du fichier de pistes, `retenu · autonome` (A2). La page `/app/properties` lance la
liste et quatre membres de `Promise.all` ; le compte « vendus » est suivi par `.then` du compte
« loués », qui ne part qu'à sa réponse : une requête HTTP en série à chaque affichage.

## Objectif utilisateur

L'agent voit sa liste de biens et ses compteurs sans l'aller-retour en série du compte « loués ».

## Contrat de données

Aucun changement : les mêmes six appels à `GET /api/properties` (`per_page=1` pour les compteurs),
le compteur « Vendus / loués » reste la somme des deux totaux.

## Delta à produire

- [x] `properties/(liste)/page.tsx` : « loués » devient un membre propre du `Promise.all`.
- [x] Test : `compteurs-en-parallele.tck-865.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Avant toute réponse de l'API, les six requêtes sont parties.
- [x] AC2 — La tuile « Vendus / loués » vaut la somme des totaux `sold` et `rented`.

## Hypothèses

- Seule la mise en série est corrigée. L'endpoint de compteurs unique proposé par la `Piste`
  ajoute une surface d'API que le classement A2 ne couvre pas (lu, ligne `Mesure` du mesureur).

## Hors périmètre

- Un endpoint de compteurs en `COUNT(*) FILTER (WHERE …)`.

## Notes d'implémentation

- Reproduit avant correctif : 5 requêtes lancées avant la première réponse au lieu de 6.
- Ablation : page remise à l'état d'avant → rouge (5 au lieu de 6) ; remise → vert.
