---
id: TCK-597
title: "Avis et signalements : un admin d'agence modère les avis de toutes les agences, un signalement tranché laisse l'annonce en ligne, et ni un agent ni un prestataire ne peuvent être notés"
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
    - docs/features.md#111-avis--réputation
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#11-review
    - docs/models-spec.md#68-propertyreport-
    - docs/models-spec.md#3-property
    - docs/models-spec.md#37-serviceproviderprofile-
tags: [back, front, securite, cloisonnement, avis, moderation, signalement, prestataire, doublons, adr-requise]
---

## Objectif utilisateur

- **Admin d'agence** : il modère les avis des biens et des agents de son agence, et seulement ceux-là.
- **Super-admin** : quand il donne raison à un signalement, l'annonce quitte vraiment le site et n'y
  revient pas sans son accord. Deux modérateurs ne peuvent pas trancher le même élément en même temps.
- **Agent** : il voit les avis reçus sur ses biens et sur lui-même, il est prévenu d'un nouvel avis
  et il répond depuis sa console.
- **Client** : il peut noter l'agent qui l'a accompagné et l'agence qui gère son bail.
- **Agence et locataire** : ils notent le prestataire après une intervention terminée.
- **Visiteur** : il signale une annonce ou un avis sans créer de compte.

## Contexte

Ce ticket vient de l'analyse par acteur du 2026-10-06 (vague 73). Il couvre les points AD1, A15,
C18, P20, V12, S1, S18 et S20. Chaque constat ci-dessous a été **re-mesuré** sur `e3ab4a4e`.

### 1. Cloisonnement de la modération des avis (AD1, faille)

- `ReviewController::index` (`takussan-api/app/Http/Controllers/Api/ReviewController.php:42-45`)
  ouvre la file à tout admin de **sa propre** agence (`isAgencyAdminAt($user->agency_id)`). La requête
  (l.47) n'a ensuite **aucun filtre d'agence**, et `pending_count` (l.103-105) compte les avis de
  toute la plateforme.
- `approve` (l.269), `reject` (l.278), `reports` (l.149) et `ModerateReviewRequest::authorize()`
  (`app/Http/Requests/Api/ModerateReviewRequest.php:30-36`) répètent la même expression. Aucun ne
  compare l'agence de l'avis à celle de l'acteur, et `ReviewModerationService` ne vérifie que la
  transition (`app/Services/Review/ReviewModerationService.php:99-107`). **Un admin de l'agence A
  approuve, masque ou supprime donc les avis de l'agence B.** `reports()` lui rend en plus l'e-mail
  des signalants de B (l.158-162).
- `reply` et `deleteReply` (`ReplyReviewRequest.php:34-36`, `ReviewController.php:222-225`)
  acceptent **n'importe quel membre** dont le profil actif est dans l'agence du bien, bailleur
  compris.
- Aucun test ne l'a vu. Dans `tests/Feature/Api/ReviewModerationQueueTest.php:17-24`, l'« admin »
  est matérialisé `super_admin`, et aucun test ne fait intervenir un `agency_admin`.
- Il n'existe pas de `ReviewPolicy`. Le docblock de `ModerateReviewRequest.php:25-28` attend qu'un
  ticket de suite de TCK-306 en crée une.
- Côté front, `/admin/moderation` est réservé au super-admin
  (`takussan-web/src/app/(dashboard)/admin/moderation/page.tsx:14`). L'admin d'agence n'a aucun
  écran pour modérer les avis de son agence.

### 2. Un signalement tranché n'agit pas sur l'annonce (S1)

- `UnifiedModerationService::decidePropertyReport` (`app/Services/Admin/UnifiedModerationService.php:291-296`)
  appelle `PropertyModerationService::resolveReport` (`app/Services/Property/PropertyModerationService.php:127-145`),
  qui **ne fait que** poser `resolved_at` et écrire une ligne d'activité. Que la décision soit
  `hide` ou `remove`, l'annonce reste publiée et indexée. Pour un bien en attente, `decideProperty`
  (l.282-289) traite `hide` et `remove` comme un `reject`.
