---
id: TCK-1476
title: "Le rôle `viewer` ne s'affiche plus « Lecture seule », et D-66 revient au porteur"
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
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#8-propertycollaborator"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-86--collaborateurs-co_owner-et-viewer-dun-bien"
tags: [web, property, collaborators, i18n, pistes]
---

## Contexte

Réf : **P86.02** du fichier de pistes, `validé` (V7 accordé). `PropertyPolicy::view` n'ouvre rien
à un collaborateur `co_owner` ou `viewer` (dette D-66), et la condition de réouverture de D-66
(TCK-587 fusionné) est remplie. Le panneau des collaborateurs affiche pourtant `viewer` sous
« Lecture seule », qui promet une lecture que l'API ne donne pas.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** : la plus étroite. La `Piste` ne recommande ni l'ouverture d'une lecture (V2,
autorisation neuve, non accordée) ni le retrait des rôles (V4, réécriture de lignes, non
accordée) ; elle demande « en attendant, un libellé qui ne promet pas de lecture », et de rendre
D-66 au porteur. Libellé retenu : « Lecteur (sans accès) » / « Viewer (no access) » — « lecteur »
est le nom du rôle dans `docs/features.md` § 1.1, « sans accès » dit ce que l'API fait.

## Objectif

Le panneau des collaborateurs ne promet plus au `viewer` une lecture qu'il n'a pas, et D-66 dit
que la décision revient au porteur.

## Delta à produire

- [x] `property.dashboard.collaborators.roles.viewer` : `fr` « Lecteur (sans accès) », `en` « Viewer (no access) ».
- [x] `docs/ardoise.md` D-66 : condition remplie, décision au porteur, libellé changé.

## Critères d'acceptation

- [x] AC1 — Le panneau affiche « Lecteur (sans accès) » pour un `viewer`, et nulle part « Lecture seule ».

## Reste à faire

- Ouvrir une lecture à `co_owner` et `viewer` (bien, baux, loyers), ou retirer les deux rôles de l'enum et du libellé : choix du porteur (D-66).
- Le `wo` (« Xool rekk ») n'est pas réécrit : pause du wolof.

## Hors périmètre

- L'API, inchangée. `docs/features.md` (spec fermée à l'implémenteur).

## Notes d'implémentation

- Ablation : le test, modifié avant le libellé, rougit sur « Lecture seule » (1 rouge, 8 verts) ; libellé posé → 9 verts.
