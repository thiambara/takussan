---
id: TCK-596
title: "Cycle locatif : le locataire donne congé, une annulation prévient qui doit l'être, l'hôte bloque ses dates et synchronise iCal, le bail se signe par code, l'état des lieux range ses photos dans la bonne pièce"
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
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#19-état-des-lieux--inventaires
  models:
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#6-bookingpayment
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#24-inventory-
    - docs/models-spec.md#32-task-
tags: [back, front, bail, reservation, etat-des-lieux, ical, signature, securite, adr-requise]
---

## Objectif utilisateur

- **Locataire** : donner son préavis depuis son espace, en voyant le délai et la pénalité avant d'envoyer.
- **Client qui annule** : savoir que son acompte sera remboursé ; **bailleur et agent** : apprendre
  qu'un séjour est libéré et avoir le remboursement à traiter sous les yeux.
- **Hôte en courte durée** : fermer des nuits et ne plus subir de double réservation avec Airbnb ou
  Booking.com.
- **Bailleur et locataire** : signer le bail à distance avec une preuve de consentement, au lieu
  d'un simple clic « Activer » du gestionnaire.
- **Agent** : photographier chaque pièce de l'état des lieux depuis son téléphone, voir ce qu'il a
  envoyé, et ne jamais toucher un état des lieux signé.

## Contexte

Analyse par acteur du 2026-10-06, vague 73 : points C8, C12 (client), O12, O17 (propriétaire),
A6, A7 (agent). Chaque constat a été **re-mesuré** sur `origin/dev` e3ab4a4e. Quatre faits neufs
s'y ajoutent (marqués **neuf**).

### 1. Préavis du locataire (C8) : l'API l'autorise, le front le cache

- `LeasePolicy::requestEarlyTermination` autorise le locataire du bail
  (`takussan-api/app/Policies/LeasePolicy.php:154-158`), `cancelEarlyTermination` aussi (l.180-183).
  Le test `LeaseEarlyTerminationEndpointTest::test_tenant_can_open_their_own_request_without_terminate_permission`
  (l.103) le prouve. Le service notifie déjà locataire et bailleur
  (`app/Listeners/Lease/NotifyOnEarlyTermination.php:41-58`). **Rien à faire côté API.**
- `takussan-web/src/components/leases/LeaseDetail.tsx:88-92` : `canRequestTermination = canRefundDeposit`,
  qui est vrai seulement pour les rôles de gestion (l.72-77). Le commentaire qui le justifie est faux :
  le client arrive bien sur `/app/leases` (`AppSidebar.tsx:192`). La bannière reçoit le même drapeau
  (`LeaseDetail.tsx:251`) : le locataire ne peut pas non plus **retirer** un préavis.
- Le dialogue affiche déjà le délai et l'estimation de la pénalité (`EarlyTerminationDialog.tsx:64-171`).
  `tenant.user_id` est dans la charge du bail (`LeaseResource.php:52` → `CustomerResource.php:26`).
- Statuts éligibles : `active` et `expired` (`LeaseDetail.tsx:236`, `EarlyTerminationService::guardRequestable` l.292-305).

### 2. Annulation de réservation (C12)

- `BookingService::cancel` (`takussan-api/app/Services/Model/BookingService.php:270-308`) identifie
  l'auteur (l.279-285) mais **ne notifie que le client** (l.296-305), même quand c'est lui qui annule.
  Le bailleur et l'agent ne sont jamais prévenus. Aucun événement `Booking*` n'existe dans `app/Events`.
- Un acompte `paid` n'est ni signalé ni visible. `POST booking-payments/{payment}/refund`
  (`routes/api/bookings.php:27`) existe mais n'a aucun appelant front.
- **Neuf, sur le remboursement :** `RefundBookingPaymentRequest::authorize`
  (`app/Http/Requests/Api/RefundBookingPaymentRequest.php:32-35`) délègue à `canManageBooking`
  (`Concerns/AuthorizesTransitionally.php:91-105`), qui **inclut le client** (l.104), comme voulu pour
  `store` (TCK-172). `store` neutralise ensuite le client (`BookingPaymentController.php:41-54`),
  mais `refund` (l.88-100) ne le fait pas. Résultat : **le client peut faire passer son propre acompte
  à `refunded`** (`BookingPaymentService::refund` l.44-65), sans qu'aucun argent ne bouge.
  `Capability::BookingsRefund` n'a aucun lecteur.
