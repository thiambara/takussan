---
id: TCK-2704
title: "Notifications : les quatre avis de la cloche qui n'ont pas de code en reçoivent un, pour être rangés et marqués « à traiter » justement"
status: done
phase: P1
family: back
estimate: M
wave: 87
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2633]
blocks: [TCK-2634]
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: ["docs/models-spec.md#12-appnotification-️"]
tags: [back, notifications, audit-ux, app, i18n]
---

## Objectif utilisateur

L'admin d'agence voit dans « À traiter » le bien qu'un bailleur lui propose et l'intervention urgente
qu'on vient de signaler. Le super-admin y voit la demande de passage en agence professionnelle. Et
« Mise en avant terminée » se lit dans la langue de chacun, comme les autres avis.

## Contrat de données

Relevé le 2026-11-11 sur `feat/audit-ux-app-lot-1`, après TCK-2633 :

- Une ligne de cloche **sans `code`** a pour famille celle de sa cible stockée, sinon celle de son
  type (TCK-2633, `NotificationClassification::TARGETS` puis `::TYPES`). Elle n'est **jamais**
  « à traiter » : seul un code nomme le geste attendu.
- Quatre classes, prises comme exemples par TCK-2633 et TCK-2634, écrivent une ligne sans code :

| Classe | Destinataire | Écrit aujourd'hui | Rangement d'aujourd'hui | Attendu |
|---|---|---|---|---|
| `Boost\BoostEndedNotification` | le titulaire du bien | `system`, cible `property` | `bien`, pas à traiter | `bien`, pas à traiter |
| `PropertyProposedNotification` | les admins actifs de l'agence | `system`, sans cible | `systeme`, pas à traiter | `bien`, **à traiter** |
| `UrgentMaintenanceCreatedNotification` | l'agence (création, passage en urgent, escalade à 30 min) | `maintenance`, sans cible | `demande`, pas à traiter | `demande`, **à traiter** |
| `AgencyUpgradeRequestSubmittedNotification` | les super-admins | `system`, sans cible | `systeme`, pas à traiter | `systeme`, **à traiter** |

- Les textes de la cloche viennent aujourd'hui de `credits.boost.ended.*`,
  `notifications.property_proposed.title`, `notifications.urgent_maintenance.title*` et
  `agency_upgrade.notifications.submitted.subject`, rendus en français à l'envoi (dette du principe 5).
- La page de revue de la demande de passage existe côté front :
  `/super-admin/agency-upgrade-requests/[id]`. `NotificationTarget::PATHS` n'a pas de genre qui la vise.

## Comportement attendu

- Chacune des quatre classes écrit sa ligne de cloche avec un `code`, ses `params` bruts et une
  cible, comme le fait déjà `PropertyApprovedNotification` (`toAppNotification()`). Ses e-mails et
  ses diffusions ne changent pas.
- L'avis d'intervention urgente a **deux** codes, car son titre change à l'escalade : la création et
  le passage en urgent d'un côté, l'escalade de l'autre.
- Chaque code neuf a sa ligne `[famille, à traiter]` dans `NotificationClassification::CODES`
  (garde `NotificationFamilyTableTest`).
- Chaque code a ses textes dans `lang/{fr,en,wo}/notifications.php` (`codes.<code>.{title,body,sms}`,
  bloc marqué TCK-2704, car le fichier est partagé) et côté front (`notifications.codes.<code>.{title,body}`),
  avec les mêmes paramètres. Le wolof reprend le français (wolof en pause).
- Un nouveau genre de cible, `agency_upgrade_request`, mène à la page de revue de la demande ; sa
  famille est déclarée dans `NotificationClassification::TARGETS`.
- Les lignes déjà stockées sans code ne sont pas réécrites : TCK-2633 les range par leur cible.

## Plan technique

