---
id: TCK-2680
title: "Le prestataire accepte une intervention en proposant son créneau, en un seul geste"
status: todo
phase: P2
family: back
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2613]
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
tags: [back, maintenance, prestataire, audit-ux, app]
---

## Objectif utilisateur

Le prestataire invité depuis une demande d'intervention voit la panne à l'arrivée et répond en une
fois : « J'accepte, je passe jeudi à 10 h ». Le locataire et l'agence reçoivent la date, sans que
l'agence ait à la reporter.

## Contrat de données

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- `POST /api/maintenance-requests/{id}/accept` (`MaintenanceRequestController::accept`, `:346`)
  n'accepte **aucun corps** : `MaintenanceRequestService::accept` (`:227-251`) pose `accepted_at`
  sous verrou, refuse une demande terminale (`maintenance.terminal_request`) ou déjà acceptée
  (`maintenance.already_accepted`), puis émet `MaintenanceStatusChanged` (`CAUSE_ACCEPTED`).
- Le créneau `scheduled_at` ne s'écrit que par `PATCH maintenance-requests/{id}`
  (`UpdateMaintenanceRequestRequest::SCHEDULING_FIELDS`), **au donneur d'ordre et au prestataire qui
  a déjà accepté** (`:42-46`). Un prestataire assigné qui n'a pas dit oui ne fixe pas de rendez-vous.
- Fixer ou déplacer un créneau émet `MaintenanceScheduleChanged`, que
  `NotifyMaintenanceParticipants::handleScheduleChanged` (`:69-91`) notifie
  (`maintenance.schedule_changed`) au prestataire, au demandeur et aux donneurs d'ordre, sauf à l'auteur.
- **Aucune route ne permet d'accepter ET de proposer un créneau** : le geste « Proposer un créneau »
  de l'assistant du prestataire (maquette `app-entree-assistants`, approche A) n'a pas d'endpoint, et
  TCK-2613 l'avait sorti de son périmètre.

**À créer** :

- `AcceptMaintenanceRequestRequest` : `scheduled_at` `sometimes|nullable|date|after:now`, interprété
  en heure de Dakar comme le `PATCH` existant ; `authorize()` = la politique actuelle
  `respondToAssignment`.
- `POST /api/maintenance-requests/{id}/accept` accepte ce corps facultatif. Avec `scheduled_at`,
  `MaintenanceRequestService::accept` pose **dans la même transaction** `accepted_at` et
  `scheduled_at`, puis émet `MaintenanceStatusChanged` (accepté) **et** `MaintenanceScheduleChanged`
  (créneau) après la transaction. Sans corps, comportement d'aujourd'hui, inchangé.

## Direction UX / Artistique

Sans objet (ticket API). Écran servi : l'assistant du prestataire (TCK-2613), étape « la raison de
venir », boutons « Accepter » et « Proposer un créneau ».

## Contraintes strictes (métier)

- **Un seul geste, une seule transaction** : soit l'acceptation et le créneau sont posés ensemble,
  soit rien (une date invalide rend 422 sur `scheduled_at`, et `accepted_at` reste nul).
- Les refus existants ne changent pas : demande terminale 422 `maintenance.terminal_request`, déjà
  acceptée 422 `maintenance.already_accepted`, prestataire non assigné 403.
- **Notifications** : une seule notification par destinataire et par événement, comme aujourd'hui ;
  l'auteur (le prestataire) ne reçoit rien. Le demandeur reçoit `maintenance.schedule_changed` avec la date.
- L'adresse et le kit d'accès suivent la règle actuelle (après acceptation, TCK-592) : rien de plus.
- Le créneau reste modifiable ensuite par `PATCH`, aux mêmes personnes qu'aujourd'hui.

## Delta à produire

- [ ] FormRequest `AcceptMaintenanceRequestRequest` ; contrôleur `accept` qui l'utilise.
- [ ] `MaintenanceRequestService::accept(MaintenanceRequest, User, ?CarbonInterface $scheduledAt = null)`.
- [ ] Tests `MaintenanceAcceptWithSlotTest` : acceptation avec créneau (deux colonnes posées, deux
      événements, notifications au demandeur et au donneur d'ordre, aucune à l'auteur) ; créneau passé
      → 422 et `accepted_at` nul ; sans corps → comportement d'avant (test existant inchangé) ; double
      acceptation concurrente avec créneau → une seule passe ; prestataire non assigné → 403.

## Critères d'acceptation

- [ ] AC1 — `POST …/accept {scheduled_at: "2026-11-12T10:00:00"}` par le prestataire assigné rend 200 ; la ressource porte `accepted_at` non nul et `scheduled_at` = 12 nov. 10:00 (Dakar).
- [ ] AC2 — Le demandeur de la démo reçoit exactement une notification `maintenance.schedule_changed` dont les paramètres portent cette date ; le prestataire n'en reçoit aucune.
- [ ] AC3 — `scheduled_at` dans le passé : 422 sur `scheduled_at`, et une lecture suivante montre `accepted_at` toujours nul (rien n'est posé à moitié).
- [ ] AC4 — `POST …/accept` sans corps : la suite existante des acceptations passe sans modification.

## Hors périmètre

- Les disponibilités du prestataire comme contrainte du créneau (saisies dans l'assistant, non lues ici).
- Une confirmation du créneau par le locataire.
- L'écran (TCK-2613).

## Notes d'implémentation

_(à remplir par implementing-specs)_
