---
id: TCK-2743
title: "Les autres dates-heures reçues avec un décalage sont converties avant l'écriture : visites, tâches, paiements, liens, délégations"
status: todo
phase: P2
family: back
estimate: M
wave: 86
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2700]
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#32-task-"
  adr:
    - "docs/adr/0018-format-des-dates-sur-le-fil.md"
tags: [back, dates, fuseau, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

Une heure envoyée avec son décalage (`11:00+01:00`) désigne un instant, et c'est cet instant que tout le monde relit
ensuite : le visiteur et l'agent pour une visite, l'agent pour une tâche, le comptable pour un paiement. Aujourd'hui,
seul le créneau d'intervention le garantit (TCK-2700).

## Contexte

Suivi demandé par les Notes de TCK-2700 (relevé du 2026-11-11, re-mesuré le même jour sur `feat/audit-ux-app-lot-2`
après d9e9da233 ; lignes de cet arbre).

**Le mécanisme est le même partout.** Une chaîne validée `date` (ou un `Carbon::parse()`, qui garde le décalage reçu)
arrive à `create()`, `fill()` ou à un attribut casté `datetime`. Le cast d'Eloquent écrit l'heure **murale** de la
valeur, sans la ramener au fuseau de l'application (UTC) : `2026-11-12T11:00:00+01:00` est stocké `11:00`, l'instant
d'1 h trop tard. Mesuré pour `MaintenanceRequest` (tinker, et `MaintenanceScheduleOffsetTest` rouge avant TCK-2700) ;
le même cast se comporte de même sur chaque colonne ci-dessous.

**Sans effet aujourd'hui pour une valeur en `Z`, en `+00:00` ou sans décalage** : Africa/Dakar est à UTC+0, et le
front envoie des instants en `Z` (`instantADakar`, `toISOString()`). Le défaut ne mord que sur un client qui envoie son
décalage local — application mobile, intégration, navigateur d'un utilisateur hors de Dakar dont un composant
sérialiserait l'heure locale. Il est **latent**, pas observé.

**Aggravant relevé sur deux sites : la règle et l'écriture ne lisent pas la même heure.**

- `CreneauDeVisite` (`app/Rules/CreneauDeVisite.php:26`) juge l'instant **converti** à Dakar, mais l'écriture garde
  l'heure murale. `10:00+01:00` (9 h à Dakar) est validé « sur la grille » comme 9 h, puis **stocké 10 h**.
- `MarkLateFeePaidRequest` (`before_or_equal:now`) juge l'instant, l'écriture (`LateFeeSettlement.php:54`) l'heure
  murale : l'heure murale `now + 30 min` écrite en `+01:00` désigne `now − 30 min`, passe la règle, et s'écrit
  **dans le futur** (`now + 30 min`).

## Décision

**À trancher par le porteur.**

- **a) (recommandé)** Une conversion partagée, appliquée **à la frontière** de chaque écriture listée ci-dessous :
  `MaintenanceRequest::scheduledInstant()` (TCK-2700) devient le cas particulier d'un helper de `app/Support`
  (ex. `InstantRecu::utc(string|DateTimeInterface $valeur, string $fuseauSansDecalage = 'Africa/Dakar')`), que chaque
  FormRequest expose par un accesseur (comme `AcceptMaintenanceRequestRequest::scheduledAt()`). Écriture par
  écriture, testable, sans toucher aux fabriques ni aux jeux.
- b) Un cast de modèle (`InstantUtc`) qui convertit **toute** écriture des colonnes concernées. Plus sûr pour les
  chemins futurs, mais global (fabriques, seeders, jobs, `withoutEvents`), et décision structurelle : **ADR d'abord**
  (Hors périmètre de TCK-2700, qui l'avait écarté pour cette raison).
- c) Statu quo : documenter que l'API n'accepte que `Z`/`+00:00`/sans décalage, et refuser (422) toute autre valeur
  par une règle `instant_utc`. Le plus simple ; casse un client qui envoie son décalage au lieu de le servir.

Recommandation : **(a)**, en commençant par les visites (aggravant `CreneauDeVisite`), puis le reste par lots ; une
garde (test de balayage) qui croise les règles `date` des FormRequests avec les casts `datetime` et exige un
accesseur de conversion, pour que le prochain champ ne reparte pas du même défaut.

## Contrat de données — recommandation par écriture

Chaque ligne : la colonne, ce qui l'écrit, ce qui l'atteint, la recommandation.

