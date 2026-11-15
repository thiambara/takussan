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

Implémenté le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`), ADR-0118 écrit d'abord.

**Prémisses re-mesurées — ce qui différait :**
- « le locataire qui retire sa propre demande n'a pas à en donner » : le locataire **ne peut pas** annuler aujourd'hui (matrice `MaintenanceStateMachine::actorAllows`, `ACTOR_REQUESTER` = confirmer/contester seulement ; `update` refusé au demandeur). Transition non ouverte ; `reason` est donc exigé de tout auteur d'une annulation par `PUT …/status` (`required_if:status,cancelled`), qui n'est jamais un locataire.
- Le journal (TCK-2786) posait l'invariant « ni motif ni commentaire » : élargi d'une seule clé, `reason`, sur la seule entrée d'annulation (clé absente ailleurs — `JournalDeLInterventionTest::test_aucune_donnee_hors_fiche` reste vert).
- Une annulation du système (`PropertyObserver`, bien supprimé) porte `context.reason = property_deleted` : la notification lit la **colonne**, jamais ce code.
- « Délai de réponse » : seule source historique, le journal (`status.*`) — la mesure commence à son déploiement.

**Choix (ADR-0118) :**
- Annulation : colonne `cancellation_reason` écrite sous verrou dans `transition()` ; codes variantes `maintenance.cancelled_with_reason` / `maintenance.step_cancelled_with_reason` (le SMS ne porte pas le motif), sans motif → codes d'avant.
- `requester.phone` : `isTeamPrincipalFor` (personnel de l'agence du bien), au détail seulement, clé absente sinon.
- Demande de créneau : table `maintenance_reschedule_requests`, une seule `pending` (la suivante remplace, `superseded`), close (`accepted`) par le `PATCH` du donneur d'ordre ou l'acceptation avec créneau du prestataire ; `abilities.can_request_reschedule` ; détail `pending_reschedule_request` ; notification `maintenance.reschedule_requested` (agence + prestataire assigné encore assignable).
- `overdue_slots_count` : sous-requête corrélée dérivée de `MaintenanceQueue::classify()` (file `en_retard`), carnet + suggestions ; `meta.trade_counts` sur le périmètre du carnet (invitations comprises), égal au `meta.total` de `filter[specialty]`.
- `maintenance_response_minutes` : `AgencyResponseTime`, `percentile_cont(0.5)`, 90 jours, première entrée `status.*` d'un auteur ≠ demandeur, `null` sous 5, cache 1 h par agence ; au détail.

**Mesures :** 24 tests neufs verts (5 fichiers, dont l'annulation du système sans motif et le `null` du délai mis en cache — enveloppe, `Cache::remember` relisant `null` comme absent), 14 ablations rouges puis restaurées (md5) ; la demande de créneau rejuge `completed` sous verrou et n'est plus rendue sur une demande close/rendue ; tests du carnet (TCK-2772/2829/2834) verts ; 4 tests existants qui annulaient sans motif mis à jour (`MaintenanceRequestTest`, `MaintenanceStatusTest`, `MaintenanceStatusBypassTest`, `MaintenanceNotificationsTest`) ; gardes d'architecture, balayages (Impersonation, ValeursEnListe, DateInventory), gardes de notification et `scripts/check-*.mjs` verts.

**Front (types seulement, écrans = TCK-2918) :** `reason` dans `maintenanceStatusSchema`, champs neufs déclarés (`types/maintenance.ts`, `queries/maintenance*.ts`, `queries/service-providers.ts`). ⚠ Le motif est exigé de tout auteur, bailleur compris (écrans du bailleur : TCK-2911). Le bouton « Annuler la demande » (`AutreAction.tsx:230`, `MaintenanceDetail.tsx:243`) envoie `{status: 'cancelled'}` sans motif : 422 tant que TCK-2918 n'ajoute pas la saisie.
