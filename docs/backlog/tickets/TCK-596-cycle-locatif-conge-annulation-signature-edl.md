---
id: TCK-596
title: "Cycle locatif : le locataire donne congé, une annulation prévient qui doit l'être, l'hôte bloque ses dates et synchronise iCal, le bail se signe par code, l'état des lieux range ses photos dans la bonne pièce"
status: done
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-08
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
- [x] **Livraison** (option retenue par défaut, question non tranchée) : un seul ticket pour la vague,
      livré en trois PR dans cet ordre : §1 + §5 + §2 + §3A + §4A (défauts, sans ADR), puis §3B
      derrière l'ADR d'O12, puis §4B derrière l'ADR d'O17. La signature du bail reste dans ce ticket :
      **tranché par le porteur le 2026-10-06**, la spec la porte en P2 (§1.4).
- [x] **ADR à écrire et accepter avant le code d'O12** : *« Comment Takussan représente une
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
- [x] **ADR à écrire et accepter avant le code d'O17** : *« Quelle preuve de consentement Takussan
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
- [x] Sur le détail d'un bail `active` ou `expired`, le **locataire de ce bail** (utilisateur courant =
      `tenant.user_id`, jamais « tout client ») voit le geste de préavis et peut retirer sa demande
      depuis la bannière tant que la fenêtre est ouverte. La confirmation reste au gestionnaire.
- [x] Le commentaire faux de `LeaseDetail.tsx:88-91` disparaît ; `tenant.user_id` est typé côté front.
- [x] Test de composant : locataire du bail → geste visible ; client non locataire → absent ; agent
      → inchangé.

### 2. Demande, annulation et remboursement à traiter
- [x] `App\Services\Booking\BookingStakeholders::for(Booking): Collection<User>` : client (s'il a
      un compte), bailleur (`properties.user_id`), auteur de la réservation s'il est du personnel,
      collaborateurs acceptés `manager|agent` du bien. Une seule résolution, partagée par les deux
      écouteurs ci-dessous.
- [x] `App\Events\Booking\BookingRequested` (`ShouldDispatchAfterCommit`), émis par
      `BookingService::create` et par `PublicPropertyController::bookingRequest` après **chacun** de ses
      deux `Booking::create` (séjour et offre d'achat). `App\Listeners\Booking\NotifyOnBookingRequested`
      prévient les parties prenantes **moins le client et l'auteur**, par clés
      `notifications.booking_requested.*`. Le `notifyMany` littéral de `create` (l.105-121) disparaît.
- [x] Une seule voie d'expiration : `BookingExpirationService::expireBooking` devient public
      (`expire(Booking, string $reason)`). `ExpireBookings` cesse son `update` de masse : il lit les
      identifiants échus par paquets et passe chacun par ce service, qui pose `expired_at` et
      `expiry_reason = 'deadline'`, journalise et envoie `BookingExpiredNotification`.
- [x] `App\Events\Booking\BookingClosed` (`ShouldDispatchAfterCommit`, `reason` =
      `cancelled|rejected|expired`, auteur nullable). Il est émis par `BookingService::cancel`, `reject`
      et `BookingExpirationService` (les trois expirations : seuil d'agence, échéance propre,
      `expire-now`).
- [x] `App\Listeners\Booking\NotifyOnBookingCancelled`, sur le patron de `NotifyOnEarlyTermination`,
      **seulement pour `reason = cancelled`** (le refus notifie déjà le client, l'expiration passe par
      `BookingExpiredNotification`). Destinataires : les parties prenantes **moins l'auteur de l'annulation**. Le
      littéral actuel de `cancel()` est converti en clés `notifications.booking_cancelled.*`.
- [x] `App\Listeners\Booking\OpenBookingRefundTask` (toutes raisons ; sort sans rien faire si la
      réservation ne porte aucun paiement `paid`) →
      `App\Services\Booking\BookingRefundTaskService::openFor(Booking)`, idempotent. Il crée une
      `Task` « remboursement à traiter » (priorité `high`, `taskable` = réservation,
      `metadata = {kind: booking_refund, booking_payment_ids}`). Assignation (option retenue par
      défaut, question non tranchée) : l'auteur de la réservation s'il est du personnel ; sinon le
      premier collaborateur accepté `manager` puis `agent` du bien ; sinon le premier admin de
      l'agence ; sinon le bailleur (hôte sans agence). Le service clôt la tâche (`done`) quand le
      dernier paiement `paid` passe `refunded`.
- [x] `RefundBookingPaymentRequest::authorize` : personnel de l'agence de la réservation (prédicat de
      la règle 3, jamais `users.agency_id`) **et** `Gate::allows('bookings.refund')`, OU bailleur direct
      du bien, OU super-admin. **Le client est exclu, un autre bailleur de l'agence aussi.**
- [x] `AuthorizesTransitionally::canManageBooking` (l.103) : la clause « même agence » devient le
      prédicat de la règle 3, avec un commentaire `TCK-587`. Ses deux seuls appelants sont
      `StoreBookingPaymentRequest` et `RefundBookingPaymentRequest`. `BookingPaymentController::store`
      (l.44-49) : `isOwnerAt(agence)` est remplacé par « bailleur direct du bien »
      (`property.user_id`).
- [x] `BookingResource::refund_status` (voir Contrat de données).
- [x] Front : état « remboursement en cours » / « remboursé » pour le client ; pour le personnel
      autorisé, « remboursement à traiter » avec le geste qui appelle la route existante (montant,
      motif).
- [x] Tests :
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
- [x] `App\Services\Booking\PropertyAvailabilityService::assertAvailable(Property, start, end,
      ?Booking $ignore)`, première version : réservations `confirmed` du bien en intervalle semi-ouvert
      (`start_date < :end AND end_date > :start`). `BookingService::assertNoOverlap` délègue au service.
- [x] Appels : `BookingService::create`, `BookingService::confirm` (sous le verrou existant, l.177) et
      `PublicPropertyController::bookingRequest` (séjours datés uniquement, pas l'offre d'achat).
- [x] Test `BookingAvailabilityTest` : demande privée et publique sur des nuits d'une réservation
      confirmée → 422 ; séjour qui arrive le jour du départ d'un autre → accepté à la demande **et** à
      la confirmation.

### 3B. Indisponibilités et iCal (après l'ADR d'O12)
- [x] Migrations (noms datés du jour, index et FK nommés < 63 caractères) :
      `create_property_unavailabilities_table` (index `(property_id, starts_on, ends_on)`, unicité
      partielle `(calendar_feed_id, external_uid)`), `create_property_calendar_feeds_table`,
      `add_ical_export_token_hash_to_properties`.
- [x] Modèles `PropertyUnavailability` et `PropertyCalendarFeed` (`url` en cast `encrypted`).
      `PropertyAvailabilityService` (§3A) :
      - `assertAvailable` vérifie aussi les indisponibilités, en [début, fin) ;
      - `occupiedRanges(Property, from, to)`.
- [x] `PropertyUnavailabilityController` (`index`, `store`, `destroy`) et
      `Store/IndexPropertyUnavailabilityRequest`, avec la `PropertyUnavailabilityPolicy` :
      - délègue à `PropertyPolicy::update` sur le bien (territoire 587, lu et non modifié) : qui peut
        modifier le bien peut bloquer ses dates ;
      - une indisponibilité de source `ical` ne se supprime pas à la main.
