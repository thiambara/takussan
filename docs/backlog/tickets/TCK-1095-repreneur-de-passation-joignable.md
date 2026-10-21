---
id: TCK-1095
title: "La passation refuse un repreneur au compte bloqué ou supprimé"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-88--comptes-blocked--ce-quils-reçoivent-et-qui-les-propose-encore"
tags: [back, agence, equipe, passation, pistes]
---

## Contexte

Réf : **P88.01** du fichier de pistes, `validé (délégué)` (critère accordé : V7, refuser un
repreneur bloqué est un comportement visible neuf).

Le repreneur d'une passation (`POST /api/agencies/{a}/members/{u}/handover`) n'était jugé que par
`isStaffAt()`, qui ne lit pas `users.status`. Un compte bloqué dont le profil d'agent restait actif
recevait les tâches et la collaboration du sortant, marque `is_primary` comprise, alors que la
réponse annonçait le bien « non attribué ».

### Décision du porteur (déléguée)

> faire juger le repreneur de la passation par `PersonnelDeLAgence::estPersonnel()` dans `StoreAgentHandoverRequest` : un compte `blocked` ou `deleted` est refusé en 422 sur son champ de repreneur, avec le message existant `team_handover.handover.successor_not_staff` ; la branche `collaborations` d'`AgentHandoverService` n'est pas modifiée ; test : repreneur `blocked` → 422 et aucune ligne déplacée (ni collaboration, ni tâche), repreneur actif → 200 inchangé

## Objectif utilisateur

L'admin d'agence ne peut plus passer le portefeuille d'un agent à un compte qui ne se connectera
jamais.

## Contraintes strictes (métier)

- Le message d'erreur est l'existant `team_handover.handover.successor_not_staff`, sur le champ du
  repreneur (`successor_id` ou `successors.{catégorie}`).
- `AgentHandoverService` (branche `collaborations`) n'est pas modifié.

## Delta à produire

- [x] `StoreAgentHandoverRequest` : chaque repreneur jugé par `PersonnelDeLAgence::estPersonnel()`.
- [x] Test : repreneur `blocked` puis `deleted`, en `successor_id` et en `successors.tasks` → 422,
      ni tâche ni collaboration déplacée.

## Critères d'acceptation

- [x] AC1 — repreneur `blocked` → 422 sur `successor_id`, message `successor_not_staff`.
- [x] AC2 — même refus pour `deleted`, et pour un repreneur par catégorie.
- [x] AC3 — aucune tâche ni collaboration ne quitte le sortant.
- [x] AC4 — repreneur actif → 200 inchangé (tests existants de `AgentHandoverTest`).

## Hors périmètre

- La réécriture de `is_primary` dans la branche `collaborations` du service (décision : non
  modifiée).
- Les passations déjà faites vers un compte bloqué : aucune donnée n'est réécrite.

## Notes d'implémentation

- Ablation : `StoreAgentHandoverRequest.php` rendu à `HEAD` → 1 rouge (200 au lieu de 422) ;
  correctif remis → 9/9.