- `resolveReport` ne clôt qu'**un** signalement. Les autres signalements ouverts sur le même bien
  restent dans la file, un par ligne (union l.114-128).
- Le test existant (`tests/Feature/Api/Admin/ModerationQueueTest.php:141-174`) ne vérifie que
  `$report->resolved_at` (l.173). C'est ainsi que le défaut est passé.
- **Masquer par le seul statut ne tiendrait pas**, pour trois raisons. `publish`
  (`PropertyController.php:162-179`) ne refuse que `sold`/`rented`. `updateStatus` (l.200-223)
  accepte n'importe quel statut (`UpdateStatusPropertyRequest.php:38`). Enfin, l'admin d'agence
  approuve lui-même les `pending_review` de son agence (`PropertyModerationController.php:31-46`,
  `:69-71`). `PropertyObserver` n'intervient qu'à `creating` (`app/Observers/PropertyObserver.php:12-34`).
- Le signalant n'est jamais prévenu. Il n'est d'ailleurs jamais identifié : voir §3.

### 3. Signaler sans compte (V12)

- L'API accepte le signalement anonyme d'une annonce. La route `public/properties/{slug}/report` n'a
  pas d'`auth` (`routes/api/public.php:132-134`), le contrôleur enregistre `reporter_ip`
  (`PublicPropertyController.php:575-594`), et le limiteur `public-report` autorise 5 signalements
  par heure (`AppServiceProvider.php:313`). models-spec §68 décrit bien un signalement « par un
  visiteur ou un utilisateur connecté ».
- Le front impose pourtant une connexion (`PropertyReportButton.tsx:49-55`, boîte l.85-103).
  ⚠ **Cette barrière a été posée par TCK-124 (done), sur une prémisse fausse.** Ce ticket affirmait
  que l'endpoint était protégé par Sanctum, et il citait §1.11 « Signaler un avis » pour une
  **annonce**. La retirer n'est donc pas une régression.
- `submitPropertyReport` (`takussan-web/src/app/actions/property.ts:45-58`) n'envoie jamais le
  jeton (`lib/api.ts:503-504`). Même connecté, l'auteur n'est pas rattaché : `reporter_user_id`
  reste `null`.
- Pour signaler un avis, il faut `auth:sanctum` (`routes/api/properties.php:16,83`), alors que la
  spec ouvre ce geste au visiteur 👤 (§1.11). De plus, `PropertyReviews.tsx:209` ne lit pas le
  `report` que le hook expose (`usePropertyReviews.ts:46-49`) : la fiche publique n'a **aucun**
  bouton pour signaler un avis.
- `ReviewController::report` dédoublonne par `user_id` seulement (l.329-334). Le seuil vaut 1 par
  défaut : `takussan.reviews.report_threshold` (l.351) n'existe dans aucun fichier de `config/`.

### 4. Boîte des avis de l'agent, et notification (A15)

- La boîte « avis reçus » est réservée au propriétaire (`ProfileReviewsList.tsx:91`, `isOwner`).
  Elle charge jusqu'à 100 biens (`lib/queries/reviews.ts:46-67`), puis envoie **une requête par
  bien** (l.84-99), et filtre côté client (`ProfileReviewsList.tsx:284-289`), contre la règle des
  sparse fieldsets. On y répond par `window.prompt` (l.359, l.370).
- `indexForProperty` (`ReviewController.php:176-187`) ne rend que les avis approuvés : un avis en
  attente n'apparaît jamais dans la boîte.
- `ReviewObserver.php:11-19` ne notifie personne, et ne recompte qu'à la création et à la
  suppression. Ce recompte inclut les avis en attente et refusés (l.33-35), alors que
  `AgencyResource.php:28` lit cette moyenne stockée.

### 5. Noter un agent, une agence, un prestataire (C18, P20)

- La spec prévoit « Laisser un avis sur un bien, un agent ou une agence » (§1.11). Pourtant, aucune
  route ne crée un avis sur un agent : seules existent `storeForProperty` (l.189) et
  `storeForAgency` (l.298). La fiche publique de l'agent lit et affiche ces avis
  (`PublicAgentController.php:246-249`, `agents/[slug]/page.tsx:277-281`), mais la section ne peut
  jamais se remplir.