- **Neuf :** un acompte peut être `paid` sur une réservation `pending` (`BookingPaymentService::create`
  l.17-34, sans garde de statut). `reject` (`BookingService.php:210-237`) et l'expiration
  (`app/Jobs/ExpireBookings.php:19-22`, `Jobs/Booking/ExpirePendingBookingsJob.php`) peuvent donc
  laisser un acompte encaissé sans aucun signal, exactement comme `cancel`.

### 3. Dates bloquées et iCal (O12)

- Aucune trace d'iCal (`grep -rni "VCALENDAR|text/calendar|\.ics"` sur l'API et le front donne 0)
  ni de dates bloquées. `PropertyStatus::Unavailable` ferme le bien entier, pas une plage.
- Le chevauchement n'est vérifié **qu'à la confirmation** (`BookingService::assertNoOverlap` l.245-268,
  appelé l.186 sous verrou du bien l.177). La demande ne le vérifie pas : `BookingService::create`
  (l.50-137) et la demande publique `PublicPropertyController::bookingRequest`
  (`app/Http/Controllers/Public/PublicPropertyController.php:680-770`, `Booking::create` direct l.751)
  laissent partir une demande sur des dates déjà prises.
- Aucun endpoint public n'expose les dates occupées : le dialogue de réservation public ne peut rien
  griser.
- **Neuf :** `end_date` est le jour de départ (`BookingQuote.php:83` : `nuits = start→end`), mais
  `assertNoOverlap` compare en bornes incluses (l.257-260). Deux séjours bout à bout (départ le 10,
  arrivée le 10) sont refusés comme chevauchants. Aucun test ne couvre ce cas
  (`BookingOverlapAndExpirationTest.php:18-80`).

### 4. Signature du bail (O17)

- `POST leases/{lease}/activate` (`routes/api/leases.php:18`) → `LeaseController::activate` (l.87-95,
  `authorize('update')`) → `LeaseService::activate` (`app/Services/Model/LeaseService.php:40-64`).
  Le service pose `active` et `signed_at = now()`, sans aucune preuve de consentement.
- Correction du rapport : `activate` n'accepte **que `draft`** (l.42-46), pas `pending_signature`.
  `pending_signature` n'est produit que par un renouvellement quand le réglage `lease.require_signature`
  est vrai (`LeaseRenewalService.php:98-99, 265-275`). Un tel bail n'a alors **aucun chemin vers
  `active`** : l'impasse dort, faute de valeur seedée.
- `leases.sign` (`Capability.php:56`) n'est lue que par le seed (`SystemRoleCapabilities.php`, rôle agent).
- Le motif de l'état des lieux (`InventorySignatureService.php:29-62`) : un tracé haché SHA-256 et un
  horodatage par partie, 409 en cas de re-signature, `pending_signature` puis `signed`.
  Correction du rapport : il n'y a **ni IP, ni code, ni empreinte du document signé**. Ce ticket les
  ajoute ; ce n'est pas une copie du motif.
- Correction du rapport sur l'« infra OTP existante » : `PhoneVerificationService::sendSms` (l.74-84)
  ne fait que journaliser, aucun SMS ne part. `DeletionStepUpService` (l.15-37) a choisi l'e-mail pour
  cette raison. Le transport SMS réel existe (`app/Services/Notifications/Sms/SmsRouterDriver.php`).

### 5. État des lieux : photos dans la mauvaise pièce, photos invisibles, état signé modifiable (A6, A7)

- `MediaDropzone` pose un id **fixe** (`takussan-web/src/components/media/MediaManager.tsx:604`) et un
  `<label htmlFor="media-dropzone-input">` (l.577-578). L'`<input>` est imbriqué dans le label mais
  `for` prime : le contrôle étiqueté est le **premier élément de l'arbre** portant cet id (HTML, élément
  `label`). L'input est `sr-only` (l.609) : le tap tombe sur le label. `InventoryDetail.tsx:138-145`
  rend un `RoomCard` par pièce, chacun avec sa zone (l.203-209), son état (l.165) et son envoi
  `roomName: room.name` (l.217). Toucher la zone de la pièce N remplit donc la pièce 1, et le bouton
  d'envoi de la pièce N reste désactivé (l.214). Seul le glisser-déposer (l.588-592), absent sur
  mobile, fonctionne. Aucun test ne monte deux zones (les tests existants font
  `getByTestId('media-dropzone-input')` sur une seule instance : `MediaManager.test.tsx:47,65,87`,
  `PropertyWizard.test.tsx:490`).