### Lues jusqu'à l'écriture (valeur reçue écrite telle quelle)

| Colonne | Écriture | Ce qui arrive | Recommandation |
|---|---|---|---|
| `PropertyVisit.scheduled_at` | `PropertyVisitController.php:408` (le visiteur demande), `:490` (l'agence planifie) | chaîne brute validée `date` + `CreneauDeVisite` | Convertir dans la FormRequest (accesseur), avant `createOrFail` ; `CreneauDeVisite` et l'écriture lisent alors le même instant. **Priorité 1.** |
| `PropertyVisit.scheduled_at` | `PropertyVisitController.php:578` (`fill($data)` du `PATCH`) ; comparaisons `:543` et `:564` par `Carbon::parse` | chaîne brute | Même accesseur ; la comparaison « l'heure a-t-elle changé » (annonce au visiteur, TCK-590) se fait sur l'instant converti — sinon le même instant écrit avec un autre décalage s'annonce comme un déplacement (cf. AC3 de TCK-2700). **Priorité 1.** |
| `PropertyVisit.scheduled_at` | `Public/PublicPropertyController.php:876` (hors tranche) | chaîne brute (la tranche, elle, est déjà `->utc()`) | Même conversion que la console. **Priorité 1.** |
| `PropertyVisit.scheduled_at` (lecture) | `VisitSchedulingService.php:364` (`activeVisitAtSameSlot`, doublon au même créneau) | relit le créneau « tel que `create()` l'écrirait » par le cast | Suit l'écriture : une fois la conversion faite en amont, l'attribut reçu est déjà l'instant UTC ; vérifier que le doublon se juge sur cet instant (test : la même heure envoyée en `+01:00` et en `Z` est un doublon). |
| `Task.due_at` | `TaskController.php:121` (`create`), `:212` (`fill`) | chaîne brute (`StoreTaskRequest`, `UpdateTaskRequest` : `date`) | Accesseur de conversion dans les deux FormRequests. Priorité 2. |
| `LeasePayment.paid_at` | `LeasePaymentService.php:89` | chaîne brute (`MarkPaidLeasePaymentRequest` : `nullable\|date`) | Convertir. Si le front n'envoie qu'une date (`AAAA-MM-JJ`), la lire à Dakar (début du jour) — même règle que `CommissionLedgerService::paidAt()`. Priorité 2 (quittances, registre). |
| `BookingPayment.paid_at` | `BookingPaymentService.php:99` | chaîne brute (`StoreBookingPaymentRequest`) | Même traitement que `LeasePayment.paid_at`. Priorité 2. |
| `LeasePayment.late_fee_paid_at` | `LateFeeSettlement.php:54` | chaîne brute (`MarkLateFeePaidRequest` : `before_or_equal:now`) | Convertir avant l'écriture : la règle juge déjà l'instant, l'écriture doit écrire le même (aggravant ci-dessus). Priorité 2. |
| `Inventory.conducted_at` | `InventoryService.php:55` | valeur reçue ou `now()` | Convertir la valeur reçue ; `now()` est déjà juste. Priorité 3. |
| `DocumentShareLink.expires_at` | `DocumentShareLinkService.php:28` | chaîne brute (`StoreDocumentShareLinkRequest` : `after:now`) | Convertir : un lien expire à l'heure dite, ni une heure avant, ni une heure après. Même aggravant que `late_fee_paid_at` : l'heure murale `now − 30 min` en `-01:00` désigne `now + 30 min`, passe
`after:now`, et s'écrit déjà expirée. Priorité 2. |
| `Booking.expires_at` | `BookingService.php:174` | chaîne brute (`StoreBookingRequest` : `date`) ou `now()+7 j` | Convertir la valeur reçue. Priorité 3. |
| `RoleDelegation.starts_at` | `RoleDelegationService.php:93` → `:110` | valeur reçue | Convertir ; si la délégation se pense en jours, lire une date seule à Dakar (début du jour), comme `ends_at` se lit par `FinInclusive::de()`. Priorité 3. |
| `RoleDelegation.starts_at` (absence d'agent) | `AgentAbsenceService.php:58` (création), `:132` (modification) | `Carbon::parse($data['starts_at'])`, qui **garde** le décalage ; le cast écrit l'heure murale de l'objet | Remplacer le `Carbon::parse` par la conversion partagée. Priorité 3. |

### Candidats par la règle et le cast, chemin d'écriture non lu

À lire avant d'implémenter — même croisement (règle `date` × cast `datetime`), pas de lecture de l'écriture :
`Announcement` et `AgencySpotlight` (`starts_at`, `ends_at`), `Payout.scheduled_at` (`StorePayoutRequest`,
`PayServiceProviderBillRequest`), `PlatformPayout.processed_at`, `PrivacyRequest.received_at`,
`AgencySubscription.trial_ends_at`. Recommandation : même conversion si l'écriture est brute ; rien si elle passe
déjà par `FinInclusive::de()` ou un début de jour à Dakar.

### Déjà justes (rien à faire)

`MaintenanceRequest.scheduled_at` (TCK-2700), `CommissionLedgerService::paidAt()` (début du jour à Dakar), les fins de
période par `FinInclusive::de()`, la tranche de visite publique (`->utc()`).

**Limite du relevé** : le croisement est par nom de champ ; une date reçue sous un autre nom que sa colonne lui
échappe. La garde recommandée en (a) le fermerait.

## Contraintes strictes (métier)

- Une valeur **sans décalage** se lit à l'heure de Dakar, comme aujourd'hui : son stockage ne change pas.
- Une valeur **avec décalage** est l'instant qu'elle désigne, ramené au fuseau de l'application avant l'écriture.
- **Une seule conversion**, partagée (celle de TCK-2700, généralisée) ; jamais une conversion par site.
- La règle de validation et l'écriture lisent **le même instant** (`CreneauDeVisite`, `before_or_equal:now`,
  `after:now`).
- Les annonces « l'heure a changé » (visite, TCK-590) comparent des instants : le même instant écrit avec un autre
  décalage n'annonce rien.
- `null` garde son sens actuel sur chaque champ.

## Delta à produire

- [ ] Décision du porteur (a, b ou c) ; si (b), ADR avant tout code.
- [ ] (a) Le helper partagé dans `app/Support`, `MaintenanceRequest::scheduledInstant()` qui l'emploie (sans changer
      son comportement : `MaintenanceScheduleOffsetTest` et `MaintenanceSchedulingHorizonTest` verts).
