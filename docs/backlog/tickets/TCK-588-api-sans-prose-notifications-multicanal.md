---
id: TCK-588
title: "L'API n'écrit plus de prose : une notification est un code rendu dans la langue du destinataire, part sur WhatsApp ou SMS y compris vers un contact sans compte, et une erreur métier porte un code"
status: todo
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#12-appnotification-
    - docs/models-spec.md#7-customer
    - docs/models-spec.md#54-whatsappcontact-
tags: [full, notifications, preferences, i18n, whatsapp, sms, erreurs, loyers, visites, garde-ci, adr-requise]
---

## Objectif utilisateur

- **Locataire** : je reçois mes rappels de loyer sur WhatsApp ou par SMS, même si l'agence m'a saisi
  sans compte. Le message est dans ma langue, avec un montant lisible et un nombre de jours juste.
- **Bailleur** : je suis prévenu d'un impayé quand il survient, et non au détour de mon tableau de
  bord.
- **Agent** : je reçois chaque jour un seul récapitulatif des impayés de mes baux. Le visiteur sans
  compte reçoit le rappel de sa visite planifiée.
- **Admin d'agence**, et tout utilisateur : erreurs et notifications s'affichent dans ma langue, et un
  clic dans la cloche m'emmène sur l'objet concerné.

## Contexte

Ce ticket vient de l'analyse par acteur du 2026-10-06 (vague 73). Il couvre C4, C5, C9, C11, O5,
O13, A8 (relances de loyer, rappels de visite planifiés, récapitulatif agent ; les confirmations de
visite à l'anonyme relèvent de TCK-590), A19 et AD20. Tout a été re-mesuré sur `e3ab4a4e`. Il
**fixe le contrat** que la vague utilise (règle de coexistence n° 1) : forme d'une notification,
forme d'une erreur, envoi à un contact sans compte.

### 1. Le rappel de loyer annonce un retard négatif et fractionnaire (C4), et ne part pas sans pénalité

`SendLeasePaymentReminders.php:55` : `$days = now()->diffInDays($payment->due_date);`. Avec Carbon
3.13.2 (`composer.lock:3929-3930`, la version installée), `diffInDays` est **signé et flottant**.
Mesure à 2026-10-06 14:23, pour une échéance au 2026-09-29 :

- la forme du job rend `-7.599…` ;
- la forme `(int) $due->diffInDays(now(), true)` rend `7`.

Le job tourne à 08:00 (`routes/console.php:36`). Le locataire lit donc « en retard de -7.33…
jour(s) ». Deux défauts s'y ajoutent :

- le montant est concaténé brut (l.36 et l.60). `amount` n'est pas casté (`LeasePayment.php:50-60`),
  d'où « 150000.00 XOF », alors que `CurrencyFormatter` existe ;
- aucun lien vers l'échéance.

Le test (`SendLeasePaymentRemindersTest`) mocke `notify()->once()` sans regarder le texte.

**Un retard n'est relancé que si le bail porte une pénalité** (défaut relevé à la passe de
correction). La relance J+1/J+7 ne lit que `status = late` (`SendLeasePaymentReminders.php:43`). Or
le **seul** écrivain de ce statut est `LateFeeCalculator::apply` (`LateFeeCalculator.php:133`),
appelé par `ApplyLateFeesJob` sur les seuls baux à `late_fee_percent > 0`
(`ApplyLateFeesJob.php:35-36, 71-72`), une fois le délai de grâce passé (`LateFeeCalculator.php:94-97`).
`late_fee_percent` est nullable (migration `2026_04_25_120000`, l.12). Donc :

- un bail sans pénalité : son locataire n'est **jamais** relancé pour un retard ;
- un bail avec 3 jours de grâce : la relance J+1 ne part jamais (l'échéance est encore `pending`).

Les tableaux de bord, eux, comptent un retard comme `pending|late` et `due_date < now`
(`DashboardController.php:86`). Enfin, une échéance `partially_paid` n'est relancée ni à J-3 (l.23 :
`pending` seulement) ni en retard, et le montant annoncé est `amount` et non le solde
(`remaining_amount`, `HasPaymentAttributes.php:239`).

### 2. L'infrastructure WhatsApp/SMS de la vague 36 n'a aucun appelant vivant (C5, O5, A8)

- **La pile existe.** TCK-282 et TCK-283 sont `done` : `WhatsappChannel` (bascule vers SMS,
  fenêtre de 24 h, gabarits approuvés, opt-out), `SmsChannel` (heures calmes ARTP, limite de débit)
  et `PreferenceResolver::resolveMobileChannel()` (l.159-169).
- **Personne ne s'en sert.** `SupportsSms` et `SupportsWhatsapp` ne sont implémentés que par
  `NewBookingNotification`, que **rien n'envoie** : `grep -rn NewBookingNotification app routes` ne
  la trouve que dans `AppDatabaseChannel::TYPES:119`. Elle portait le seul appel de
  `NotificationTemplateService::renderActive()` (`NewBookingNotification.php:151`). L'**éditeur de
  gabarits du super-admin** (`EditableNotificationEvents` : `booking_confirmed`,
  `payment_received`, `maintenance_created`) n'a donc **aucun effet en production**.
- **La préférence mobile ne mène nulle part.** La matrice de préférences propose `whatsapp`, mais
  activer ce canal pour un événement n'envoie rien.
- **Le service n'envoie que l'e-mail.** `NotificationService::notify()`
  (`NotificationService.php:36-74`) écrit `app_notifications` puis envoie l'e-mail brut (l.61-63,
  92-97) : jamais de SMS ni de WhatsApp.
- **Les interrupteurs de préférence commandent le mauvais envoi.** `TYPE_TO_EVENT` (l.24-32)
  associe un *type* à un événement, pas un message à son événement :
  - `payment` **et** `lease` → `lease_payment_due` : `lease_payment_overdue`
    (`PreferenceResolver.php:52`) n'est jamais consulté, et couper « échéance » coupe aussi le
    « Paiement reçu » de `LeasePaymentService:59,68` ;
  - `booking` → `booking_request` : la confirmation, le refus et l'annulation envoyés au client
    (`BookingService:198,228,298`) obéissent à « nouvelle demande » et ignorent
    `booking_status_changed` ;
  - `system` → `threshold_alert` (l.31) : le verdict KYC envoyé à l'admin d'agence et la demande
    d'instruction envoyée aux super-admins (`KycWorkflowService.php:209-218, 230-245`) obéissent à
    « Alerte seuil KPI ». Couper cette alerte coupe l'e-mail « KYC rejeté ». (L'alerte de recherche,
    même défaut, est à TCK-599.)
- **La matrice propose des cases qui ne commandent rien.** `matrixFor()`
  (`PreferenceResolver.php:176-219`) croise **tous** les événements avec **tous** les canaux :
  - la colonne `push` mène à `broadcast`, qui part dans le journal (`BROADCAST_CONNECTION=log`,
    dette D-65) ;
  - `sms` et `whatsapp` sont cochables pour 16 événements, alors qu'aucun n'a d'émetteur mobile
    vivant (ci-dessus). Après ce ticket, seuls les codes `mobile()` en auront.
