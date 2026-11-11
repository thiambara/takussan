---
id: TCK-2700
title: "Une heure d'intervention envoyée avec un décalage est convertie, au PATCH comme à l'acceptation"
status: todo
phase: P1
family: back
estimate: XS
wave: 86
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2680]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
tags: [back, maintenance, dates, audit-ux, app]
---

## Objectif utilisateur

Le créneau d'une intervention est le même pour tout le monde. Une heure envoyée avec son décalage
(`11:00+01:00`) désigne 10 h UTC, soit 10 h à Dakar, et c'est 10 h que le locataire, le prestataire
et l'agence lisent ensuite.

## Contrat de données

Relevé sur `feat/audit-ux-app-lot-1` (fa3b781b4) le 2026-11-11 :

- `PATCH /api/maintenance-requests/{id}` (`MaintenanceRequestController::update`) valide
  `scheduled_at` en `sometimes|nullable|date` (`UpdateMaintenanceRequestRequest`), puis l'écrit par
  `fill()`.
- **Le cast `datetime` d'Eloquent écrit l'heure murale de la valeur reçue, sans convertir son
  décalage.** Mesuré par tinker : `fill(['scheduled_at' => '2026-11-12T11:00:00+01:00'])` stocke
  `2026-11-12 11:00:00`. La base est en UTC (`config('app.timezone')`) : l'instant enregistré est
  11 h UTC, une heure plus tard que l'instant envoyé.
- `POST /api/maintenance-requests/{id}/accept {scheduled_at}` (TCK-2680) convertit déjà, dans
  `MaintenanceRequestService::accept`.
- Sans effet aujourd'hui pour une heure sans décalage ou en `+00:00` : Africa/Dakar est à UTC+0.

## Direction UX / Artistique

Sans objet (ticket API).

## Contraintes strictes (métier)

- Une heure **sans décalage** se lit à l'heure de Dakar (`MaintenanceRequest::SCHEDULED_TIMEZONE`),
  comme aujourd'hui : son stockage ne change pas.
- Une heure **avec décalage** est l'instant qu'elle désigne : elle est ramenée au fuseau de
  l'application avant l'écriture.
- **Une seule conversion**, partagée par le `PATCH` et l'acceptation.
- La règle d'annonce du `PATCH` ne change pas (TCK-2012) : un passage fixé ou déplacé s'annonce, la
  même heure renvoyée non. La même heure exprimée avec un autre décalage est la même heure.
- `scheduled_at: null` retire toujours l'heure.

## Delta à produire

- [ ] Une conversion unique (`MaintenanceRequest::scheduledInstant()`), employée par
      `AcceptMaintenanceRequestRequest`, `MaintenanceRequestService::accept` et
      `MaintenanceRequestController::update`.
- [ ] Tests `MaintenanceScheduleOffsetTest` : `PATCH {scheduled_at: '2026-11-12T11:00:00+01:00'}` →
      10 h UTC, relue 10 h à Dakar ; sans décalage → inchangé ; même instant avec un autre décalage →
      aucune annonce ; `null` → retirée.

## Critères d'acceptation

- [ ] AC1 — `PATCH {scheduled_at: "2026-11-12T11:00:00+01:00"}` par le donneur d'ordre : la ressource
      rend `2026-11-12T10:00:00+00:00`, et la colonne relue à Dakar vaut 10:00.
- [ ] AC2 — `PATCH {scheduled_at: "2026-11-12T10:00:00"}` : stocké `2026-11-12 10:00:00`, comme avant.
- [ ] AC3 — L'heure déjà fixée (10 h UTC) renvoyée en `11:00+01:00` n'émet aucun
      `maintenance.schedule_changed`.
- [ ] AC4 — Ablation : retirer la conversion du `PATCH` fait rougir AC1.
- [ ] AC5 — Les tests de TCK-2680 (`MaintenanceAcceptWithSlotTest`) restent verts.

## Hors périmètre

- Les autres écritures de date et heure reçues telles quelles par `fill()` (visites, paiements…) :
  relevées dans les notes, non corrigées ici.
- Un cast de modèle qui convertirait toute écriture : changement global, qui appelle un ADR.

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-entree-2, branche `feat/audit-ux-app-lot-1`, après fa3b781b4).