- Taille : la zone accepte 10 Mo (`MediaManager.tsx:77`) quand l'API plafonne à 5 Mo
  (`UploadRoomPhotosInventoryRequest.php:37`). Elle **valide avant de réduire** (l.562), alors que
  `MediaManager` réduit puis valide (l.151-153). L'envoi d'état des lieux part brut
  (`lib/queries/inventory.ts:199-213`). ⚠ Abaisser seulement la limite à 5 Mo refuserait net toute
  photo de téléphone de plus de 5 Mo.
- `room_photos` n'apparaît nulle part dans `takussan-web/src`. `show` (`InventoryController.php:95-102`)
  ne charge pas les médias et `InventoryResource` ne les expose pas. Seuls le PDF (l.214, 229-244) et la
  réponse d'envoi (l.268-275, URL signées) les lisent. Il n'existe aucune route de suppression.
- **Neuf :** `uploadRoomPhotos` (`InventoryController.php:258-277`) n'a **aucune garde de statut**,
  alors que `update` refuse un état signé (409, l.111-116) ou non brouillon (422, l.120-124). On peut
  donc **ajouter des photos à un état des lieux signé**. Comme le PDF est recomposé au téléchargement,
  le document « signé » change après les signatures. `room_name` est une chaîne libre (l.38 de la
  requête), sans lien avec les pièces de l'état des lieux.

## Contrat de données

- **Préavis** : endpoints existants `POST|DELETE leases/{lease}/early-termination`, sans changement.
- **Annulation** : `BookingResource` gagne `refund_status` (`null` | `pending` | `refunded`). La valeur
  est **dérivée** des paiements (réservation `cancelled|rejected|expired` avec au moins un paiement
  `paid` → `pending` ; plus aucun `paid` et au moins un `refunded` → `refunded`). Elle n'est calculée
  que si `payments` est chargée, jamais par une requête par ligne. La tâche « remboursement à traiter »
  est une `Task` existante (`taskable` = la réservation, `metadata.kind = booking_refund`).
- **Indisponibilités** (après ADR) :
  - modèle `PropertyUnavailability` : bien, `starts_on`, `ends_on` (intervalle semi-ouvert), motif,
    source `manual|ical`, flux d'origine, `external_uid`, auteur ;
  - modèle `PropertyCalendarFeed` : bien, URL externe chiffrée, libellé, dernier état de
    synchronisation ;
  - jeton d'export par bien ;
  - routes `GET|POST properties/{property}/unavailabilities`, `DELETE unavailabilities/{unavailability}`,
    `GET|POST properties/{property}/calendar-feeds`, `DELETE calendar-feeds/{feed}`,
    `POST properties/{property}/ical-token` (régénère) ;
  - publiques : `GET /api/public/properties/{slug}/availability?from=&to=` (plages occupées, sans
    aucune donnée personnelle) et `GET /ical/{token}.ics`.