- **Un locataire sans compte est sauté.** Le job fait `continue` quand `lease.tenant.user` est nul
  (l.28-31 et 51-54). Or `customers.user_id` est nullable (migration `2026_04_17_160006`, l.13) ; son
  téléphone (l.19) ne sert à rien. `Customer` ne porte ni langue ni consentement.
- **Le bailleur et l'agent ne sont jamais prévenus** d'un retard. Les baux n'ont pas d'`agent_id`
  (`Lease.php:27`) ; l'agent d'un bien se résout par `PrimaryPropertyContact::for()`
  (`PropertyConversationResolver.php:49-52`).
- **Le visiteur sans compte n'a pas de rappel.** `SendPropertyVisitReminders.php:95-107` n'adresse
  le rappel qu'au `visitor` (`User`) et à l'agent ; `visitor_phone` et `customer_id`
  (`PropertyVisit.php:17-18`) sont ignorés.
- **Les canaux ne protègent pas un destinataire routé.** Aucun appelant de `Notification::route()`
  n'existe aujourd'hui dans `app/` : le défaut est latent, et ce ticket le rend vivant. Pour un tel
  destinataire :
  - ni la garde `phone_verified_at` ni l'opt-in ne s'appliquent : elles exigent un `User`
    (`SmsChannel.php:59,128` ; `WhatsappChannel.php:80,262`) ;
  - la limite de débit se calcule par `getKey()`, donc **aucune limite** pour lui
    (`SmsChannel.php:137-140` ; `WhatsappChannel.php:271-274`) ;
  - la langue du gabarit WhatsApp (`app()->getLocale()`, `WhatsappChannel.php:169`) n'est **pas**
    un défaut : `NotificationSender` exécute chaque canal sous `withLocale(preferredLocale())`
    (`Illuminate/Notifications/NotificationSender.php:115, 134-141`). Il suffit que l'envoi routé
    porte `->locale()`.
  - `TemplateResolver::resolve()` (`TemplateResolver.php:23-35`) ne cherche que la langue exacte :
    même avec un gabarit `fr` approuvé, un destinataire wolof hors fenêtre de 24 h bascule toujours
    en SMS. Aucun gabarit WhatsApp n'est semé aujourd'hui, dans aucune langue.

### 3. Les notifications sont en prose française, ou dans la langue de l'émetteur (C9, O13, A19)

- **19 appels** de `NotificationService::notify/notifyMany` passent un titre et un corps littéraux
  en français :
  - `MaintenanceQuoteController:30,59,80,102` ; `MaintenanceRequestController:119` ;
  - `PublicAgentController:353` ; `PublicPropertyController:852,927` ;
  - `NotifyNewMessageJob:54` ; `KycWorkflowService:209,230` ;
  - `BookingService:114,198,228,298` ;
  - `LeasePaymentService:59,68` (« Paiement reçu » au bailleur, sans bien ni locataire) ;
  - `SendLeasePaymentReminders:32,56`.

  `SendSavedSearchAlerts:138` relève de TCK-599.
- **9 appels** passent par `__()` mais sortent dans la langue **du processus** : celle de l'acteur
  ou du worker, jamais celle du destinataire. Le service ne change jamais de langue. Sites :
  `NotifyDelegation{Activated:26,46, Expired:25,41, Revoked:25,41}`,
  `NotifyStatementFinalized:36,48`, `NotifyStatementImported:30`.
- **Le wolof retombe sur l'anglais.** `fallback_locale` vaut `en` (`config/app.php:85`), et
  `lang/wo/` est incomplet (comparaison des clés aplaties, fr → wo, re-mesurée à la passe de
  correction) :
  - `role_delegations.php` absent (14 clés) ;
  - `notifications.php` : 15 clés manquent, dont `visit_requested.*`, `visit_confirmed.*` et
    `visit_reminder.*` — les e-mails de visite partent donc **en anglais** à un wolophone ;
  - `messages.php` : 20 clés manquent, dont 4 lues par le code (`integration_inactive`,
    `integration_missing_credentials`, `integration_test_ok`, `tag_in_use`) ; les 16 autres
    (`*_title`/`*_body`) n'ont aucun lecteur dans `app/`.

  La seule parité gardée côté API est `validation.php` (`ValidationTranslationParityTest`, qui
  compare fr et wo au dictionnaire du framework — `lang/en/validation.php` n'en porte que les
  surcharges, c'est voulu).
- **Classes `Notification` en prose en dur :**
  - envoyées : `PropertyApproved:42-53`, `PropertyRejected:45-59`, `ThresholdAlertTriggered:52-62`,
    `UrgentMaintenanceCreated:55-68`, `ActivityLogExportReady:31-36`, `ReportExportReady:24-27` ;
  - **jamais envoyées** (aucun `new X` dans `app/`), doublons morts des appels de
    `MaintenanceQuoteController` : `QuoteSubmitted`, `QuoteApproved`, `QuoteRejected`,
    `MaintenanceQuoteRequested`.
- **Montants formatés à la main**, sans `CurrencyFormatter` ni langue :
  - au format anglais dans une phrase française : `LeasePaymentLateFeeNotification:62,67`
    (`number_format($x, 2)` → « 1,500.00 ») et `LeaseDepositRefundNotification:73,79` ;
  - au format français dans une phrase anglaise : `LeaseEarlyTerminationNotification:79`,
    `InvoiceOverdueReminderNotification:62`, `LeaseRentReviewedNotification:64-65`
    (`number_format($x, 0, '.', ' ')`).
- **La cloche fige la langue d'écriture.** Elle affiche `title` et `body` tels qu'ils sont stockés
  (`NotificationBell.tsx:24-26, 242`) : une notification reste dans sa langue d'écriture.

### 4. La cloche n'ouvre rien (C11)

`NotificationBell.tsx:229-268` affiche chaque notification comme un `<li>` sans lien, avec un seul
bouton (lu / non lu). La cible existe pourtant dans `data` (`booking_id`, `lease_payment_id`,
`maintenance_request_id`, `conversation_id`…) ou dans `referenceable_*`. Il n'y a aucune page
d'historique : `/app/profile/notifications` ne gère que les préférences. Côté API,
`NotificationController::index` (l.12-26) rend le modèle brut, avec un `per_page` non borné.

### 5. Les erreurs de l'API sont en prose, en deux langues, et exposent des noms de classe (AD20)

- **186 `abort*()` à message littéral** dans `app/`, relevés par tokenizer PHP : il voit les appels
  sur plusieurs lignes. Le rapport en annonçait 94, sur la foi d'un grep mono-ligne limité aux
  contrôleurs et services. Répartition :
  - 92 dans `Http/Controllers/Api` ;
  - 19 dans `Payments/Drivers` ;
  - `BookingService` 8, `PaymentGatewayService` 7, `PayoutService` 7 (dont l.16-19, 33 et 41, en
    anglais), `InvoiceService` 5…

  À côté : 47 aborts déjà traduits et 146 sans message.
- **Prose d'erreur hors `abort`** :
  - 22 `'message' => '<prose>'`, par exemple `Api/Agency/RoleController.php:155`, en français ;
  - 10 `ValidationException::withMessages` en prose ;
  - 6 `throw new *HttpException('<prose>')`.
- **Le rendu recopie le message.** `bootstrap/app.php:75-89` rend toute `HttpException` en
  `{message}`, sans code. Or `Handler::prepareException` a déjà converti trois cas avant ce rappel :
  - un modèle introuvable donne un `404` « No query results for model [App\Models\Lease] 12 », qui
    **expose la classe** ;
  - un refus de policy donne « This action is unauthorized. » (`AuthorizationException.php:33`) ;
  - un `abort(403)` nu donne « Error ».
- **Quatre chemins échappent au rendu ou à la garde envisagée** (relevés à la passe de correction) :
  - `KycWorkflowService::refuse()` (l.177-183) lève une `HttpResponseException` : la réponse est
    construite à la main et **ne passe jamais** par le rappel de `bootstrap/app.php`. Ses quatre
    appelants (l.69, 158, 165, 196) passent de la prose anglaise (« Verified KYC dossiers are
    locked. »), que le front affiche : il ne reconnaît que les codes du BFF (`api.ts:242-248`) ;
  - `PaymentGatewayService.php:86` met `$payment::class` dans le message : « … no amount could be
    resolved on App\Models\LeasePayment. » ;
  - `InvitationAcceptController.php:51` recopie `$e->getMessage()` dans un 401 construit à la
    main ;
  - `PlatformReportingService.php:411-417` met sa phrase dans un `sprintf` à l'intérieur de
    `ValidationException::withMessages` : un relevé qui ne regarde que le premier argument ne la
    voit pas.
- **Le front affiche cette prose telle quelle**, qu'il croit localisée par Laravel (`api.ts:376-384`,
  ADR-0019, conséquence 1). Le seul précédent « code + message » est `Me/DataExportController:43-48`
  (TCK-575).

