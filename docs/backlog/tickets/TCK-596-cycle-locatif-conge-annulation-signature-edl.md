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
  qu'une demande arrive ou qu'un séjour est libéré, et avoir le remboursement à traiter sous les yeux.
- **Hôte en courte durée** : fermer des nuits et ne plus subir de double réservation avec Airbnb ou
  Booking.com.
- **Bailleur et locataire** : signer le bail à distance avec une preuve de consentement, au lieu
  d'un simple clic « Activer » du gestionnaire.
- **Agent** : photographier chaque pièce de l'état des lieux depuis son téléphone, voir ce qu'il a
  envoyé, et ne jamais toucher un état des lieux signé.

## Contexte

Analyse par acteur du 2026-10-06, vague 73 : points C8, C12 (client), O12, O17 (propriétaire),
A6, A7 (agent). Chaque constat a été **re-mesuré** sur `origin/dev` e3ab4a4e. Quatre faits neufs
s'y ajoutent (marqués **neuf**). La passe de correction du 2026-10-06 en a relevé six autres en
re-mesurant le code (marqués **neuf (passe de correction)**). Chaque défaut porte désormais une case
du Delta et un critère qui rougit sur le code actuel.

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
  laisser un acompte encaissé sans aucun signal, exactement comme `cancel`. Il y a un **quatrième**
  chemin : l'expiration manuelle `POST bookings/{booking}/expire-now`
  (`Admin/BookingController.php:27-58`) → `BookingExpirationService::expireBookingManually` (l.151-170).
- **Neuf (passe de correction) : l'expiration à l'échéance est muette.** `ExpireBookings`
  (`app/Jobs/ExpireBookings.php:19-22`, toutes les heures, `routes/console.php:29`) fait un `update` de
  masse du statut seul. Il ne pose ni `expired_at` ni `expiry_reason`, ne journalise rien et ne
  prévient personne. L'autre chemin, `BookingExpirationService::expireBooking` (l.199-218), pose les
  deux colonnes, journalise et envoie `BookingExpiredNotification` au client et au bailleur
  (l.237-250). Une demande expirée à son échéance propre reste donc `expired` avec
  `expired_at = null`, sans que le client le sache.
- **Neuf (passe de correction) :** le remboursement est aussi ouvert à **un autre bailleur de la même
  agence**. `canManageBooking` accepte `$user->agency_id === $booking->agency_id`
  (`AuthorizesTransitionally.php:103`), et l'accesseur rend l'agence d'un `OwnerProfile`
  (`User.php:228-251`). C'est la classe de défaut de TCK-587 §1, sur un site que 587 ne liste pas.
  Le même assistant autorise `POST bookings/{booking}/payments` (`StoreBookingPaymentRequest.php:36-39`),
  et `BookingPaymentController::store` compte `isOwnerAt(agence)` comme du personnel (l.44-49). Cet
  autre bailleur peut donc **enregistrer un acompte `paid`** sur la réservation d'un autre bailleur.
- **Neuf (passe de correction) :** la demande de réservation ne prévient pas qui doit la traiter.
  `PublicPropertyController::bookingRequest` crée la réservation (offre d'achat l.724, séjour l.749)
  et **ne notifie personne**, ni bailleur ni agent. `BookingService::create` ne prévient que le
  bailleur (`properties.user_id`, l.105-121), par un littéral. L'agent du bien n'est jamais prévenu,
  et la demande peut expirer au seuil de l'agence (`BookingExpirationService.php:176-182`) sans que
  personne l'ait vue.

### 3. Dates bloquées et iCal (O12)

- Aucune trace d'iCal (`grep -rni "VCALENDAR|text/calendar|\.ics"` sur l'API et le front donne 0)
  ni de dates bloquées. `PropertyStatus::Unavailable` ferme le bien entier, pas une plage.
- Le chevauchement n'est vérifié **qu'à la confirmation** (`BookingService::assertNoOverlap` l.245-268,
  appelé l.186 sous verrou du bien l.177). La demande ne le vérifie pas : `BookingService::create`
  (l.50-137) et la demande publique `PublicPropertyController::bookingRequest`
  (`app/Http/Controllers/Public/PublicPropertyController.php:680-770`, `Booking::create` direct l.749)
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
- **Neuf (passe de correction) :** un bail renouvelé créé directement `active`
  (`LeaseRenewalService.php:101-125`, `signed_at` posé l.124) **n'a pas d'échéancier**. Le service
  n'émet ni `GenerateLeasePaymentSchedule` ni `LeaseActivated`. Les seuls producteurs d'échéances sont
  `LeaseService::activate` (l.55) et le bouton manuel `POST leases/{lease}/payments/generate-schedule`
  (`LeaseController.php:109`). Tant que personne ne clique, le bail renouvelé n'a aucune échéance, donc
  ni relance ni pénalité de retard. Aucun test de renouvellement ne compte les échéances
  (`LeaseRenewalServiceTest`, `LeaseRenewalEndpointTest`).
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
- **Neuf :** l'empreinte imprimée sur le PDF (`InventorySignatureService::traceabilityHash`,
  l.69-82) porte sur l'identité, les pièces et les signatures, **pas sur les photos**. Elle est
  recalculée à chaque rendu (`InventoryController.php:217`).
