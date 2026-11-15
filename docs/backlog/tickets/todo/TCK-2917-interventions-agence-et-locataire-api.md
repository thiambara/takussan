---
id: TCK-2917
title: "API — interventions côté agence et locataire : annuler avec un motif, le téléphone du demandeur, le locataire qui demande un autre créneau, les créneaux dépassés d'un prestataire, et le délai de réponse de l'agence"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2918]
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [back, interventions, agence, locataire, prestataires, audit-ux, app]
---

## Objectif utilisateur

L'agence appelle le locataire depuis sa demande, annule en disant pourquoi, et choisit un prestataire en voyant ses créneaux dépassés ; le locataire demande un autre créneau et sait que l'agence répond d'ordinaire dans l'heure.

## Contrat de données

Constat (vérifié à l'écriture) :

- **Annuler** passe par `PUT …/status` dont la seule règle est `status` (`UpdateStatusMaintenanceRequestRequest.php:44-48`) : **aucun motif**. Le locataire reçoit l'étape `cancelled` (`NotifyMaintenanceParticipants.php:39,160-166`), sans motif.
- **Téléphone du demandeur** : seulement dans `access.requester_phone`, pour le prestataire assigné après acceptation (`MaintenanceRequestResource.php:178-201`) ; le résumé `requester` (id, name, email, username) n'a pas de téléphone (l. 367-380). Fiche `TCK-2653.json` : « décision d'API (TCK-2637 : le numéro d'un locataire va aux seuls lecteurs du bail) ».
- **Créneau** : `scheduled_at` ne s'écrit que par le principal ou le prestataire assigné qui a accepté (`UpdateMaintenanceRequestRequest::authorize`) — le locataire ne peut rien demander.
- **Créneaux dépassés** : servis par demande (`slot_overdue_days`, file `en_retard`), **pas** par prestataire dans le carnet (`ServiceProviderProfileController.php:55-68`) ni dans les suggestions.
- **Délai de réponse de l'agence** : aucune source (`DemandeEnvoyee.tsx:40`).
- « Écrire à l'agence » : la conversation de l'intervention existe dès l'assignation (`conversation_id` servi) — rien à faire côté API.

Audit (`audit-f4-patrimoine.md`, app-interventions) : **e1** (Appeler / WhatsApp du demandeur), **e2** (« Annuler la demande » sans motif alors que la maquette promet « Le locataire est prévenu, avec votre motif »), **e4** (« répond d'ordinaire dans l'heure » non rendu, aucune source), **e5** (« Changer le créneau »), **e8** (« 1 créneau dépassé » non servi ; pastilles de métier non comptées).

À servir :

1. Annulation : `reason` (texte, requis pour `cancelled` par le personnel) sur `PUT …/status` ; stocké, au journal, et dans la notification du locataire et du prestataire.
2. `requester.phone` dans le détail **pour le personnel de l'agence du bien** (lecteur du bail, règle de TCK-2637), jamais pour un autre prestataire ni pour le bailleur.
3. `POST maintenance-requests/{id}/reschedule-requests` (le demandeur) : un ou plusieurs créneaux proposés + un mot ; notifie l'agence et le prestataire assigné ; le détail rend la demande en attente ; le personnel ou le prestataire l'accepte en posant `scheduled_at` (chemin existant), ce qui la clôt.
4. Carnet et suggestions : `overdue_slots_count` par prestataire (créneaux passés sans clôture), et les comptes par métier (facettes) de la liste.
5. `maintenance_response_minutes` de l'agence (médiane signalement → première prise en charge sur 90 jours), rendu au locataire avec la demande (nul sous un seuil d'échantillon).

## Contraintes strictes (métier)

- Le motif d'annulation est lisible du locataire, du bailleur et du prestataire concerné ; il n'est jamais vide quand le personnel annule (422) ; le locataire qui retire sa propre demande n'a pas à en donner.
- Le téléphone du demandeur suit TCK-2637 : test qui prouve son absence pour un prestataire non assigné, un bailleur et une autre agence.
- Une demande de changement de créneau ne change pas `scheduled_at` d'elle-même.
- Nombre de requêtes constant pour `overdue_slots_count` sur une page du carnet.
- Délai de réponse : médiane, pas moyenne ; aucun chiffre servi sous 5 demandes sur la période.

## Delta à produire

- [ ] **Écrire l'ADR** (numéro suivant libre) avant le code : le téléphone du demandeur servi au personnel de l'agence (règle de lecture, en regard de TCK-2637) et la demande de changement de créneau du locataire (modèle neuf).
- [ ] `UpdateStatusMaintenanceRequestRequest` : `reason` ; colonne `cancellation_reason` (migration) ; journal et notifications.
- [ ] `MaintenanceRequestResource` : `requester.phone` conditionnel.
- [ ] Migration `create_maintenance_reschedule_requests_table` ; `MaintenanceRescheduleRequestController` ; notifications.
- [ ] `ServiceProviderProfileController` / suggestions : `overdue_slots_count`, facettes par métier.
- [ ] `maintenance_response_minutes` (service, mis en cache par agence).
- [ ] Tests : `MaintenanceCancelWithReasonTest`, `MaintenanceRequesterPhoneVisibilityTest`, `MaintenanceRescheduleRequestTest`, `ServiceProviderOverdueSlotsTest`, `AgencyMaintenanceResponseTimeTest`.

## Critères d'acceptation

- [ ] AC1 — `PUT …/status` `{status: cancelled}` par le personnel sans `reason` → 422 ; avec `reason: "Le bailleur fait intervenir son artisan"` → 200, et la notification du locataire contient ce motif.
- [ ] AC2 — Le détail lu par un agent de l'agence du bien rend `requester.phone` ; lu par le bailleur ou un prestataire non assigné, `requester` n'a pas de `phone`.
- [ ] AC3 — Le locataire demandeur `POST …/reschedule-requests` avec deux créneaux : 201, l'agence est notifiée, `scheduled_at` inchangé ; un autre locataire : 403.
- [ ] AC4 — Un prestataire avec 1 intervention dont le créneau est passé de 2 jours sans clôture rend `overdue_slots_count = 1` dans le carnet et dans les suggestions.
- [ ] AC5 — Une agence dont la médiane de prise en charge est 42 minutes sur 12 demandes rend `maintenance_response_minutes = 42` ; avec 3 demandes, `null`.

## Hors périmètre

- Les écrans (TCK-2918).
- Le bailleur et le prestataire (TCK-2911).
- La note vocale (TCK-2900).

## Notes d'implémentation

_(à remplir par implementing-specs)_
