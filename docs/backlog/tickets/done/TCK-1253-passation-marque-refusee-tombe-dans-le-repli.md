---
id: TCK-1253
title: "Passation : la marque d'un bien dont le repreneur des biens est refusé tombe dans le repli, au lieu de passer au repreneur des collaborations"
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
tags: [api, agence, passation, agent-principal, pistes]
---

## Contexte

Réf : **P121.03** du fichier de pistes, `validé (délégué)`.

Avec un repreneur par catégorie, `responsible_properties` passe la marque d'agent principal par
`ResponsibleAgentAssigner`. Un repreneur refusé (co-propriétaire du bien) range le bien en
`unassigned`, et la ligne du partant garde `is_primary`. `collaborations` vient ensuite : si son
repreneur n'a pas de ligne sur le bien, la ligne du partant lui est réécrite par
`update(['user_id'])`, marque comprise, hors de `PrimaryAgentDesignator`. La réponse dit le bien
« non attribué » alors que le repreneur des collaborations en porte la marque.

## Décision du porteur (déléguée)

« validé (délégué) — dans `collaborations`, retirer `is_primary` de la ligne du partant avant de réécrire `user_id` quand le repreneur des biens a été refusé : le bien reste sans marque (repli) et la réponse le compte dans `unassigned.responsible_properties`, comme le refus de la collision d'ADR-0059 § 3 ; le repreneur des collaborations ne reçoit jamais la marque par la réécriture »

Critère accordé : V7.

## Objectif

Un bien dont le repreneur des biens est refusé reste sans marque après la passation, et la réponse
qui le dit non attribué est vraie.

## Delta à produire

- [x] `AgentHandoverService::move()` reçoit les biens refusés par `responsible_properties` ; dans
      `collaborations`, une ligne marquée d'un de ces biens perd sa marque avant d'être réécrite au
      repreneur.
- [x] En-tête du service : la règle ajoutée à la catégorie `collaborations`.

## Critères d'acceptation

- [x] AC1 — Partant agent principal, A co-propriétaire du bien, `successors =
      {responsible_properties: A, collaborations: B}` → 200, `unassigned.responsible_properties = 1`,
      `moved.collaborations = 1`, la ligne de B est `agent` sans marque, et aucune ligne du bien
      n'est marquée.
- [x] AC2 — Les autres passations gardent leur comportement (`AgentHandoverPropertiesTest`,
      `AgentHandoverTest`).

## Hypothèses

- La décision vise la réécriture (le repreneur des collaborations n'a pas de ligne sur le bien).
  Quand il en a déjà une (collision), le service garde la reprise d'ADR-0053 « Conséquences » par
  `ResponsibleAgentAssigner` : la décision ne la nomme pas, et le service peut encore la refuser.
- Quand `responsible_properties` n'a pas de repreneur du tout, rien ne change : la décision ne vise
  que le refus.
- Le contact public suit le repli de `PrimaryPropertyContact` ; s'il retombe sur B, c'est par
  l'ordre d'invitation, pas par une marque.

## Notes d'implémentation

- Ablation : la ligne `forceFill(['is_primary' => false])` retirée → le test neuf rougit (la ligne de
  B porte `is_primary = true`) ; remise → vert.
- `is_primary` n'est pas `fillable` (TCK-504) : d'où `forceFill()->save()`, jamais `update()`.