## Contrat de données

**Ce contrat est celui de toute la vague 73** : un ticket qui notifie ou rejette le suit, qu'il
fusionne avant ou après celui-ci.

### A. Une notification = un code, des paramètres, une cible

- **Catalogue** : enum `App\Domain\Notifications\NotificationCode`, aux valeurs
  `<domaine>.<événement>` en snake_case. Chaque cas déclare :
  - `type()` ;
  - `preferenceEvent()`, un élément de `PreferenceResolver::EVENTS` ou de `CRITICAL_EVENTS`, ou
    `null` (non désactivable, comme aujourd'hui un type non associé). Il suit le **message**, pas
    le type. `TYPE_TO_EVENT` ne sert plus qu'aux appels `notify()` restants (ceux des tickets non
    encore fusionnés) et disparaît avec `notify()` :

    | Codes | Événement |
    |---|---|
    | `lease_payment.due_soon` | `lease_payment_due` |
    | `lease_payment.{overdue, overdue_landlord, overdue_digest}` | `lease_payment_overdue` |
    | `lease_payment.{recorded, received_landlord}` | `lease_payment_received` (nouveau, dans `EVENTS`) |
    | `booking.created` | `booking_request` |
    | `booking.{confirmed, rejected, cancelled}` | `booking_status_changed` |
    | `visit.reminder` | `visit_reminder` |
    | `message.received` | `message_received` |
    | `kyc.{submitted, verified, rejected}` | `kyc_status_changed` (nouveau, dans `CRITICAL_EVENTS` : in-app et e-mail toujours, jamais de mobile forcé) |
    | `role_delegation.*`, `bank_statement.*` | `null` |
    | `property.{approved, rejected}` | inchangé (classes existantes) |

    Aucun code de ce ticket ne pointe vers `threshold_alert`, qui ne commande plus que
    `ThresholdAlertTriggered`.
  - `params()`, qui associe à chaque nom un type `money`, `date`, `datetime`, `count` ou `text` ;
  - `mobile()` : le code peut partir sur WhatsApp ou SMS ;
  - `reachesContacts()` : le code peut viser un contact sans compte (transactionnel seulement) ;
  - `templateEvent()` : l'événement de `EditableNotificationEvents` correspondant, s'il existe.
- **Sur le fil** (`GET /api/notifications`, `AppNotificationResource`) :

  ```json
  { "id": 9401, "type": "payment", "code": "lease_payment.overdue",
    "params": { "amount": { "amount": "150000.00", "currency": "XOF" }, "days": 7,
                "due_date": "2026-09-29", "property": "Villa Almadies" },
    "target": { "kind": "lease", "id": 12, "path": "/app/leases/12" },
    "title": "…", "body": "…", "read_at": null, "created_at": "…" }
  ```

  - **Paramètres** : valeurs brutes. `text` ne porte que des données saisies par un utilisateur
    (titre, nom, extrait de message), jamais une phrase de l'API.
  - **`target`** : un `kind` pris dans une liste fermée et un chemin de console, ou `null`. Pour les
    lignes anciennes et les 29 classes `Notification` existantes, la ressource la **dérive** des clés
    connues de `data` et de `referenceable_*`.
  - **`title` et `body`** sont rendus **à la lecture**, dans la langue négociée de la requête
    (TCK-536). Ils servent de repli au front. Une ligne sans `code` rend ses colonnes stockées.
- **Rendu** : `NotificationRenderer::render(code, params, locale, timezone, surface)`.
  - Surfaces : `title`, `body`, `mail_subject`, `mail_body`, `sms`.
  - Clés : `lang/{fr,en,wo}/notifications.php` → `codes.<code>.<surface>`. Un `NotificationTemplate`
    actif pour `templateEvent()`, le canal et la langue l'emporte.
  - Montants par `CurrencyFormatter` dans la langue du destinataire ; dates dans `users.timezone`
    (défaut `Africa/Dakar`) ; pluriels par `trans_choice`.
- **Cloche** : rendue par le dictionnaire du front, clés `notifications.codes.<code>.{title,body}` de
  `takussan-web/src/messages/{fr,en,wo}.json`. Un code inconnu y retombe sur `title`/`body` de
  l'API.
- **Émission** : `NotificationService::send(User|ContactSansCompte $to, NotificationCode $code,
  array $params, ?NotificationTarget $target = null)`.
  1. Pour un `User`, la ligne `app_notifications` est créée **en synchrone** : `code`, `params`,
     `target`, et `title`/`body` rendus dans la langue du destinataire.
  2. Puis `CodedNotification` (`ShouldQueue`, `SupportsSms`, `SupportsWhatsapp`, avec
     `appNotificationId` pour le suivi de livraison) envoie : `mail` et `broadcast` selon
     `preferenceEvent()`, plus **un** canal mobile si `mobile()` et `resolveMobileChannel()` le
     permettent.

### B. Une erreur métier = un code + un message localisé

`HTTP 403 { "code": "payout.landlord_not_in_agency", "message": "<__('errors.payout.landlord_not_in_agency') dans la langue négociée>" }`