- **Neuf (passe de correction) : une signature d'état des lieux sans signature.** Sans `role` ni
  `signature` dans le corps, `InventoryController::sign` (l.159-173) bascule sur l'ancien
  `InventoryService::sign` (`app/Services/Model/InventoryService.php:69-105`). Ce chemin n'enregistre
  **aucun tracé ni empreinte**, ne refuse pas une re-signature, et pose `signed` **sans `signed_at`**
  (l.98-100). Pour un super-admin, il marque **les deux parties d'un coup** (l.87-94). Le front n'en
  a plus besoin : il envoie toujours un tracé (`InventorySignatures.tsx:182`). Seuls
  `InventoryTest.php:138-164` l'exercent encore.
- **Neuf (passe de correction) :** dans le chemin avec tracé, `authorizeRole`
  (`InventorySignatureService.php:94-121`) laisse un super-admin signer **comme locataire** (l.101),
  alors que son docblock dit « seul le locataire du bail » (l.18). Le rôle `landlord` accepte
  `$user->agency_id === $property->agency_id` (l.109) : **un autre bailleur de la même agence**
  signe pour le bailleur. C'est la classe de TCK-587 §1, sur un site que 587 ne liste pas.
- **Neuf (consolidation) : un collaborateur `viewer` ou `co_owner` signe comme bailleur.** Le même
  `authorizeRole` accepte **tout** collaborateur accepté du bien, quel que soit son rôle
  (`InventorySignatureService.php:110-115` : `where('user_id')->whereNotNull('accepted_at')`, aucun
  filtre sur `role` ; `CollaboratorRole.php:7-10` : `manager | co_owner | agent | viewer`). Aucune
  policy ne garde la route (`routes/api/inventories.php:13`, pas de `can:` ;
  `InventoryController::sign` l.152-173 n'appelle pas `authorize`) : le service est la seule garde.
  Un proche laissé en `viewer`, qui n'a même pas le droit de lire le bien (`InventoryPolicy::view`
  l.27-31 ne lit pas les collaborateurs), engage donc le bailleur par sa signature. Ce n'est pas la
  dette D-66 (« ces rôles n'ouvrent rien »), qui le renvoie ici (`docs/ardoise.md`, D-66). L'effet ne
  joue aujourd'hui que pour les lignes des seeders : aucun code ne pose `property_collaborators.accepted_at`
  (`PrimaryPropertyContact.php:40` ; `InvitationService.php:628` pose celui de l'**invitation**).
  Le signataire n'est pas non plus enregistré : `owner_signed` est un booléen, rien ne dit qui a
  signé ni pour qui (`Inventory.php:19-25`).

## Contrat de données

- **Préavis** : endpoints existants `POST|DELETE leases/{lease}/early-termination`, sans changement.
- **Annulation** : `BookingResource` gagne `refund_status` (`null` | `pending` | `refunded`). La valeur
  est **dérivée** des paiements (réservation `cancelled|rejected|expired` avec au moins un paiement
  `paid` → `pending` ; plus aucun `paid` et au moins un `refunded` → `refunded`). Elle n'est calculée
  que si `payments` est chargée, jamais par une requête par ligne. La tâche « remboursement à traiter »
  est une `Task` existante (`taskable` = la réservation, `metadata.kind = booking_refund`).
- **Événements de réservation** : `BookingRequested` (création, privée ou publique, offre d'achat
  comprise) et `BookingClosed` (`reason` = `cancelled|rejected|expired`, auteur nullable). Aucun
  changement de route.
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
- **Bail renouvelé** : aucun changement de contrat. Un renouvellement `active` produit son échéancier
  comme une activation.
- **État des lieux** : `show` expose `room_photos` (id, URL signée, `room_name`, regroupés par pièce)
  et une nouvelle route `DELETE inventories/{inventory}/room-photos/{media}`.
  `POST inventories/{inventory}/sign` **exige** `role` et `signature` (422 sinon). La colonne
  `inventories.traceability_hash` (SHA-256 complet, nullable) est figée à la seconde signature.
  `InventoryResource` l'expose.

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

- **Le client ne rembourse jamais**, un autre bailleur de l'agence non plus. `refund` est réservé au
  personnel de l'agence de la réservation titulaire de `bookings.refund`, au bailleur direct du bien
  (`properties.user_id`) et au super-admin. Option retenue par défaut (question non tranchée) :
  `bookings.refund` n'est pas accordée au rôle système agent, car c'est une sortie d'argent. La
  preuve est un test HTTP qui rougit sur le code actuel.
- **Une demande de réservation prévient qui doit la traiter** : bailleur, auteur s'il est du
  personnel, collaborateurs acceptés `manager|agent` du bien, moins l'auteur de la demande. Cela vaut
  pour la demande privée, la demande publique et l'offre d'achat.
- **Une notification ne part jamais vers son propre auteur.** Elle va à toutes les autres parties
  (client, bailleur, agent du bien), par des clés `__()`, jamais un littéral (règle commune 1). Les
  clés vivent dans un bloc propre au ticket (règle 2).
- **Intervalle semi-ouvert [début, fin) partout** : réservations, indisponibilités, iCal (`DTEND`
  exclusif). Deux séjours bout à bout ne se chevauchent pas.
- **Vérification de disponibilité à la demande ET à la confirmation**, sous verrou de la ligne
  `properties` (piège PostgreSQL n°2 du `CLAUDE.md` : pas de `lockForUpdate()` sur un agrégat).
  Créer un blocage manuel sur une réservation confirmée → 422. La vérification contre les
  réservations confirmées, en semi-ouvert, **n'attend pas l'ADR** (§3A) : c'est un défaut d'aujourd'hui.
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
- **Signature d'état des lieux** : toujours avec un tracé (plus de chemin sans charge utile).
  **Personne ne signe pour une autre partie.** `tenant` = le locataire du bail, et lui seul, même pas
  le super-admin. **Qui signe pour le bailleur** (règle unique, la même que la signature du bail §4B) :
  le **bailleur du bail** (`leases.landlord_id`) pour lui-même, ou un membre du **personnel de
  l'agence du bail** (`leases.agency_id` ; `isAgentAt || isAgencyAdminAt`, prédicat de la règle 3,
  jamais `users.agency_id`) titulaire de **`leases.sign`**, qui signe **pour son compte**. La
  signature enregistre alors qui a signé et pour qui (`on_behalf_of`). Personne d'autre : ni un
  collaborateur du bien, **quel que soit son rôle** (`viewer`, `co_owner`, `agent`, `manager` ; un
  collaborateur qui est aussi du personnel de l'agence passe par la seconde voie), ni le
  super-admin, ni un autre bailleur de l'agence. Tranché par la session le 2026-10-06 : la
  correction vit ici, pas dans la dette D-66. L'empreinte
  imprimée couvre les photos et elle est **figée** à la seconde signature. Un état des lieux signé
  avant ce ticket garde l'empreinte qu'il imprime aujourd'hui : on ne change pas l'empreinte d'un
  document déjà remis.
- **Bail renouvelé** : un renouvellement qui naît `active` produit son échéancier, une seule fois,
  après validation de la transaction. Un renouvellement `pending_signature` le produit à l'activation
  par signature, jamais deux fois.
- **ADR requis avant le code**, un pour O12 et un pour O17 (modèle de données neuf, échange externe,
  méthode de consentement neuve).
- **Coordination vague 73** :
  - **TCK-587** possède `LeasePolicy` : 596 n'y **ajoute** qu'une méthode `sign`, avec l'expression
    « personnel de l'agence » (`isAgentAt || isAgencyAdminAt`, commentaire `TCK-587`, règle 3).
    `leases.sign` et `bookings.refund` gagnent un lecteur ici : les retirer de la tolérance de la garde
    « capacité sans lecteur » de 587, selon l'ordre de fusion. `RefundBookingPaymentRequest` n'est dans
    aucun territoire : 596 le prend, avec `canManageBooking` (deux appelants, tous deux de 596) et le
    bloc l.41-49 de `BookingPaymentController::store` ; 587 n'y touche qu'`authorizeBookingAccess`
    (l.102-112). 596 prend aussi `InventorySignatureService::authorizeRole` et
    `InventoryService::sign`, deux sites de la classe « même agence » (587 §1) que 587 ne liste pas.
    Il y écrit l'expression de la règle 3 avec un commentaire `TCK-587`. Ordre de fusion indifférent.
    Le prédicat « qui signe pour le bailleur » vit dans une classe neuve de 596
    (`App\Services\Lease\LandlordSignatory`), hors de `LeasePolicy` : 587 n'a rien à y fusionner.
  - **TCK-588** : 596 écrit ses notifications par clés ; s'il y a conflit sur `BookingService::cancel`
    ou `BookingService::create`, la version de 596 gagne. Les littéraux de `confirm` et `reject`
    restent à 588. `ExpireBookings` et `BookingExpirationService` ne sont dans aucun territoire :
    596 les prend (voie d'expiration unique).
  - **TCK-589** : si un envoi d'OTP réutilisable a fusionné, s'y brancher ; sinon, suivre le patron
    `DeletionStepUpService`. Aucune dépendance dure.
  - **TCK-591** possède `CalendarController` : l'affichage des indisponibilités dans l'agenda de la
    console est une suite à coordonner. L'export ICS de l'agenda (A16) réutilise le sérialiseur choisi
    par l'ADR d'O12.
  - **TCK-593** : `LeaseDetail` (593 : contrat ; 596 : préavis et signature) et `BookingDetail`
    (593 : reçu ; 596 : remboursement), en blocs distincts.
  - **TCK-598** possède les pages publiques : 596 ne touche que les champs de dates du dialogue de
    réservation. L'endpoint de disponibilité est un **nouveau** contrôleur ; `bookingRequest` ne gagne
    que l'appel à la vérification et l'émission de `BookingRequested`, après chacun de ses deux
    `Booking::create`.
  - **TCK-595** : l'activation par signature émet toujours `LeaseActivated`, sinon le grand livre ne
    naît plus. Le renouvellement émet son échéancier, pas `LeaseActivated` : la naissance d'une
    écriture au renouvellement reste à 595. `LeaseRenewalService` n'est dans aucun territoire, 596 le
    prend pour ce seul bloc.
  - **TCK-594** possède tout décaissement réel.

## Delta à produire

### 0. Décisions
- [ ] **Livraison** (option retenue par défaut, question non tranchée) : un seul ticket pour la vague,
      livré en trois PR dans cet ordre : §1 + §5 + §2 + §3A + §4A (défauts, sans ADR), puis §3B
      derrière l'ADR d'O12, puis §4B derrière l'ADR d'O17. La signature du bail reste dans ce ticket :
      **tranché par le porteur le 2026-10-06**, la spec la porte en P2 (§1.4).
- [ ] **ADR à écrire et accepter avant le code d'O12** : *« Comment Takussan représente une
      indisponibilité et échange avec les calendriers externes ? »* Il tranche :
      - le format iCal (RFC 5545, `VEVENT` journée entière) et la bibliothèque (génération + analyse) ;
      - le jeton d'export : aléatoire 256 bits stocké haché (**option retenue par défaut**), ou URL
        signée versionnée, qui dépend d'`APP_KEY` ;
      - la fréquence d'import (**option retenue par défaut** : toutes les heures, `withoutOverlapping`,
        plus un « synchroniser maintenant » limité) ;
      - le sort des événements importés disparus de la source (supprimés) ;
      - l'export des dates importées (**option retenue par défaut** : non, pour éviter l'écho entre
        plateformes ; l'export porte les réservations confirmées et les blocages manuels) ;
      - le traitement des conflits (**option retenue par défaut** : l'événement importé est enregistré,
        marqué en conflit, bailleur et agent prévenus ; jamais d'annulation automatique) ;
      - la garde SSRF.
- [ ] **ADR à écrire et accepter avant le code d'O17** : *« Quelle preuve de consentement Takussan
      enregistre-t-elle pour un bail ? »* Il tranche :
      - l'objet signé (empreinte du PDF figé) ;
      - le canal du code (SMS sur numéro vérifié, sinon e-mail) ;
      - ce qui est conservé (signataire, rôle, empreinte, horodatage, IP, agent utilisateur, canal) ;
      - la signature pour le compte du bailleur (**option retenue par défaut** : le bailleur signe
        lui-même s'il a un compte ; sinon un membre du personnel de l'agence titulaire de `leases.sign`
        signe « pour le compte du bailleur » au titre du mandat de gestion, mention portée sur la preuve
        et sur le PDF) ;
      - le locataire sans compte (**option retenue par défaut** : la v1 exige un compte ; sinon
        « signature hors plateforme » avec contrat numérisé obligatoire, `method = paper`) ;
      - le sort de `POST leases/{lease}/activate` ;
      - la sortie de l'impasse `pending_signature`.

### 1. Préavis du locataire (front)
- [ ] Sur le détail d'un bail `active` ou `expired`, le **locataire de ce bail** (utilisateur courant =
      `tenant.user_id`, jamais « tout client ») voit le geste de préavis et peut retirer sa demande
      depuis la bannière tant que la fenêtre est ouverte. La confirmation reste au gestionnaire.
- [ ] Le commentaire faux de `LeaseDetail.tsx:88-91` disparaît ; `tenant.user_id` est typé côté front.
- [ ] Test de composant : locataire du bail → geste visible ; client non locataire → absent ; agent
      → inchangé.

### 2. Demande, annulation et remboursement à traiter
- [ ] `App\Services\Booking\BookingStakeholders::for(Booking): Collection<User>` : client (s'il a
      un compte), bailleur (`properties.user_id`), auteur de la réservation s'il est du personnel,
      collaborateurs acceptés `manager|agent` du bien. Une seule résolution, partagée par les deux
      écouteurs ci-dessous.
- [ ] `App\Events\Booking\BookingRequested` (`ShouldDispatchAfterCommit`), émis par
      `BookingService::create` et par `PublicPropertyController::bookingRequest` après **chacun** de ses
      deux `Booking::create` (séjour et offre d'achat). `App\Listeners\Booking\NotifyOnBookingRequested`
      prévient les parties prenantes **moins le client et l'auteur**, par clés
      `notifications.booking_requested.*`. Le `notifyMany` littéral de `create` (l.105-121) disparaît.
- [ ] Une seule voie d'expiration : `BookingExpirationService::expireBooking` devient public
      (`expire(Booking, string $reason)`). `ExpireBookings` cesse son `update` de masse : il lit les
      identifiants échus par paquets et passe chacun par ce service, qui pose `expired_at` et
      `expiry_reason = 'deadline'`, journalise et envoie `BookingExpiredNotification`.
- [ ] `App\Events\Booking\BookingClosed` (`ShouldDispatchAfterCommit`, `reason` =
      `cancelled|rejected|expired`, auteur nullable). Il est émis par `BookingService::cancel`, `reject`
      et `BookingExpirationService` (les trois expirations : seuil d'agence, échéance propre,
      `expire-now`).
- [ ] `App\Listeners\Booking\NotifyOnBookingCancelled`, sur le patron de `NotifyOnEarlyTermination`,
      **seulement pour `reason = cancelled`** (le refus notifie déjà le client, l'expiration passe par
      `BookingExpiredNotification`). Destinataires : les parties prenantes **moins l'auteur de l'annulation**. Le
      littéral actuel de `cancel()` est converti en clés `notifications.booking_cancelled.*`.
- [ ] `App\Listeners\Booking\OpenBookingRefundTask` (toutes raisons ; sort sans rien faire si la
      réservation ne porte aucun paiement `paid`) →
      `App\Services\Booking\BookingRefundTaskService::openFor(Booking)`, idempotent. Il crée une
      `Task` « remboursement à traiter » (priorité `high`, `taskable` = réservation,
      `metadata = {kind: booking_refund, booking_payment_ids}`). Assignation (option retenue par
      défaut, question non tranchée) : l'auteur de la réservation s'il est du personnel ; sinon le
      premier collaborateur accepté `manager` puis `agent` du bien ; sinon le premier admin de
      l'agence ; sinon le bailleur (hôte sans agence). Le service clôt la tâche (`done`) quand le
      dernier paiement `paid` passe `refunded`.
- [ ] `RefundBookingPaymentRequest::authorize` : personnel de l'agence de la réservation (prédicat de
      la règle 3, jamais `users.agency_id`) **et** `Gate::allows('bookings.refund')`, OU bailleur direct
      du bien, OU super-admin. **Le client est exclu, un autre bailleur de l'agence aussi.**
- [ ] `AuthorizesTransitionally::canManageBooking` (l.103) : la clause « même agence » devient le
      prédicat de la règle 3, avec un commentaire `TCK-587`. Ses deux seuls appelants sont
      `StoreBookingPaymentRequest` et `RefundBookingPaymentRequest`. `BookingPaymentController::store`
      (l.44-49) : `isOwnerAt(agence)` est remplacé par « bailleur direct du bien »
      (`property.user_id`).
- [ ] `BookingResource::refund_status` (voir Contrat de données).
- [ ] Front : état « remboursement en cours » / « remboursé » pour le client ; pour le personnel
      autorisé, « remboursement à traiter » avec le geste qui appelle la route existante (montant,
      motif).
- [ ] Tests :
      - `BookingRequestNotificationTest` : demande publique (séjour, puis offre d'achat) et demande
        privée → bailleur et agent du bien notifiés, client non ;
      - `BookingCancellationNotificationTest` : annulation par le client → bailleur et agent notifiés,
        client non ; par l'agent → client et bailleur notifiés ; titre rendu en anglais pour un
        destinataire de langue `en` ;
      - `BookingRefundTaskTest` : acompte `paid` + annulation, refus, expiration par chacun des deux
        jobs, ou `expire-now` → une seule tâche ; remboursement → tâche close ; sans acompte → aucune
        tâche ;
      - `ExpireBookingsTest` : une demande `pending` dont `expires_at` est passé → `expired`,
        `expired_at` posé, `expiry_reason = deadline`, `BookingExpiredNotification` reçue par le client ;
      - `BookingPaymentRefundAuthorizationTest` : client 403, autre bailleur de la même agence
        (`OwnerProfile`) 403, agent sans `bookings.refund` 403, admin d'agence 200, bailleur direct 200 ;
        `POST bookings/{id}/payments` par un autre bailleur de la même agence → 403, aucune ligne créée.

### 3A. Chevauchement des réservations (défaut, sans ADR)
- [ ] `App\Services\Booking\PropertyAvailabilityService::assertAvailable(Property, start, end,
      ?Booking $ignore)`, première version : réservations `confirmed` du bien en intervalle semi-ouvert
      (`start_date < :end AND end_date > :start`). `BookingService::assertNoOverlap` délègue au service.
- [ ] Appels : `BookingService::create`, `BookingService::confirm` (sous le verrou existant, l.177) et
      `PublicPropertyController::bookingRequest` (séjours datés uniquement, pas l'offre d'achat).
- [ ] Test `BookingAvailabilityTest` : demande privée et publique sur des nuits d'une réservation
      confirmée → 422 ; séjour qui arrive le jour du départ d'un autre → accepté à la demande **et** à
      la confirmation.

### 3B. Indisponibilités et iCal (après l'ADR d'O12)
- [ ] Migrations (noms datés du jour, index et FK nommés < 63 caractères) :
      `create_property_unavailabilities_table` (index `(property_id, starts_on, ends_on)`, unicité
      partielle `(calendar_feed_id, external_uid)`), `create_property_calendar_feeds_table`,
      `add_ical_export_token_hash_to_properties`.
- [ ] Modèles `PropertyUnavailability` et `PropertyCalendarFeed` (`url` en cast `encrypted`).
      `PropertyAvailabilityService` (§3A) :
      - `assertAvailable` vérifie aussi les indisponibilités, en [début, fin) ;
      - `occupiedRanges(Property, from, to)`.
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
      - `BookingAvailabilityTest` (suite du §3A) : demande privée et publique refusées sur des dates
        bloquées ; un blocage qui finit le jour d'arrivée ne bloque pas ;
      - `IcalExportTest` : jeton faux → 404, régénération → l'ancien jeton meurt, aucune donnée
        personnelle dans le corps ;
      - `SyncPropertyCalendarFeedsTest` : import, mise à jour, suppression d'un événement disparu,
        conflit signalé, URL vers `127.0.0.1` / `169.254.169.254` / `10.0.0.0/8` refusées, réponse
        de plus de 1 Mo refusée, avec `Http::fake`.

### 4A. Bail renouvelé sans échéancier (défaut, sans ADR)
- [ ] `LeaseRenewalService` : quand l'enfant naît `active`, émettre `GenerateLeasePaymentSchedule`
      pour lui **après validation** de la transaction (`DB::afterCommit` ou job
      `ShouldDispatchAfterCommit`). Un enfant `pending_signature` n'en émet pas : son échéancier vient
      de l'activation (§4B). Ne pas émettre `LeaseActivated` ici (coordination TCK-595).
- [ ] Test `LeaseRenewalScheduleTest` : renouvellement de 12 mois en paiement mensuel, réglage
      `lease.require_signature` absent → l'enfant a 12 échéances `pending` au bon montant ; réglage à
      vrai → 0 échéance ; le bail parent garde les siennes.

### 4B. Signature du bail par code (après l'ADR d'O17)
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
      - `landlord` = `LandlordSignatory::allows` (§5) : bailleur, ou personnel de l'agence du bail
        titulaire de **`leases.sign`**, signant pour son compte (premier lecteur de cette capacité) ;
        `on_behalf_of_user_id` = `LandlordSignatory::onBehalfOf` ;
      - `requestSignature` = gestionnaire du bail.
      ⚠ La policy ne suffit pas : `Gate::before` accorde **tout** au super-admin
      (`AppServiceProvider.php:433`), donc `LeasePolicy::sign` le laisserait signer pour l'une ou
      l'autre partie. `LeaseSignatureService::sign` revérifie le signataire (locataire du bail, ou
      `LandlordSignatory::allows`) et rend 403 sinon, super-admin compris.
- [ ] `LeaseController::activate` suit la décision de l'ADR (**option retenue par défaut** : réservée à
      la « signature hors plateforme », contrat numérisé obligatoire, preuve `method = paper`). Elle
      accepte `pending_signature` : fin de l'impasse du renouvellement. Elle émet toujours
      `GenerateLeasePaymentSchedule` et `LeaseActivated`.
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
      - tiers 403 ; super-admin `role=tenant` puis `role=landlord` → 403 (le contournement par
        `Gate::before`) ; collaborateur `viewer` du bien `role=landlord` → 403 ;
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
- [ ] Signature : `InventoryController::sign` valide **toujours** par `InventorySignRequest` (`role`
      et `signature` requis) ; la branche sans charge utile et `InventoryService::sign` disparaissent.
      Les trois appels sans corps de `InventoryTest.php:138-164` passent au corps `{role, signature}`.
      Côté front, la mutation de signature n'admet plus d'appel sans tracé, et le commentaire qui
      décrit l'ancien comportement disparaît.
- [ ] Nouvelle classe `App\Services\Lease\LandlordSignatory`, le prédicat unique « qui signe pour le
      bailleur », livré ici (PR 1) et réutilisé par §4B :
      - `allows(User $user, Lease $lease): bool` vaut vrai si `$user->id === $lease->landlord_id`, ou
        si `$lease->agency_id !== null`, le signataire est du personnel de cette agence
        (`isAgentAt($lease->agency_id) || isAgencyAdminAt($lease->agency_id)`, commentaire `TCK-587`)
        **et** `$user->can('leases.sign')`. Sinon faux. Le super-admin n'a pas de voie propre, et un
        collaborateur du bien non plus ;
      - `onBehalfOf(User $user, Lease $lease): ?int` rend `null` si le signataire est le bailleur,
        `$lease->landlord_id` sinon.
- [ ] `InventorySignatureService::authorizeRole` : `tenant` = le locataire du bail **seulement** (le
      super-admin sort de l.101, le docblock l.18 devient vrai). `landlord` =
      `LandlordSignatory::allows($user, $inventory->lease)`, sinon 403. Le bloc
      `$isOwner || $isAgencyStaff || $isCollaborator || $isAdmin` (l.108-120) disparaît en entier,
      **requête des collaborateurs comprise** (l.110-115). Le docblock l.19-20 est réécrit sur la
      règle des Contraintes strictes. `inventories.lease_id` est non nul
      (`2026_04_17_160022_create_inventories_table.php:13`) : `lease` existe toujours.
- [ ] Qui a signé, et pour qui : la migration de l'empreinte (ci-dessous) ajoute aussi
      `owner_signed_by_user_id` et `owner_signed_on_behalf_of_user_id` (FK `users`, nullables,
      `nullOnDelete`). `InventorySignatureService::sign` les pose à la signature `landlord`, par
      `LandlordSignatory::onBehalfOf`. `InventoryResource` expose les deux identifiants. Le PDF
      imprime « Signé par X pour le compte de Y » quand `on_behalf_of` est renseigné (clé
      `inventories.pdf.signed_on_behalf_of`, fr/en/wo).
- [ ] `InventoryResource` expose `can_sign_as` (`tenant`/`landlord`, pour l'utilisateur courant, par
      le même prédicat que `authorizeRole`, en `show` seulement). Front : le canevas bailleur s'ouvre
      à qui l'API laisse signer, et à lui seul. Aujourd'hui, `InventoryDetail.tsx:355-362` l'ouvre
      à tout rôle `agent|agency_admin|owner|super_admin`, puis l'API répond 403. Quand le signataire
      n'est pas le bailleur, le canevas dit « pour le compte de <bailleur> ». Le super-admin ne voit
      plus aucun canevas.
- [ ] Fixture : `InventorySignatureTest::makeInventory` (l.319-326) passe `lease_id` du bail de
      `scaffoldLease`. Sans cela, la fabrique crée un autre bail (`InventoryFactory.php:22`) dont le
      bailleur n'est pas `$owner`, et `test_property_owner_can_sign_as_landlord` rougirait pour une
      raison de fixture, pas de règle.
- [ ] Empreinte : migration `add_signature_traceability_to_inventories` (`traceability_hash`, chaîne
      64, nullable ; plus les deux FK du signataire ci-dessus). À la seconde signature, `InventorySignatureService::sign` y fige un SHA-256 qui couvre
      aussi les photos : pour chaque média `room_photos`, trié par id, `room_name` et le SHA-256 de ses
      octets. Le PDF imprime la colonne quand elle existe, sinon l'ancien calcul (états des lieux signés
      avant ce ticket : empreinte inchangée).