- **Signature du bail** (après ADR) :
  - modèle `LeaseSignature` : bail, rôle `tenant|landlord`, signataire, `on_behalf_of_user_id`,
    `document_sha256`, `signed_at`, `ip_address`, `user_agent`, `otp_channel`, destination masquée ;
  - `leases.contract_sha256` et `leases.signature_requested_at`, plus une collection média privée
    `signed_contract` sur `Lease` ;
  - routes `POST leases/{lease}/signature-request`, `POST leases/{lease}/signature/otp`,
    `POST leases/{lease}/signature` ;
  - `LeaseResource` gagne `signatures` (rôle, date, empreinte, jamais l'IP pour la partie adverse).
- **État des lieux** : `show` expose `room_photos` (id, URL signée, `room_name`, regroupés par pièce)
  et une nouvelle route `DELETE inventories/{inventory}/room-photos/{media}`.

## Direction UX / Artistique

- **Préavis** : le geste du locataire est sobre et sérieux. Il voit le délai et la pénalité *avant* de
  confirmer, puis le compte à rebours et le retrait possible tant que la fenêtre est ouverte. Le texte
  parle au locataire (« Donner mon préavis »), pas au gestionnaire.
- **Annulation** : côté client, un état clair, « Remboursement de l'acompte en cours », sans promesse
  de délai que personne ne tient. Côté agence, le remboursement à traiter se voit sur la réservation
  et dans les tâches, et se solde en un geste qui demande le montant remboursé.
- **Calendrier de l'hôte** : une vue mois par bien où réservations, blocages manuels et dates importées
  se distinguent d'un coup d'œil (couleur **et** motif ou libellé, jamais la couleur seule). Bloquer
  une plage se fait en deux taps sur mobile. Le lien d'export se copie en un geste ; un flux en erreur
  dit depuis quand et pourquoi. Le tunnel public grise les nuits prises sans dire pourquoi.
- **Signature** : un parcours court et rassurant. On lit le contrat figé, on reçoit un code, on le saisit,
  la signature est faite. Chaque partie voit qui a signé et quand. Le gestionnaire voit l'état
  « en attente de signature du locataire / du bailleur ».
- **État des lieux** : chaque pièce montre ses vignettes déjà envoyées, que l'on peut supprimer tant
  que l'état est un brouillon. Un tap sur la zone de la pièce N ouvre le sélecteur **de la pièce N**.
  Une photo de téléphone passe sans message d'erreur. Rien n'est modifiable une fois l'état soumis.
- Charte « Ancrage Local Contemporain » (`docs/design-guidelines.md`), fr/en/wo pour tout libellé.

## Contraintes strictes (métier)

- **Le client ne rembourse jamais.** `refund` est réservé au personnel de l'agence titulaire de
  `bookings.refund`, au bailleur direct du bien et au super-admin. La preuve est un test HTTP qui
  rougit sur le code actuel.
- **Une notification ne part jamais vers son propre auteur.** Elle va à toutes les autres parties
  (client, bailleur, agent du bien), par des clés `__()`, jamais un littéral (règle commune 1). Les
  clés vivent dans un bloc propre au ticket (règle 2).
- **Intervalle semi-ouvert [début, fin) partout** : réservations, indisponibilités, iCal (`DTEND`
  exclusif). Deux séjours bout à bout ne se chevauchent pas.
- **Vérification de disponibilité à la demande ET à la confirmation**, sous verrou de la ligne
  `properties` (piège PostgreSQL n°2 du `CLAUDE.md` : pas de `lockForUpdate()` sur un agrégat).
  Créer un blocage manuel sur une réservation confirmée → 422.
- **Import iCal** : HTTPS seulement, résolution DNS refusant les plages privées, de bouclage et de
  métadonnées (SSRF), délai de 10 s, réponse plafonnée (1 Mo), pas de redirection vers un hôte refusé.
  Un import n'annule **jamais** une réservation : un conflit est signalé au bailleur et à l'agent.
  L'URL externe est chiffrée en base (elle contient souvent un secret de la plateforme tierce).
- **Export iCal** : aucune donnée personnelle (ni nom, ni téléphone : « Réservé » / « Indisponible »).
  Jeton révocable par régénération, comparé en temps constant. Limiteur de débit.
- **Signature** : le contrat est **figé** à la demande de signature (PDF rendu une fois, stocké en
  collection privée, SHA-256 de ses octets). Les deux parties signent la **même** empreinte, et toute
  modification du bail entre les deux signatures invalide les signatures en attente. Code à 6 chiffres,
  usage unique, TTL 5 min, 5 essais au plus, renvoi limité à 1 par 60 s. Le code part par SMS via
  `SmsRouterDriver` vers un numéro **vérifié**, sinon par e-mail. Il n'est jamais journalisé hors du
  pilote `log`. L'activation (échéancier + `LeaseActivated`) se produit **une seule fois**, à la seconde
  signature, dans la même transaction que celle-ci.
- **État des lieux** : envoi et suppression de photos **uniquement en `draft`** (409 si signé, 422
  sinon, comme `update`). `room_name` appartient aux pièces de l'état des lieux. Les URL restent
  signées (collection privée, ADR-0029).
- **ADR requis avant le code**, un pour O12 et un pour O17 (modèle de données neuf, échange externe,
  méthode de consentement neuve).
- **Coordination vague 73** :
  - **TCK-587** possède `LeasePolicy` : 596 n'y **ajoute** qu'une méthode `sign`, avec l'expression
    « personnel de l'agence » (`isAgentAt || isAgencyAdminAt`, commentaire `TCK-587`, règle 3).
    `leases.sign` et `bookings.refund` gagnent un lecteur ici : les retirer de la tolérance de la garde
    « capacité sans lecteur » de 587, selon l'ordre de fusion. `RefundBookingPaymentRequest` n'est dans
    aucun territoire : 596 le prend.
  - **TCK-588** : 596 écrit ses notifications par clés ; s'il y a conflit sur `BookingService::cancel`,
    la version de 596 gagne.
  - **TCK-589** : si un envoi d'OTP réutilisable a fusionné, s'y brancher ; sinon, suivre le patron
    `DeletionStepUpService`. Aucune dépendance dure.
  - **TCK-591** possède `CalendarController` : l'affichage des indisponibilités dans l'agenda de la
    console est une suite à coordonner. L'export ICS de l'agenda (A16) réutilise le sérialiseur choisi
    par l'ADR d'O12.
  - **TCK-593** : `LeaseDetail` (593 : contrat ; 596 : préavis et signature) et `BookingDetail`
    (593 : reçu ; 596 : remboursement), en blocs distincts.
  - **TCK-598** possède les pages publiques : 596 ne touche que les champs de dates du dialogue de
    réservation. L'endpoint de disponibilité est un **nouveau** contrôleur ; `bookingRequest` ne gagne
    que l'appel à la vérification.
  - **TCK-594** possède tout décaissement réel.

## Delta à produire

### 0. Décisions
- [ ] **ADR à écrire et accepter avant le code d'O12** : *« Comment Takussan représente une
      indisponibilité et échange avec les calendriers externes ? »* Il tranche :
      - le format iCal (RFC 5545, `VEVENT` journée entière) et la bibliothèque (génération + analyse) ;
      - le jeton d'export : aléatoire 256 bits stocké haché, **recommandé**, ou URL signée versionnée,
        qui dépend d'`APP_KEY` ;
      - la fréquence d'import (**recommandé** : toutes les heures, `withoutOverlapping`, plus un
        « synchroniser maintenant » limité) ;
      - le sort des événements importés disparus de la source (supprimés) ;
      - l'export des dates importées (**recommandé** : non, pour éviter l'écho entre plateformes) ;
      - le traitement des conflits ;
      - la garde SSRF.
