---
id: TCK-1331
title: "Passation : un repreneur qui collabore déjà au bien reprend la collaboration d'agent du partant et sa part, ou la laisse désassignée s'il est co-propriétaire"
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
    - "docs/features.md#112-agence--équipe"
  adr:
    - "docs/adr/0059-changer-l-agent-responsable-et-transmettre-les-biens-a-la-passation.md#3-la-passation--les-biens-dabord-les-lignes-ensuite"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-121--passation-de-portefeuille--chaque-catégorie-face-au-geste-unitaire"
tags: [api, agence, passation, collaborations, commission, pistes]
---

## Contexte

Réf : **P121.02** du fichier de pistes, `validé`.

Dans la catégorie `collaborations` de `AgentHandoverService`, quand le repreneur a déjà une ligne
sur le bien, la ligne d'agent du partant était supprimée quel que soit le rôle de celle du
repreneur. Seule une ligne marquée principale passait par `ResponsibleAgentAssigner`, qui promeut
`viewer` ou `manager` en `agent`. Un repreneur lecteur restait lecteur : plus aucune ligne d'agent
pour lui, la part de commission du partant disparaissait avec sa ligne, et la réponse comptait la
collaboration « déplacée ».

## Décision du porteur

« validé — porteur (2026-10-22) : la ligne du repreneur passe en `agent` comme dans `ResponsibleAgentAssigner`, `co_owner` rangé en `unassigned` ; la `commission_share` du partant est reportée au repreneur »

Critère accordé : V1.

## Objectif

Une collaboration d'agent transmise à un repreneur qui collabore déjà au bien reste une
collaboration d'agent, avec la part du partant ; et la réponse ne compte « déplacée » que ce qui
l'a été.

## Delta à produire

- [x] `AgentHandoverService::takeOverCollaboration()` : la ligne du repreneur passe en `agent`
      (`viewer`, `manager`), ou reçoit la marque par le service si la ligne du partant la portait ;
      la `commission_share` du partant lui est reportée ; un repreneur `co_owner` → `false`.
- [x] Catégorie `collaborations` : une reprise refusée range la ligne du partant en `unassigned`
      (journal `unassigned_ids` compris) ; la ligne du partant est supprimée dans tous les cas,
      comme avant.

## Critères d'acceptation

- [x] AC1 — Bien d'un bailleur, principal un autre membre ; partant `agent` non marqué avec
      `commission_share` 30 ; repreneur `viewer` → 200, `moved.collaborations` compte la ligne,
      pas de `unassigned.collaborations` ; la ligne du repreneur est `agent`, 30.00, non marquée.
- [x] AC2 — Repreneur `co_owner` du bien → `unassigned.collaborations = 1`, journal
      `unassigned_ids` = la ligne du partant, la ligne du repreneur reste `co_owner`.
- [x] AC3 — La collision avec marque (ADR-0053) et les autres passations gardent leur comportement.

## Hypothèses

- « Reportée » : la part du repreneur prend la valeur de celle du partant quand le partant en
  avait une ; elle n'est pas additionnée à une part que le repreneur aurait déjà. Sans part chez
  le partant, celle du repreneur reste.
- Le cas `co_owner` garde la suppression de la ligne du partant, comme le refus de la marque dans
  la même catégorie : la collaboration est désassignée, et la part du partant tombe avec sa ligne
  (une part ne se reporte pas sur une co-propriété).

## Notes d'implémentation

- Ablations : sans la promotion en `agent` → AC1 rouge sur le rôle ; sans le report de la part →
  AC1 rouge sur `commission_share` ; sans la branche `co_owner` → AC2 rouge (`moved.collaborations`
  vaut 2, la co-propriété aurait été réécrite en `agent`). Remises → vert.