- [ ] Tests :
      - `InventoryRoomPhotosTest` : envoi sur `signed` → 409, sur `pending_signature` et `disputed`
        → 422, pièce inconnue → 422 ; `show` rend les URL signées groupées ; suppression d'un média
        d'un autre état des lieux → 404 ;
      - `InventorySignatureTest` (ajouts) : appel sans corps → 422 ; super-admin `role=tenant` → 403 ;
        super-admin `role=landlord` → 403 ; autre bailleur de la même agence (`OwnerProfile`)
        `role=landlord` → 403 ; collaborateur accepté `viewer` puis `co_owner` du bien (sans autre
        lien) `role=landlord` → 403 ; agent de l'agence du bail **sans** `leases.sign` → 403, **avec**
        → 200, `owner_signed_on_behalf_of_user_id` = bailleur du bail ; bailleur du bail → 200,
        `owner_signed_by_user_id` = lui, `on_behalf_of` nul (voir AC 23) ;
      - `LandlordSignatoryTest` (unitaire) : la table des cas ci-dessus, plus un bail sans
        `agency_id` (seul le bailleur signe) ;
      - `InventoryTraceabilityHashTest` : deux états des lieux identiques sauf une photo → empreintes
        figées différentes ; un état signé sans colonne rend l'empreinte de l'ancien calcul, valeur
        figée dans le test ;
      - test de composant qui monte **deux pièces** (voir AC 13).