- [ ] **ADR à écrire et accepter avant le code d'O17** : *« Quelle preuve de consentement Takussan
      enregistre-t-elle pour un bail ? »* Il tranche :
      - l'objet signé (empreinte du PDF figé) ;
      - le canal du code (SMS sur numéro vérifié, sinon e-mail) ;
      - ce qui est conservé (signataire, rôle, empreinte, horodatage, IP, agent utilisateur, canal) ;
      - la signature pour le compte du bailleur par un titulaire de `leases.sign` ;
      - le locataire sans compte (**recommandé** : v1 exige un compte, sinon « signature hors
        plateforme » avec contrat numérisé obligatoire, `method = paper`) ;
      - le sort de `POST leases/{lease}/activate` ;
      - la sortie de l'impasse `pending_signature`.

### 1. Préavis du locataire (front)
- [ ] Sur le détail d'un bail `active` ou `expired`, le **locataire de ce bail** (utilisateur courant =
      `tenant.user_id`, jamais « tout client ») voit le geste de préavis et peut retirer sa demande
      depuis la bannière tant que la fenêtre est ouverte. La confirmation reste au gestionnaire.
- [ ] Le commentaire faux de `LeaseDetail.tsx:88-91` disparaît ; `tenant.user_id` est typé côté front.
- [ ] Test de composant : locataire du bail → geste visible ; client non locataire → absent ; agent
      → inchangé.

### 2. Annulation et remboursement à traiter
- [ ] `App\Events\Booking\BookingCancelled` (`ShouldDispatchAfterCommit`), émis par
      `BookingService::cancel`, `reject` et les deux jobs d'expiration (ces derniers : seulement pour les
      réservations portant un paiement `paid`, par lot ; jamais une requête par réservation sans acompte).
- [ ] `App\Listeners\Booking\NotifyOnBookingCancelled`, sur le patron de `NotifyOnEarlyTermination`.
      Destinataires : client, bailleur (`properties.user_id`), auteur de la réservation s'il est du
      personnel, collaborateurs acceptés `manager|agent` du bien ; **moins l'auteur de l'annulation**.
      Le littéral actuel de `cancel()` est converti en clés.
- [ ] `App\Services\Booking\BookingRefundTaskService::openFor(Booking)` : idempotent. Il crée une
      `Task` « remboursement à traiter » (priorité `high`, `taskable` = réservation,
      `metadata = {kind: booking_refund, booking_payment_ids}`) assignée selon l'option recommandée
      (voir notes). Il la clôt (`done`) quand le dernier paiement `paid` passe `refunded`.
- [ ] `RefundBookingPaymentRequest::authorize` : `Gate::allows('bookings.refund', $booking)`, OU
      bailleur direct du bien, OU super-admin. **Le client est exclu.**
- [ ] `BookingResource::refund_status` (voir Contrat de données).
- [ ] Front : état « remboursement en cours » / « remboursé » pour le client ; pour le personnel
      autorisé, « remboursement à traiter » avec le geste qui appelle la route existante (montant,
      motif).
