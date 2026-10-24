---
id: TCK-1705
title: "Le membre retiré ne lit, ne modifie ni ne liste plus les biens d'agence qu'il a saisis"
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
  features: ["docs/features.md#112-agence--équipe", "docs/features.md#11-gestion-des-biens"]
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-153--ce-que-le-retrait-en-leave_unassigned-laisse-au-nom-du-retiré-et-ce-qui-le-lit-encore"
tags: [back, agence, autorisation, pistes]
---

## Objectif utilisateur

Une agence qui retire un agent en `leave_unassigned` ne lui laisse plus lire ni modifier les biens
d'agence qu'il avait saisis (`properties.user_id`).

Réf : **P153.01**.

## Décision du porteur

- P153.01 : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Critère accordé : V2 (qui lit et modifie un bien).

**Choix de l'implémenteur** (la piste dit « `estProprietaire` ou personnel de l'agence ») : la voie
la plus étroite est retenue, un **profil de tout statut** dans l'agence du bien
(`PropertyPolicy::isMemberOf`, déjà employé par `update`). Seul l'auteur sans aucun profil vivant
dans l'agence perd son titre ; un bailleur ou un agent suspendu garde la lecture qu'il a
aujourd'hui (et `update` juge toujours `properties.update_own` pour lui).

## Contraintes strictes (métier)

- L'auteur d'un bien **sans agence** garde lecture et écriture.
- Le personnel de l'agence garde son accès par `isStaffOf` / `properties.update_any`.

## Delta à produire

- [x] `PropertyPolicy::view` : `user_id` ne vaut titre sur un bien d'agence que si l'auteur a un
  profil dans l'agence.
- [x] `PropertyPolicy::update` : la branche « auteur sans profil dans l'agence » ne vaut plus que
  pour un bien sans agence.
- [x] `PropertyController::index` : la clause `user_id` est bornée aux biens sans agence et à ceux
  des agences où l'appelant a un profil.
- [x] Test : `MembreRetireBiensSaisisTest` (3 cas).

## Critères d'acceptation

- [x] AC1 — agent retiré en `leave_unassigned` : `GET` et `PUT /api/properties/{saisi}` → 403, titre inchangé, bien absent de `GET /api/properties`.
- [x] AC2 — témoin : l'agent encore membre lit et liste le bien.
- [x] AC3 — l'auteur d'un bien sans agence le lit, le modifie et le liste.

## Hors périmètre

- Le sort du titre `user_id` lui-même et de la marque `is_primary` (P121.04).

## Notes d'implémentation

- Ablation : policy et contrôleur retirés → AC1 rouge (200 au lieu de 403) ; contrôleur seul retiré
  → AC1 rouge sur la liste. Remis → 3/3.
