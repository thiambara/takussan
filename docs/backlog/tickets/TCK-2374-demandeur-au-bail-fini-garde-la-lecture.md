---
id: TCK-2374
title: "Le demandeur d'une intervention dont le bail a pris fin garde la lecture, et perd confirmer, contester, les photos et l'écriture dans le fil"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2290]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md#amendement-du-2026-10-25-p24801--le-demandeur-au-bail-fini-lit-et-nagit-plus"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-248--branches--demandeur--dune-intervention-face-au-locataire-dont-le-bail-a-pris-fin"
tags: [api, web, authorization, maintenance, messaging, pistes]
---

## Contexte

Réf : **P248.01** du fichier de pistes, `validé` par le porteur le 2026-10-25 (second tour). Le
défaut est mesuré par le mesureur sur `db3e25230`, et re-mesuré ici par le test de garde avant
correctif.

L'ouverture d'une intervention exige un bail en cours (`store`, `openRequests`). Ensuite, la branche
du demandeur ne lisait que `requester_id` (`MaintenanceRequestPolicy::isRequester`). Une fois le bail
`terminated` et un nouveau locataire arrivé, l'ancien locataire confirmait la réparation (200, la
demande passait `closed`), contestait, ajoutait des photos (201) et écrivait dans le fil de
l'intervention. L'occupant actuel, lui, recevait 403 sur la même demande.

## Décision du porteur

- **P248.01** :
  > validation du porteur (2026-10-25) : le demandeur dont le bail a pris fin garde la lecture de ses interventions, comme celle de son bail passé ; confirmer, contester, ajouter des photos et écrire dans le fil exigent un bail en cours du bien

## Delta à produire

- [x] `MaintenanceRequestPolicy::requesterMayAct()` : la branche du demandeur pour agir. Elle exige,
      du demandeur qui a été locataire du bien, un bail en cours de ce bien
      (`User::ACTIVE_TENANT_LEASE_STATUSES`, la liste de `store`). Elle est lue par
      `respondToResolution` et `actorsOf`.
- [x] `MaintenanceRequestPolicy::contribute()` : verser au dossier (photos du signalement, messages
      du fil). Ce sont les acteurs de `view`, avec `requesterMayAct` à la place de `isRequester`.
      `UploadPhotosMaintenanceRequestRequest::authorize()` la lit à la place de `view`.
- [x] `ConversationAccess::allowsWriting()` : la garde de lecture, plus `contribute` pour un fil
      d'intervention. `SendMessageConversationRequest::authorize()` la lit.
- [x] `CreateGroupConversationRequest` : rattacher un groupe neuf à l'intervention exige
      `contribute`, avec la même erreur de validation que le contexte invisible.
- [x] `GET /api/conversations/{id}` rend `data.abilities.can_send_message`. `ChatView` remplace la
      saisie par une note quand il est faux.
- [x] ADR-0031, amendement du 2026-10-25 (P248.01), et `docs/features.md` § 1.8.

## Critères d'acceptation

- [x] AC1 — Bail du locataire T passé `terminated`, nouveau locataire N au bail actif. T lit encore
      ses deux interventions (fiche 200, liste) et leur fil (fiche et messages 200).
- [x] AC2 — Pour T, `confirm-resolution` et `contest-resolution` rendent 403, la demande reste
      `completed`, `can_confirm_resolution` et `can_contest_resolution` sont faux, et `actorsOf` ne le
      range plus parmi les demandeurs.
- [x] AC3 — Pour T, `POST …/photos` rend 403, et aucune photo n'est ajoutée.
- [x] AC4 — Pour T, `POST /api/conversations/{fil}/messages` rend 403, et `can_send_message` est
      faux. Un groupe neuf rattaché à l'intervention est refusé sur `maintenance_request_id`.
- [x] AC5 — Témoins : le locataire au bail actif, en préavis (`terminating`) ou renouvelé (bail
      suivant actif) garde tous les gestes. Le demandeur qui n'a jamais été locataire du bien, le
      bailleur et le prestataire n'en perdent aucun.

## Hypothèses

- **« Le demandeur dont le bail a pris fin »** : un demandeur qui a tenu un bail du bien comme
  locataire (bail ou fiche supprimés compris) et n'en tient plus aucun en cours au sens de `store`.
  Le demandeur qui n'a jamais été locataire du bien (personnel, bailleur, fixture sans bail) n'est
  pas visé. C'est l'option qui ne retire rien à un autre demandeur que celui que la décision nomme.
  Le personnel parti reste jugé par D2 (TCK-2290).
- **« Un bail en cours du bien »** : n'importe quel bail en cours de ce bien, pas seulement celui
  rattaché à la demande. Un renouvellement garde donc les gestes.
- **Photos et messages postés après la fin du bail** : ils restent lisibles, comme le reste. La
  lecture ne change pas.

## Notes d'implémentation

- Ablation : voir la ligne `Mesure` de P248.01. `respondToResolution` est gardé deux fois, par
  `requesterMayAct` et par `transitionTo` (qui lit `actorsOf`). Retirer la condition des deux sites
  rougit la confirmation, et retirer celle d'`actorsOf` seul rougit l'assertion `actorsOf`.