- [ ] Les écritures du tableau, par priorité ; un test par colonne : `…T11:00:00+01:00` → `10:00` UTC relu, sans
      décalage → inchangé.
- [ ] Visites : test qui prouve que `CreneauDeVisite` et l'écriture lisent le même instant, et qu'un même instant en
      `+01:00` puis en `Z` n'annonce pas de déplacement.
- [ ] La garde de balayage (règle `date` × cast `datetime` → accesseur de conversion exigé), avec la liste des
      exceptions motivées.

## Critères d'acceptation

- [ ] AC1 — `POST /api/property-visits {scheduled_at: "…T10:00:00+01:00"}` (9 h à Dakar, sur la grille) : la visite est
      stockée à 09:00 UTC, et la ressource rend `…T09:00:00+00:00`.
- [ ] AC2 — Le `PATCH` d'une visite à 09:00 UTC avec `…T10:00:00+01:00` n'émet aucune annonce de déplacement.
- [ ] AC3 — `PATCH /api/tasks/{id} {due_at: "…T11:00:00+01:00"}` : `due_at` relu à 10:00 UTC.
- [ ] AC4 — `late_fee_paid_at` et `DocumentShareLink.expires_at` reçus avec décalage sont stockés à l'instant désigné ;
      une valeur qui passe `before_or_equal:now` ne s'écrit jamais dans le futur.
- [ ] AC5 — Chaque autre colonne du tableau a son test « avec décalage → instant, sans décalage → inchangé ».
- [ ] AC6 — Ablation : retirer la conversion d'une écriture fait rougir son test ; retirer l'accesseur d'une FormRequest
      que la garde surveille fait rougir la garde.

## Hors périmètre

- Le créneau d'intervention (fait : TCK-2700 et TCK-2715).
- Les colonnes `date` (sans heure) : pas de décalage à convertir.
- Le front : il envoie déjà des instants en `Z`.

## Notes d'implémentation

- **Relevé à la vérification adverse de TCK-2715 (2026-11-11), préexistant, même famille** : la règle `date` de
  Laravel relit « 99999-01-01 » en 2009-01-01, et le `PATCH` d'une intervention (sans `after:now`) l'écrit en 200 ;
  même chose pour « 0099-01-01 » et une chaîne terminée par un octet nul. La conversion partagée de la voie (a) est
  l'endroit où refuser ces formes (un format ISO 8601 strict à la frontière), plutôt qu'une règle de plus par champ.