- [x] `PropertyCalendarFeedController` (`index`, `store`, `destroy`, `sync`) avec
      `StorePropertyCalendarFeedRequest`. `PropertyIcalTokenController::store` régénère le jeton et rend
      l'URL **une seule fois**.
- [x] `App\Http\Controllers\Public\PublicPropertyAvailabilityController` (plages occupées d'un bien
      public, bornées à 18 mois, sans donnée personnelle) et `App\Http\Controllers\Public\IcalExportController`
      (`text/calendar; charset=utf-8`, limiteur `throttle:ical-export`).
- [x] Job `SyncPropertyCalendarFeedsJob`, à la fréquence fixée par l'ADR, dans `routes/console.php`,
      avec `withoutOverlapping`. Il passe par un garde-fou HTTP sortant `App\Support\Http\SafeOutboundUrl`
      (SSRF). Il compte les échecs ; au troisième d'affilée, le bailleur est prévenu. Un conflit avec
      une réservation confirmée est marqué, et le bailleur et l'agent sont prévenus.
- [x] Front, côté hôte : sur la fiche d'un bien en location courte durée, la vue calendrier du bien
      (réservations, blocages, importés), le blocage d'une plage, la gestion des flux et la copie du
      lien d'export.
- [x] Front, tunnel public : les nuits occupées sont grisées dans les champs de dates du dialogue de
      réservation, qui affiche une erreur explicite si le serveur refuse quand même.
- [x] Tests :
      - `PropertyUnavailabilityTest` : CRUD, autorisation, refus sur une réservation confirmée ;
      - `BookingAvailabilityTest` (suite du §3A) : demande privée et publique refusées sur des dates
        bloquées ; un blocage qui finit le jour d'arrivée ne bloque pas ;
      - `IcalExportTest` : jeton faux → 404, régénération → l'ancien jeton meurt, aucune donnée
        personnelle dans le corps ;
      - `SyncPropertyCalendarFeedsTest` : import, mise à jour, suppression d'un événement disparu,
        conflit signalé, URL vers `127.0.0.1` / `169.254.169.254` / `10.0.0.0/8` refusées, réponse
        de plus de 1 Mo refusée, avec `Http::fake`.

### 4A. Bail renouvelé sans échéancier (défaut, sans ADR)
- [x] `LeaseRenewalService` : quand l'enfant naît `active`, émettre `GenerateLeasePaymentSchedule`
      pour lui **après validation** de la transaction (`DB::afterCommit` ou job
      `ShouldDispatchAfterCommit`). Un enfant `pending_signature` n'en émet pas : son échéancier vient
      de l'activation (§4B). Ne pas émettre `LeaseActivated` ici (coordination TCK-595).
- [x] Test `LeaseRenewalScheduleTest` : renouvellement de 12 mois en paiement mensuel, réglage
      `lease.require_signature` absent → l'enfant a 12 échéances `pending` au bon montant ; réglage à
      vrai → 0 échéance ; le bail parent garde les siennes.

### 4B. Signature du bail par code (après l'ADR d'O17)
- [x] Migrations `create_lease_signatures_table` (unicité `(lease_id, role, document_sha256)` nommée)
      et `add_contract_signature_columns_to_leases`. Collection privée `signed_contract` dans
      `Lease::registerMediaCollections`.
- [x] `App\Services\Lease\LeaseSignatureService` :
      - `request(Lease, User)` : `draft|pending_signature` → `pending_signature`, PDF figé et haché ;
      - `sendCode(Lease, User)` ;
      - `sign(Lease, User, code, Request)` : vérifie le code, enregistre la preuve et, à la seconde
        signature, active le bail comme `LeaseService::activate`, dans la même transaction, une seule
        fois.
      `App\Services\Lease\LeaseSignatureOtpService` suit le patron `DeletionStepUpService`, avec un
      compteur d'essais en plus.
- [x] `LeaseSignatureController` (`request`, `sendCode`, `sign`), avec `RequestLeaseSignatureRequest`
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
- [x] `LeaseController::activate` suit la décision de l'ADR (**option retenue par défaut** : réservée à
      la « signature hors plateforme », contrat numérisé obligatoire, preuve `method = paper`). Elle
      accepte `pending_signature` : fin de l'impasse du renouvellement. Elle émet toujours
      `GenerateLeasePaymentSchedule` et `LeaseActivated`.
- [x] `DocumentPdfController::leaseContract` sert le PDF figé dès qu'il existe.
- [x] Notifications par clés : « bail à signer » à chaque partie, « bail signé par X » à l'autre,
      « bail actif » à toutes.
- [x] Front : sur le détail du bail, chaque partie voit l'état des signatures, lit le contrat figé,
      reçoit puis saisit son code ; le gestionnaire lance la demande et suit l'attente.
- [x] Tests `LeaseSignatureTest` :
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
- [x] `InventoryController::uploadRoomPhotos` : garde de statut identique à `update` (409 si `signed`,
      422 si non `draft`), placée **avant** l'écriture. `UploadRoomPhotosInventoryRequest` :
      `room_name` ∈ noms de `rooms`.
- [x] `InventoryController::show` charge `room_photos`. `InventoryResource` les expose **seulement
      quand ils sont chargés** (id, URL signée, `room_name`), pas dans `index`.
- [x] Route `DELETE inventories/{inventory}/room-photos/{media}` (`inventories.room-photos.destroy`)
      → `InventoryController::destroyRoomPhoto`, avec autorisation `update`, `draft` seulement, et un
      média qui appartient bien à cet état des lieux et à cette collection (sinon 404).
- [x] Front : chaque zone d'envoi a un identifiant **unique** ; les photos sont **réduites avant
      d'être validées** puis envoyées, avec une limite affichée cohérente avec l'API ; chaque pièce
      montre ses vignettes et permet de supprimer en brouillon.
- [x] Signature : `InventoryController::sign` valide **toujours** par `InventorySignRequest` (`role`
      et `signature` requis) ; la branche sans charge utile et `InventoryService::sign` disparaissent.
      Les trois appels sans corps de `InventoryTest.php:138-164` passent au corps `{role, signature}`.
      Côté front, la mutation de signature n'admet plus d'appel sans tracé, et le commentaire qui
      décrit l'ancien comportement disparaît.
- [x] Nouvelle classe `App\Services\Lease\LandlordSignatory`, le prédicat unique « qui signe pour le
      bailleur », livré ici (PR 1) et réutilisé par §4B :
      - `allows(User $user, Lease $lease): bool` vaut vrai si `$user->id === $lease->landlord_id`, ou
        si `$lease->agency_id !== null`, le signataire est du personnel de cette agence
        (`isAgentAt($lease->agency_id) || isAgencyAdminAt($lease->agency_id)`, commentaire `TCK-587`)
        **et** `$user->can('leases.sign')`. Sinon faux. Le super-admin n'a pas de voie propre, et un
        collaborateur du bien non plus ;
      - `onBehalfOf(User $user, Lease $lease): ?int` rend `null` si le signataire est le bailleur,
        `$lease->landlord_id` sinon.