- [ ] Tests :
      - `BookingCancellationNotificationTest` : annulation par le client → bailleur et agent notifiés,
        client non ; par l'agent → client et bailleur notifiés ;
      - `BookingRefundTaskTest` : acompte `paid` + annulation, refus ou expiration → une seule tâche ;
        remboursement → tâche close ; sans acompte → aucune tâche ;
      - `BookingPaymentRefundAuthorizationTest` : client 403, agent sans `bookings.refund` 403, admin
        d'agence 200, bailleur direct 200.

### 3. Indisponibilités et iCal (après l'ADR d'O12)
- [ ] Migrations (noms datés du jour, index et FK nommés < 63 caractères) :
      `create_property_unavailabilities_table` (index `(property_id, starts_on, ends_on)`, unicité
      partielle `(calendar_feed_id, external_uid)`), `create_property_calendar_feeds_table`,
      `add_ical_export_token_hash_to_properties`.
- [ ] Modèles `PropertyUnavailability` et `PropertyCalendarFeed` (`url` en cast `encrypted`).
      `App\Services\Booking\PropertyAvailabilityService` :
      - `assertAvailable(Property, start, end, ?Booking $ignore)`, qui vérifie les réservations
        confirmées + les indisponibilités en [début, fin) ;
      - `occupiedRanges(Property, from, to)`.
      `assertNoOverlap` délègue au service et passe en semi-ouvert.
- [ ] Appels de `assertAvailable` : `BookingService::create`, `BookingService::confirm` (sous le verrou
      existant) et `PublicPropertyController::bookingRequest` (séjours datés uniquement, pas l'offre
      d'achat).
- [ ] `PropertyUnavailabilityController` (`index`, `store`, `destroy`) et
      `Store/IndexPropertyUnavailabilityRequest`, avec la `PropertyUnavailabilityPolicy` :
      - délègue à `PropertyPolicy::update` sur le bien (territoire 587, lu et non modifié) : qui peut
        modifier le bien peut bloquer ses dates ;
      - une indisponibilité de source `ical` ne se supprime pas à la main.
- [ ] `PropertyCalendarFeedController` (`index`, `store`, `destroy`, `sync`) avec
      `StorePropertyCalendarFeedRequest`. `PropertyIcalTokenController::store` régénère le jeton et rend
      l'URL **une seule fois**.
- [ ] `App\Http\Controllers\Public\PublicPropertyAvailabilityController` (plages occupées d'un bien
      public, bornées à 18 mois, sans donnée personnelle) et `App\Http\Controllers\Public\IcalExportController`
      (`text/calendar; charset=utf-8`, limiteur `throttle:ical-export`).
- [ ] Job `SyncPropertyCalendarFeedsJob`, à la fréquence fixée par l'ADR, dans `routes/console.php`,
      avec `withoutOverlapping`. Il passe par un garde-fou HTTP sortant `App\Support\Http\SafeOutboundUrl`
      (SSRF). Il compte les échecs ; au troisième d'affilée, le bailleur est prévenu. Un conflit avec
      une réservation confirmée est marqué, et le bailleur et l'agent sont prévenus.
- [ ] Front, côté hôte : sur la fiche d'un bien en location courte durée, la vue calendrier du bien
      (réservations, blocages, importés), le blocage d'une plage, la gestion des flux et la copie du
      lien d'export.
- [ ] Front, tunnel public : les nuits occupées sont grisées dans les champs de dates du dialogue de
      réservation, qui affiche une erreur explicite si le serveur refuse quand même.
- [ ] Tests :
      - `PropertyUnavailabilityTest` : CRUD, autorisation, refus sur une réservation confirmée ;
      - `BookingAvailabilityTest` : demande privée et publique refusées sur dates bloquées, séjours
        bout à bout acceptés ;
      - `IcalExportTest` : jeton faux → 404, régénération → l'ancien jeton meurt, aucune donnée
        personnelle dans le corps ;
      - `SyncPropertyCalendarFeedsTest` : import, mise à jour, suppression d'un événement disparu,
        conflit signalé, URL vers `127.0.0.1` / `169.254.169.254` / `10.0.0.0/8` refusées, réponse
        de plus de 1 Mo refusée, avec `Http::fake`.

### 4. Signature du bail par code (après l'ADR d'O17)
- [ ] Migrations `create_lease_signatures_table` (unicité `(lease_id, role, document_sha256)` nommée)
      et `add_contract_signature_columns_to_leases`. Collection privée `signed_contract` dans
      `Lease::registerMediaCollections`.
- [ ] `App\Services\Lease\LeaseSignatureService` :
      - `request(Lease, User)` : `draft|pending_signature` → `pending_signature`, PDF figé et haché ;
      - `sendCode(Lease, User)` ;
      - `sign(Lease, User, code, Request)` : vérifie le code, enregistre la preuve et, à la seconde
        signature, active le bail comme `LeaseService::activate`, dans la même transaction, une seule
        fois.
      `App\Services\Lease\LeaseSignatureOtpService` suit le patron `DeletionStepUpService`, avec un
      compteur d'essais en plus.
- [ ] `LeaseSignatureController` (`request`, `sendCode`, `sign`), avec `RequestLeaseSignatureRequest`
      et `SignLeaseRequest`. `LeasePolicy::sign(User, Lease, string $role)` :
      - `tenant` = locataire du bail ;
      - `landlord` = bailleur, ou personnel de l'agence du bail titulaire de **`leases.sign`**, signant
        pour son compte (premier lecteur de cette capacité) ;
      - `requestSignature` = gestionnaire du bail.
- [ ] `LeaseController::activate` suit la décision de l'ADR (**recommandé** : réservée à la « signature
      hors plateforme », contrat numérisé obligatoire, preuve `method = paper`). Elle accepte
      `pending_signature` : fin de l'impasse du renouvellement.
