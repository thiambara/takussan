---
id: TCK-2093
title: "Le fil d'activité de la fiche client rend chaque ligne une fois, et se relit après une note, une étape ou une tâche"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-591]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-199--listes-chargées-par-morceaux-puis-comptées-groupées-ou-triées-sur-la-seule-page-chargée"
tags: [front, crm, cache, pistes]
---

## Objectif utilisateur

Dans l'onglet « Activité » d'une fiche client, une entrée journalisée entre deux « Voir plus »
n'est pas rendue deux fois, et une note, une étape ou une tâche ajoutée depuis la fiche y apparaît
sans attendre cinq minutes.

## Contexte

Réf : **P199.06** du fichier de pistes, `validé (délégué)`.

Décision du porteur (déléguée) : dédoublonner par `id` les pages du fil d'activité de `CustomerActivityFeed`, première occurrence gardée, comme `ConversationList`, et invalider `['agent-crm', 'customer', id, 'activity']` après les gestes de la fiche client qui journalisent (note, étape, tâche) ; test : fil d'activité à deux pages décalées d'une insertion entre deux lectures, chaque ligne rendue une fois ; reste : la relecture de la liste des fils (`maxPages` borné ou page 1 seule par l'intervalle)

Avant (lu) : `CustomerActivityFeed.tsx:68` concatène les pages (`flatMap`) sous `key={row.id}`,
alors que l'API pagine par décalage (`created_at desc, id desc`) ; la clé
`AGENT_CRM_QUERY_KEY.activity` n'est invalidée nulle part.

## Hypothèses (mode sans humain)

- Les gestes de la fiche qui journalisent, et leur composant (lu) :
  - note : `CustomerNotesTimeline` (page de la fiche, action serveur puis `router.refresh()`) et
    la note du tiroir du pipeline (`CustomerDetailSheet`, vue réduite de la fiche) ;
  - étape : `CustomerStageControl` (page de la fiche) ;
  - tâche : `CustomerTasksPanel` (création et bascule, partagé par la page et le tiroir).
- Le glissement d'une carte du kanban (`useCustomerStageMutation`) n'est pas un geste de la fiche :
  il n'est pas touché.

## Delta à produire

- [x] `CustomerActivityFeed` : pages dédoublonnées par `id`, première occurrence gardée.
- [x] Invalidation de `AGENT_CRM_QUERY_KEY.activity(customerId)` après le succès de chacun des gestes
  ci-dessus.

## Critères d'acceptation

- [x] AC1 — Deux pages décalées d'une insertion : chaque ligne est rendue une fois.
- [x] AC2 — Après une note (page et tiroir), une étape ou une tâche (création, bascule) réussie, la
  clé d'activité du client est invalidée.

## Reste à faire

- la relecture de la liste des fils (`maxPages` borné ou page 1 seule par l'intervalle)

## Hors périmètre

- Le kanban du pipeline.

## Notes d'implémentation

- **Ablation** : les cinq composants remis à leur version d'avant → 6 rouges sur 9 (la ligne
  repoussée rendue deux fois ; la clé d'activité jamais invalidée après l'étape, la tâche créée, la
  tâche basculée, la note de la page, la note du tiroir) ; correctif remis → 9 verts.
- **Piège** : `CustomerNotesTimeline` lit désormais le client TanStack ; les tests qui rendent la
  fiche (`CustomerDetailTabs.relations`, `introuvable-vs-erreur`, `tabs.defilement`) restent verts,
  l'onglet des notes n'étant monté qu'ouvert.
