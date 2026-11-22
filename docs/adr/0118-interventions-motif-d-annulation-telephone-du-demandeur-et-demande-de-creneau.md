# ADR-0118 — Interventions : le motif d'annulation, le téléphone du demandeur au personnel, et la demande de créneau du locataire

- **Statut** : Accepté le 2026-11-15 — décision du porteur « implémente tout », modalités à revoir
- **Date** : 2026-11-15
- **Tickets** : TCK-2917 (API), TCK-2918 (écrans)
- **S'appuie sur** : TCK-592 (kit d'accès du prestataire, P6 ; matrice acteur × cible), TCK-2637 (le numéro d'un locataire va aux seuls lecteurs du bail), TCK-2652 (files d'attente, `MaintenanceQueue`), TCK-2700/2715 (l'instant d'un créneau et son horizon), TCK-2786 (journal de l'intervention)

## Contexte

Audit `app-interventions` (e1, e2, e4, e5, e8), mesuré le 2026-11-15 dans le worktree `feat/audit-manques-2026-11-15` :

- `PUT …/status` n'a qu'une règle, `status` : l'agence annule **sans motif**, alors que la maquette promet « Le locataire est prévenu, avec votre motif ».
- Le téléphone du demandeur ne sort que dans `access.requester_phone`, au prestataire assigné **après acceptation** ; le personnel de l'agence ne l'a pas sur la demande (le résumé `requester` n'a que nom, e-mail, identifiant).
- Seuls le donneur d'ordre et le prestataire assigné écrivent `scheduled_at` : le locataire ne peut rien demander.
- Le retard de créneau est servi par demande (`slot_overdue_days`), jamais par prestataire.
- Aucune source ne dit en combien de temps l'agence prend une demande en charge.

## Décision

### 1. Le motif d'annulation est une colonne, exigée de qui annule par `PUT …/status`

- Colonne `maintenance_requests.cancellation_reason` (texte, nullable, hors `$fillable`), écrite **dans la transaction verrouillée** de `MaintenanceRequestService::transition()` quand la cible est `cancelled`.
- `reason` est **requis** (`required_if:status,cancelled`, 500 caractères au plus) sur `PUT …/status`. Aujourd'hui, seuls des donneurs d'ordre (personnel, bailleur du bien, super-admin) peuvent y annuler — la matrice ne donne pas l'annulation au demandeur ni au prestataire. Si un jour le locataire peut retirer sa propre demande, ce sera par un geste à lui, sans motif exigé.
- Les annulations du système (bien supprimé, `PropertyObserver`) n'écrivent **pas** de motif : leur `context.reason = property_deleted` reste un code d'audit, jamais un texte montré au locataire.
- Le motif est rendu dans `cancellation_reason` à **tout lecteur** de la demande (demandeur, bailleur, prestataire assigné, personnel) : c'est l'objet même du motif.
- **Notifications** : deux codes variantes, `maintenance.cancelled_with_reason` (prestataire, donneurs d'ordre) et `maintenance.step_cancelled_with_reason` (demandeur), avec `reason` en paramètre ; sans motif, les codes d'avant. Le SMS ne porte pas le motif (texte libre, longueur non bornée en segments).
- **Journal** : l'invariant « une entrée ne porte que `from` et `to` » s'élargit d'**une** clé, `reason`, sur la seule transition vers `cancelled`, lue sur la colonne. Le journal n'est lu que du personnel, qui lit déjà le motif sur la fiche : il ne révèle toujours rien que la fiche ne montre.

### 2. Le téléphone du demandeur va au personnel de l'agence du bien

- `requester.phone` est rendu **au détail** (`GET …/{id}` et les gestes qui renvoient la demande) au seul **personnel actif de l'agence du bien** (`MaintenanceRequestPolicy::isTeamPrincipalFor`) — ceux qui lisent le bail du bien au titre du personnel (`LeasePolicy::view`, `Lease::scopeVisibleTo`), ce qui est la règle de TCK-2637.
- **Clé absente** (pas nulle) pour tout autre lecteur : le bailleur (il ne le demandait pas et la maquette ne le lui montre pas), un prestataire (qui garde son kit d'accès après acceptation), une autre agence, le demandeur lui-même. Jamais sur une liste.

### 3. La demande de changement de créneau est un modèle à elle

Table `maintenance_reschedule_requests` : `maintenance_request_id` (cascade), `requester_id` (l'auteur), `proposed_slots` (liste JSON d'instants ISO, 1 à 3), `note` (texte, nullable), `status` (`pending`, `accepted`, `superseded`), `resolved_at`, `resolved_by_id`, horodatages. Pas d'`agency_id` : la ligne se lit toujours par sa demande.

- `POST /api/maintenance-requests/{id}/reschedule-requests` : le **demandeur qui peut encore agir** (`requesterMayAct` : bail du bien en cours), sur une demande ni terminale ni `completed`. Chaque créneau passe par la conversion et l'horizon des autres routes (`InstantIso`, `after:now`, `DansLHorizonDuPassage`, `MaintenanceRequest::scheduledInstant`). Un autre locataire : 403.
- **Une seule demande en attente** : une nouvelle remplace la précédente (`superseded`), plutôt qu'un 409 — le locataire qui se ravise ne doit pas être bloqué.
- **Elle ne change jamais `scheduled_at`** : elle notifie l'agence (donneurs d'ordre) et le prestataire assigné (`maintenance.reschedule_requested`), et le détail la rend dans `pending_reschedule_request`.
- Elle se **clôt** (`accepted`, `resolved_by_id`) quand le personnel ou le prestataire pose un créneau par les chemins existants (`PATCH` du donneur d'ordre, acceptation du prestataire avec créneau), dans leur transaction.
- `abilities.can_request_reschedule` dit au front si le bouton existe.

### 4. Les créneaux dépassés d'un prestataire, et les comptes par métier

- `overdue_slots_count` par prestataire, dans le carnet (`GET /api/agencies/{id}/service-providers`) et les suggestions : sous-requête corrélée (nombre de requêtes constant pour une page), qui compte les interventions **de cette agence** assignées à son compte et qui sont dans la file `en_retard` de `MaintenanceQueue` — même table, même borne (« créneau antérieur au début du jour à Dakar »), dérivée de `MaintenanceQueue::classify()`.
- `meta.trade_counts` du carnet : le nombre de lignes par métier, sur le **périmètre** du carnet (comme `meta.zones`), pas sur la requête filtrée — la pastille ne fond pas sous une recherche.

### 5. Le délai de réponse de l'agence

- `maintenance_response_minutes` : **médiane** (`percentile_cont(0.5)`), en minutes, de « signalement → première prise en charge » sur les demandes des biens de l'agence **créées dans les 90 derniers jours**.
- « Prise en charge » : la première entrée `status.*` du journal (TCK-2786) dont l'auteur est une personne **autre que le demandeur** — l'agent qui crée et assigne sa propre demande ne mesure pas une réponse. La mesure commence donc au déploiement du journal ; aucune reprise.
- **Aucun chiffre sous 5 demandes prises en charge** (`null`), ni pour un bien sans agence.
- Mis en cache par agence (1 h). Rendu au détail de la demande, à tout lecteur : c'est une mesure de l'agence, pas d'une personne.

## Conséquences

- Le bouton « Annuler la demande » du front qui envoie `{status: cancelled}` sans motif reçoit 422 jusqu'à TCK-2918, qui ajoute la saisie du motif.
- Deux codes de notification et un troisième (`reschedule_requested`) entrent dans la table des familles, les langues de l'API et du front.
- Une demande de créneau se perd si le donneur d'ordre répond par le fil plutôt qu'en posant le créneau : elle reste `pending` jusqu'au créneau suivant ou à la demande suivante.

## Application

- `UpdateStatusMaintenanceRequestRequest`, `MaintenanceRequestService::transition()`, `NotifyMaintenanceParticipants`, `RecordMaintenanceJournal` ; `MaintenanceRequestResource` (`cancellation_reason`, `requester.phone`, `pending_reschedule_request`, `maintenance_response_minutes`, `abilities.can_request_reschedule`).
- `MaintenanceRescheduleRequest`, `MaintenanceRescheduleRequestController`, `StoreMaintenanceRescheduleRequestRequest`.
- `ServiceProviderProfile::overdueSlotsSubquery()`, `ServiceProviderProfileController`, `SuggestedProvidersController`.
- `App\Services\Maintenance\AgencyResponseTime`.
- Tests : `MaintenanceCancelWithReasonTest`, `MaintenanceRequesterPhoneVisibilityTest`, `MaintenanceRescheduleRequestTest`, `ServiceProviderOverdueSlotsTest`, `AgencyMaintenanceResponseTimeTest`.
