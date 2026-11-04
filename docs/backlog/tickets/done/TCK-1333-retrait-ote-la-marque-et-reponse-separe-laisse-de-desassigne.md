---
id: TCK-1333
title: "Retrait d'un membre : la marque d'agent principal de ses lignes tombe, et la passation sépare « laissé au partant » de « désassigné »"
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
tags: [api, agence, passation, retrait, agent-principal, pistes]
---

## Contexte

Réf : **P121.04** du fichier de pistes, `validé`.

Avec `leave_unassigned` et `remove_after`, le retrait supprimait les profils sans toucher aux
lignes de collaboration : un bien dont le repreneur des biens avait été refusé gardait la ligne
`{retiré, agent, principal}`, et la réponse le disait « non attribué ». `unassigned` mêlait aussi
deux sens : une intervention désassignée n'est à personne, un bien saisi refusé
(`held_properties`) garde le partant pour titulaire.

## Décision du porteur

« validé — porteur (2026-10-22) : au retrait, retirer `is_primary` de la ligne `collaborations` du retiré, comme P121.03, sans supprimer la ligne ; séparer dans la réponse « laissé au retiré » de « désassigné » »

Critère accordé : V7.

## Objectif

Un membre retiré ne porte plus la marque d'agent principal d'aucun bien de l'agence, et la réponse
de la passation dit ce qui reste au partant à part de ce qui n'est plus à personne.

## Delta à produire

- [x] `AgencyMemberRemovalService::remove()` (le chemin unique du retrait) : les lignes marquées du
      retiré sur les biens de l'agence perdent `is_primary`, biens verrouillés d'abord ; la ligne
      reste.
- [x] `AgentHandoverService::transfer()` rend `left_to_member` à côté d'`unassigned` :
      `held_properties` refusés, et `responsible_properties` refusés dont la ligne du partant porte
      encore la marque. `AgentHandoverController::store` le compte comme `unassigned`.

## Critères d'acceptation

- [x] AC1 — Partant principal du bien, `successors = {responsible_properties: co-propriétaire,
      held_properties: repreneur bailleur}`, `leave_unassigned` et `remove_after` → 200,
      `unassigned.responsible_properties = 1`, `left_to_member.held_properties = 1`, aucune ligne
      marquée au nom du retiré, sa ligne `agent` reste ; le bien saisi garde le retiré pour titulaire.
- [x] AC2 — Sans retrait, le bien dont le repreneur est refusé → `left_to_member.responsible_properties = 1`,
      le partant reste contact public.
- [x] AC3 — Le cas de TCK-1253 (marque ôtée par la réécriture des collaborations) reste dans
      `unassigned.responsible_properties`.

## Hypothèses

- Le nom de la clé, `left_to_member`, est un choix d'implémentation : la décision dit « laissé au
  retiré », et la clé sert aussi sans retrait (le partant est encore membre).
- Le journal `AgentHandover` garde `unassigned_ids` tel quel : la décision vise la réponse.
- L'ôtage de la marque vit dans le retrait lui-même, donc vaut aussi pour le retrait sans
  passation (`AgencyController::removeAgent` y délègue). Sans `leave_unassigned`, le portefeuille
  est vide et aucune ligne d'agent ne reste : l'ôtage n'a rien à faire.
- Comme TCK-1253, la marque tombe par `forceFill()`, sans `PrimaryAgentDesignator` : ni journal
  `primary_agent_designated` ni revalidation de la fiche publique.
- Le front ne lit pas `unassigned` de la réponse (`HandoverWizard`) : la clé neuve n'y est pas typée.

## Notes d'implémentation

- Une première règle par catégorie (`responsible_properties` « laissé » sauf retrait) faisait
  rougir le test de TCK-1253 : la marque peut tomber sans retrait. La règle se juge donc bien par
  bien, sur la ligne marquée du partant après passation et retrait.
- Ablation : l'appel à `dropPrimaryMarks()` retiré → AC1 rouge (le bien est compté laissé au
  partant, sa ligne garde la marque) ; remise → vert.