## Critères d'acceptation

- [ ] AC1 — Le **locataire de ce bail** voit et ouvre le geste de préavis sur un bail `active`, et
      retire sa demande pendant la fenêtre. Un utilisateur au rôle client qui n'est pas ce locataire
      ne le voit pas. Le test de composant rougit sur le code actuel (le locataire ne voit rien) et
      rougit aussi si le geste s'ouvre à « tout client ».
- [ ] AC2 — Annulation par le client : le bailleur **et** l'agent du bien reçoivent une notification,
      le client n'en reçoit pas pour son propre geste. Annulation par l'agent : le client et le
      bailleur sont notifiés, l'agent non. Les destinataires sont vérifiés par identifiant, pas par
      nombre. Le titre reçu par un destinataire de langue `en` est la traduction anglaise de la clé
      `notifications.booking_cancelled.title`, jamais « Réservation annulée ».
- [ ] AC3 — Une réservation portant un acompte `paid` qui passe `cancelled`, `rejected` ou `expired`
      (par `ExpireBookings`, par `ExpirePendingBookingsJob` **et** par `expire-now`) produit
      **exactement une** tâche `booking_refund` assignée. Sans acompte payé, aucune tâche.
      Le dernier remboursement clôt la tâche.
- [ ] AC4 — `POST booking-payments/{id}/refund` par le **client** de la réservation → 403, et le
      paiement reste `paid`. Le test rougit sur `e3ab4a4e` et redevient rouge si l'on retire la
      correction. Un **autre bailleur de la même agence** (`OwnerProfile`) → 403, le paiement reste
      `paid` (rougit aussi sur `e3ab4a4e`). Le même autre bailleur qui poste
      `POST bookings/{id}/payments` avec `status = paid` → 403 et aucune ligne `booking_payments`
      créée (rougit sur `e3ab4a4e` : 201, paiement `paid`). Un agent sans `bookings.refund` → 403 ; un
      admin d'agence → 200 ; le bailleur direct → 200.
