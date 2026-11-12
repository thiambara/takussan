---
id: TCK-2748
title: "Messagerie au bureau : créer un groupe en un seul formulaire, et la colonne « Infos du groupe » avec le rôle de chaque participant"
status: todo
phase: P2
family: full
estimate: M
wave: 87
created: 2026-11-12
updated: 2026-11-12
depends_on: [TCK-2632]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  models:
    - "docs/models-spec.md#18-conversation-"
tags: [front, back, messagerie, audit-ux, app, fidelite]
---

## Objectif utilisateur

Au bureau, l'agent crée un groupe d'un seul geste — les personnes, le nom, le bien ou le bail — et,
dans un fil de groupe, voit à côté du fil qui y parle et à quel titre (« Locataire », « Prestataire ·
plomberie », « Vous · administratrice du groupe »), sans ouvrir de feuille.

## Constat

TCK-2632 a livré la messagerie de la maquette `app-messagerie` (approche a, validée par le porteur)
avec deux écarts de structure au bureau, acceptés par le lead (« b et b », 2026-11-12) et consignés
dans `docs/qa/audit-ux-2026-11/fidelite/TCK-2632.json` :

1. **a-3 bureau — « Nouveau groupe »** : la maquette est UN formulaire (« À » en puces, bascule
   « groupe » active, nom du groupe, bien et bail liés, « Annuler » / « Créer le groupe ») ; le produit
   garde la liste « Personnes » puis `NewGroupDialog` en deux étapes (TCK-576, contexte par
   `GroupContextPicker`, TCK-565). Écart mesuré : 83 % de pixels.
2. **a-5 bureau — fil de groupe** : la maquette remplace la colonne de contexte par « Infos du
   groupe » (titre et lien de l'intervention ou du bien, participants avec leur rôle, « Ajouter un
   participant », sourdine, « Quitter le groupe », et la règle « nommez une autre administratrice
   avant de partir ») ; le produit garde la colonne de contexte et ouvre `ConversationInfoSheet` par
   la sous-ligne de l'en-tête.

## Deltas API — à vérifier ou à créer

- **Lien bien / bail à la création : EXISTE.** `CreateGroupConversationRequest` accepte déjà
  `property_id` et `lease_id` (relu le 2026-11-12), et `GroupContextPicker` les choisit. Le formulaire
  unique est donc un travail de FRONT ; vérifier seulement que l'intervention (`maintenance_request_id`)
  n'a pas à être choisie à la création — la maquette ne la propose pas.
- **Rôle d'un participant dans le groupe : À CRÉER.** `ParticipantRole` ne porte que `admin` /
  `member`. La maquette dit la RELATION au contexte du fil : « Locataire » (le locataire du bail de
  l'intervention), « Prestataire · plomberie » (le prestataire affecté et sa spécialité),
  « Propriétaire », « Agent ». À dériver côté API du contexte du fil (bail, intervention, bien), jamais
  stocké à la main ; ne rendre une relation qu'à qui peut lire ce contexte (même règle que
  `GET /api/conversations/{id}/context`, TCK-2630). Le rôle `admin` reste celui du groupe.

## Critères d'acceptation

- [ ] **AC1** — Au bureau (dès `lg`), « Nouvelle conversation » bascule en « groupe » dans le même
      dialogue : destinataires en puces, nom, bien ou bail liés (`property_id` / `lease_id`), création
      par `POST` groupe ; au téléphone, le parcours de TCK-2632 reste.
- [ ] **AC2** — Dans un fil de groupe, dès `xl`, la colonne de droite est « Infos du groupe » ; la
      colonne de contexte reste celle des fils directs.
- [ ] **AC3** — Chaque participant porte sa relation au contexte, servie par l'API (delta ci-dessus),
      ou rien quand l'appelant ne peut pas lire ce contexte ; jamais une relation devinée.
- [ ] **AC4** — « Quitter le groupe » refuse le départ de la dernière administratrice et le dit
      (le refus existe-t-il côté API ? à relever avant d'écrire le texte).
- [ ] **AC-F2** — `fidelite compare` sur a-3 et a-5 au bureau (1440 et 1280) : les écarts « décision
      produit » de `TCK-2632.json` qui citent ce ticket disparaissent.
