---
id: TCK-2964
title: "Poser un objet dans un fil : partager un bien, proposer un créneau de visite, en carte relue pour chaque lecteur"
status: done
phase: P2
family: full
estimate: M
wave: 94
created: 2026-11-17
updated: 2026-11-18
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

### Prémisses re-mesurées (2026-11-18)

- **AC5 est faux dans le code, et le code est suivi.** Une visite créée par le personnel
  (`POST /api/property-visits` → `PropertyVisitController::planForCustomer` →
  `VisitSchedulingService::createConfirmedOrFail`) **naît `confirmed`** et son SMS part. Le client ne
  peut pas la confirmer : `confirm` exige `PropertyVisitPolicy::peutConfirmer` (personnel, ou bailleur
  au titre du réglage), sinon 403 `visit.staff_only`. Le client peut seulement la **déplacer**
  (`reschedule`, au visiteur), ce qui la repasse `scheduled`. C'est alors l'agent qui la confirme depuis
  sa carte (`abilities.confirm`, `CarteVisite` de TCK-2962). Ni la création ni la confirmation d'une
  visite ne sont changées (contrainte 4, le SMS). AC5 n'est pas mesuré : aucun test ne simule ce
  parcours.
- « Proposer un créneau » exige du personnel un `customer_id`, ou un nom et un téléphone. Le front le
  lit dans `GET /api/conversations/{id}/context` → `customer.id`, rendu au seul personnel. Sans fiche,
  l'entrée le dit et ne crée rien. Sans fiche liée au compte, la visite n'aurait pas de `visitor_id`,
  et le client ne la lirait pas.
- `object.id` d'un objet absent : **403, pas 422**. C'est le patron d'`OpenRoomRequest` : la route ne
  dit pas ce qui existe. Le ticket demandait « `object.id` existant ».
- Le bien n'avait pas de geste dans `PropertyResource.abilities` (seulement `transfer_owner`, rendu à
  la seule fiche). Ajout de `request_visit` = « lit le bien sans `PropertyPolicy::view` » : le lecteur
  le lit donc parce qu'il est publié. Le personnel et le bailleur planifient, ils ne demandent pas.
  `avecGestes()` rend `abilities` sur la route des messages.
- L'extrait de `NotifyNewMessageJob` était `content` (le code brut d'une carte). Il est désormais composé
  par destinataire, dans SA langue (`Message::cardPreview($locale)`, `lang/*/messaging.php`
  `card_preview.*`). `last_message_preview` reste le code (l'aperçu commun ; le front écrit le libellé).

### Mesures

- `ConversationCardTest` : 10 verts. `RelectureDesObjetsTest` : le type `property` est ajouté (sinon
  `UnhandledMatchError`), 12 verts.
- Ablation AC2 : `peutLire` retiré de `StoreConversationCardRequest::authorize` → 403 attendu, 201 reçu
  (rouge). Restauré par `cp`, md5 `70e7acf7…` identique.
- Ablation AC1 : lecture publique forcée (`if (true)`) dans `SujetsDuFil::peutLire` → 2 rouges (bien
  dépublié, brouillon). Restauré, md5 `255ea619…` identique.
- Les classes de garde, `ImpersonationReadSweepTest`, `ValeursEnListeParcoursDesRoutesTest`,
  `DateInventoryByValueTest`, `PropertyOwnerTransferTest` et `LangGroupParityTest` sont vertes.

### Front (2026-11-18)

- Les deux entrées vivent dans le menu du trombone : `BoutonDePieceJointe` reçoit une prop `entrees`, et
  il se nomme alors « Joindre ou partager ». Les feuilles sont `usePoserDansLeFil`, dans
  `components/messages/poser/`. Aucune feuille ne porte de `<form>` : montée dans le `dessus` du
  composeur, un `submit` remonterait jusqu'au formulaire du message par l'arbre React.
- Le choix du bien réutilise `GroupPropertyPicker`, qui appelle `GET /api/conversations/context/properties`
  avec les champs `id,title,reference_number`, la règle de `PropertyPolicy::view`.
- « Proposer un créneau » : `POST /api/property-visits` avec `{property_id, customer_id, scheduled_at}`,
  puis `…/cards`. Si la pose de la carte échoue, la feuille garde l'identifiant de la visite et ne rejoue
  que la pose (test).
- « Demander une visite » mène à la fiche publique localisée (`hrefLocalise`), où vit le parcours de
  demande. Le dialogue de visite de la fiche n'est pas importé dans le fil : ses espaces
  (`propertyVisitDialog`, `propertyContact`) ne sont pas servis dans le widget. La fiche n'ouvre pas
  ce dialogue toute seule, faute de paramètre : le client clique encore une fois.
- La carte du bien (`poser/CarteBien.tsx`) attend son `case 'property'` dans `cartes/CarteDuFil.tsx`.
  Ce fichier est tenu par TCK-2963 : c'est une collision, et le correctif exact est dans le rapport.
  Il en va de même pour le branchement dans `ChatView.tsx`.
- Ablation front : sans le test d'`abilities.request_visit`, 2 rouges dans `CarteBien.tck-2964`.
  Restauré, md5 identique.
- Parcours réel mesuré (`ConversationCardTest`, 11 verts) : dans une directe sans bien, le `…/context`
  de l'agent rend `customer.id`, `POST /api/property-visits` rend la visite `confirmed` pour cette fiche,
  la carte se pose et le client la relit.
- Un bien lisible mais hors agence : l'API réserve au nom de l'agent (sans fiche). La feuille vérifie
  `status = confirmed` et `customer_id` avant de poser la carte, sinon elle le dit (`creneau.horsAgence`)
  et ne pose rien (test vitest).
- La photo du bien est dans l'aplat (prop `media` de `CadreDeCarte`, TCK-2964), comme la maquette `BienD`.
- `IdempotentRoutesTest`, `MessageTypeSpoofingTest` et `EcritureDeMessageUniqueTest` sont verts.

### Relevé de la session (2026-11-18)

**Relevé au navigateur le 2026-11-18** (sous `./dev.sh`, agent `agent3`, 1280, fil direct d'Ousmane Niang) : le trombone propose « Photo · Document PDF · Partager un bien · Proposer un créneau de visite » ; « Partager un bien » ouvre la feuille, liste le portefeuille, et pose la carte du bien (photo, lieu, surface, prix, « Voir le bien ») ; la boîte remonte le fil avec l'extrait « Objet partagé ». **AC5 n'est pas mesuré : sa prémisse est fausse** — une visite créée par le personnel naît `confirmed` (le client ne la confirme pas, il peut la déplacer) ; consigné dans les notes de l'agent, les règles des visites n'ont pas été changées.
