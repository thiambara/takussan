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

- [x] **AC1** — Au bureau (dès `lg`), « Nouvelle conversation » bascule en « groupe » dans le même
      dialogue : destinataires en puces, nom, bien ou bail liés (`property_id` / `lease_id`), création
      par `POST` groupe ; au téléphone, le parcours de TCK-2632 reste.
      *Preuve : `NouvelleConversation.groupe.tck-2748.test.tsx` (5 tests : interrupteur, `POST` avec
      `property_id`, minimum de 3, téléphone → `NewGroupDialog`, rien sans groupe proposé) ; relevé
      a-3 bureau 1280 (formulaire unique).*
- [x] **AC2** — Dans un fil de groupe, dès `xl`, la colonne de droite est « Infos du groupe » ; la
      colonne de contexte reste celle des fils directs.
      *Preuve : `MessagesPage.test.tsx` (« un fil de groupe a « Infos du groupe »… »),
      `InfosDuGroupe.tck-2748.test.tsx` ; relevé a-5 bureau 1280.*
- [x] **AC3** — Chaque participant porte sa relation au contexte, servie par l'API (delta ci-dessus),
      ou rien quand l'appelant ne peut pas lire ce contexte ; jamais une relation devinée.
      *Preuve : `ConversationParticipantRelationsTest` (13 tests, `participants` de
      `GET /api/conversations/{id}/context`, `App\Services\Messaging\RelationsAuFil`), 6 ablations
      rouges (bail du fil, bail de l'intervention, bien lisible, `BailleurDuBien` sur le bien et sur
      le bail, agence du fil) ; la garde de l'intervention du fil n'est pas atteignable (403 en amont,
      épinglé par un test) ; côté front, `InfosDuGroupe.tck-2748.test.tsx` (AC3).*
- [x] **AC4** — « Quitter le groupe » refuse le départ de la dernière administratrice et le dit
      (le refus existe-t-il côté API ? à relever avant d'écrire le texte).
      *Relevé : oui, `GroupConversationService::removeParticipant` lève une 422
      (`messaging.errors.promote_admin_before_leaving`). Preuve : `InfosDuGroupe.tck-2748.test.tsx`
      (AC4, et le départ quand un autre admin existe), ablation rouge.*
- [ ] **AC-F2** — `fidelite compare` sur a-3 et a-5 au bureau (1440 et 1280) : les écarts « décision
      produit » de `TCK-2632.json` qui citent ce ticket disparaissent.
      *Partiel : relevé à 1280 seulement (brief du lot : 390/1280), 1440 non relevé. À 1280, les deux
      structures sont celles de la maquette (dialogue unique de 449,6 contre 446,9 px ; colonne de
      320 px) et les deux exceptions citant ce ticket sont retirées de `TCK-2632.json`, remplacées par
      cinq écarts nommés : contenu vide du formulaire et absence de relations dans la démo (donnée),
      rayon et ombre du dialogue et hauteur de l'interrupteur (composant partagé), « admin du groupe »
      neutre (décision produit retenue par team-lead le 2026-11-14).*

## Notes d'implémentation (TCK-2748)

- Décisions retenues par team-lead le 2026-11-14 (sur recommandation) : catégorie de
  l'intervention plutôt que les spécialités du profil ; « admin du groupe » (neutre) ; interrupteur
  manuel au bureau, le clic sur une personne reste direct (pas d'activation d'office à deux).
- Relation : `prestataire` > `locataire` > `proprietaire` > `agent` quand une personne en cumule.
- Logique partagée : `useGestionDuGroupe` (feuille et colonne), `useCreationDeGroupe` (`NewGroupDialog`
  et le mode groupe de `NouvelleConversation`).