- [ ] `DocumentPdfController::leaseContract` sert le PDF figé dès qu'il existe.
- [ ] Notifications par clés : « bail à signer » à chaque partie, « bail signé par X » à l'autre,
      « bail actif » à toutes.
- [ ] Front : sur le détail du bail, chaque partie voit l'état des signatures, lit le contrat figé,
      reçoit puis saisit son code ; le gestionnaire lance la demande et suit l'attente.
- [ ] Tests `LeaseSignatureTest` :
      - parcours à deux signatures → `active` + échéancier généré une fois ;
      - code faux ×5 → verrou ;
      - code rejoué → 422 ;
      - bail modifié entre deux signatures → signature en attente invalidée ;
      - tiers 403 ;
      - agent sans `leases.sign` 403, avec → 200 et `on_behalf_of_user_id` renseigné ;
      - IP et empreinte enregistrées ;
      - renouvellement `pending_signature` signable.

### 5. État des lieux
- [ ] `InventoryController::uploadRoomPhotos` : garde de statut identique à `update` (409 si `signed`,
      422 si non `draft`), placée **avant** l'écriture. `UploadRoomPhotosInventoryRequest` :
      `room_name` ∈ noms de `rooms`.
- [ ] `InventoryController::show` charge `room_photos`. `InventoryResource` les expose **seulement
      quand ils sont chargés** (id, URL signée, `room_name`), pas dans `index`.
- [ ] Route `DELETE inventories/{inventory}/room-photos/{media}` (`inventories.room-photos.destroy`)
      → `InventoryController::destroyRoomPhoto`, avec autorisation `update`, `draft` seulement, et un
      média qui appartient bien à cet état des lieux et à cette collection (sinon 404).
- [ ] Front : chaque zone d'envoi a un identifiant **unique** ; les photos sont **réduites avant
      d'être validées** puis envoyées, avec une limite affichée cohérente avec l'API ; chaque pièce
      montre ses vignettes et permet de supprimer en brouillon.
- [ ] Tests :
      - `InventoryRoomPhotosTest` : envoi sur `signed` → 409, sur `pending_signature` → 422, pièce
        inconnue → 422 ; `show` rend les URL signées groupées ; suppression d'un média d'un autre
        état des lieux → 404 ;
      - test de composant qui monte **deux pièces** (voir AC 13).

## Critères d'acceptation

