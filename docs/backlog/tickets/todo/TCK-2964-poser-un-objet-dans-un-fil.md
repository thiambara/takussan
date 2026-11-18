---
id: TCK-2964
title: "Poser un objet dans un fil : partager un bien, proposer un créneau de visite, en carte relue pour chaque lecteur"
status: todo
phase: P2
family: full
estimate: M
wave: 94
created: 2026-11-17
updated: 2026-11-17
depends_on: [TCK-2958, TCK-2962]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#3-property
    - docs/models-spec.md#17-propertyvisit-
tags: [back, front, messagerie, le-fil, cartes, bien, visite, adr-0128]
---

## Objectif utilisateur

- **L'agent dans le fil d'un client** : il partage un bien ou propose un créneau de visite sans
  quitter la conversation, et le client y répond d'un geste (« Demander une visite », « Confirmer ce
  moment ») depuis la carte.

## Contrat de données

- ADR-0128 §§ 3 et 4 (la carte garde une référence ; un geste passe par la route de l'objet).
- **Endpoint neuf** — `POST /api/conversations/{conversation}/cards` avec **pour seul corps**
  `{object: {type, id}}`. Le serveur pose `type = card`, `code`, `data` et `content` ; aucun autre champ
  du client n'est lu.
- Types posables, ajoutés au registre `SujetsDuFil` comme objets de carte (non sujets de fil) :
  - `property` → code `property.shared`, `data` vide. Lecture : la fiche publique du bien s'il est
    publié (la projection est alors un sous-ensemble de ce que rend `GET /api/public/properties/{slug}`,
    pour tout lecteur), sinon `PropertyPolicy::view` ; sinon `{indisponible: true}`.
  - `property_visit` → code `visit.proposed`, `data` : `scheduled_at`. Lecture : `PropertyVisitPolicy::view`
    (type et projection posés par TCK-2958 ; ce ticket n'ajoute que le code).
- **« Proposer un créneau » crée d'abord la visite par sa route existante** (`POST
  /api/property-visits`), puis pose sa carte ; le client la confirme ou la déplace par `POST
  /api/property-visits/{visit}/confirm` / `…/reschedule`. « Demander une visite » depuis la carte d'un
  bien suit le parcours de demande de visite existant.
- Front : la carte du bien et la carte de créneau de visite à l'écran (composants de TCK-2962), et les
  deux entrées du composeur.

## Direction UX / Artistique

- **Référence de fidélité, à lire au chemin absolu (le résultat, jamais le code)** : `BienD` et
  `CreneauD` (variante visite) de
  `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/fil-cartes-d-cartes.tsx` ;
  visionneuse `http://localhost:3000/fr/playground/maquettes?p=fil-cartes&a=d`.
- Même sobriété que TCK-2962 : aplat sans bordure, photo du bien en tête, prix en chiffre clé, un geste
  principal pour le client, rien à faire pour l'agent sinon une trace (« Partagé à 13:10 avec … »).
- Partager et proposer se font depuis le composeur, par un choix court (chercher un bien de son
  portefeuille ; choisir un moment), sans quitter le fil.

## Contraintes strictes (métier)

- **Autorisation** (`StoreConversationCardRequest::authorize`) : l'auteur peut **écrire** dans le fil
  (`ConversationAccess::allowsWriting`) **et** lire l'objet qu'il pose (`SujetsDuFil::peutLire`).
  On ne partage pas un objet qu'on ne lit pas.
- **Validation** : `object.type` parmi les types **posables** du registre (`property`,
  `property_visit`) ; tout autre type, même du registre (un `lease_payment`, un `booking`), 422 ;
  `object.id` existant. Un nom venu de la requête n'est jamais résolu hors du registre.
- La carte passe par `ConversationWriter::post` (garde d'écriture, notification ordinaire
  `NotifyNewMessageJob`) et par `EvenementsDuFil` pour sa forme (catalogue, clés de `data`).
- Le lecteur qui ne lit pas l'objet reçoit `{indisponible: true}` : un bien dépublié depuis le
  partage devient indisponible pour le client, sans rien réécrire.
- Une carte posée compte comme non lue pour les autres participants (un message d'un autre, TCK-2958).
- Le préfixe `/api` et les sparse fieldsets côté front : règles de `CLAUDE.md`.

## Delta à produire

- [ ] `SujetsDuFil` : type `property` (projection publique ou `view`), drapeau « posable » sur
  `property` et `property_visit`.
- [ ] `CodesDuFil` : `property.shared`, `visit.proposed`.
- [ ] Route `POST conversations/{conversation}/cards` (`routes/api/conversations.php`),
  `ConversationCardController@store`, `StoreConversationCardRequest` ; réponse : le message rendu par
  `MessageResource` avec son `object` pour l'auteur.
- [ ] Front : les deux entrées du composeur (partager un bien, proposer un créneau qui crée la visite
  puis pose la carte), la carte du bien et la carte de créneau de visite, les clés i18n `fr`, `en`,
  `wo` (= français).
- [ ] Tests API `ConversationCardTest` : pose d'un bien et d'une visite ; 403 pour un auteur qui ne lit
  pas l'objet, pour un auteur en lecture seule ; 422 pour un type non posable et pour un type hors
  registre ; un champ `code`, `data` ou `content` envoyé par le client est ignoré ; un bien dépublié
  devient indisponible pour le client et reste lisible pour l'agent qui le lit par `view`.
- [ ] Tests front : la pose d'un bien appelle `…/cards` avec le seul `{object}` ; « Proposer un
  créneau » appelle `POST /api/property-visits` puis `…/cards` ; la carte rend son geste selon
  `object.abilities`.

## Critères d'acceptation

- [ ] **AC1** — Un client qui ne lit pas un bien non publié reçoit `{indisponible: true}` pour sa
  carte. *Ablation : rendre la projection sans juger la lecture rend le test rouge.*
- [ ] **AC2** — Un auteur ne peut pas poser un objet qu'il ne lit pas. *Ablation : retirer
  `peutLire` de `authorize` rend le test 403 rouge.*
- [ ] **AC3** — `code`, `data` et `content` sont ceux du serveur, quoi qu'envoie le client
  (le test envoie `data: {amount: 1}` et `content: "texte"` et relit la ligne).
- [ ] **AC4** — Un type du registre qui n'est pas posable (`lease_payment`) est refusé 422.
- [ ] **AC5** — Le client confirme le créneau depuis la carte par la route de la visite, et la carte
  passe à « Confirmé » chez l'agent par le signal du fil.
- [ ] Pint propre ; ESLint 0 erreur ; `tsc --noEmit` propre ; tests des fichiers touchés verts.

## Hors périmètre

- Poser d'autres objets (un devis, un état des lieux, un document) : un type posable de plus est une
  ligne de registre et un ticket.
- Proposer un créneau d'intervention depuis le fil : la demande de report existe déjà
  (`reschedule-requests`) et parle dans le fil par TCK-2961.
- La note d'équipe, la @mention : lot 2.

## Notes d'implémentation

_(à remplir par implementing-specs)_