- [ ] AC5 — `refund_status` vaut `pending` pour la réservation annulée avec acompte payé et
      `refunded` après remboursement ; le client voit l'état correspondant.
- [ ] AC6 — Les deux ADR sont acceptés avant le premier commit de leur sous-partie.
- [ ] AC7 — Sans attendre l'ADR (§3A) : une demande, privée **ou publique**, sur des nuits d'une
      réservation déjà confirmée → 422 et aucune ligne `bookings` créée (rougit sur le code actuel :
      201). Un séjour qui arrive le jour du départ d'un autre → accepté à la demande et à la
      confirmation (rougit sur le code actuel, via `confirm`). Après §3B, même refus sur des nuits
      bloquées.
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
- [ ] AC15 — `POST inventories/{id}/room-photos` sur un état des lieux `signed` → 409, sur
      `pending_signature` ou `disputed` → 422, avec une pièce absente de `rooms` → 422. Dans les trois
      cas, le nombre de médias `room_photos` est inchangé (test qui rougit sur `e3ab4a4e`, où les
      trois rendent 200).
- [ ] AC16 — `GET inventories/{id}` rend `room_photos` groupés par pièce avec des URL signées ;
      l'agent les voit dans chaque pièce et en supprime une en brouillon (204). La suppression sur un
      état soumis → 422.