- [ ] AC1 — Le **locataire de ce bail** voit et ouvre le geste de préavis sur un bail `active`, et
      retire sa demande pendant la fenêtre. Un utilisateur au rôle client qui n'est pas ce locataire
      ne le voit pas (test de composant qui rougit si le geste s'ouvre à « tout client »).
- [ ] AC2 — Annulation par le client : le bailleur **et** l'agent du bien reçoivent une notification,
      le client n'en reçoit pas pour son propre geste. Annulation par l'agent : le client et le
      bailleur sont notifiés, l'agent non. Les destinataires sont vérifiés par identifiant, pas par
      nombre.
- [ ] AC3 — Une réservation portant un acompte `paid` qui passe `cancelled`, `rejected` ou `expired`
      produit **exactement une** tâche `booking_refund` assignée. Sans acompte payé, aucune tâche.
      Le dernier remboursement clôt la tâche.
- [ ] AC4 — `POST booking-payments/{id}/refund` par le **client** de la réservation → 403, et le
      paiement reste `paid`. Le test rougit sur `e3ab4a4e` et redevient rouge si l'on retire la
      correction. Un agent sans `bookings.refund` → 403 ; un admin d'agence → 200.
- [ ] AC5 — `refund_status` vaut `pending` pour la réservation annulée avec acompte payé et
      `refunded` après remboursement ; le client voit l'état correspondant.
- [ ] AC6 — Les deux ADR sont acceptés avant le premier commit de leur sous-partie.
- [ ] AC7 — Une demande, privée **ou publique**, sur des nuits bloquées ou déjà confirmées → 422.
      Un séjour qui arrive le jour du départ d'un autre → accepté (test qui rougit sur le code actuel,
      via `confirm`).
- [ ] AC8 — Le flux `/ical/{token}.ics` d'un bien contient ses réservations confirmées et ses
      blocages manuels, ne contient ni nom ni téléphone, et rend 404 avec l'ancien jeton après
      régénération.
- [ ] AC9 — Un flux iCal importé crée, met à jour et retire les indisponibilités correspondantes. Une
      URL vers une adresse privée, de bouclage ou de métadonnées est refusée **sans requête sortante**
      (`Http::assertNothingSent`). Un conflit avec une réservation confirmée est signalé, et la
      réservation reste confirmée.
- [ ] AC10 — Le bail passe `active` **uniquement** après la seconde signature par code valide.
      L'échéancier est généré une fois. Chaque `LeaseSignature` porte l'empreinte du PDF figé,
      l'horodatage et l'IP. Un code rejoué ou un sixième essai est refusé.
- [ ] AC11 — `leases.sign` a un lecteur : un agent de l'agence du bail sans cette capacité ne peut
      pas signer pour le bailleur (403), il le peut avec (200, `on_behalf_of_user_id` renseigné).
- [ ] AC12 — Un bail renouvelé en `pending_signature` atteint `active` par le parcours de signature
      (fin de l'impasse).
- [ ] AC13 — **Test de composant qui monte deux pièces** : un fichier choisi par la zone de la
      **seconde** pièce active le bouton d'envoi de la seconde pièce, et pas celui de la première.
      Ce test **rougit sur le code actuel** (id fixe), sans recours au glisser-déposer. Les
      `htmlFor` des deux zones sont distincts et désignent chacun l'input de leur propre zone.
- [ ] AC14 — Une photo JPEG de 7 Mo est **acceptée** par la zone d'état des lieux et le fichier
      envoyé pèse ≤ 5 Mo. Un fichier non image est refusé avec le message de type. (Un correctif
      qui abaisserait seulement la limite à 5 Mo échoue à cet AC.)
- [ ] AC15 — `POST inventories/{id}/room-photos` sur un état des lieux `signed` → 409, et le nombre
      de médias `room_photos` est inchangé (test qui rougit sur `e3ab4a4e`).
- [ ] AC16 — `GET inventories/{id}` rend `room_photos` groupés par pièce avec des URL signées ;
      l'agent les voit dans chaque pièce et en supprime une en brouillon (204). La suppression sur un
      état soumis → 422.
- [ ] AC17 — `./vendor/bin/pint`, `npx tsc --noEmit`, `npm run lint` propres. Clés fr/en/wo
      présentes pour tout libellé ajouté.

## Hors périmètre

- La politique d'annulation par bien (montant remboursable selon le délai, remboursement partiel
  automatisé) : §1.3 P3.
- Tout décaissement réel d'un remboursement (mobile money, virement) : TCK-594. Ici, le remboursement
  reste un statut et une tâche.
- L'affichage des indisponibilités dans l'agenda agrégé de la console (`CalendarController`,
  TCK-591) et l'export ICS de l'agenda de l'agent (TCK-591, A16).
- La signature électronique qualifiée (certificat, horodatage par un tiers de confiance) ; la
  signature d'un locataire sans compte par lien public (voir ADR).
- La comparaison automatique entrée ↔ sortie des états des lieux, et la reconnaissance de
  dégradations (§1.9 P3).
- L'envoi par SMS ou WhatsApp des notifications de ce ticket hors code de signature : TCK-588.

## Notes d'implémentation

_(à remplir par implementing-specs)_