**Décisions du porteur (2026-11-12)** : (a) ; tout le périmètre (≈ 22 sites), livré par lots — helper et visites,
puis P2, puis P3, puis la garde ; pas de règle ISO 8601 stricte dans cette passe (ticket de suite) ; les bornes des
rapports (`GrowthReportingRequest`, `RevenueReportingRequest`, `ReportExportRequest`) sont des lectures, exceptions
motivées de la garde.

**Lot 1 — le helper et les visites.**
- `App\Support\InstantRecu::utc()` / `::ouNul()` : LA conversion. `MaintenanceRequest::scheduledInstant()` en est le
  cas particulier (comportement inchangé : `MaintenanceScheduleOffsetTest`, `MaintenanceSchedulingHorizonTest` verts),
  et `CreneauDeVisite` juge par elle l'instant qui sera stocké.
- Un accesseur par FormRequest de visite : `scheduledAt()` sur `StorePropertyVisitRequest`,
  `UpdatePropertyVisitRequest`, `ReschedulePropertyVisitRequest`, `ConfirmPropertyVisitRequest`,
  `Public\VisitRequestPublicPropertyRequest` ; `lignes()` sur `BulkConfirmPropertyVisitsRequest` (lot).
- Les 7 écritures : `store` substitue l'instant dans `$data` avant ses deux branches (visiteur, agence) — le doublon
  au même créneau (`activeVisitAtSameSlot`) se juge donc sur l'instant ; `update` le substitue avant la garde du
  report, les gardes du bien et de l'agent, l'écriture et l'annonce du déplacement (AC2) ; `reschedule`, `confirm`,
  `bulkConfirm` passent l'accesseur au service ; la demande publique hors tranche aussi.
- Tests : `tests/Feature/Visits/HeureDeVisiteAvecDecalageTest.php` (11 ; 9 rouges avant le correctif, les deux verts
  d'avant — hors grille converti, sans décalage — ne prouvent rien du correctif et n'en sont pas la preuve). Ablations
  7/7 rouges (store, update, reschedule, confirm, lot, publique, helper sans `setTimezone`). 45 fichiers voisins
  (visites, demandes publiques, interventions) joués un à un : verts.

**Lot 2 — P2 : échéances, encaissements, liens, reversements.**
- `App\Http\Requests\Concerns\ConvertitLesInstantsRecus` : chaque FormRequest dont le corps validé part tel quel vers
  un service déclare ses dates-heures reçues (`instantsRecus()`), et le contrôleur lit `validatedAvecInstants()` —
  chaque champ déclaré passe par `InstantRecu::ouNul()`. `validated()` n'est **pas** surchargé, délibérément :
  surchargé, il changerait le type de la valeur pour tout lecteur, sans couvrir `safe()` ni `input()`.
- Huit écritures : `due_at` des tâches (`store`, `update`) ; `paid_at` du loyer encaissé (`markPaid`), de la pénalité
  réglée (`markLateFeePaid`) et de l'acompte d'une réservation (`BookingPaymentController::store`) ; `expires_at` d'un
  lien de partage ; `scheduled_at` d'un reversement (`PayoutController::store`) et du paiement programmé d'une facture
  de prestataire (`ServiceProviderBillController::pay`).
- AC4 tenu par deux tests : `before_or_equal:now` et `after:now` jugent l'instant, et l'écriture écrivait l'heure
  murale — une pénalité réglée « 10:30+01:00 » à 10:00 UTC passait la règle et s'écrivait dans le futur ; un lien
  « 09:30-01:00 » passait `after:now` et naissait expiré.
- Une date seule (`paid_at = 2026-11-10`) se lit au début du jour à Dakar, comme avant (tenu par le test du loyer).
- Les autres lectures de `validated()` de ces contrôleurs n'ont pas de date-heure (remboursement, `markProcessed`,
  `markFailed`, validation de facture) ou n'ont que des dates calendaires (`StoreLeasePaymentRequest` : `period_start`,
  `period_end`, `due_date`, castés `date`) : hors périmètre.
- Tests : une méthode par écrivain, ajoutée à la classe existante (`TaskTest`, `LeasePaymentLateFeeMarkPaidTest` ×2,
  `DocumentShareLinkTest`, `BookingPaymentStaffBoundTest`, `PayoutTest`, `ServiceProviderBillTest`) ; 7/7 rouges avant
  le correctif.