- `POST agencies/{agency}/reviews` (`routes/api/agencies.php:52`) n'a **aucun appelant** côté
  front. Les « opportunités d'avis » du profil ne proposent que des biens, assemblés côté client
  depuis les réservations et les baux (`ProfileReviewsList.tsx:142-161`).
- On ne peut noter ni un prestataire ni une intervention. `Review::reviewable` ne vise que bien,
  agence et user (models-spec §11), et `ServiceProviderProfile` n'a aucune donnée de réputation
  (`app/Models/Profiles/ServiceProviderProfile.php:24-30`). Noter le prestataire comme `User`
  mélangerait sa note avec celle d'une fiche agent (`PublicAgentController.php:246-249`).

### 6. Doublons et fraude (S18)

- Une recherche de `phash|perceptual|imagehash` ne trouve rien. La seule duplication existante est
  la duplication **volontaire** d'un bien par son agence (TCK-074, `PropertyPolicy.php:12,123`),
  qui produit des doublons légitimes.
- La file `media` et son service `worker-media` existent déjà
  (`deploy/takussan/compose.api.yml:59-61`, `app/Jobs/Media/*`), et `intervention/image` aussi
  (`composer.json:12`). **Aucun nouveau worker n'est nécessaire.** Les conversions publiques sont
  filigranées **par agence** (`Property.php:577-586`, TCK-539) : une empreinte calculée sur une
  conversion distinguerait deux copies de la même photo.
- « Détection automatique d'avis suspects » est spécifiée (§1.11, P3) et absente du code.

### 7. File de modération : concurrence et motifs (S20)

- `UnifiedModerationService::decide` (l.65-95) ne verrouille rien et ne vérifie pas que l'élément
  est encore ouvert. Un `property_report` déjà résolu peut être tranché une seconde fois (l.71).
- Le motif est un texte libre obligatoire (`DecideModerationQueueRequest.php:32-33`). Le panneau
  propose les mêmes quatre décisions quel que soit le type d'élément (`moderation.tsx:293-298`).

## Contrat de données

Sans recopier la spec, voici ce qui change.

- **`reviews`** : `agency_id` (périmètre de modération, figé à la création) ;
  `context_type`/`context_id` (ce qui a rendu l'avis éligible : réservation, bail, visite,
  intervention) ; `ServiceProviderProfile` devient une cible du `morphTo`.
- **`property_reports`** : `decision`, `resolved_by_id`, `reason_code`.
- **`properties`** : `platform_hold_at`, `platform_hold_by_id`, `platform_hold_reason`. C'est le
  verrou que seule la plateforme lève.
- **File unifiée** : nouveau `source_type = suspected_duplicate` (§6). Les items `review` portent un
  drapeau `suspicious` (§6).
- **Endpoints neufs** :
  - `GET /api/reviews/received`
  - `GET /api/me/review-opportunities`
  - `POST /api/agents/{user}/reviews`
  - `POST /api/service-providers/{serviceProviderProfile}/reviews`
  - `POST /api/public/reviews/{review}/report`
  - `POST|DELETE /api/admin/moderation/{id}/claim`
  - `POST /api/admin/moderation/decide-batch`
- **Endpoints existants consommés par le front** : `POST /api/agencies/{agency}/reviews`,
  `POST /api/public/properties/{slug}/report` (désormais avec jeton si connecté),
  `PATCH /api/reviews/{review}/moderate`, `GET /api/reviews`.

## Direction UX / Artistique

- **Signaler** reste un geste discret mais disponible sans compte, partout où une annonce ou un avis
  public s'affiche. On ne demande ni connexion ni e-mail. Le motif « arnaque » est en tête.
- **La confirmation dit la vérité.** Elle annonce « Merci, nous allons examiner », jamais « Annonce
  retirée ». Un visiteur connecté apprend qu'il sera prévenu de l'issue.