- [ ] `NotificationCode` : `boost.ended`, `property.proposed`, `maintenance.urgent_created`,
  `maintenance.urgent_escalated`, `agency.upgrade_requested` — avec `type()`, `preferenceEvent()`
  (`null` : ces avis n'avaient aucun interrupteur sur la cloche) et `params()`.
- [ ] `NotificationClassification::CODES` : `boost.ended` → `[bien, false]`, `property.proposed` →
  `[bien, true]`, `maintenance.urgent_*` → `[demande, true]`, `agency.upgrade_requested` →
  `[systeme, true]`.
- [ ] `NotificationTarget::PATHS` + `NotificationClassification::TARGETS` : `agency_upgrade_request`.
- [ ] Les quatre classes : `toAppNotification()` avec `code`, `params`, `target`, et `title` et
  `body` rendus par `NotificationRenderer`.
- [ ] `lang/*/notifications.php` (bloc TCK-2704), clés front par l'outil i18n.
- [ ] Tests : un test par classe qui envoie par le vrai émetteur et lit la ligne par
  `GET /api/notifications` (`code`, `famille`, `a_traiter`, cible) ; plus les balayages de catalogue
  existants (`SmsSegmentsTest`, `NotificationParamTypesTest`, `LangGroupParityTest`,
  `MobileClassEventsTest`, `FormeDesDatesDeNotificationTest`, `RienPourUnCompteNonJoignableTest`,
  `NotificationTemplateChannelsTest`) et `scripts/check-notification-codes.mjs`.

## Critères d'acceptation

- [ ] AC1 — Un bailleur propose un bien : chaque admin actif de l'agence a une ligne
  `code = property.proposed`, `famille = bien`, `a_traiter = true`, qui ouvre le bien.
- [ ] AC2 — Une intervention urgente est créée, puis escaladée : l'agence reçoit
  `maintenance.urgent_created`, puis `maintenance.urgent_escalated`, toutes deux en `demande` et
  « à traiter », qui ouvrent l'intervention.
- [ ] AC3 — Une demande de passage en agence est soumise : chaque super-admin a une ligne
  `agency.upgrade_requested`, `systeme`, « à traiter », qui ouvre `/super-admin/agency-upgrade-requests/{id}`.
- [ ] AC4 — Une mise en avant prend fin : la ligne porte `boost.ended`, `famille = bien`,
  `a_traiter = false`, et son titre est rendu dans la langue du destinataire (`en` → anglais).
- [ ] AC5 — Ablation : retirer le `code` d'une des quatre classes fait rougir son test.

## Hors périmètre

Le relevé des autres classes qui écrivent encore une ligne de cloche sans code (2026-11-11). Ce sont
les entrées de `AppDatabaseChannel::TYPES` sans `toAppNotification()` codé, et les
`toAppNotification()` sans `code`. Chacune garde le rangement que TCK-2633 lui donne (cible, puis
type) et n'est jamais « à traiter » :

- **Bail** (`lease`) : `LeaseRenewedNotification`, `LeaseRentReviewedNotification`,
  `LeaseEarlyTerminationNotification`, `LeaseDepositRefundNotification`, `TenantWelcomeNotification`,
  `TenantInventoryReminderNotification` (le locataire a un état des lieux à faire, donc à traiter une fois codé),
  `AgentTenantInventoryReminderNotification`.
- **Paiement** (`payment`) : `LeasePaymentLateFeeNotification`, `InvoiceOverdueReminderNotification`.
- **Réservation** (`booking`) : `BookingExpiredNotification`.
- **Système** (`system`) : `AgencyUpgradeApprovedNotification`, `AgencyUpgradeRejectedNotification`,
  `SuperAdminInvitedBroadcast`, `SuperAdminAcceptedBroadcast`, `TaskDueReminderNotification` (une
  tâche à faire, donc à traiter une fois codée), `ThresholdAlertTriggered`.
- **Écrites avec une cible** : `Boost\BoostRefundedNotification` (`property`),
  `Credits\CreditsGrantedNotification` et `Credits\CreditsExpiringNotification` (`credits`),
  `FavoriteChangesNotification` (`favorites`), `SavedSearchMatchesNotification` (`saved_searches`).

À coder par lots de domaine, dans la ligne de TCK-605 et du principe 5.

## Notes d'implémentation

Relevé et implémenté le 2026-11-11 sur `feat/audit-ux-app-lot-1`, à la suite de TCK-2633 (même arbre).

**Prémisses qui différaient**

- La cloche re-rend une ligne à code **dans la langue de la requête** (`AppNotificationResource::rendered()`,
  `SetLocaleMiddleware` : `?lang=` → `Accept-Language` → `preferred_language`), pas dans celle du destinataire ;
  la langue du destinataire ne vaut que pour le texte STOCKÉ (`title`/`body`, rendus à l'envoi). AC4 est donc vérifié
  des deux côtés : texte stocké en anglais pour un destinataire `en`, cloche en `en` puis en `fr` selon `?lang=`.
- `check-notification-codes.mjs` exige `codes.<code>.sms` côté API pour TOUT code, mobile ou non : les cinq codes en
  ont un, alors qu'aucun ne part par SMS (`mobile()` reste faux).
- **Double « à traiter » possible à la création d'une intervention urgente** : `maintenance.created` (déjà « à
  traiter ») part au créateur du bien, `maintenance.urgent_created` à l'assigné et à l'admin principal
  (`MaintenanceRequestController::store`, `sendUrgentAlert`). Quand le créateur du bien est l'admin principal, il
  reçoit les deux pour la même demande, et `a_traiter_non_lues` la compte deux fois (trois après l'escalade). Non
  tranché ici : décision de la session.

**Décisions**

- Les classes gardent leurs e-mails et diffusions ; seule leur ligne de cloche change, par `toAppNotification()`
  (précédent : `PropertyApprovedNotification`). `data` garde sa forme (`PropertyAuthorizationTest` lit
  `data.type`). Les entrées de `AppDatabaseChannel::TYPES` restent, comme celle de `PropertyApprovedNotification`.
- Deux codes pour l'urgence : le titre change à l'escalade ; le passage en urgent d'une demande existante garde le
  code de la création (même titre, seul l'e-mail diffère).
- `preferenceEvent()` vaut `null` pour les cinq : leur cloche n'avait aucun interrupteur.
- Paramètres : `property`, `title` (de l'intervention), `agency` — tous `text`. L'agence sans nom garde le repli
  `#<id>` de l'e-mail.
- Nouveau genre de cible `agency_upgrade_request` → `/super-admin/agency-upgrade-requests/{id}`, rangé `systeme`
  dans `NotificationClassification::TARGETS`.
- Les lignes de mise en avant DÉJÀ stockées gardent `code = null` : TCK-2633 les range en `bien` par leur cible.
  Aucune migration.
- Textes : les titres reprennent ceux d'avant (« Mise en avant terminée », « Urgent : … », « Nouvelle demande
  d'upgrade d'agence : … ») ; les corps sont neufs (la cloche n'en avait pas pour trois des quatre).

## Vérification (2026-11-11)

Le code est sur `dev` depuis 5f1bc7b82. Les tests qui passent par les vrais émetteurs ont été ajoutés au lot 2 (634db0ef4). La vérification adverse est acceptée : AC1 à AC5 ont été re-mesurés par exécution, et 13 ablations sur 14 rougissent. La quatorzième est D10 (la langue stockée de `property.proposed`) : elle n'est épinglée que pour `boost.ended`, comme le demande l'AC4, et la cloche relit le texte par son code.

Suites mineures, au lot 2 :
- épingler la langue du texte stocké pour les autres codes ;
- remplacer « upgrade » dans les textes fr de l'API par « passage en agence professionnelle ».
