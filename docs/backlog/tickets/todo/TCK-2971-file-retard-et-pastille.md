---
id: TCK-2971
title: "La file « Retard » de la boîte et sa part de la pastille des gestes"
status: todo
phase: P2
family: back
estimate: L
wave: 96
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2969, TCK-2970]
blocks: [TCK-2973]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
    - docs/models-spec.md#19-conversationparticipant-
tags: [back, messagerie, le-fil, engagements, boite, adr-0130, adr-0128]
---

## Objectif utilisateur

- **Celui à qui l'on doit** (le bénéficiaire, et le personnel qui suit le fil) : une promesse non tenue
  range le fil dans « Retard ». La pastille de l'onglet Messages la compte comme un geste attendu.

## Contrat de données

Le contrat est [ADR-0130](../../../adr/0130-l-engagement-est-un-objet-du-fil.md), § 5. Les
définitions de TCK-2967 (côté, message compté, `handled_at`, `snoozed_until`) ne changent pas.

- **`FileDuFil` gagne `retard`.** Un fil est `retard` pour le lecteur L, hors `rappel`, quand il porte
  un engagement `open` avec `due_at < maintenant` :
  - dont le porteur **n'est pas du côté de L** (la règle des côtés de TCK-2967, écrite une fois) ;
  - et que L suit : L en est le bénéficiaire, **ou** L est du personnel de l'agence du fil.

  La préséance devient `rappel` > `retard` > `vous` > `attente` > `ajour`. `handled_at` ne s'applique
  pas à `retard`.
- **`GET /api/conversations`** :
  - `filter[file]=retard` ;
  - `meta.counts.retard` ;
  - `meta.gestes` = les fils `vous` ou `retard` hors sourdine. Chaque fil compte une fois ;
  - sous `filter[file]=retard`, ordre par `retard_depuis` croissant (la plus ancienne échéance
    dépassée), puis par dernier échange ;
  - par fil :
    - `retard_depuis` : un instant ;
    - `engagement` : le plus pressant des engagements `open` du fil, ou `null`. On prend d'abord un
      engagement en retard, puis l'échéance la plus proche. Il porte `{id, title, holder_id,
      due_at, etat}`, où `etat` vaut `late` ou `open`. Le front nomme le porteur d'après les
      participants, sans identifiant à l'écran.

  Le tout dans la **même** sous-requête latérale : le nombre de requêtes de la liste reste le même pour
  1 et 30 fils.

## Contraintes strictes (métier)

- **Coût** : pour la liste des fils, une requête constante, et un `EXPLAIN ANALYZE` relevé sur la base
  de développement, joint au ticket (méthode de TCK-2967 : copie des tables dans le schéma temporaire
  si les migrations ne sont pas jouées).
- **Les notes d'équipe ne changent pas plus `retard` que les autres files** (TCK-2967).
- Le porteur en retard est `vous` par l'événement de TCK-2970, **jamais** `retard` pour son propre
  engagement.

## Delta à produire

- [ ] `FileDuFil` : l'expression nommée « un engagement en retard que je suis », la file `retard` dans le
  `CASE`, `retard_depuis`, `engagement` (détails), comptes, filtre, ordre.
- [ ] `ConversationController::index`, `ListConversationsRequest` (`retard` admis) et
  `ConversationResource` (champs neufs).
- [ ] `DateInventoryByValueTest` : les clés neuves.
- [ ] Tests :
  - `FileRetardTest`, un jeu par règle :
    - un bénéficiaire client voit `retard` ;
    - le personnel voit `retard` pour un engagement du client ;
    - un collègue voit `retard` pour l'engagement d'un client, mais pas pour celui d'un collègue ;
    - un autre client du fil, non bénéficiaire, ne voit rien ;
    - le porteur voit `vous` ;
    - `retard` prime sur `vous`, et `rappel` prime sur `retard` ;
    - « Traité » ne sort pas de `retard` ;
    - un engagement tenu sort de `retard` ;
  - `GestesEtRetardTest` : `meta.gestes` = `vous` + `retard` hors sourdine. Il ne change sous aucun
    filtre. Un fil à la fois `vous` et en retard ne compte qu'une fois.

## Critères d'acceptation

- [ ] **AC1** — Chaque règle de `retard` a son test, rouge par ablation de sa clause :
  - retirer le côté met le collègue en `retard` sur l'engagement d'un collègue ;
  - retirer « que L suit » met en `retard` un client non bénéficiaire ;
  - inverser la préséance avec `vous` fait rougir le test de préséance ;
  - laisser `handled_at` s'appliquer fait rougir « Traité ne sort pas de retard ».
- [ ] **AC2** — `meta.gestes` compte chaque fil une fois. *Ablation : `vous` + `retard` comptés sur deux
  expressions qui se recouvrent → rouge.*
- [ ] **AC3** — Le nombre de requêtes de `GET /api/conversations` ne croît pas de 1 à 30 fils, filtre
  `retard` compris. Le plan d'exécution est joint.
- [ ] Pint propre ; tests des fichiers touchés verts, `FileDuFilTest` et `ListeDeLaBoiteTest` compris.

## Hors périmètre

- La liste `GET /api/commitments` et la fiabilité : TCK-2987.
- L'écran de la puce : TCK-2973.

## Notes d'implémentation

_(à remplir par implementing-specs)_