- **Boîte des avis reçus** (agent, bailleur, admin d'agence) :
  - les filtres (bien, répondu ou non, statut) sont appliqués par le serveur ;
  - un avis en attente est visible et marqué comme tel ;
  - la réponse se rédige dans un vrai champ, sans boîte de dialogue du navigateur, et reste lisible
    au clavier et au lecteur d'écran.
- **Modération côté agence** : une vue des avis de l'agence, les avis en attente d'abord. Chaque
  décision exige un motif choisi dans une liste traduite, avec un complément libre facultatif.
  L'écran dit clairement qu'un avis sur l'agence elle-même est modéré par la plateforme.
- **File super-admin** :
  - seules les décisions qui ont un sens pour le type d'élément sont proposées ;
  - « Masquer l'annonce » dit ce qu'il fait : retirée du site et verrouillée ;
  - un élément pris en charge par un autre modérateur affiche son nom et l'heure ;
  - l'âge de chaque élément est visible ;
  - une sélection multiple permet de traiter le spam évident.
- **Noter** : après une visite, un bail, une réservation ou une intervention terminés, le client et
  le donneur d'ordre trouvent l'invitation dans leurs avis. Une seule invitation par contexte, et
  elle disparaît une fois l'avis déposé. Palette et cartes : `docs/design-guidelines.md`.

## Contraintes strictes (métier)

1. **ADR avant le code**, deux décisions structurelles (numéros attribués à l'écriture, 0030 est
   pris) :
   - **ADR A, « Avis : cible, preuve d'éligibilité, périmètre de modération, verrou plateforme
     d'une annonce »**. Il tranche :
     - qui modère quoi. Option recommandée : l'admin d'agence pour les avis sur les biens et les
       agents de `reviews.agency_id` ; la plateforme seule pour les avis sur l'agence, sur un
       prestataire, et pour une agence `individual` ;
     - la cible d'un avis sur un prestataire. Option recommandée : `ServiceProviderProfile`, pas
       `User` ;
     - l'unicité d'un avis : une fois par auteur et par sujet pour un bien, un agent ou une agence ;
       une fois par auteur et par intervention pour un prestataire ;
     - le levier du masquage. Option recommandée : `status=rejected` + `visibility=private` +
       `platform_hold_*`.
   - **ADR B, « Détection des doublons d'annonces »**. Il tranche l'algorithme d'empreinte (dHash
     64 bits sur l'**original**), le stockage, le seuil de distance, la borne de passage à l'échelle
     de la comparaison, et le refus de l'auto-masquage.
2. **Cloisonnement** : un admin d'agence n'agit jamais sur un avis d'une autre agence. Cela vaut
   pour la lecture de la file, `pending_count`, `reports`, `approve`, `reject` et `moderate`. Le
   périmètre se juge sur `reviews.agency_id` et sur l'agence du **profil actif**
   (`request()->activeProfile()`), jamais sur l'accesseur `User::agency_id` seul. Répondre est
   réservé au publieur du bien (`properties.user_id`), au personnel de l'agence (prédicat « agent
   ou admin d'agence », écrit `isAgentAt || isAgencyAdminAt` avec un commentaire `TCK-587` tant que
   587 n'est pas fusionné), et à l'agent pour un avis qui le vise. Jamais un bailleur ou un client
   qui ne serait que membre.
3. **Le verrou plateforme tient à un point unique.** Tant que `platform_hold_at` est posé, aucune
   écriture ne peut rendre le bien public : ni `status` vers un statut publiable, ni
   `visibility=public`, ni `published_at`. Seule l'approbation par un **super-admin** le lève.
   Cela couvre `publish`, `updateStatus`, `updateVisibility`, `update` et les actions en masse
   (591). Un admin d'agence qui approuve un bien verrouillé reçoit un 403.
4. **Aucune décision ne se joue deux fois.** `decide` verrouille la source (`lockForUpdate` sur la
   ligne, piège n°2 du `CLAUDE.md`) et rend **409** si l'élément est déjà tranché, ou s'il est pris
   en charge par un autre modérateur dont la prise n'a pas expiré.
5. **Signalement anonyme** : le limiteur `public-report` est conservé. Un champ piège rempli rend
   204 **sans rien enregistrer**, pour ne pas renseigner un robot. Le dédoublonnage se fait par
   compte si l'auteur est connecté, sinon par empreinte visiteur (IP **hachée** avec sel applicatif,
   jamais l'IP en clair dans `reviews.metadata`). Pas d'auto-masquage sur un nombre de
   signalements : les signalements sont anonymes et contournables.
6. **Éligibilité à noter, vérifiée côté serveur** (FormRequest `authorize()`, 403 avant la
   validation, comme TCK-305) :
   - **agent** : une visite `completed` dont il est `agent_id`, ou un bail ou une réservation
     honorés sur un bien dont il est le publieur. On ne note jamais soi-même ;
   - **prestataire** : une intervention `completed` ou `closed` dont il est `assigned_to`, notée
     par son demandeur ou par le personnel de l'agence du bien.
7. **Moyennes publiées** : seuls les avis `approved` comptent. Le recompte se fait à chaque
   changement de statut, pas seulement à la création.
8. **Aucun littéral de prose** dans les notifications et les erreurs ajoutées (règle commune 1 de la
   vague). Clés dans les blocs `notifications.review.*`, `notifications.moderation.*`,
   `errors.review.*` et `errors.moderation.*`.
9. **Coordination avec la vague 73** :
   - **599** possède `PropertyObserver::updated`. 597 y **ajoute** une méthode `updating` et ne
     touche pas `updated`.
   - **587** possède l'autorisation de `PropertyController` et `PropertyPolicy` : 597 n'y touche pas.
   - **600** possède `scopePublic` et `shouldBeSearchable` : 597 n'y touche pas. Le masquage
     s'appuie sur des statuts que ces deux méthodes excluent déjà.
   - **588** possède `NotificationService` : 597 l'appelle sans le modifier.
   - **598** : sa page « bien retiré » doit présenter un bien masqué par la modération comme
     « indisponible », sans motif.
   - **592** possède `components/maintenance/*` et le service de maintenance : 597 ne fait que lire
     `MaintenanceRequest`.
   - **601** porte le NINEA et le RIB partagés.
   - **TCK-537** possède le bloc auteur de `ReviewResource`.

## Delta à produire

### 0. Décisions

- [ ] ADR A et ADR B, écrits et acceptés **avant** le code (voir Contraintes 1).

### 1. Cloisonnement (AD1)

- [ ] Migration `add_moderation_scope_to_reviews_table` :
  - `agency_id` (FK `reviews_agency_id_fk`, `nullOnDelete`) ;
  - `context_type`/`context_id` ;
  - index `reviews_agency_status_idx (agency_id, status)` ;
  - index unique partiel `reviews_author_context_uniq (author_id, context_type, context_id) WHERE
    context_id IS NOT NULL` ;
  - reprise des données : bien → `properties.agency_id`, agence → `id`, user → `null`.
- [ ] `App\Policies\ReviewPolicy` (`moderate`, `viewReports`, `reply`, `deleteReply`), enregistrée.
  `ModerateReviewRequest`, `ReplyReviewRequest`, `approve`, `reject`, `reports` et `deleteReply`
  **délèguent** à la policy.
- [ ] `ReviewController::index` : le super-admin voit tout ; l'admin d'agence filtre sur
  `reviews.agency_id` = agence du profil actif ; `pending_count` est filtré de la même façon ;
  `per_page` est plafonné à 100.
- [ ] Tests `ReviewModerationScopeTest` : refus inter-agences sur `index`, `pending_count`,
  `reports`, `approve`, `reject`, `moderate`, `reply` et `deleteReply` ; succès dans sa propre
  agence ; un bailleur membre ne peut pas répondre.
- [ ] Front : une vue de modération des avis pour l'admin d'agence (agences `standard`), qui
  consomme `GET /api/reviews` sans filtre d'agence côté client.

### 2. Le signalement agit sur le bien (S1)

- [ ] Migration `add_platform_hold_to_properties_table` : `platform_hold_at`,
  `platform_hold_by_id` (FK `properties_platform_hold_by_fk`), `platform_hold_reason`.
- [ ] Migration `add_decision_to_property_reports_table` : `decision`, `resolved_by_id` (FK
  `property_reports_resolved_by_fk`), `reason_code`.
- [ ] `PropertyModerationService::resolveReport` agit selon la décision :
  - **`hide`** : le bien passe `rejected`, `private`, `published_at=null`, verrou posé, motif dans
    `rejection_reason` ;
  - **`remove`** : verrou posé, puis suppression douce du bien ;
  - **`reject`** (classer sans suite) : le bien est inchangé.

  Pour `hide` et `remove`, **tous** les signalements ouverts du bien sont clos avec la même
  décision. Le propriétaire est notifié avec le motif, et chaque signalant connecté est notifié de
  l'issue.
- [ ] `PropertyModerationService::approve` : un super-admin lève le verrou ; un admin d'agence
  reçoit un 403 sur un bien verrouillé.
- [ ] `PropertyObserver::updating` (méthode **nouvelle**) : refuse en 422
  (`errors.moderation.platform_hold`) toute écriture qui rendrait public un bien verrouillé.
- [ ] `DecideModerationQueueRequest` et `UnifiedModerationService` : décisions valides par
  `source_type` (`property` : `approve`|`reject` ; `property_report` : `hide`|`remove`|`reject` ;
  `review` : `approve`|`hide`|`remove`). Tout autre couple rend 422.
- [ ] Tests `PropertyReportDecisionTest` : un test par décision, qui vérifie **l'état du bien**
  (statut, visibilité, verrou, présence dans `GET /api/public/properties` et `…/{slug}`,
  `shouldBeSearchable()`), puis la tentative de republication par l'agence.

### 3. Signaler sans compte (V12)

- [ ] Route `POST /api/public/reviews/{review}/report` (`public.reviews.report`,
  `throttle:public-report`) et `ReportPublicReviewRequest` (motif, champ piège). Elle partage avec
  la route authentifiée un `ReviewReportService` qui porte le dédoublonnage par compte ou par
  empreinte hachée.
- [ ] `ReportPublicPropertyRequest` : même champ piège. Le contrôleur rend 204 sans enregistrer
  quand le piège est rempli, et dédoublonne par bien et par empreinte sur 24 h.
- [ ] Front : plus de barrière de connexion pour signaler une annonce. Le jeton est transmis quand
  le visiteur est connecté. Un bouton « Signaler » est présent sur chaque avis public (fiche bien,
  fiche agent, fiche agence).
- [ ] Tests `PublicReportTest` : signalement anonyme d'un avis enregistré, piège, dédoublonnage,
  rattachement du compte quand un jeton est envoyé.

### 4. Boîte des avis et notification (A15)

- [ ] `GET /api/reviews/received` (`reviews.received`), avec `IndexReceivedReviewsRequest` :
  - périmètre : les biens publiés par l'acteur ou dont il est collaborateur, les avis qui le visent
    (agent, prestataire), et toute l'agence pour l'admin d'agence ;
  - `filter[property_id]`, `filter[replied]`, `filter[status]` (sans `rejected`),
    `filter[subject_type]`, `per_page` ≤ 50.
- [ ] `ReviewObserver` :
  - à la création, notification « avis à modérer » aux admins de `reviews.agency_id` (rien pour la
    file plateforme) ;
  - au passage `approved`, notification « nouvel avis » au sujet (publieur du bien, agent, admins
    de l'agence, prestataire) ;
  - recompte sur les seuls avis approuvés à chaque changement de `status`.
- [ ] Front : la boîte est ouverte à l'agent, au bailleur et à l'admin d'agence. Une seule requête
  paginée, la réponse se rédige dans la page.
- [ ] Tests `ReceivedReviewsTest` (périmètres et filtres) et `ReviewNotificationTest`.

### 5. Noter un agent, une agence, un prestataire (C18, P20)

- [ ] `POST /api/agents/{user}/reviews` (`agents.reviews.store`) et
  `StoreForAgentReviewRequest`, qui vérifie l'éligibilité et renseigne `context_*` et
  `agency_id` à partir du contexte.
- [ ] `POST /api/service-providers/{serviceProviderProfile}/reviews`
  (`service-providers.reviews.store`) et `StoreForServiceProviderReviewRequest`. Ajouter
  `ServiceProviderProfile::reviews()`. La note moyenne (approuvée) est exposée dans le carnet de
  prestataires de l'agence, par `withAvg`.
- [ ] `GET /api/me/review-opportunities` : bien, agent, agence et prestataire éligibles, pas encore
  notés, avec leur contexte. Remplace l'assemblage fait côté client.
- [ ] Front : invitations à noter dans les avis du profil, formulaire commun bien + agent après
  une visite ou un bail, avis d'agence relié à l'endpoint existant.
- [ ] Tests `AgentReviewTest`, `ServiceProviderReviewTest` et `ReviewOpportunitiesTest` :
  éligible → 201, non éligible → 403, doublon → 422, se noter soi-même → 403.

### 6. Doublons et avis suspects (S18), après ADR B

- [ ] Migration `create_media_fingerprints_table` (`media_id` unique, `property_id`, `agency_id`,
  empreinte, index nommés) et migration `create_duplicate_suspicions_table` (paire de biens,
  signal `photo`|`address`, score, `resolved_at`, `decision`, unicité de la paire).
- [ ] Job `App\Jobs\Media\ComputePhotoFingerprintJob` sur la file `media`, déclenché à l'ajout
  d'une photo. Le calcul se fait sur l'**original**.
- [ ] Service `App\Services\Moderation\DuplicateListingDetector` :
  - empreinte proche, **entre agences différentes seulement** ;
  - clé d'adresse normalisée : ville et quartier repliés par `CaseInsensitive::fold`, position
    arrondie, surface et prix à ±5 %, même transaction ;
  - un bien dupliqué volontairement (TCK-074) dans la même agence n'est jamais signalé.
- [ ] `source_type = suspected_duplicate` dans la file unifiée. Décisions `hide` (verrou §2) et
  `reject`.
- [ ] Avis suspects : `metadata.ip_hash` posé à la création, et drapeau `suspicious` calculé à la
  lecture de la file (rafale sur un même sujet, compte récent, empreinte partagée entre auteurs),
  qui sert au tri. Aucune action automatique.
- [ ] Tests `DuplicateListingDetectorTest` et `SuspiciousReviewFlagTest`.

### 7. File de modération (S20)

- [ ] Migration `create_moderation_claims_table` (`item_key` unique, `claimed_by_id`,
  `claimed_at`, `expires_at`).
- [ ] `POST|DELETE /api/admin/moderation/{id}/claim`. `decide` avec verrou et 409 (Contraintes 4).
- [ ] Enum `ModerationReasonCode` (codes traduits côté front) : `reason_code` est requis, `reason`
  est requis seulement pour `other`.
- [ ] `POST /api/admin/moderation/decide-batch` : au plus 50 identifiants, une décision et un motif
  communs, une transaction par élément, résultat rendu par élément.
- [ ] Front : prise en charge, décisions filtrées par type, âge de l'élément, sélection multiple.
- [ ] Tests `ModerationQueueConcurrencyTest` (deux décisions sur le même élément : la seconde rend
  409) et `ModerationBatchTest`.

## Critères d'acceptation

- [ ] **AC1 (cloisonnement, rouge sur le code actuel).** Prenons deux agences A et B, et un admin
  de A. Sur un avis d'un bien de B :
  - `PATCH /api/reviews/{id}/moderate`, `POST …/approve`, `POST …/reject` et `GET …/reports`
    rendent **403**, et l'avis est inchangé en base ;
  - `GET /api/reviews` ne rend **aucun** avis de B, et `meta.pending_count` est égal au nombre
    d'avis en attente de A **seulement** (valeur attendue écrite dans le test).

  Le même admin modère un avis de A et obtient 200. **Ablation** : on remet l'expression
  d'autorisation actuelle et le test redevient rouge.
- [ ] **AC2.** Un bailleur dont le profil actif est dans l'agence A répond à un avis d'un bien de A
  qui n'est pas le sien : 403. Le publieur du bien et un agent de A obtiennent 200.
- [ ] **AC3 (S1, l'état du bien, pas celui du signalement).** On signale un bien public deux fois,
  puis le super-admin décide `hide` sur l'un des signalements. Résultat :
  - le bien est `rejected`, `private`, avec `published_at = null` et `platform_hold_at` non nul ;
  - `GET /api/public/properties/{slug}` rend 404, et le bien est absent de
    `GET /api/public/properties` ;
  - `shouldBeSearchable()` vaut `false` ;
  - les **deux** signalements sont clos.

  Ensuite, l'agence appelle `POST /api/properties/{id}/publish`, puis
  `PUT …/status {status: available}` : les deux rendent 422, et le bien reste non public.
  **Ablation** : sans la méthode `updating`, la republication passe et le test rougit.
- [ ] **AC4.** `remove` supprime le bien (suppression douce, 404 public). `reject` laisse le bien
  public et inchangé, et clôt seulement le signalement. Une décision `approve` sur un
  `property_report` rend 422.
- [ ] **AC5.** Un admin d'agence approuve un bien verrouillé : 403. Un super-admin l'approuve : le
  verrou est levé et le bien redevient publiable.
- [ ] **AC6 (V12).** Sans jeton, `POST /api/public/reviews/{id}/report` rend 200 et ajoute un
  signalement. Quand le champ piège est rempli, la réponse est 204 et rien n'est enregistré. Le même
  visiteur qui signale deux fois fait monter `reported_count` de 1 seulement. Côté front, un
  visiteur non connecté ouvre le formulaire de signalement d'une annonce sans voir de boîte de
  connexion. Connecté, son `reporter_user_id` est enregistré.
- [ ] **AC7 (A15).** Un agent voit les avis de ses biens et ceux qui le visent, jamais ceux d'un
  autre agent de l'agence. Avec `filter[replied]=0`, un **seul** appel rend exactement les avis
  sans réponse (comptes attendus écrits dans le test). L'approbation d'un avis crée une
  notification pour le publieur du bien. Le libellé de cette notification vient d'une clé, et le
  test l'affirme dans deux langues.
- [ ] **AC8 (C18).** Un client dont la visite accompagnée par l'agent X est `completed` note X :
  201, et l'avis apparaît sur `GET /api/public/agents/{slug}` une fois approuvé. Un client sans
  visite ni bail avec X reçoit 403. Un agent qui se note lui-même reçoit 403.
- [ ] **AC9 (P20).** Le demandeur d'une intervention `completed` note le prestataire assigné : 201.
  Une seconde note sur la **même** intervention rend 422. Une note sur une intervention `open` rend
  403. La note moyenne exposée au carnet ne compte que les avis approuvés : avec trois avis (5 et 3
  approuvés, 1 en attente), elle vaut **4.0**.
- [ ] **AC10 (S18).** Deux biens d'agences différentes partagent une photo identique au pixel près
  (originaux), ce qui crée **une** suspicion. Le même cas dans une seule agence, issu d'une
  duplication volontaire, n'en crée **aucune**. Une photo différente mais avec le même filigrane
  d'agence n'en crée aucune non plus.
- [ ] **AC11 (S20).** Deux super-admins décident le même élément l'un après l'autre : la seconde
  décision rend 409 et ne change rien. Un élément pris en charge par A rend 409 à B jusqu'à
  l'expiration de la prise. Avec `reason_code=other` sans `reason`, la réponse est 422.

## Hors périmètre

- **L'annuaire public des prestataires** (seconde moitié de P20). Aucune ligne de spec ne le porte
  aujourd'hui. Il viendra après la notation, dans un ticket de suite, sur consentement du
  prestataire.
- **NINEA et RIB partagés entre agences** : TCK-601.
- **La minimisation de l'auteur d'un avis public** : TCK-537.
- **La page « bien retiré »** : TCK-598.
- **Le plafond de `per_page` sur `public/properties/{slug}/reviews`** : TCK-598 (V16).
- **L'auto-masquage d'une annonce après N signalements** : refusé par ADR B (contournable).
- **L'interception de `publish` par `agencies.moderation_required` pour un bien existant**
  (aujourd'hui seulement à `creating`). Constat relevé pendant la rédaction, à traiter à part.
  Le verrou plateforme de ce ticket ne le corrige pas.

## Notes d'implémentation

_(à remplir par implementing-specs)_