- [x] `InventorySignatureService::authorizeRole` : `tenant` = le locataire du bail **seulement** (le
      super-admin sort de l.101, le docblock l.18 devient vrai). `landlord` =
      `LandlordSignatory::allows($user, $inventory->lease)`, sinon 403. Le bloc
      `$isOwner || $isAgencyStaff || $isCollaborator || $isAdmin` (l.108-120) disparaît en entier,
      **requête des collaborateurs comprise** (l.110-115). Le docblock l.19-20 est réécrit sur la
      règle des Contraintes strictes. `inventories.lease_id` est non nul
      (`2026_04_17_160022_create_inventories_table.php:13`) : `lease` existe toujours.
- [x] Qui a signé, et pour qui : la migration de l'empreinte (ci-dessous) ajoute aussi
      `owner_signed_by_user_id` et `owner_signed_on_behalf_of_user_id` (FK `users`, nullables,
      `nullOnDelete`). `InventorySignatureService::sign` les pose à la signature `landlord`, par
      `LandlordSignatory::onBehalfOf`. `InventoryResource` expose les deux identifiants. Le PDF
      imprime « Signé par X pour le compte de Y » quand `on_behalf_of` est renseigné (clé
      `inventories.pdf.signed_on_behalf_of`, fr/en/wo).
- [x] `InventoryResource` expose `can_sign_as` (`tenant`/`landlord`, pour l'utilisateur courant, par
      le même prédicat que `authorizeRole`, en `show` seulement). Front : le canevas bailleur s'ouvre
      à qui l'API laisse signer, et à lui seul. Aujourd'hui, `InventoryDetail.tsx:355-362` l'ouvre
      à tout rôle `agent|agency_admin|owner|super_admin`, puis l'API répond 403. Quand le signataire
      n'est pas le bailleur, le canevas dit « pour le compte de <bailleur> ». Le super-admin ne voit
      plus aucun canevas.
- [x] Fixture : `InventorySignatureTest::makeInventory` (l.319-326) passe `lease_id` du bail de
      `scaffoldLease`. Sans cela, la fabrique crée un autre bail (`InventoryFactory.php:22`) dont le
      bailleur n'est pas `$owner`, et `test_property_owner_can_sign_as_landlord` rougirait pour une
      raison de fixture, pas de règle.
- [x] Empreinte : migration `add_signature_traceability_to_inventories` (`traceability_hash`, chaîne
      64, nullable ; plus les deux FK du signataire ci-dessus). À la seconde signature, `InventorySignatureService::sign` y fige un SHA-256 qui couvre
      aussi les photos : pour chaque média `room_photos`, trié par id, `room_name` et le SHA-256 de ses
      octets. Le PDF imprime la colonne quand elle existe, sinon l'ancien calcul (états des lieux signés
      avant ce ticket : empreinte inchangée).
- [x] Tests :
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

### 6. Ajoutés après vérification adverse (verif-596, REFUSÉ : 1 bloquant, 3 majeurs, 4 mineurs)

Chaque case a son commit, un test **rouge sur 06b97854**, et une ablation restaurée par `cp`, md5
contrôlé.

- [x] **B1** — personne ne supprime un `signed_contract` par `DELETE /api/media`, super-admin compris
      (refus dans `MediaController::destroy`, avant `Gate::before`) ; même règle pour `room_photos`
      hors brouillon. `leaseContract` ferme à l'échec (409 `lease_signature.contract_missing`) quand
      le média figé manque ou que ses octets ne rendent plus `contract_sha256` ; `assertAwaiting`
      l'exige aussi. ADR-0042 §1. — `30136cc3`, ablations C-B1.1 à C-B1.4 rouges.
- [x] **M1** — la voie papier exige `LandlordSignatory` (requête **et** service) ; le super-admin n'en
      a pas ; `can_activate_on_paper` guide le front. ADR-0042 §6. — `308695a5`, C-M1.1 et F-M1.1
      rouges.
- [x] **M2** — le contrat imprime pénalité de retard (taux, délai de grâce), `special_conditions`,
      préavis, indemnité de départ anticipé, renouvellement, prix de vente, type ;
      `Lease::CONTRACT_PRINTED_TERMS` / `CONTRACT_UNPRINTED_COLUMNS` partagent `$fillable` ; la vraie
      vue est rendue par les tests ; `PATCH` d'un terme imprimé hors `draft`/`pending_signature` →
      422 `lease.terms_locked`. ADR-0042 §1. — `76e879d9`, C-M2.1 (6 rouges) et C-M2.2 rouges.
- [x] **M3** — `InventorySignatureService::sign` sous verrou de ligne, contrôles sur la ligne relue.
      — `af4997dc`, C-M3.1 rouge.
- [x] **m1** — un renvoi ne remet plus le compteur d'essais à zéro (TTL `LOCK_SECONDS`) ; le faux qui
      verrouille rend 423. ADR-0042 §2. — `d570cd16`, C-m1.1 et C-m1.2 rouges.
- [x] **m2** — `BookingService::cancel` (et `reject`, même défaut) sous verrou de ligne. —
      `a818805e`, C-m2.1 rouge (2).