**Prémisse re-mesurée** : conforme. `fill(['scheduled_at' => '2026-11-12T11:00:00+01:00'])` stocke
`2026-11-12 11:00:00` (tinker), et `MaintenanceScheduleOffsetTest` rougit avant le correctif (4 sur 6).

**Décisions**

- La conversion vit sur le modèle, à côté du fuseau qu'elle emploie :
  `MaintenanceRequest::scheduledInstant(string|DateTimeInterface): CarbonImmutable`. Chaîne sans
  décalage → lue à Dakar ; chaîne avec décalage ou objet date → l'instant désigné ; le résultat est
  ramené au fuseau de l'application. Employée par `MaintenanceRequestController::update` (valeur non
  nulle seulement : `null` retire toujours l'heure), `AcceptMaintenanceRequestRequest::scheduledAt()`
  et `MaintenanceRequestService::accept()` (qui convertissait déjà, par son propre code, depuis
  TCK-2680 — remplacé par l'appel partagé).
- Pas de cast ou de mutateur de modèle : il changerait toute écriture (fabriques, jeux, jobs), ce qui
  est hors du delta.
- La règle d'annonce du `PATCH` tient sans autre changement : la valeur convertie est comparée par
  `isDirty` sur l'heure UTC, donc le même instant écrit `11:00+01:00` n'annonce rien (AC3).

**Mesures** : `MaintenanceScheduleOffsetTest` 7 tests, verts avec `MaintenanceAcceptWithSlotTest` (AC5,
19 tests) ; `tests/Feature/Maintenance` et voisins : 364 verts. Trois ablations, rouges puis
restaurées par `cp` (md5 vérifiés) : conversion du `PATCH` retirée → 3 rouges (AC4) ;
`setTimezone` retiré de la conversion → 6 rouges ; conversion retirée du service → 1 rouge
(`test_l_acceptation_par_le_service_convertit`).

**Non éprouvable** : la lecture « sans décalage = Dakar » ne se distingue pas d'une lecture en UTC
tant qu'Africa/Dakar est à UTC+0 ; elle est écrite pour le sens, pas mesurée.

**Relevé (non corrigé) — autres dates-heures reçues et écrites telles quelles par le cast**

Même mécanisme : une chaîne validée `date` (ou un `Carbon::parse()` qui garde le décalage reçu)
passe à `create`/`fill`/un attribut casté `datetime`, et l'heure murale est stockée. Sans effet pour
une valeur sans décalage ou en `+00:00`. Croisement des règles `date` de `app/Http/Requests` avec
les casts `datetime` des modèles, puis lecture du chemin d'écriture :

- *chemin d'écriture lu, valeur brute* :
  - `PropertyVisit.scheduled_at` — `PropertyVisitController.php:157` et `:200` (chaîne brute),
    `:265` (`Carbon::parse`), `PublicPropertyController.php:876` (chaîne brute hors tranche) ;
    `VisitSchedulingService.php:364` lit le créneau par le même cast ;
  - `Task.due_at` — `TaskController.php:76` (`create`) et `:167` (`fill`) ;
  - `LeasePayment.paid_at` — `LeasePaymentService.php:89` ; `BookingPayment.paid_at` —
    `BookingPaymentService.php:99` ; `late_fee_paid_at` — `LateFeeSettlement.php:54` ;
  - `Inventory.conducted_at` — `InventoryService.php:31` ;
  - `DocumentShareLink.expires_at` — `DocumentShareLinkService.php:28` ; `Booking.expires_at` —
    `BookingService.php:174` ;
  - `RoleDelegation.starts_at` — délégation, `RoleDelegationService.php:92` ; absence d'agent (une
    `RoleDelegation` aussi), `AgentAbsenceService.php:58` et `:132` (`Carbon::parse`).
- *candidats par la règle et le cast, chemin d'écriture non lu* : `Announcement` et `AgencySpotlight`
  (`starts_at`, `ends_at`), `Payout.scheduled_at` (`StorePayoutRequest`,
  `PayServiceProviderBillRequest`), `PlatformPayout.processed_at`, `PrivacyRequest.received_at`,
  `AgencySubscription.trial_ends_at`.
- *déjà convertis* : `CommissionLedgerService::paidAt()` (début du jour à Dakar), les fins de
  période par `FinInclusive::de()`, la tranche de visite publique (`->utc()`).

Le croisement est par nom de champ : il ne voit pas une date reçue sous un autre nom que sa colonne.