- `App\Exceptions\ApiError` (étend `HttpException`, porte `errorCode` et `params`), avec les
  fonctions `abort_code(int $status, string $code, array $params = [])`, `abort_code_if()` et
  `abort_code_unless()` dans `app/Support/helpers.php` (autoload `files`).
- Le code est un **littéral** `^[a-z0-9_]+(\.[a-z0-9_]+)+$`, et sa clé `lang/{fr,en,wo}/errors.php`.
- **Toute autre `HttpException`** (policy, modèle introuvable, `abort(403)` nu) est rendue
  `{code: "http.<statut>", message: __("errors.http.<statut>")}`. Le message de l'exception
  n'atteint **jamais** le corps de la réponse.
- Le front affiche `message` : `proseServeur` le fait déjà, rien à changer. Un composant peut se
  brancher sur `code`. *Option retenue par défaut (question 5 des notes, non tranchée par le
  porteur) : code + message localisé par l'API, plutôt qu'un code seul traduit par le front.*
- **Aucune réponse d'erreur construite à la main** : pas de `HttpResponseException`, pas de
  `response()->json(['message' => …], 4xx)` hors `abort_code*()`. Un contrôleur qui relaie une
  erreur (`InvitationAcceptController`) relaie `code` et `message` d'une `ApiError`, jamais
  `getMessage()` d'une autre exception.

### C. Un contact sans compte

- **Le destinataire.** `App\Services\Notifications\ContactSansCompte` porte `phone` (normalisé par
  `PhoneNumber::normalize`), `name`, `locale` et `customerId`. Deux fabriques :
  - `fromCustomer(Customer)` ;
  - `fromVisit(PropertyVisit)`, qui prend `visitor_phone`, sinon `customer.phone`.
- **Sa langue.** `customer.user.preferred_language` s'il en a une, sinon **`fr` explicitement**,
  jamais `app()->getLocale()`. *Option retenue par défaut (question 2, non tranchée) : pas de
  colonne de langue sur `customers` dans ce ticket.*
- **L'envoi.** `Notification::route('whatsapp'|'sms', $phone)` avec `->locale($locale)` : c'est ce
  `->locale()` qui fixe la langue du gabarit (`NotificationSender` rend chaque canal sous
  `withLocale`). **Aucune ligne `app_notifications`** : sa clé étrangère vise `users`. WhatsApp
  seulement si `whatsapp_contacts` est `opted_in` pour ce numéro, sinon SMS. Rien si le numéro est
  invalide. *Option retenue par défaut (question 3, non tranchée) : un SMS transactionnel part sans
  opt-in explicite (exécution du bail ou de la demande de visite) ; jamais de message non
  transactionnel.*
- **Gabarit WhatsApp d'un destinataire `wo`.** `TemplateResolver::resolve()` cherche `wo`, puis
  `fr`. Le texte libre (dans la fenêtre de 24 h) et le SMS restent en wolof. *Option retenue par
  défaut (question 4, non tranchée ; la présence du wolof parmi les langues de gabarit Meta n'est
  pas mesurée).*
- **Le destinataire d'une échéance**, dans l'ordre : `lease.tenant.user`, sinon
  `ContactSansCompte::fromCustomer(lease.tenant)` si le téléphone est renseigné, sinon personne
  (journalisé, sans exception).

### Endpoints

| Méthode | Route | Changement |
|---|---|---|
| GET | `/api/notifications` | `AppNotificationResource` ; `per_page` borné à 1-50 ; `filter[unread]` ; `fields[app_notifications]` |
| POST | `/api/notifications/{id}/read`, `/unread`, `/read-all` | inchangés (rendent la ressource) |
| GET | `/api/notifications/preferences` (et `/api/me/notification-preferences`) | une case qu'aucun envoi ne peut honorer est `locked`, `reason: "channel_unavailable"` ; les défauts mobiles par événement (Delta I) |
| PUT | `/api/notifications/preferences` | ignore une case `channel_unavailable`, comme une case `inapp` |

## Direction UX / Artistique

- **Une notification est une porte.** Toute la ligne mène à son objet, et le clic la marque lue.
  Le geste lu / non lu reste secondaire et distinct. Une notification sans objet se lit, mais n'a pas
  l'air d'un lien.
- Depuis la cloche, un accès « tout voir » mène à un **historique** paginé : filtre « non lues »,
  « tout marquer lu », état vide qui rassure. C'est le vocabulaire de la cloche, en plus calme.
- Texte par le dictionnaire, dans la langue de l'interface ; jamais de clé brute à l'écran ;
  montants et dates par les formateurs de la locale. Mobile d'abord : cibles ≥ 44 px, aucun
  défilement horizontal à 320 px ; charte de `docs/design-guidelines.md`.

## Contraintes strictes (métier)

1. **ADR à écrire et accepter avant le code**, sous le numéro libre suivant : ADR-0030 est pris, et
   la vague en écrit d'autres. Il étend ADR-0019 à l'API et tranche trois questions :
   - où vit le texte d'une notification (code + paramètres, rendu par surface) ;
   - la forme d'une erreur (B) ;
   - la base, les canaux et la langue d'un envoi à un contact sans compte (C).

   Il amende `models-spec.md` §12, et `/sync-specs` suit.
2. **Contact sans compte : transactionnel seulement** (option retenue par défaut, question 3).
   `send()` lève une `LogicException` si
   `reachesContacts()` est faux. Jamais de catégorie Meta `marketing`. Les heures calmes ARTP
   restent appliquées. Un numéro `opted_out` ne reçoit jamais de WhatsApp.
3. **Limite de débit par numéro** pour un destinataire sans clé : `sms-channel:phone:{e164}` et
   `whatsapp-channel:phone:{e164}`.
4. **Isolation.** Le récapitulatif d'un agent ne contient que des échéances de son agence dont il est
   le contact principal. Un bailleur ne reçoit que les retards de ses baux.
5. **Pas de doublon.** Un rappel (échéance × jalon J-3/J+1/J+7, visite × fenêtre) n'est jamais
   renvoyé sur le même canal quand le planificateur repasse : un marqueur par jalon, comme
   `SendPropertyVisitReminders`.
6. **SMS court.** Chaque rendu `sms` (fr, en, wo) tient en **au plus deux segments**
   (`SmsSegmentCalculator`) avec des paramètres de taille réaliste.
7. **Pas de clé manquante à l'exécution.** Un code inconnu du dictionnaire du front ne doit jamais
   lever (ADR-0022 : `MISSING_MESSAGE` lève hors production). On vérifie la présence avant de
   traduire, sinon on retombe sur le `title` de l'API.
