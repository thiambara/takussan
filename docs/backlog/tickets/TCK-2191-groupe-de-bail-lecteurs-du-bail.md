---
id: TCK-2191
title: "Un groupe rattaché à un bail ne compte que des personnes qui lisent ce bail"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-191--fils-rattachés-à-un-bail-ou-à-un-bien-face-à-la-policy-de-leur-contexte"
tags: [back, messagerie, bail, pistes]
---

## Objectif utilisateur

Le locataire sait que le fil rattaché à son bail ne réunit que les parties au bail et le personnel
de l'agence : un simple correspondant de l'agent n'y entre plus, ni à la création du groupe ni
par un ajout.

## Contexte

Réf : **P191.04** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-24) : participants d'un groupe rattaché à un bail limités à qui passe `LeasePolicy::view`, contrôlé à la création et à l'ajout, avec l'exception du prestataire assigné à une intervention de ce bail (TCK-592, `SyncMaintenanceConversation`) ; la règle est écrite à `docs/features.md:278` ; reste : relever en préproduction les fils qui comptent déjà un tiers

Avant (lu, puis mesuré par `GroupeDeBailParticipantsTest`) : `GuardsConversationScope::guardContext`
ne juge face au bail que l'acteur ; les autres participants ne sont jugés que par leur joignabilité
(`guardReach`, `MessagingReach`). Un correspondant de l'agent, sans lien au bail, entrait dans le
groupe (201) et en lisait l'historique.

## Hypothèses (mode sans humain)

- « Le prestataire assigné à une intervention de ce bail » se lit sur le groupe lui-même : le
  candidat est l'`assigned_to` de la demande d'intervention rattachée au groupe
  (`maintenance_request_id`), et cette demande porte ce bail (`lease_id`). Un prestataire assigné
  n'entre pas dans un autre groupe du même bail.
- Le fil d'intervention que crée `SyncMaintenanceConversation` passe par `GroupConversationService`,
  hors de ces requêtes : il n'est pas touché.
- La conversation directe n'est pas concernée : la règle écrite vise le groupe.
- À l'ajout, la borne n'est jugée que pour un acteur qui peut ajouter (`ConversationPolicy::addParticipant`) :
  à tout autre, le contrôleur répond 403 `messaging.admin_only`, comme avant (tenu par
  `MembreSuspenduFilsDeContexteTest::test_p191_03_…`).
- Le refus est un 422 sur `participants` (création) ou `user_ids` (ajout), une phrase neuve
  `messaging.errors.participants_cannot_read_lease` ; le wolof porte le texte français (pause du wolof).

## Delta à produire

- [x] `GuardsConversationScope::guardLeaseReaders()` : chaque participant neuf passe
  `LeasePolicy::view`, hors le prestataire assigné à l'intervention rattachée.
- [x] Appelée par `CreateGroupConversationRequest` (après la garde de contexte) et par
  `AddParticipantsRequest` (après la joignabilité).
- [x] Clé `messaging.errors.participants_cannot_read_lease` (fr, en, wo).
- [x] Tests : `tests/Feature/Messaging/GroupeDeBailParticipantsTest.php` ; les trois témoins de
  `GroupConversationCreationTest` qui rattachent un bail y mettent des lecteurs du bail.

## Critères d'acceptation

- [x] AC1 — Création d'un groupe à `lease_id` avec un participant qui ne lit pas le bail → 422,
  aucun groupe créé ; avec les parties et le personnel → 201 ; un tiers dans un groupe sans bail → 201.
- [x] AC2 — Ajout à un groupe à `lease_id` d'un participant qui ne lit pas le bail → 422, non ajouté ;
  un membre du personnel → ajouté.
- [x] AC3 — Le prestataire assigné à l'intervention rattachée entre (création et ajout) ; dans un
  groupe du même bail sans cette intervention, il est refusé.

## Reste à faire

- relever en préproduction les fils qui comptent déjà un tiers

## Hors périmètre

- Le sélecteur `GET /api/conversations/{id}/contacts` (`MessagingReach`) ne lit pas la borne : il
  peut proposer un correspondant que l'ajout refuse ensuite. `docs/features.md:272` dit qu'une seule
  règle sert le sélecteur, la création et l'ajout.
- La ligne `docs/features.md:278` garde son « ⚠ Au 2026-10-23, la règle n'est pas appliquée » : la
  spec est fermée à l'implémenteur (`/sync-specs`).
- Les fils existants qui comptent déjà un tiers ne sont pas touchés.

## Notes d'implémentation

- **Ablation** : `guardLeaseReaders()` vidée → 4 rouges sur 5 dans `GroupeDeBailParticipantsTest`
  (le témoin qui admet, seul, reste vert) ; rétablie → 5 verts.
- **Piège** : la requête d'ajout valide avant que le contrôleur n'autorise. Sans condition, la borne
  rendait 422 au suspendu de P191.03, que le contrôleur doit refuser en 403.