- [x] **m3** — `SafeOutboundUrl` refuse `::/8` (dont `::ffff:0:0/96` et l'IPv4 traduite) et
      `fe80::/9` (dont `fec0::/10`) ; la première synchronisation part en file
      (`SyncPropertyCalendarFeedJob`), `store` rend 201 avec le flux `pending`, affiché
      « première synchronisation en cours ». ADR-0041 §5, §7. — `52d7acd5`, C-m3.1 (7) et F-m3.1
      rouges.
- [x] **m4** — limiteur `calendar-feed-create`, 10/h par utilisateur. ADR-0041 §5. — `15d3e3de`,
      C-m4.1 et C-m4.2 rouges.
- [x] **Hors diff, bailleur bloqué** — `BookingPolicy::validate` et `cancel` appliquent
      `landlordWrites`. — `01f6805c`, C-BP.1 rouge.
- [x] **Hors diff, échéancier doublé** — « aucune échéance » se juge sous le verrou de `leases`, dans
      la transaction qui écrit ; la tâche passe par `generateScheduleIfMissing`. — `3b5fc9ac`,
      C-SCH.1 rouge (2) ; course réelle à deux processus C-SCH.2 : 40/40 baux doublés sur
      06b97854, 0 après.
- [x] Deux tests de médias que §4B et §5 avaient rougis sans qu'un balayage les voie
      (`MediaDiskCollectionsTest`, `MediaDiskPrivatePhotosTest`, déjà rouges sur 06b97854). —
      `c8b94585`.

### 7. Ajoutés après la passe 2 de vérification adverse (verif-596 passe 2, REFUSÉ : 1 majeur, 3 mineurs)

Chaque test est **rouge sur a3053112**, sauf n1, qui est un manque de test et non un défaut de code :
son test rougit sous l'ablation M1a. Ablations restaurées par `cp`, md5 contrôlé.

- [x] **N1** — `leases.early_termination_penalty_months` et `rent_review_max_pct` sont figés par la
      demande de signature et par la voie papier. On prend la valeur négociée sur le bail, sinon le
      réglage du moment. Elles sont imprimées, et lues par `computePenalty` et `RentReviewService`.
      Elles sont rangées dans les termes imprimés (`lease.terms_locked`). `late_fees.cap_percent`
      n'est pas figé. ADR-0042 §1. — `dcb4f436`. P2-N1.1 (code de a3053112) : 7 rouges ;
      mutations P2-N1.2 à P2-N1.4 : 1 rouge chacune.
- [x] **n1** — agent sans `leases.sign` et sans fichier → 403. — `7b8c4e0f`. Ablation M1a :
      1 rouge.
- [x] **n2** — `Property::hasHostCalendar()` : un bien archivé, vendu, ou qui n'est plus loué à la
      nuit ou à la semaine n'a pas de calendrier d'hôte. L'export rend 404, l'import horaire et
      toute synchronisation sont sans appel sortant, l'enregistrement d'un flux rend 422. Une fois le
      bien désarchivé, l'export et l'import reviennent. ADR-0041 §5. — `66a94a6e`. P2-n2.1 (code de
      a3053112) : 3 rouges ; P2-n2.2 à P2-n2.4 : rouges.
- [ ] **n3** — un garant se rattache encore à un bail actif : hors périmètre, **à ticketer par la
      session**, pas corrigé ici.

### 8. Ajoutés après la passe 3 de vérification adverse (verif-596 passe 3, REFUSÉ : 1 majeur, 2 mineurs)

Chaque test est **rouge sur ef61596f**, sauf les deux gardes de non-régression (parent antérieur,
`force` sur un bail antérieur), vertes avant comme après et rougies par leur ablation. Ablations
restaurées par `cp`, md5 contrôlé, dans un seul script.

- [x] **N1'** — `LeaseRenewalService::renew` recopie `early_termination_penalty_months` et
      `rent_review_max_pct` du parent, comme les autres termes imprimés ; `RenewLeaseRequest` les
      accepte aux bornes d'`UpdateLeaseRequest`. Un parent antérieur (colonnes nulles) donne un
      enfant nul. La lecture « un renouvellement sans signature retombe sur le réglage, comme un bail
      antérieur » était fausse : le parent a une valeur figée et signée. ADR-0042 §1. — `d01cbfe9`.
      P3-N1'.1 et P3-N1'.2 : 2 rouges chacune ; P3-N1'.3 : 1.
- [x] **m-a** — `LeaseController::update` relit la ligne sous `lockForUpdate()` dans une transaction,
      juge `lease.terms_locked` sur elle et écrit sur elle. — `2c964039`. P3-m-a.1 (juger sur
      l'instance liée) : 1 rouge.
- [x] **m-b** — au-dessus d'un plafond de révision **figé**, `force` rend 422
      `lease.rent_review_above_contract_cap`, capacité ou non ; `force` ne vaut plus que pour un bail
      antérieur. Décision de session, option (a), réversible. ADR-0042 §1 tranche le point ouvert. —
      `1d24d363`. P3-m-b.1 et P3-m-b.2 : 1 rouge chacune.

## Critères d'acceptation

- [x] AC1 — Le **locataire de ce bail** voit et ouvre le geste de préavis sur un bail `active`, et
      retire sa demande pendant la fenêtre. Un utilisateur au rôle client qui n'est pas ce locataire
      ne le voit pas. Le test de composant rougit sur le code actuel (le locataire ne voit rien) et
      rougit aussi si le geste s'ouvre à « tout client ».
- [x] AC2 — Annulation par le client : le bailleur **et** l'agent du bien reçoivent une notification,
      le client n'en reçoit pas pour son propre geste. Annulation par l'agent : le client et le
      bailleur sont notifiés, l'agent non. Les destinataires sont vérifiés par identifiant, pas par
      nombre. Le titre reçu par un destinataire de langue `en` est la traduction anglaise de la clé
      `notifications.booking_cancelled.title`, jamais « Réservation annulée ».
- [x] AC3 — Une réservation portant un acompte `paid` qui passe `cancelled`, `rejected` ou `expired`
      (par `ExpireBookings`, par `ExpirePendingBookingsJob` **et** par `expire-now`) produit
      **exactement une** tâche `booking_refund` assignée. Sans acompte payé, aucune tâche.
      Le dernier remboursement clôt la tâche.
- [x] AC4 — `POST booking-payments/{id}/refund` par le **client** de la réservation → 403, et le
      paiement reste `paid`. Le test rougit sur `e3ab4a4e` et redevient rouge si l'on retire la
      correction. Un **autre bailleur de la même agence** (`OwnerProfile`) → 403, le paiement reste
      `paid` (rougit aussi sur `e3ab4a4e`). Le même autre bailleur qui poste
      `POST bookings/{id}/payments` avec `status = paid` → 403 et aucune ligne `booking_payments`
      créée (rougit sur `e3ab4a4e` : 201, paiement `paid`). Un agent sans `bookings.refund` → 403 ; un
      admin d'agence → 200 ; le bailleur direct → 200.
- [x] AC5 — `refund_status` vaut `pending` pour la réservation annulée avec acompte payé et
      `refunded` après remboursement ; le client voit l'état correspondant.
- [x] AC6 — Les deux ADR sont acceptés avant le premier commit de leur sous-partie.
- [x] AC7 — Sans attendre l'ADR (§3A) : une demande, privée **ou publique**, sur des nuits d'une
      réservation déjà confirmée → 422 et aucune ligne `bookings` créée (rougit sur le code actuel :
      201). Un séjour qui arrive le jour du départ d'un autre → accepté à la demande et à la
      confirmation (rougit sur le code actuel, via `confirm`). Après §3B, même refus sur des nuits
      bloquées.
- [x] AC8 — Le flux `/ical/{token}.ics` d'un bien contient ses réservations confirmées et ses
      blocages manuels, ne contient ni nom ni téléphone, et rend 404 avec l'ancien jeton après
      régénération.
- [x] AC9 — Un flux iCal importé crée, met à jour et retire les indisponibilités correspondantes. Une
      URL vers une adresse privée, de bouclage ou de métadonnées est refusée **sans requête sortante**
      (`Http::assertNothingSent`). Un conflit avec une réservation confirmée est signalé, et la
      réservation reste confirmée.
- [x] AC10 — Le bail passe `active` **uniquement** après la seconde signature par code valide.
      L'échéancier est généré une fois. Chaque `LeaseSignature` porte l'empreinte du PDF figé,
      l'horodatage et l'IP. Un code rejoué ou un sixième essai est refusé.
- [x] AC11 — `leases.sign` a un lecteur : un agent de l'agence du bail sans cette capacité ne peut
      pas signer pour le bailleur (403), il le peut avec (200, `on_behalf_of_user_id` renseigné).
- [x] AC12 — Un bail renouvelé en `pending_signature` atteint `active` par le parcours de signature
      (fin de l'impasse).
- [x] AC13 — **Test de composant qui monte deux pièces** : un fichier choisi par la zone de la
      **seconde** pièce active le bouton d'envoi de la seconde pièce, et pas celui de la première.
      Ce test **rougit sur le code actuel** (id fixe), sans recours au glisser-déposer. Les
      `htmlFor` des deux zones sont distincts et désignent chacun l'input de leur propre zone.
- [x] AC14 — Une photo JPEG de 7 Mo est **acceptée** par la zone d'état des lieux et le fichier
      envoyé pèse ≤ 5 Mo. Un fichier non image est refusé avec le message de type. (Un correctif
      qui abaisserait seulement la limite à 5 Mo échoue à cet AC.)
- [x] AC15 — `POST inventories/{id}/room-photos` sur un état des lieux `signed` → 409, sur
      `pending_signature` ou `disputed` → 422, avec une pièce absente de `rooms` → 422. Dans les trois
      cas, le nombre de médias `room_photos` est inchangé (test qui rougit sur `e3ab4a4e`, où les
      trois rendent 200).
- [x] AC16 — `GET inventories/{id}` rend `room_photos` groupés par pièce avec des URL signées ;
      l'agent les voit dans chaque pièce et en supprime une en brouillon (204). La suppression sur un
      état soumis → 422.
- [x] AC17 — `./vendor/bin/pint`, `npx tsc --noEmit`, `npm run lint` propres. Clés fr/en/wo
      présentes pour tout libellé ajouté.
- [x] AC18 — Une demande de réservation publique (séjour **et** offre d'achat) et une demande privée
      notifient le bailleur et le collaborateur accepté `agent` du bien, vérifiés par identifiant ; le
      client n'est pas notifié de sa propre demande. Le test rougit sur `e3ab4a4e` : la demande
      publique n'y notifie personne, la privée oublie l'agent.
- [x] AC19 — Un renouvellement `active` (réglage de signature absent) produit son échéancier : 12
      échéances `pending` pour 12 mois en paiement mensuel, sans clic. Le test rougit sur `e3ab4a4e`
      (0 échéance) et redevient rouge si l'on retire l'émission du job.
- [x] AC20 — `POST inventories/{id}/sign` sans `role` ni `signature` → 422, et `owner_signed`,
      `tenant_signed`, `status` sont inchangés (rougit sur `e3ab4a4e` : 200 et partie marquée signée).
      Un super-admin qui signe `role=tenant` → 403 ; un autre bailleur de la même agence qui signe
      `role=landlord` → 403. Les deux rougissent sur `e3ab4a4e` (200).
- [x] AC21 — L'empreinte figée d'un état des lieux signé change si une seule photo diffère (rougit sur
      `e3ab4a4e`, où les photos n'entrent pas dans le calcul). Celle d'un état des lieux signé avant
      la migration reste la valeur imprimée aujourd'hui.
- [x] AC22 — Une demande `pending` dont `expires_at` est passé, expirée par `ExpireBookings`, porte
      `expired_at` et `expiry_reason = deadline`, et son client reçoit `BookingExpiredNotification`.
      Le test rougit sur `e3ab4a4e` (`expired_at` nul, aucune notification).
- [x] AC23 — **Qui signe pour le bailleur.** Un utilisateur sans profil dans l'agence du bien, ajouté
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

**Ajoutés après vérification adverse (verif-596)** — chacun rouge sur 06b97854 :

- [x] AC24 — `DELETE /api/media/{signed_contract}` → 403 par l'admin d'agence **et** le
      super-admin ; un contrat figé absent → 409 au téléchargement et à la signature ; des octets
      altérés ne sont pas servis (`LeaseSignatureTest`, 3 tests ; `InventoryRoomPhotosTest`, 1).
- [x] AC25 — `agentWithout(LeasesSign)` → 403 sur `activate` et `can_activate_on_paper = false` ;
      le super-admin → 403 (`LeaseSignatureTest`) ; le panneau ne montre pas la voie papier
      (`LeaseSignaturePanel.test.tsx`).
- [x] AC26 — Chaque terme de `CONTRACT_PRINTED_TERMS` change le rendu de la **vraie** vue ; un
      `PATCH` de `late_fee_percent` ou `late_fee_grace_days` sur un bail actif → 422
      `lease.terms_locked`, la valeur ne bouge pas (`LeaseContractTermsTest`, 5 tests).
- [x] AC27 — Deux signatures d'état des lieux par deux instances périmées → `signed`, empreinte de
      64 caractères (`InventorySignatureTest`).
- [x] AC28 — Quatre codes faux, un renvoi, un code faux → 423 (`LeaseSignatureTest`).
- [x] AC29 — Une annulation (et un refus) lue avant une expiration → 422, statut `expired`, un seul
      `BookingClosed` (`BookingCancellationNotificationTest`, 2 tests).
- [x] AC30 — `fec0::1`, `feff::1`, `::ffff:0:7f00:1`, `::ffff:0:a9fe:a9fe`, `::7f00:1` ne sont pas
      publiques (`IcalTest`) ; la création d'un flux rend 201 `pending` sans requête sortante et met
      `SyncPropertyCalendarFeedJob` en file (`SyncPropertyCalendarFeedsTest`).
- [x] AC31 — La 11ᵉ création de flux de l'heure par le même utilisateur → 429, sur un autre de ses
      biens ; un autre bailleur crée encore (`SyncPropertyCalendarFeedsTest`).
- [x] AC32 — Un bailleur bloqué → 403 sur `confirm`, `reject` et `cancel`, la réservation reste
      `pending` ; non bloqué, il garde les trois (`BookingPaymentRefundAuthorizationTest`).
- [x] AC33 — Tâche et route verrouillent la ligne `leases` **avant** de compter les échéances, dans la
      transaction qui les écrit ; deux générations périmées laissent un seul échéancier
      (`GenerateLeasePaymentScheduleTest`, 3 tests) ; course réelle à deux processus : 0 doublé
      (40/40 sur 06b97854).

**Ajoutés après la passe 2 (verif-596 passe 2) :**

- [x] AC34 — Le réglage d'indemnité passe de 2 à 6 après la signature : `computePenalty` rend
      toujours 2 mois, ceux que le contrat figé imprime. Le plafond de révision est figé à 20 %
      puis relevé à 50 % : une hausse de 30 % est refusée. La voie papier fige aussi. Une valeur
      négociée en brouillon est celle qui est figée. Un `PATCH` sur un bail actif → 422
      `lease.terms_locked` (`LeaseContractTermsTest`, 5 tests).
- [x] AC35 — `POST leases/{id}/activate` sans fichier, par un agent sans `leases.sign` → 403, sans
      `errors` (`LeaseSignatureTest`).
- [x] AC36 — Un bien archivé par `PropertyPublication` : export 404, import horaire et première
      synchronisation sans requête sortante, « synchroniser maintenant » et un nouveau flux → 422
      `calendar_feed.property_closed`. Désarchivé : export 200, import repris. Un bien passé au
      mois : export 404, import arrêté (`SyncPropertyCalendarFeedsTest`, 3 tests).

**Ajoutés après la passe 3 (verif-596 passe 3) :**

- [x] AC37 — Un parent signé à 1 mois et 5 %, renouvelé sans signature, réglage d'indemnité passé à
      6 : l'enfant `active` porte `[1, 5]`, `computePenalty` rend 1 mois, une révision de +15 % est
      refusée. Un enfant `pending_signature` hérite et imprime « 1 mois » et « Variation de 5 % » à
      sa demande de signature. Le corps du renouvellement renégocie dans les bornes (13 mois, 101 %
      → 422). Un parent antérieur donne un enfant nul (`LeaseContractTermsTest`, 4 tests).
- [x] AC38 — Une activation validée entre la liaison de route et le contrôle : le `PATCH` rend 422
      `lease.terms_locked`, `contract_sha256` et les termes restent intacts
      (`LeaseContractTermsTest::test_a_patch_racing_an_activation_is_judged_on_the_locked_row`).
- [x] AC39 — Super-admin, `force`, bail figé à 10 % (réglage relevé à 50 %), +30 % → 422
      `lease.rent_review_above_contract_cap`, loyer inchangé ; +10 % passe. Sur un bail antérieur,
      `force` dépasse encore le réglage (`LeaseContractTermsTest`, 2 tests).

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

Branche `feat/tck-596-cycle-locatif`, partie d'`origin/dev` acf58a66 (586, 587, 588 fusionnés).
Livrée en **une seule PR** (décision de la session, 2026-10-07), dans l'ordre du ticket.

**§1 — préavis du locataire.** Re-mesuré : `LeaseDetail.tsx:88-92` tel que décrit ; `LeaseController::show`
charge toujours `tenant` (l.66), donc `tenant.user_id` est dans la charge sans changer `useLease`.
Le geste s'ouvre à `canRefundDeposit || isLeaseTenant` (gestionnaire inchangé), libellé
« Donner mon préavis » côté locataire (`lease.early_termination.cta_tenant`, fr/en/wo).
Preuve : `npx vitest run src/components/leases/__tests__/LeaseDetail.preavis.test.tsx` → 5/5.
Ablations (restaurées par `cp`) : code d'origine → 2 rouges (locataire : geste, bannière) ;
« tout client » (`roles.includes('customer')`) → 2 rouges (client tiers, bail sans compte).

**§5 — état des lieux, API.** Re-mesuré sur acf58a66 : `authorizeRole` porte déjà la clause « personnel »
de 587 (`staffAgencyId()`), donc l'« autre bailleur de la même agence » est **déjà** refusé sur `dev`
(il passait sur e3ab4a4e) ; super-admin, collaborateurs de tout rôle et agent sans `leases.sign`
passaient encore. `LandlordSignatory` juge `leases.sign` par `canActAt(…, agence du bail)` et non par
`$user->can()` (sinon `Gate::before` rouvre la voie du super-admin). **Ajout** : un bailleur suspendu
dans l'agence du bail perd la signature (règle `landlordWrites` d'ADR-0031 §2, que la vérification
adverse cherche) ; il reste lecteur. `tenant` = locataire **du bail** (`lease.tenant`), plus
`inventory.tenant_id`. `room_photos` sort groupé dans l'ordre des pièces (`[{room_name, photos:[{id,url,room_name}]}]`),
`show` seulement ; `can_sign_as` aussi (`InventoryResource::forViewer`). Empreinte : SHA-256 complet figé
à la 2ᵉ signature, matière = ancienne matière + signataire bailleur + photos (id trié, `room_name`, SHA-256
des octets lus par le disque) ; `legacyTraceabilityHash()` inchangé, valeur figée `d5ea363043d795f2`
calculée par la formule d'e3ab4a4e hors du code testé.
Preuve : `php artisan test tests/Feature/Api/InventorySignatureTest.php tests/Feature/Api/InventoryTest.php
tests/Feature/Api/InventoryRoomPhotosTest.php tests/Feature/Api/InventoryTraceabilityHashTest.php
tests/Unit/Services/LandlordSignatoryTest.php` → 76 verts ; + 16 classes voisines (capacités, validation,
médias, ressources…) → 311 verts. Ablations rejouées (restaurées par `cp`, journal `scratchpad/t596/ablations.log`) :
A5.1 `authorizeRole` d'acf58a66 → 8 rouges ; A5.2 requête des collaborateurs seule → 4 ; A5.3 appel sans corps
→ 2 ; A5.4 upload sans garde → 3 ; A5.5 `room_name` libre → 1 ; A5.6 suppression sans filtre de collection
→ 1 ; A5.7 suppression sans garde → 3 ; A5.8 photos hors empreinte → 1 ; A5.9 colonne ignorée → 1 ;
A5.10 clause `users.agency_id` d'e3ab4a4e → 4. `leases.sign` sort de `CapabilityEnforcementInventory`, cliquet 16 → 15.

**§5 — état des lieux, front.** `MediaDropzone` et `MediaManager` prennent un `useId()` par instance.
La zone réduit **avant** de valider, et jusque sous le plafond : `reduirePhotoSousPlafond` (nouvelle,
`lib/reduire-photo.ts`) rétrécit les dimensions d'un ratio tiré du poids, 4 essais au plus, format
inchangé — sans elle, une photo de 7 Mo déjà sous 2 560 px partait intacte et l'API la refusait.
Plafond affiché et appliqué : 5 Mo (`INVENTORY_PHOTO_MAX_BYTES`, = `max:5120` de l'API). Les vignettes
viennent de `room_photos` (URL signées), supprimables en brouillon. Le canevas s'ouvre par
`can_sign_as` ; l'API ajoute `sign_on_behalf_of` (`{id, full_name}` du bailleur) pour le libellé
« Pour le compte de … ». `useSignInventory` n'admet plus d'appel sans `{role, signature}`.
Preuve : `npx vitest run src/components/inventory src/components/media src/components/property-form src/lib/__tests__`
→ 981 verts (dont `InventoryDetail.pieces.test.tsx`, 7). Ablations (restaurées par `cp`) : F5.1 id fixe →
2 rouges (AC13) ; F5.2 réduction sans plafond → 1 (AC14) ; F5.3 valider avant de réduire → 1 (AC14) ;
F5.4 canevas deviné par les rôles → 1. Les tests jsdom doublent `createImageBitmap`/`OffscreenCanvas`
(poids proportionnel aux pixels) ; **non mesuré au navigateur réel** à ce stade.

**§2 — demande, annulation, remboursement.** Re-mesuré sur acf58a66 : `canManageBooking` porte déjà
`staffAgencyId()` (587) — l'« autre bailleur » ne passait plus `authorize` de `store` ni de `refund`,
mais le **client** remboursait toujours son acompte, l'agent remboursait sans `bookings.refund`, et
`staffAgencyId()` lit l'accesseur `users.agency_id` (une seule agence). Règle unique dans
`App\Services\Booking\BookingMoneyAccess` : bailleur direct (sauf suspendu dans l'agence, ADR-0031 §2),
personnel de l'agence **de la réservation** (`isStaffAt`), super-admin ; rembourser exige en plus
`canActAt(bookings.refund, agence de la réservation)` (pas `$user->can()` : `Gate::before`).
`bookings.refund` sort de l'inventaire, cliquet 15 → 14 (594 le baisse aussi : conflit attendu sur
la constante, prendre la plus basse).
Destinataires : `BookingStakeholders::for()` ; un collaborateur d'un bien d'agence n'est retenu que
s'il est **encore** personnel actif (un agent suspendu garde sa ligne de collaboration). Codes : le
corps de `booking.cancelled` devient neutre (« La réservation … a été annulée », il part désormais au
bailleur et à l'agent) ; nouveau code `booking.requested_undated` pour l'offre d'achat et la demande
privée sans dates (sinon « du  au  »). Expiration : `BookingExpirationService::expire()` est la voie
unique (verrou de ligne, relecture, `BookingClosed`) ; `ExpireBookings::handle()` garde sa signature
sans argument. Tâche : titre `__('bookings.refund_task.title')`, `metadata.booking_payment_ids`,
sérialisée sur la ligne de la réservation. **Ajouts** : `refund()` verrouille la ligne du paiement
(deux remboursements concurrents) et refuse un montant à décimales en XOF
(`booking_payment.refund_fractional`) ; `show` charge `payments` et rend `booking_payments` — le front
les attendait et ne les recevait jamais (liste « aucun paiement » permanente) — plus `can_refund`.
Front : `BookingRefundPanel`, bloc distinct du reçu de 593, monté seulement si `refund_status`.
Preuve : 5 classes neuves (36 tests) + 59 classes voisines → 697 verts, 2 ignorés ;
`BookingDetail.remboursement.test.tsx` 5/5. Ablations (restaurées par `cp`) : A2.1 → 2 rouges,
A2.2 → 1, A2.3 → 1, A2.4 → 1, A2.5 → 1, A2.6 → 2, A2.7 → 5, A2.8 → 1, A2.9 → 3, A2.10 → 2,
A2.11 → 1, A2.12 → 1, A2.13 → 1, A2.14 → 2, A2.15 → 1, A2.16 → 1 (après ajout du test « agent d'une
autre agence » : la première passe l'avait laissée verte), A2.17 → 1, A2.18 → 1, A2.19 → 1, A2.20 → 1 ;
F2.1 → 4, F2.2 → 1, F2.3 → 1, F2.4 → 1.

**§3A — chevauchement.** Re-mesuré : `assertNoOverlap` en bornes fermées (`<=`/`>=`), appelé par `confirm`
seul. `PropertyAvailabilityService::assertAvailable` (semi-ouvert, réservations `confirmed`) est appelé
par `create`, `confirm` et la demande publique datée, **chacun sous le verrou de la ligne `properties`**
(la demande prend le même verrou que `confirm`). **Ajout** : `confirm` verrouille aussi la ligne de la
réservation, que `expire()` verrouille — une confirmation relue avant qu'une expiration ne valide
écrasait `expired` par `confirmed` (non éprouvé par un test : course entre deux connexions).
Preuve : `BookingAvailabilityTest` 7/7 + 4 classes voisines → 39 verts. Ablations (restaurées par
`cp`) : A3.1 bornes fermées (le code d'origine) → 2 rouges ; A3.2 `create` sans vérification → 1 ;
A3.3 demande publique sans vérification → 2 ; A3.4 statut ignoré → 2 ; A3.5 `confirm` sans
vérification → 1.

**§4A — renouvellement sans échéancier.** Re-mesuré : `LeaseRenewalService::renew` n'émet ni job ni
`LeaseActivated`. L'enfant `active` émet `GenerateLeasePaymentSchedule` en `afterCommit()` ; un enfant
`pending_signature` n'émet rien. Pas de `LeaseActivated` (595). Preuve : `LeaseRenewalScheduleTest`
2/2 (12 échéances `pending` à 250 000, du 2026-11-01 au 2027-10-01 ; parent inchangé ; 0 avec
`lease.require_signature`) + `LeaseRenewalServiceTest`, `LeaseRenewalEndpointTest` → 16 verts.
Ablations : A4.1 sans émission (le code d'origine) → 1 rouge ; A4.2 émission sans condition de
statut → 1 rouge. ⚠ Incident : une commande de vérification a, par un motif de fichiers vide, lancé
`php artisan test` sans argument (suite entière) ; arrêtée à la main après ~7 min, aucun résultat
exploité.

**§3B — indisponibilités et iCal (ADR-0041, commité avant le code).** Deux tables, `[starts_on, ends_on)`
comme les réservations ; `assertAvailable` refuse aussi une nuit bloquée (`booking.dates_unavailable`),
sous le même verrou de la ligne du bien, à la demande privée, publique et à la confirmation.
Autorisation : les trois FormRequest et la `PropertyUnavailabilityPolicy` lisent `PropertyPolicy::update`
(non modifiée) — donc **un agent sans `properties.update_any` ne gère pas le calendrier**, un
administrateur d'agence oui, un bailleur suspendu non. Export : jeton 256 bits haché SHA-256, URL
rendue une fois, route `GET /ical/{token}.ics` **hors du groupe `web`** (`withoutMiddleware('web')` :
sans session, une 404 rendue sous `web` exigeait le magasin de session), limiteur `ical-export`
30/min/IP. Import : `SafeOutboundUrl` (résolution, toutes les adresses globales, épinglage
`CURLOPT_RESOLVE`, pas de redirection, 10 s, 1 Mo), un UID répété ne garde que sa première
occurrence (sinon violation d'unicité dans la transaction), événements passés ignorés, 2 000 au
plus, 10 flux par bien. **Mesuré pendant l'ablation** : PHP refuse déjà `::ffff:0:0/96`
(`NO_RES_RANGE`) — la branche « IPv4 mappée » était morte (B3.22 survivait) ; elle est remplacée par
le refus des préfixes NAT64 `64:ff9b::/96`, que PHP juge **globaux** (`64:ff9b::a9fe:a9fe` atteint
`169.254.169.254` sur un réseau NAT64). L'ADR est amendé d'une ligne en ce sens.
Front : onglet « Calendrier » de la fiche (location `daily`/`weekly` seulement) — vue mois
(réservé / bloqué / importé), blocage, déblocage des seuls blocages manuels, conflit signalé, flux
(ajout, état, synchroniser, retirer, jamais l'URL), lien d'export (généré, montré une fois, copié).
Tunnel public : `DatePicker` reçoit `isDateDisabled`, l'arrivée grise les nuits prises, le départ
grise ce qui franchirait une nuit prise ; le refus du serveur s'affiche (`role="alert"`).
`check-status-badge-unique` : la table de teintes des cases est déclarée (vocabulaire d'origine, pas
de statut). Preuve : `PropertyUnavailabilityTest` 10, `BookingAvailabilityTest` 11, `IcalExportTest` 5,
`SyncPropertyCalendarFeedsTest` 27, `IcalTest` 23 ; balayage de 63 classes voisines → 609 verts.
Front : `occupancy.test.ts` 4, `PropertyReservationDialog.nuits-prises` 5, `PropertyCalendarPanel` 6 ;
101 fichiers voisins → 1 098 verts ; `tsc`, ESLint propres. Ablations (restaurées par `cp`) :
B3.1 → 3 rouges, B3.2 → 1, B3.3 → 1, B3.4 → 1, B3.5 → 2, B3.6 → 2, B3.7 → 1, B3.8 → 1, B3.9 → 3,
B3.10 → 2, B3.11 → 1, B3.12 → 1, B3.13 → 1, B3.20 → 8, B3.21 → 1, B3.22 survivante (voir plus haut),
B3.22bis → 3, B3.23 → 1, B3.24 → 1, B3.25 → 1, B3.26 → 1, B3.27 → 1, B3.28 → 1, B3.29 → 1,
B3.30 → 1, B3.31 → 1, B3.32 → 1, B3.33 → 1, B3.34 → 1, B3.35 → 1, B3.36 → 1, B3.37 → 1, B3.38 → 1 ;
F3.1 → 2, F3.2 → 2, F3.3 → 1, F3.4 → 1, F3.5 → 3, F3.6 → 1, F3.7 → 1, F3.8 → 1, F3.9 → 1,
F3.10 → 1, F3.11 → 1. **Non mesuré au navigateur réel** ; la garde SSRF n'a pas été éprouvée contre un
vrai serveur (tests par `Http::fake` et résolveur DNS substitué). Au passage, `NoLegacyUserTypeTest`
rougissait sur deux commentaires de §2/§5 (commit `fix(api)` séparé) — mes balayages précédents ne
l'incluaient pas.

**§4B — signature du bail par code** (ADR-0042, commité avant le code). Re-mesuré : `activate`
posait `active` sur la seule autorité d'`update`, sans preuve ; un renouvellement `pending_signature`
n'avait aucun chemin vers `active` ; le PDF du contrat était rendu à chaque téléchargement, pied de
page daté, donc **sans empreinte stable**. Livré : `signature-request` rend le PDF une fois, le range
dans la collection privée `signed_contract`, pose `contract_sha256` ; `GET leases/{id}/contract/pdf`
sert ce fichier octet pour octet dès qu'il existe. Code 6 chiffres, 10 min, lié au bail, au
signataire, au rôle **et** à l'empreinte ; renvoi à 60 s ; 5 faux → code détruit, verrou 15 min ;
consommé au succès. Limiteur de route `lease-signature-code` 3/min + 10/h (**deux clés distinctes** :
deux `Limit` de même clé partagent un compteur — patron repris d'`account-deletion-step-up`).
Défigement : une garde **sur le modèle** (`Lease::booted`, `updating`) remet `contract_sha256` à `null`
dès qu'une colonne hors `CONTRACT_NEUTRAL_COLUMNS` bouge pendant l'attente, quel que soit l'appelant ;
garant attaché ou détaché → `unfreezeContract()`. L'activation à la seconde signature se fait dans la
transaction, sous le verrou de la ligne relue (`LeaseService::completeActivation`, échéancier
`afterCommit`). `activate` = voie papier : scan obligatoire (pdf/jpg/png, 10 Mo), `authorize`
**avant** la validation (un tiers reçoit 403, pas la liste des champs), preuve `paper` par rôle avec
`recorded_by_id`, accepte `draft` et `pending_signature`.
Écarts au texte du ticket, assumés : (1) la mention « pour le compte de » est sur la **preuve** et à
l'écran, **pas** dans le PDF — l'écrire changerait l'empreinte que les deux parties ont signée
(ADR-0042 §4) ; (2) pas de `RequestLeaseSignatureRequest` : la demande n'a pas de corps,
l'autorisation `requestSignature` est dans le contrôleur ; (3) `code_locked` rend **423**, pas 429 —
mesuré dans `src/lib/api.ts` (`codeErreur`) : tout 429 est affiché par le front comme le générique
« trop de tentatives », la durée du verrou que dit l'API serait perdue ; `resend_too_soon` reste 429 ;
(4) le bailleur est notifié quand le personnel signe **pour son compte** (il apprend qu'on l'a
engagé) ; (5) `MobileClassEventsTest` (TCK-588) exigeait une case de préférences pour toute classe
SMS : le code de signature est **hors préférences** (critique, demandé par son destinataire) — liste
fermée `HORS_PREFERENCES` dans le test, plus un test qui exige sa criticité. Le canal SMS réel le borne
toujours à 5/h (testé sans le faux `Notification`). `promesses-de-delai.test.ts` (TCK-575) : les deux
libellés « valable 10 minutes » sont inscrits au registre avec `LeaseSignatureOtpService.php:24`.
Front : panneau « Signature du bail » sur le détail (draft/pending seulement) — état par rôle (seules
les preuves `current` comptent), lien vers le contrat figé, « Recevoir mon code » pour les seuls rôles
de `can_sign_as`, saisie 6 chiffres, refus de l'API affiché (`role="alert"`) ; le gestionnaire
(`can_request_signature`) demande / refige et active sur contrat papier (`useActivateLease` en
multipart). L'ancien bouton « Activer le bail » est retiré.
Preuve : `LeaseSignatureTest` 37 verts (+ `LeaseTest` 8, `MobileClassEventsTest` 2) ; balayage de 27
classes voisines (Lease*, Tenant*, Inventory*, Renewal*, DocumentPdf*, RoleAccess,
OwnerIsolationWithinAgency, PrivateMediaAccess, NoLegacyUserType, ProseLitteraleInterdite…) → 313
verts ; 24 classes de notifications/lang → 151 verts. Front : `LeaseSignaturePanel` 7,
`LeaseDetail.preavis` 7 ; 15 fichiers voisins → 91 verts ; 80 fichiers lisant les dictionnaires →
813 verts ; `tsc`, ESLint propres ; toutes les gardes racine vertes. Ablations (restaurées par `cp`) :
B4.1 → 1 rouge, B4.2 → 1, B4.3 → 1, B4.4 → 1, B4.5 → 2, B4.6 → 1, B4.6b → 1, B4.7 → 1, B4.8 → 1,
B4.9 → 1, B4.10 → 1, B4.11 → 1, B4.12 → 1, B4.13 → 1, B4.14 → 1, B4.15 → 1, B4.16 → 1, B4.17 → 1,
B4.18 → 1, B4.19 → 1, B4.20 → 1, B4.21 → 1, B4.22 → 1, B4.23 → 1, B4.24 → 1 ; F4.1 → 1, F4.2 → 1,
F4.3 → 3, F4.4 → 1, F4.5 → 1, F4.6 → 1, F4.7 → 1, F4.8 → 2, F4.9 → 1, F4.10 → 1. **Non éprouvé** :
deux secondes signatures concurrentes (le verrou de ligne est en place, aucun test ne les fait
courir) ; un vrai envoi SMS ; le rendu au navigateur réel.

**Corrections après vérification adverse (2026-10-08).** Voir §6 et AC24-AC33. Lectures assumées :
(1) M2 « figé » : un `PATCH` d'un terme imprimé reste permis en `draft` et `pending_signature`, où il
défige le contrat comme avant ; il est refusé en `active` et au-delà. (2) **Non verrouillé, noté** :
rattacher ou détacher un garant sur un bail actif — le garant est imprimé au contrat. (3) La
résolution DNS de l'enregistrement d'un flux reste dans la requête (c'est elle qui rend le refus
immédiat, 422) ; l'appel sortant, lui, est parti en file (ADR-0041 §7). (4) `reject` avait le même
défaut que `cancel` : fermé dans le même commit. (5) Pour la course d'échéancier, un test sur une
connexion ne peut pas faire courir deux transactions : le test lit l'ordre et la profondeur de
transaction des requêtes ; la preuve de comportement est une course réelle à deux processus, hors
suite (base jetable, supprimée).

**Passe 2 (2026-10-08).** Voir §7 et AC34-AC36. Ce qui reste ouvert :

1. n3, le garant sur un bail actif, à ticketer par la session.
2. La dérogation `leases.rent_review_force` permet encore de dépasser le plafond de révision
   imprimé (ADR-0042 §1, point ouvert).
3. La session demandait d'écrire la lecture « `late_fees.cap_percent` n'est pas figé » dans
   ADR-0041. Elle est écrite dans **ADR-0042 §1**, l'ADR du contrat ; ADR-0041 porte le
   calendrier iCal.

Fusion d'`origin/dev` avec 590 (`2f843f56`) : un seul conflit, sur les imports de
`PublicPropertyController`, les deux côtés gardés.

