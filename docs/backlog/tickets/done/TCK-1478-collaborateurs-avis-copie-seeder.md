---
id: TCK-1478
title: "Collaborateurs d'un bien : boîte d'avis bornée au personnel, éligibilité rejugée à la copie, `co_owner` et `viewer` semés"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1476]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#111-avis--réputation"
  models:
    - "docs/models-spec.md#8-propertycollaborator"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-86--collaborateurs-co_owner-et-viewer-dun-bien"
tags: [api, property, collaborators, reviews, seeders, pistes]
---

## Contexte

Réf : **P86.05** du fichier de pistes, `validé` (V7 accordé). Trois écarts autour des rôles
`co_owner` et `viewer` : `ReceivedReviews` range dans la boîte « avis reçus » les avis de tout
bien dont l'appelant est collaborateur, quel que soit son rôle, alors que `ReviewPolicy::reply`
ne laisse répondre que le publieur et le personnel de l'agence ; la copie d'un bien
(`copy_collaborators`) recrée les lignes sans rejuger `CollaboratorEligibleForProperty` ; le
seeder ne sème que des `agent` et des `manager`.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenus**, ceux de la recommandation du délégué (Mesure du 2026-10-20), P86.02 gardant
les deux rôles (TCK-1476) :
- (a) la branche collaborateur de la boîte suit la règle de `ReviewPolicy::reply` pour un bien :
  elle ne vaut que sur les biens d'une agence dont l'appelant est personnel ;
- (b) à la copie, la ligne que la règle refuserait (auteur : celui qui duplique) est écartée sans
  erreur ; la copie n'est pas refusée ;
- (c) un `co_owner` et un `viewer` semés sur le premier bien de chaque agence.

## Objectif

Les deux rôles sans accès ne reçoivent plus d'avis qu'ils ne peuvent traiter, ne se recopient pas
inéligibles, et se voient en local.

## Delta à produire

- [x] `ReceivedReviews::targetsActor` : branche collaborateur bornée à `staffAgencyIds()`.
- [x] `PropertyDuplicationService` : chaque ligne rejugée par `CollaboratorEligibleForProperty($clone, $role, $actor)`, écartée si refusée.
- [x] `PropertyCollaboratorSeeder::seedOwnerSideRoles` : un `co_owner` (bailleur autre que le titulaire) et un `viewer` (second bailleur, à défaut agent puis admin libre), sans part ni `accepted_at`.

## Critères d'acceptation

- [x] AC1 — Un `co_owner` ou `viewer` bailleur, et un ancien agent resté en ligne, ne reçoivent pas l'avis ; un `viewer` du personnel le reçoit ; le collaborateur d'une autre agence ne le reçoit plus.
- [x] AC2 — La copie garde l'agent et le `co_owner` éligibles, écarte l'agent sorti et le `co_owner` qui n'est plus bailleur ; la source garde ses quatre lignes.
- [x] AC3 — Le seeder sème un `co_owner` et un `viewer`, chacun éligible, sans part de commission.

## Hors périmètre

- Ouvrir une lecture à ces rôles ou les retirer (D-66, au porteur).

## Notes d'implémentation

- `ReceivedReviewsTest::test_the_inbox_says_who_may_reply` épinglait l'avis présent avec `can_reply = false` pour le collaborateur d'une autre agence : il n'est plus dans sa boîte (`null`), conséquence voulue de (a).
- Ablation (les trois fichiers de `HEAD` remis) → 4 rouges (2 dans `ReceivedReviewsTest`, 1 dans `PropertyDuplicationTest`, 1 dans `PropertyCollaboratorSeederTest`) ; restaurés → verts.
- Le seeder n'a pas été joué sur la base de développement (écriture interdite à l'agent) : seul le test l'éprouve.