- Ablations 9/9 rouges : chacun des huit contrôleurs rendu à `validated()`, et le trait sans conversion. 69 fichiers
  voisins (tâches, loyers, pénalités, acomptes, réservations, liens, reversements, factures de prestataires,
  rapprochement, double authentification des sorties d'argent, parcours des routes) joués un à un : verts.

**Lot 3 — P3, et les fins par `FinInclusive`.**
- **Ajout au périmètre** : `FinInclusive::de()` était rangé parmi les « déjà justes », ce qui ne vaut que pour une
  **date seule** (fin du jour à Dakar). Un instant explicite était rendu tel quel, et le cast en écrivait l'heure
  murale : `ends_at = …T08:30:00+02:00` d'une délégation s'écrivait 08:30 au lieu de 06:30. Il passe désormais par
  `InstantRecu::utc()` (objet `Carbon` mutable, comme la branche de la date seule). Lecteurs corrigés d'un coup : la
  fin d'une délégation de rôle, celle d'une absence (création et modification), la validité d'une offre (console
  `BookingService::recordedTerms()` et tunnel public `PublicPropertyController::bookingRequest()`).
- **Piège d'ordre** : un champ lu par `FinInclusive::de()` n'est **jamais** dans `instantsRecus()`. Converti en amont,
  une date seule y arriverait en objet (minuit) et perdrait sa fin de jour. D'où `starts_at` seul pour la délégation et
  l'absence, `expires_at` seul pour la réservation (`offer_expires_at` reste à `FinInclusive`).
- Une conversion par champ, côté FormRequest (lisible par la garde du lot 4) : le trait sur `InventoryStoreRequest`
  (`conducted_at`), `StoreBookingRequest` (`expires_at`), `StoreRoleDelegationRequest` et les deux requêtes d'absence
  (`starts_at`), les deux requêtes d'annonce et `StoreMaintenanceRequest` (`starts_at`, `ends_at`),
  `AssignAgencySubscriptionRequest` (`trial_ends_at`), `StorePrivacyRequestRequest` (`received_at`) ; un accesseur
  `processedAt()` sur `MarkPlatformPayoutPaidRequest` (le contrôleur lisait `input()`, et `markPaid()` attend un
  `Carbon` mutable). Les `Carbon::parse()` des services d'absence et d'abonnement restent : sur un objet, ils ne
  changent pas l'instant (ablations ci-dessous). Hors HTTP, l'absence n'a aucun appelant ; l'abonnement, deux : la
  revue de mise à niveau (sans fin d'essai) et le seeder (`toDateTimeString()`, une chaîne sans décalage, lue comme
  avant).
- `StoreAgencySpotlightRequest::periode()` était déjà juste (`->utc()`) ; il passe par la même conversion, sans
  changement de comportement (`AgencySpotlightTest`, dont la période en `+02:00`, vert).
- Hors périmètre, vérifiés : `UploadKycDocumentRequest.expires_at` (`date_format:Y-m-d`, aucun décalage possible),
  `PlatformPayoutController::closePeriod()` (`period_end`, colonne `date`), `Booking.start_date` / `end_date` (`date`).
- **Effet de bord à connaître** : `offer_expires_at` est une colonne `date` (le jour mural reçu) et `expires_at`
  l'instant. Une validité envoyée en instant près de minuit (`…T00:30:00+01:00`) range le 21 dans l'une et le 20 à
  23:30 UTC dans l'autre. Le front envoie une date seule ; la forme stricte relève de TCK-2752.
- Tests : une méthode par écriture, dans la classe existante (`InventoryCreationTest`, `BookingTest`,
  `StaffRecordsOfferTest` ×2, `PropertyBookingRequestTest`, `RoleDelegationFinInclusiveTest`, `AgentAbsenceTest`
  création puis modification, `AnnouncementTest` création puis modification avec `ends_at: null` qui efface la fin,
  `MaintenanceModeTest`, `PlatformPayoutTest`, `PrivacyRequestRegistryTest`, `BillingPlansTest`). Ablations 16/16
  rouges : chaque contrôleur rendu à `validated()` (absence et annonce : création et modification séparément ;
  réservation : enregistrée et non enregistrée), `FinInclusive` sans sa nouvelle branche (console, public, délégation),
  le `Carbon::parse` du virement, `periode()` sans conversion.
- 75 fichiers voisins (états des lieux, réservations et offres, tunnel public, délégations, absences et passations,
  annonces, maintenance, reversements de la plateforme, registre de la vie privée, abonnements et mises à niveau, mise
  en avant, parcours des routes) joués un à un : verts.