8. **Coordination avec la vague.** Règle n° 1 : sur un appel `notify(`/`abort(` réécrit par un
   ticket de domaine, **sa version gagne**, et ce ticket convertit le reste.
   - **590** : lui reviennent `PublicPropertyController::contactLead` (`:927`),
     `PublicAgentController::contactLead` (`:353`) et les confirmations de `PropertyVisitController`.
     Il envoie la confirmation de visite à l'anonyme par `send(ContactSansCompte::fromVisit(…))`.
   - **592** : lui reviennent `MaintenanceQuoteController`, `MaintenanceRequestController` et les
     aborts `Maintenance*`. Il branche ou supprime les quatre classes `Quote*` mortes ; si 592 a
     fusionné sans y toucher, ce ticket les supprime. `MaintenanceStatusChanged` notifie par
     `send()`.
   - **596** : `BookingService::cancel` (destinataires) est à lui ; ce ticket ne change que le texte
     (`booking.cancelled`).
   - **599** : `SendSavedSearchAlerts` est exclu. La garde l'exempte nommément, d'une **exemption
     qui expire** : elle rougit dès que le fichier n'a plus de littéral. Les alertes de 599 sont des
     classes `Notification` dédiées ; un abonné sans compte routé par `Notification::route()` reste
     servi : la règle B de ce ticket ne refuse pas un destinataire routé, elle lui réserve WhatsApp
     s'il est `opted_in` et lui donne le SMS sinon.
   - **587, 589, 594, 597, 600** : leurs aborts réécrits gagnent. Les invitations par téléphone de
     589 passent par `ContactSansCompte`.
   - **595** : sans `leases.agent_id`, l'agent du récapitulatif est
     `PrimaryPropertyContact::for(lease.property)`. Si 595 fusionne d'abord, c'est `agent_id`, avec
     ce repli.
   - **602** : ce ticket prévoit dans les codes `lease_payment.{due_soon,overdue}` un paramètre
     optionnel `payment_url` et son emplacement dans les textes (une variante de clé avec lien) ;
     602 le remplit par `LeasePaymentLinkService::urlFor(LeasePayment)`. Avant 602, la variante sans
     lien s'applique.
   - **593** : la prose de `LeasePaymentService` et de `LeasePaymentLateFeeNotification` est ici.
   - **591** : la normalisation de `customers.phone` est à lui. Ce ticket normalise à l'envoi et
     n'ajoute aucune colonne à `customers`.
   - **601 touche aussi `bootstrap/app.php`.** Dans `->withExceptions(…)` (l.72-90), **seul le
     rappel `$exceptions->render(…)` (l.75-89) est à nous** : ce ticket le réécrit (codes,
     `http.<statut>`). **Le rapporteur est à 601** : tout appel `$exceptions->report(…)`,
     `->context(…)`, `->dontReport(…)` ou équivalent qui cesse de journaliser les bindings SQL, ajouté
     comme instruction distincte. `shouldRenderJsonWhen` (l.73) ne bouge pas. Aucun des deux ne
     touche le bloc de l'autre ; un conflit y est un conflit de lignes voisines ; **ordre de fusion
     indifférent**. Invariant commun : le rendu de ce ticket ne met jamais `getMessage()` dans un
     corps, et une `QueryException` (qui n'est pas une `HttpException`) n'y est pas interceptée.
   - **599 et `NotificationService.php`** (notre fichier). 599 corrige son interrupteur en sortant
     de `notify()` : ses alertes deviennent des classes dédiées avec leur propre événement, ce qui
     ne demande aucune ligne de `NotificationService` : c'est ce que 599 écrit et vérifie (son
     AC12). Il **ajoute** à `PreferenceResolver` ses deux événements et, si ses classes
     implémentent `SupportsSms`/`SupportsWhatsapp`, leurs événements à `MOBILE_CLASS_EVENTS`
     (Delta I) : ajouts voisins. **S'il devait malgré tout toucher `TYPE_TO_EVENT`, seule
     l'entrée `'system' => 'threshold_alert'` (l.31) est à lui**, et
     seulement après la fusion de ce ticket — avant, `KycWorkflowService` passe encore par
     `NotificationType::System` et changerait d'interrupteur avec lui. Le reste du fichier
     (`send()`, la constante, son retrait avec `notify()`) est à ce ticket. **588 d'abord** si 599
     touche la constante, sinon ordre indifférent.
   - **601 et `KycWorkflowService`** : 601 touche `upload()` (`expires_at`) ; ce ticket ne touche
     que `refuse()` et ses quatre appelants, `notifySubmitted()` et `notifyReviewed()`. Ordre
     indifférent.
   - **593** possède `LateFeeCalculator` et le statut `late` : ce ticket ne le modifie pas, il
     cesse seulement d'en dépendre pour relancer (C).
   - **595** possède `PlatformReportingService` (`refuserPlageTropLarge`, l.407-418) : s'il le
     réécrit, sa version gagne ; sinon ce ticket le convertit.
   - **589** possède `InvitationService` ; ce ticket ne change que le relais d'erreur de
     `InvitationAcceptController` (l.43-57). Si 589 réécrit l'abort 401 de `accept()`, sa version
     gagne, en `abort_code`.
   - **Seul ce ticket** modifie `NotificationService` (hors l.31, voir 599),
     `PreferenceResolver` (599 n'y fait que des ajouts, voir plus haut) et
     `NotificationPreferencesMatrix` (libellé de la nouvelle raison de verrouillage ; personne ne
     le revendique). Dictionnaires : ajouts seulement, en blocs `codes.*`, `errors.php` (nouveau) et
     `notifications.codes.*` côté front. Pendant la vague, `notify()`/`notifyMany()` restent
     appelables, mais sans littéral.
   - **Ordre recommandé : fusionner ce ticket tôt.** Après lui, on utilise `send()` et
     `abort_code*()`. Avant lui, on écrit `__()` explicite (règle n° 1), et ce ticket rebase sans
     réécrire la logique.

## Delta à produire

### 0. Décision
- [ ] ADR (contrainte 1), accepté avant tout code.

### A. Socle
- [ ] Enum `NotificationCode`. Au minimum :
  - `lease_payment.{due_soon, overdue, overdue_landlord, overdue_digest, recorded,
    received_landlord}` ;
  - `booking.{created, confirmed, rejected, cancelled}` ;
  - `visit.reminder`, `message.received` ;
  - `kyc.{submitted, verified, rejected}`, `role_delegation.*`, `bank_statement.*` ;
  - `property.{approved, rejected}` ;
  - un code par appel converti en E.
- [ ] Migration `<date>_add_code_params_target_to_app_notifications_table` : `code` string(100),
      `params` jsonb et `target` jsonb, tous nullables ; `down()` réversible.
- [ ] `NotificationRenderer`, `NotificationTarget` (avec dérivation pour les lignes anciennes),
      `CodedNotification`, `NotificationService::send()`. `AppDatabaseChannel` accepte `code`,
      `params` et `target`.
- [ ] `AppNotificationResource` ; `NotificationController::index` (borne, `filter[unread]`, champs
      clairsemés).
- [ ] `send()` choisit l'interrupteur par `preferenceEvent()` (table du Contrat A) ;
      `PreferenceResolver::EVENTS` gagne `lease_payment_received`, `CRITICAL_EVENTS` gagne
      `kyc_status_changed`.
- [ ] Le rendu consulte `NotificationTemplateService::renderActive()` pour `booking.confirmed`,
      `lease_payment.recorded` et `maintenance.created`.
- [ ] Lignes `notification_templates` (`whatsapp`, `meta_status = pending`, nom, variables) pour
      `lease_payment.due_soon`, `lease_payment.overdue` et `visit.reminder`. Le passage à `approved`
      est un acte d'exploitation ; d'ici là, la bascule vers SMS s'applique.

### B. Contacts sans compte
- [ ] `ContactSansCompte` avec ses deux fabriques.
- [ ] `SmsChannel`/`WhatsappChannel` :
  - limite par numéro ;
  - opt-in WhatsApp exigé pour un destinataire routé.
- [ ] `TemplateResolver::resolve()` : repli `wo` → `fr` (Contrat C).

### C. Loyers (C4, C5, O5, A8)
- [ ] `SendLeasePaymentReminders` sur `send()` :
  - **sélection** : une échéance **ouverte** (`pending`, `partially_paid` ou `late`), jamais le seul
    statut `late` — J-3 sur `due_date = today + 3`, retard sur `due_date ∈ {today - 1, today - 7}`.
    Le statut `late` (écrit par la pénalité de 593) n'entre plus dans la décision de relancer ;
  - **montant annoncé** : le solde `remaining_amount`, pas `amount` ;
  - **locataire**, avec ou sans compte : J-3 ⇒ `due_soon` ; J+1 et J+7 ⇒ `overdue`, avec
    `days = (int) $payment->due_date->diffInDays(now(), true)` ;
  - **bailleur** : `overdue_landlord` ;
  - **agent** : **un** `overdue_digest` (nombre, total, cible `/app/payments`), seulement s'il a au
    moins un retard ce jour-là ;
  - chargement anticipé de `lease.tenant.user`, `lease.landlord` et du contact principal du bien ;
  - marqueur par jalon.
- [ ] `LeasePaymentService:59-75` ⇒ `recorded` et `received_landlord`, qui nomment le bien et le
      locataire.

### D. Rappels de visite planifiés (A8)
- [ ] `SendPropertyVisitReminders` ⇒ `visit.reminder` (`window` = `24h` | `1h`).
  - Destinataires : `visitor`, sinon `customer.user`, sinon `ContactSansCompte::fromVisit()` ; plus
    l'agent.
  - `VisitReminderNotification` est supprimée une fois sans appelant.

### E. Conversion des notifications
- [ ] Les 19 appels littéraux et les 9 appels rendus dans la langue de l'émetteur (§3) passent sur
      `send()`, sauf ceux qu'un ticket de domaine aura déjà réécrits.
- [ ] Les 6 classes envoyées passent sur des clés de `lang/` ; les 4 mortes suivent la coordination
      avec 592.
- [ ] Montants des notifications par `CurrencyFormatter::format($x, $currency, $notifiable->preferredLocale())` :
      `LeasePaymentLateFeeNotification:62,67`, `LeaseDepositRefundNotification:73,79`,
      `LeaseEarlyTerminationNotification:79`, `InvoiceOverdueReminderNotification:62`,
      `LeaseRentReviewedNotification:64-65`. Le pourcentage (`:66`) par `NumberFormatter` de la
      langue. Plus aucun `number_format(` dans `app/Notifications/` (garde G).
- [ ] Wolof complet côté API : `lang/wo/role_delegations.php` (14 clés) ; les 15 clés manquantes de
      `lang/wo/notifications.php` ; les 4 clés vivantes manquantes de `lang/wo/messages.php`. Les
      16 clés `*_title`/`*_body` de `messages.php` sans lecteur sont **supprimées** de `fr` et `en`
      (elles ne deviennent pas des codes). Blocs `codes.*` dans `lang/{fr,en,wo}/notifications.php`.

### F. Erreurs (AD20)
- [ ] `ApiError`, `app/Support/helpers.php`, le rendu de `bootstrap/app.php` (dont `http.<statut>`),
      `lang/{fr,en,wo}/errors.php`.
- [ ] Conversion, par domaine (plusieurs PR possibles) : 186 `abort*`, 22 `'message' =>`,
      10 `ValidationException` et 6 `HttpException`. Le `$msg` construit à
      `PaymentGatewayService:77-79` devient un code avec paramètres ; `:86` ne nomme plus aucune
      classe (`payment.amount_unresolved`).
- [ ] `KycWorkflowService::refuse()` est supprimée : ses quatre appelants (l.69, 158, 165, 196)
      deviennent `abort_code(422, self::CODE_…, $params)`. Les codes existants (`kyc.locked`,
      `kyc.unknown_document_type`, `kyc.not_transitionable`, `kyc.documents_missing`) sont gardés à
      l'identique ; `documents_missing` porte la liste en paramètre `missing`.
- [ ] `InvitationAcceptController` (l.43-57) relaie `code` et `message` de l'`ApiError`, plus
      `requires_login` et `email` ; jamais `getMessage()`.
- [ ] `PlatformReportingService::refuserPlageTropLarge()` (l.407-418) : message par
      `__('errors.reporting.range_too_wide', ['max' => …, 'granularity' => …])` (sauf réécriture par
      595).

### G. Gardes
- [ ] `tests/Unit/Architecture/ProseLitteraleInterditeTest.php` (tokenizer, sur `app/`) refuse un
      littéral contenant une lettre aux positions suivantes :
      - (a) le message d'un `abort*` ;
      - (b) le titre ou le corps de `->notify(`/`->notifyMany(` ;
      - (c) `subject|line|greeting|action|salutation` et `'title'`/`'body'` dans
        `app/Notifications/**` ;
      - (d) `'message' => '…'` ;
      - (e) le message de `new *HttpException(` et de `ValidationException::withMessages`.

      Aux positions (a)-(e), **tout** littéral à lettre compte, y compris imbriqué dans un
      `sprintf(`, une concaténation ou un tableau (cas `PlatformReportingService:412`). Deux formes
      refusées sans condition de littéral :
      - (f) `new HttpResponseException(` dans `app/` (elle contourne le rendu) ;
      - (g) `number_format(` dans `app/Notifications/**`.

      Aucune exemption hors 599, qui expire. Échec si 0 fichier scanné ou 0 appel reconnu. Fixtures
      `tests/Fixtures/ProseLitterale/` (positifs et négatifs comptés exactement).
- [ ] `tests/Unit/Lang/LangGroupParityTest.php` vérifie :
  - les mêmes fichiers de groupe, les mêmes clés et les mêmes placeholders dans les trois langues,
    à une exception nommée : `en/validation.php`, qui ne porte que les surcharges du dictionnaire du
    framework (gardé par `ValidationTranslationParityTest`) ;
  - pour chaque `NotificationCode`, `title`/`body`/`sms` en trois langues, avec les placeholders de
    `params()` ;
  - pour chaque code littéral passé à `abort_code*`, sa présence dans `errors.php` (×3).
- [ ] `scripts/check-notification-codes.mjs` : chaque cas de `NotificationCode` a
      `notifications.codes.<code>.{title,body}` dans `src/messages/{fr,en,wo}.json`. Échec s'il lit
      0 cas. Étape nommée dans `repo-ci.yml`.

### H. Front (C11)
- [ ] Cloche : ligne entière cliquable vers `target.path`, marquée lue au clic, rendue par code ;
      accès à l'historique.
- [ ] Page `/app/notifications` : pagination, « non lues », « tout marquer lu ». Type
      `AppNotification` enrichi de `code`, `params` et `target` ; clés fr/en/wo.
- [ ] Préférences : une case `channel_unavailable` est inactive et dit pourquoi, dans les trois
      langues, comme les deux raisons existantes.

### I. Des préférences qui commandent quelque chose
- [ ] **Défauts mobiles par événement** — *option retenue par défaut (question 1, non tranchée)* :
      `whatsapp` et `sms` activés par défaut pour `lease_payment_due`, `lease_payment_overdue`,
      `visit_reminder` et `booking_status_changed`, désactivables ; désactivés ailleurs. Toujours
      soumis à `phone_verified_at`. `PreferenceResolver::DEFAULTS` devient
      `defaultFor(string $event, string $channel): bool`, lu par `shouldSend()` **et**
      `matrixFor()`. Coût SMS à la charge de la plateforme.
- [ ] `PreferenceResolver::channelsFor(string $event): list<string>` :
  - `inapp` et `email` toujours ;
  - `push` seulement si `config('broadcasting.default')` n'est ni `log` ni `null` (D-65) ;
  - `sms`/`whatsapp` seulement si l'événement est **mobile** : un `NotificationCode` `mobile()`
    l'a pour `preferenceEvent()`, ou il figure dans `PreferenceResolver::MOBILE_CLASS_EVENTS`
    (événements des classes `Notification` qui implémentent `SupportsSms`/`SupportsWhatsapp` ;
    599 y ajoute les siens).
- [ ] `matrixFor()` verrouille toute autre case (`locked: true`, `enabled: false`,
      `reason: "channel_unavailable"`) ; `updateMany()` l'ignore.
- [ ] `tests/Unit/Notifications/MobileClassEventsTest.php` : chaque classe de `app/Notifications/`
      qui implémente `SupportsSms` ou `SupportsWhatsapp` a son `EVENT_TYPE` dans
      `MOBILE_CLASS_EVENTS`, et réciproquement. Échec si 0 classe lue.

## Critères d'acceptation

- [ ] **AC1 — Jours et montant (C4).** Heure fixée au 2026-10-06 08:00, échéance `late` du
      2026-09-29 de 150000 XOF, locataire fr. Le corps in-app vaut **exactement** le rendu attendu,
      avec « 7 jours » et le montant égal à `CurrencyFormatter::format(150000, XOF, 'fr')`
      (« 150 000 F CFA ») ; il ne contient ni « 150000.00 » ni « XOF ». À J+1, il dit « 1 jour ».
      La ligne porte `target.path = /app/leases/{lease_id}`. Remettre
      `now()->diffInDays($payment->due_date)` fait rougir le test.
- [ ] **AC2 — Langue du destinataire.** Avec une application en `fr`, un locataire `en` et un
      locataire `wo` reçoivent chacun leur langue, en in-app, e-mail et SMS. La ligne porte
      `code = lease_payment.overdue` et ses `params` bruts. Lue avec `Accept-Language: en`, une
      ligne écrite pour un destinataire fr rend un `title` anglais. Rouges aujourd'hui, et chacun
      par ablation de son correctif :
      - délégation de rôle : acteur fr, bénéficiaire wo ⇒ titre égal à
        `__('role_delegations.…', $p, 'wo')` et différent de la version `en` ;
      - relevé importé (`NotifyStatementImported`) traité par un worker en `fr`, destinataire `en`
        ⇒ anglais ;
      - e-mail `VisitReminderNotification`/`visit.reminder` à un destinataire `wo` : le sujet est
        égal à la clé `wo` et **différent** de la clé `en` (aujourd'hui, repli anglais).
- [ ] **AC3 — Locataire sans compte** (`user_id` nul, téléphone `+221 77 …`). À J+1 part **un** SMS
      fr (montant, jours), et **aucune** ligne `app_notifications` n'est créée. Variantes :
      - `opted_in` avec gabarit approuvé : un WhatsApp, pas de SMS ;
      - `opted_out` : SMS seul ;
      - sans téléphone : rien, sans exception ;
      - au-delà de la limite par numéro : rien ;
      - destinataire `wo` (compte lié), `opted_in`, hors fenêtre, seul un gabarit `fr` approuvé :
        un WhatsApp sur le gabarit `fr` (aujourd'hui : SMS).

      Retirer la branche contact fait rougir le test.
- [ ] **AC4 — Bailleur et agent.** Trois retards à J+1 sur deux baux du même agent, plus un retard
      dans une autre agence :
      - chaque bailleur reçoit `overdue_landlord`, qui nomme le bien et le locataire ;
      - l'agent reçoit **une** notification `overdue_digest` avec `count = 3` ;
      - l'agent de l'autre agence ne voit rien de ces trois retards ;
      - un agent sans retard ne reçoit rien ;
      - relancer le job le même jour n'envoie rien de plus.
- [ ] **AC5 — Chaque interrupteur commande son message.** Test `NotificationPreferenceRoutingTest`,
      téléphone vérifié :
      - WhatsApp coupé pour `lease_payment_due` et laissé par défaut pour `lease_payment_overdue` :
        le retard part sur WhatsApp, le rappel J-3 non. Rouge si le retard redevient
        `lease_payment_due` ;
      - e-mail coupé pour `booking_request` seulement : la confirmation `booking.confirmed` part
        quand même par e-mail ; coupé pour `booking_status_changed` : elle ne part pas. Rouge
        aujourd'hui (`booking` → `booking_request`) ;
      - e-mail coupé pour `threshold_alert` : l'admin d'agence reçoit quand même l'e-mail
        `kyc.rejected`. Rouge aujourd'hui ;
      - e-mail coupé pour `lease_payment_due` : le reçu `lease_payment.recorded` part quand même ;
      - **défauts** : sans aucune ligne de préférence, un locataire au téléphone vérifié reçoit le
        retard J+1 sur un canal mobile ; sans téléphone vérifié, sur aucun.
- [ ] **AC6 — Visite planifiée d'un anonyme.** Visite confirmée sans `visitor_id`, avec
      `visitor_phone`, dans la fenêtre de 24 h : un SMS fr part vers ce numéro, l'agent est notifié
      comme avant, et un second passage n'envoie rien.
- [ ] **AC7 — Erreurs.** Tests HTTP en fr, en et wo :
      - un reversement pour le bailleur d'une autre agence rend `403`,
        `code = payout.landlord_not_in_agency` et un message localisé. Si 594 a réécrit ce chemin,
        le test porte sur un autre `abort_code` converti ici ;
      - `GET /api/leases/999999` rend `404` et `code = http.not_found` ; le corps ne contient **ni**
        `App\` **ni** `No query results` ;
      - un refus de policy rend `http.forbidden`, sans « This action is unauthorized. » ; un
        `abort(403)` nu rend `http.forbidden` et non « Error » ;
      - une soumission KYC d'agence à pièces manquantes rend `422`, `code = kyc.documents_missing`
        (inchangé) et un message **dans la langue de la requête** — en `fr`, il ne contient pas
        « Missing required KYC documents » ;
      - un paiement sans montant résoluble (`PaymentGatewayService:86`) : le corps ne contient pas
        `App\` ;
      - une invitation qui exige la connexion rend `401`, `requires_login = true`, un `code` et un
        message localisé.

      L'ancien rappel de `bootstrap/app.php` fait rougir les trois premiers ; remettre `refuse()`
      fait rougir le cas KYC.
- [ ] **AC8 — Garde de prose.**
      - Elle est verte sur `app/`.
      - Sur les fixtures, elle trouve exactement les positifs attendus : un par forme (a)-(g), plus
        une concaténation, une interpolation sur plusieurs lignes et un `sprintf` dans
        `withMessages`. Aucun négatif (`abort(404)`, `abort_code(…)`, `__()`, journaux,
        `number_format` hors `app/Notifications/`).
      - Réinjecter `abort(403, 'Interdit.')` dans un contrôleur la fait rougir (ablation consignée).
      - Elle rougit sur un scan vide et sur une exemption périmée.
- [ ] **AC9 — Parités.** `LangGroupParityTest` et `check-notification-codes.mjs` sont verts. Chacun
      rougit dans trois cas : une clé `codes.*` retirée en `wo` côté API, la même retirée de
      `wo.json` côté front, un placeholder retiré d'une traduction.
- [ ] **AC10 — Zéro littéral.** La garde compte 0 littéral hors exemption. `BookingService::confirm`
      émet `booking.confirmed`, et un client qui a activé WhatsApp pour `booking_status_changed` le
      reçoit sur WhatsApp.
- [ ] **AC11 — Éditeur de gabarits effectif.** Un gabarit actif `payment_received` (e-mail, fr)
      remplace le sujet et le corps de l'e-mail `lease_payment.recorded` d'un locataire fr. Désactivé,
      c'est la clé de `lang/` qui s'applique. Le test rougit si le rendu ignore le registre.
- [ ] **AC12 — SMS ≤ 2 segments.** Pour chaque code `mobile()`, en fr, en et wo, avec des paramètres
      de taille réaliste. Un texte allongé fait rougir le test.
- [ ] **AC13 — API de la cloche.** `per_page=1000` rend au plus 50 éléments. `filter[unread]=1` ne
      rend que les non lues. Chaque élément porte `code`, `params` et `target`. Une ligne ancienne
      avec `data.booking_id` rend `target.path = /app/bookings/{id}`.
- [ ] **AC14 — Navigateur réel** (320, 390 et 1280 px ; fr, en, wo).
      - Un clic sur un rappel de loyer ouvre le bail et marque la ligne lue.
      - Une notification sans cible n'est pas un lien.
      - Un code inconnu du front affiche le `title` de l'API, sans clé brute ni exception.
      - L'historique se pagine et se filtre.
      - Aucun défilement horizontal ; cibles ≥ 44 px.
- [ ] **AC15 — Un retard est relancé sans pénalité.** Heure fixée, J+1 à 08:00 :
      - bail **sans** `late_fee_percent`, échéance `pending` due la veille ⇒ le locataire reçoit
        `overdue` (aujourd'hui : rien) ;
      - bail à 3 jours de grâce, échéance `pending` due la veille ⇒ idem ;
      - échéance `partially_paid` de 150000 dont 100000 payés, due dans 3 jours ⇒ `due_soon` avec
        un montant égal à `CurrencyFormatter::format(50000, XOF, 'fr')` ;
      - échéance `paid` ou `refunded` à J+1 ⇒ rien.

      Remettre `where('status', PaymentStatus::Late)` fait rougir les deux premiers cas.
- [ ] **AC16 — Matrice honnête.** `GET /api/notifications/preferences`, `BROADCAST_CONNECTION=log`,
      téléphone vérifié :
      - toute case `push` est `locked`, `reason = channel_unavailable` ;
      - `review_received`/`whatsapp` est `channel_unavailable` ; `lease_payment_overdue`/`whatsapp`
        est libre et `enabled = true` (défaut retenu) ;
      - un `PUT` qui active `review_received`/`sms` ne crée aucune ligne.

      Rouge aujourd'hui sur les trois points. `MobileClassEventsTest` rougit si une classe
      `SupportsSms` est ajoutée sans son événement.
- [ ] **AC17 — Montants des notifications.** `LeasePaymentLateFeeNotification` pour 1500 XOF :
      e-mail `fr` contenant `CurrencyFormatter::format(1500, XOF, 'fr')`, e-mail `en` contenant
      `CurrencyFormatter::format(1500, XOF, 'en')` ; aucun des deux ne contient « 1,500.00 ». Même
      contrôle sur `LeaseDepositRefundNotification` et `LeaseRentReviewedNotification` en `en`
      (pas de « 150 000 » à espace dans une phrase anglaise).
- [ ] **AC18** — Pint propre. Verts : `npm run lint`, `npx tsc --noEmit`, `npm run check:i18n`,
      `npm run check:i18n-namespaces` et `node scripts/check-notification-codes.mjs`.

## Hors périmètre

- `SendSavedSearchAlerts` et les alertes de recherche, dont leur interrupteur
  (`threshold_alert`) : TCK-599, qui les porte (son §2.2 et son AC12, qui vérifie aussi que `NotificationService.php` ne change pas dans son diff).
- Confirmations de visite et leads anonymes, dont les littéraux de `contactLead`
  (`PublicPropertyController:927`, `PublicAgentController:353`) : TCK-590 (son AC « plus aucun
  `'Nouveau lead anonyme'` ») ; lien de paiement sans compte : TCK-602.
- Formatage figé en `fr` des tableaux de bord (`overview/{agency,agent,owner,tenant}/page.tsx`,
  p. ex. `overview/agent/page.tsx:24` `const LOCALE: Locale = 'fr'`) : volet front d'O13 et A19.
  **Défaut, non porté** : ces pages sont du territoire de TCK-595, et TCK-347 ne le couvre pas (sa
  garde vise les littéraux BCP-47 `'fr-FR'`/`'fr-SN'`, pas `'fr'`). Attribution laissée à la
  session.
- Le statut `late` écrit seulement par la pénalité (`LateFeeCalculator`) : territoire de TCK-593.
  Ce ticket cesse d'en dépendre pour relancer ; le statut affiché reste à 593.
- Bouton « relancer maintenant » sur une échéance (O5) : l'échéancier appartient à 593 et 596. Un
  ticket de suivi le fera, sur `send()`.
- Conversion en codes des 29 classes `Notification` qui passent déjà par `lang/` : elles sont rendues
  dans la langue du destinataire à l'envoi et ne gagnent qu'une cible dérivée.
- Un transport push / temps réel (dette D-65) : ce ticket ne fait que verrouiller la case `push`
  tant qu'il n'existe pas. Réponses entrantes (STOP SMS, WhatsApp entrant), soumission des gabarits
  à Meta.
- Retrait de `notify()`/`notifyMany()`, après la fusion du dernier ticket de la vague.

## Notes d'implémentation

_(à remplir par implementing-specs)_