- [ ] AC17 — `./vendor/bin/pint`, `npx tsc --noEmit`, `npm run lint` propres. Clés fr/en/wo
      présentes pour tout libellé ajouté.
- [ ] AC18 — Une demande de réservation publique (séjour **et** offre d'achat) et une demande privée
      notifient le bailleur et le collaborateur accepté `agent` du bien, vérifiés par identifiant ; le
      client n'est pas notifié de sa propre demande. Le test rougit sur `e3ab4a4e` : la demande
      publique n'y notifie personne, la privée oublie l'agent.
- [ ] AC19 — Un renouvellement `active` (réglage de signature absent) produit son échéancier : 12
      échéances `pending` pour 12 mois en paiement mensuel, sans clic. Le test rougit sur `e3ab4a4e`
      (0 échéance) et redevient rouge si l'on retire l'émission du job.
- [ ] AC20 — `POST inventories/{id}/sign` sans `role` ni `signature` → 422, et `owner_signed`,
      `tenant_signed`, `status` sont inchangés (rougit sur `e3ab4a4e` : 200 et partie marquée signée).
      Un super-admin qui signe `role=tenant` → 403 ; un autre bailleur de la même agence qui signe
      `role=landlord` → 403. Les deux rougissent sur `e3ab4a4e` (200).
- [ ] AC21 — L'empreinte figée d'un état des lieux signé change si une seule photo diffère (rougit sur
      `e3ab4a4e`, où les photos n'entrent pas dans le calcul). Celle d'un état des lieux signé avant
      la migration reste la valeur imprimée aujourd'hui.
- [ ] AC22 — Une demande `pending` dont `expires_at` est passé, expirée par `ExpireBookings`, porte
      `expired_at` et `expiry_reason = deadline`, et son client reçoit `BookingExpiredNotification`.
      Le test rougit sur `e3ab4a4e` (`expired_at` nul, aucune notification).
- [ ] AC23 — **Qui signe pour le bailleur.** Un utilisateur sans profil dans l'agence du bien, ajouté
      comme collaborateur `viewer` accepté (`$property->collaborators()->create(['user_id' => …,
      'role' => 'viewer', 'accepted_at' => now()])` ; il n'existe pas de fabrique), qui poste
      `POST inventories/{id}/sign` `role=landlord` → **403**, et `owner_signed` reste `false`. Même
      chose pour `co_owner`. Le test **rougit sur `e3ab4a4e`** (200, `owner_signed = true`, par
      `InventorySignatureService.php:110-115`). Il redevient rouge si l'on remet la requête des
      collaborateurs dans `authorizeRole`. Dans la même classe :
      - super-admin `role=landlord` → 403 (200 sur `e3ab4a4e`) ;
      - agent de l'agence du bail sans `leases.sign` → 403 (200 sur `e3ab4a4e`, par l.109) ;
      - le même agent avec `leases.sign` → 200 et `owner_signed_on_behalf_of_user_id` = `landlord_id`
        du bail ;
      - le bailleur du bail → 200 et `on_behalf_of` nul.

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
- Les quatre yeux sur le remboursement d'acompte (TCK-594 le renvoie ici) : c'est une amélioration.
  Ici, le remboursement reste un statut sans décaissement, réservé à `bookings.refund`.
- La signature d'état des lieux par OTP, IP et empreinte du document : c'est une amélioration du
  motif, pas un défaut. Ce ticket corrige seulement la signature sans tracé et la signature pour
  autrui (§5).
- Ce qu'un collaborateur `viewer` ou `co_owner` **devrait** pouvoir faire (lire le bien, suivre
  visites et loyers) : dette D-66 (`docs/ardoise.md`), sans ticket sur décision du porteur.
  **Exception : la signature d'état des lieux comme bailleur qu'ils obtiennent aujourd'hui est un
  défaut, et ce ticket la ferme** (§5, AC23).

## Notes d'implémentation

_(à remplir par implementing-specs)_
