---
id: TCK-597
title: "Avis et signalements : un admin d'agence modère les avis de toutes les agences, un signalement tranché laisse l'annonce en ligne, et ni un agent ni un prestataire ne peuvent être notés"
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
  Quand il active la modération avant publication, aucun bien de son agence ne se met en ligne sans
  son accord — ni à la création, ni à la publication d'un brouillon, ni après un refus.
- **Super-admin** : quand il donne raison à un signalement, l'annonce quitte vraiment le site et n'y
  revient pas sans son accord. Deux modérateurs ne peuvent pas trancher le même élément en même temps.
- **Agent** : il voit les avis reçus sur ses biens et sur lui-même, il est prévenu d'un nouvel avis
  et il répond depuis sa console.
- **Client** : il peut noter l'agent qui l'a accompagné et l'agence qui gère son bail.
- **Agence et locataire** : ils notent le prestataire après une intervention terminée.
- **Visiteur** : il signale une annonce ou un avis sans créer de compte.

## Contexte

Ce ticket vient de l'analyse par acteur du 2026-10-06 (vague 73). Il couvre les points AD1, A15,
C18, P20, V12, S1, S18 et S20, plus un constat neuf relevé pendant la rédaction (§8). Chaque
constat ci-dessous a été **re-mesuré** sur `e3ab4a4e`.

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
  approuve lui-même les `pending_review` de son agence
  (`app/Http/Controllers/Api/Admin/PropertyModerationController.php:30-46`, `:69-71`). `PropertyObserver` n'intervient qu'à `creating` (`app/Observers/PropertyObserver.php:12-34`).
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
- `ReviewController::report` dédoublonne par `user_id` seulement (l.329-334). Le seuil est un
  **réglage fantôme** : `config('takussan.reviews.report_threshold', 1)` (l.351) lit un fichier
  `config/takussan.php` qui n'existe pas (`ls config/` → aucun ; ce `config('takussan.…')` est le
  seul de `app/`). Le seuil vaut donc toujours 1, et aucune variable d'environnement ne le change.
  Effet mesuré : un signalement fait passer un avis `approved` à `reported` (l.353-359) **sans** le
  masquer (`is_approved` reste vrai, seul critère des lectures publiques, l.179). Ce n'est sans
  danger que tant que les moyennes se calculent sur `is_approved` et non sur `status` (voir §4).
- Le signalement d'une annonce n'est **pas dédoublonné du tout** : chaque appel crée une ligne
  (`PublicPropertyController.php:585-591`, `app/Http/Controllers/Public/`), donc jusqu'à cinq lignes
  par heure et par visiteur dans la file.

### 4. Boîte des avis de l'agent, et notification (A15)

- La boîte « avis reçus » est réservée au propriétaire (`ProfileReviewsList.tsx:91`, `isOwner`).
  Elle charge jusqu'à 100 biens (`lib/queries/reviews.ts:46-67`), puis envoie **une requête par
  bien** (l.84-99), et filtre côté client (`ProfileReviewsList.tsx:284-289`), contre la règle des
  sparse fieldsets. On y répond par `window.prompt` (l.359, l.370).
- `indexForProperty` (`ReviewController.php:176-187`) ne rend que les avis approuvés : un avis en
  attente n'apparaît jamais dans la boîte.
- `ReviewObserver.php:11-19` ne notifie personne, et ne recompte qu'à la création et à la
  suppression. Ce recompte inclut les avis en attente et refusés (l.33-35), alors que
  `AgencyResource.php:28` lit cette moyenne stockée : `GET /api/agencies/{id}` rend une
  `average_rating` et un `reviews_count` qui comptent les avis non publiés. (Les biens n'ont pas ce
  défaut : `PropertyResource.php:254,265` recalcule sur `is_approved`.)

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

### 8. La modération d'agence ne tient qu'à la création (constat neuf de la rédaction)

- `agencies.moderation_required` n'a qu'un lecteur : `PropertyObserver::creating`
  (`app/Observers/PropertyObserver.php:12-34`) — grep `moderation_required` dans `app/` : ce lecteur,
  le modèle et `AgencyResource.php:36`. Un bien créé en `draft` puis publié par
  `POST /api/properties/{id}/publish` passe `available` + `public` **sans passer par la file**
  (`PropertyController.php:162-179`). Même contournement par `PUT …/status`
  (`PropertyController.php:200-223`, chemin qu'emprunte le front, `lib/queries/properties-server.ts:239-251`)
  et par `PUT /api/properties/{id}`, qui accepte `status` (`app/Http/Requests/UpdatePropertyRequest.php:46`,
  `PropertyController.php:140`). Un bien **refusé** par l'admin (`rejected`) ou encore en
  `pending_review` se publie de la même façon : le refus de l'admin ne tient pas.
- `tests/Feature/PropertyModerationTest.php` ne couvre que la création (scénario 1, l.35-55) ;
  aucun test n'appelle `publish` ni `status` sous `moderation_required`.
- En amont, **la case « modération » de la configuration d'agence n'est jamais enregistrée.** Le
  front l'envoie (`takussan-web/src/lib/schemas/agency.ts:118`, `AgencyConfigForm.tsx:351-354`,
  `PATCH /api/agencies/{id}`, `lib/queries/agencies.ts:87-88`). `AgencyController::update` ne remplit
  que `$request->validated()` (`AgencyController.php:84-86`), et `AgencyUpdateRequest::rules()`
  (`app/Http/Requests/AgencyUpdateRequest.php:28-41`) ne déclare pas `moderation_required` : la clé
  est jetée sans erreur et l'écran affiche un succès. Aucun chemin applicatif n'écrit la colonne
  (seules les factories des tests). Les deux défauts s'additionnent : l'interrupteur ne s'allume
  pas, et allumé, il ne tient pas.

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
- **Comportements changés sans nouvel endpoint** (§8) : `PATCH /api/agencies/{id}` enregistre
  `moderation_required` ; `POST /api/properties/{id}/publish`, `PUT …/status` et `PUT …/{id}` rendent
  `status = pending_review` pour une activation dans une agence `moderation_required`.

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
     - qui modère quoi. Option retenue par défaut : l'admin d'agence pour les avis sur les biens et les
       agents de `reviews.agency_id` ; la plateforme seule pour les avis sur l'agence, sur un
       prestataire, et pour une agence `individual` ;
     - la cible d'un avis sur un prestataire. Option retenue par défaut : `ServiceProviderProfile`, pas
       `User` ;
     - l'unicité d'un avis : une fois par auteur et par sujet pour un bien, un agent ou une agence ;
       une fois par auteur et par intervention pour un prestataire ;
     - le levier du masquage. Option retenue par défaut : `status=rejected` + `visibility=private` +
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
   **La modération d'agence tient au même point** (§8) : dans la même méthode
   `PropertyObserver::updating`, après le verrou, toute **activation** d'un bien d'une agence
   `moderation_required` est réécrite en `pending_review`, exactement comme à `creating`. Une
   activation, c'est un passage de `status` d'un statut parmi `draft`, `pending_review`, `rejected`
   vers `available` ou `published`, quel que soit le chemin (contrôleur, action en masse, `fill`).
   Seul `PropertyModerationService::approve` passe outre, par un contournement **borné à son appel**
   (drapeau statique remis à zéro dans un `finally`), jamais par un attribut de la requête. Pas
   d'exemption par rôle : l'admin d'agence qui publie lui-même passe par sa file, comme à la
   création (option retenue par défaut). Un retour `archived`/`unavailable` → `available` d'un bien
   déjà passé en ligne n'est pas une activation.
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
7. **Moyennes publiées** : seuls les avis publiés comptent, c'est-à-dire `is_approved = true` — le
   critère des lectures publiques (`ReviewController.php:179`, `PropertyResource.php:254`), **pas**
   `status = approved`. Un avis `approved` signalé passe `reported` sans être masqué (§3) : compter
   sur `status` laisserait n'importe quel visiteur retirer un bon avis de la moyenne en le signalant.
   Le recompte se fait à chaque changement de `is_approved` ou de `status`, pas seulement à la
   création.
8. **Aucun littéral de prose** dans les notifications et les erreurs ajoutées (règle commune 1 de la
   vague). Clés dans les blocs `notifications.review.*`, `notifications.moderation.*`,
   `errors.review.*` et `errors.moderation.*`.
9. **Coordination avec la vague 73** :
   - **599** possède `PropertyObserver::updated`. 597 y **ajoute** une méthode `updating` (verrou
     plateforme §2 + modération d'agence §8) et ne touche ni `updated` ni `creating`.
   - **587** possède l'autorisation de `PropertyController` (`publish`, `updateStatus` vers un statut
     publiable, `updateVisibility` vers `public`) et `PropertyPolicy` : 597 n'y touche pas. Le
     passage par la modération d'agence (§8) vit dans `PropertyObserver::updating`, pas dans le
     contrôleur : 587 décide **qui** peut publier, 597 décide **où atterrit** une publication. Ordre
     de fusion indifférent ; un test de 587 qui attend `available` après `publish` doit poser
     `moderation_required = false` (valeur par défaut de la colonne).
   - **589, 594 et 600** ajoutent chacun des règles à `AgencyUpdateRequest::rules()` : 597 n'y
     ajoute qu'**une** ligne (`moderation_required`). Conflit d'ajouts voisins au pire ; aucun ne
     réécrit le tableau.
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

- [x] ADR A et ADR B, écrits et acceptés **avant** le code (voir Contraintes 1).

### 1. Cloisonnement (AD1)

- [x] Migration `add_moderation_scope_to_reviews_table` :
  - `agency_id` (FK `reviews_agency_id_fk`, `nullOnDelete`) ;
  - `context_type`/`context_id` ;
  - index `reviews_agency_status_idx (agency_id, status)` ;
  - index unique partiel `reviews_author_context_uniq (author_id, context_type, context_id) WHERE
    context_id IS NOT NULL` ;
  - reprise des données : bien → `properties.agency_id`, agence → `id`, user → `null`.
- [x] `App\Policies\ReviewPolicy` (`moderate`, `viewReports`, `reply`, `deleteReply`), enregistrée.
  `ModerateReviewRequest`, `ReplyReviewRequest`, `approve`, `reject`, `reports` et `deleteReply`
  **délèguent** à la policy.
- [x] `ReviewController::index` : le super-admin voit tout ; l'admin d'agence filtre sur
  `reviews.agency_id` = agence du profil actif ; `pending_count` est filtré de la même façon ;
  `per_page` est plafonné à 100.
- [x] Tests `ReviewModerationScopeTest` : refus inter-agences sur `index`, `pending_count`,
  `reports`, `approve`, `reject`, `moderate`, `reply` et `deleteReply` ; succès dans sa propre
  agence ; un bailleur membre ne peut pas répondre.
- [x] Front : une vue de modération des avis pour l'admin d'agence (agences `standard`), qui
  consomme `GET /api/reviews` sans filtre d'agence côté client.

### 2. Le signalement agit sur le bien (S1)

- [x] Migration `add_platform_hold_to_properties_table` : `platform_hold_at`,
  `platform_hold_by_id` (FK `properties_platform_hold_by_fk`), `platform_hold_reason`.
- [x] Migration `add_decision_to_property_reports_table` : `decision`, `resolved_by_id` (FK
  `property_reports_resolved_by_fk`), `reason_code`.
- [x] `PropertyModerationService::resolveReport` agit selon la décision :
  - **`hide`** : le bien passe `rejected`, `private`, `published_at=null`, verrou posé, motif dans
    `rejection_reason` ;
  - **`remove`** : verrou posé, puis suppression douce du bien ;
  - **`reject`** (classer sans suite) : le bien est inchangé.

  Pour `hide` et `remove`, **tous** les signalements ouverts du bien sont clos avec la même
  décision. Le propriétaire est notifié avec le motif, et chaque signalant connecté est notifié de
  l'issue.
- [x] `PropertyModerationService::approve` : un super-admin lève le verrou ; un admin d'agence
  reçoit un 403 sur un bien verrouillé.
- [x] `PropertyObserver::updating` (méthode **nouvelle**) : refuse en 422
  (`errors.moderation.platform_hold`) toute écriture qui rendrait public un bien verrouillé.
- [x] `DecideModerationQueueRequest` et `UnifiedModerationService` : décisions valides par
  `source_type` (`property` : `approve`|`reject` ; `property_report` : `hide`|`remove`|`reject` ;
  `review` : `approve`|`hide`|`remove`). Tout autre couple rend 422.
- [x] Tests `PropertyReportDecisionTest` : un test par décision, qui vérifie **l'état du bien**
  (statut, visibilité, verrou, présence dans `GET /api/public/properties` et `…/{slug}`,
  `shouldBeSearchable()`), puis la tentative de republication par l'agence.

### 3. Signaler sans compte (V12)

- [x] Route `POST /api/public/reviews/{review}/report` (`public.reviews.report`,
  `throttle:public-report`) et `ReportPublicReviewRequest` (motif, champ piège). Elle partage avec
  la route authentifiée un `ReviewReportService` qui porte le dédoublonnage par compte ou par
  empreinte hachée.
- [x] `ReportPublicPropertyRequest` : même champ piège. Le contrôleur rend 204 sans enregistrer
  quand le piège est rempli, et dédoublonne par bien et par empreinte sur 24 h.
- [x] Seuil de signalement d'un avis : retirer la lecture du réglage fantôme
  `config('takussan.reviews.report_threshold', 1)` (`ReviewController.php:351`) et écrire la règle
  dans `ReviewReportService` : constante `REPORTED_THRESHOLD = 1`, avec un commentaire qui dit
  pourquoi 1 suffit (un signalement **range** l'avis dans la file, il ne le masque jamais). Option
  retenue par défaut ; pas de `config/takussan.php` créé pour une seule valeur.
- [x] Front : plus de barrière de connexion pour signaler une annonce. Le jeton est transmis quand
  le visiteur est connecté. Un bouton « Signaler » est présent sur chaque avis public (fiche bien,
  fiche agent, fiche agence).
- [x] Tests `PublicReportTest` : signalement anonyme d'un avis enregistré, piège, dédoublonnage,
  rattachement du compte quand un jeton est envoyé.

### 4. Boîte des avis et notification (A15)

- [x] `GET /api/reviews/received` (`reviews.received`), avec `IndexReceivedReviewsRequest` :
  - périmètre : les biens publiés par l'acteur ou dont il est collaborateur, les avis qui le visent
    (agent, prestataire), et toute l'agence pour l'admin d'agence ;
  - `filter[property_id]`, `filter[replied]`, `filter[status]` (sans `rejected`),
    `filter[subject_type]`, `per_page` ≤ 50.
- [x] `ReviewObserver` :
  - à la création, notification « avis à modérer » aux admins de `reviews.agency_id` (rien pour la
    file plateforme) ;
  - au passage `approved`, notification « nouvel avis » au sujet (publieur du bien, agent, admins
    de l'agence, prestataire) ;
  - méthode `updated` : recompte de `reviews_count` et `average_rating` sur les seuls avis
    `is_approved = true` (Contraintes 7) quand `is_approved` ou `status` change ; `syncCounts`
    (l.33-35) filtre de même à la création et à la suppression.
- [x] Front : la boîte est ouverte à l'agent, au bailleur et à l'admin d'agence. Une seule requête
  paginée, la réponse se rédige dans la page.
- [x] Tests `ReceivedReviewsTest` (périmètres et filtres), `ReviewNotificationTest` et
  `ReviewAggregateTest` (moyenne d'agence, AC12).

### 5. Noter un agent, une agence, un prestataire (C18, P20)

- [x] `POST /api/agents/{user}/reviews` (`agents.reviews.store`) et
  `StoreForAgentReviewRequest`, qui vérifie l'éligibilité et renseigne `context_*` et
  `agency_id` à partir du contexte.
- [x] `POST /api/service-providers/{serviceProviderProfile}/reviews`
  (`service-providers.reviews.store`) et `StoreForServiceProviderReviewRequest`. Ajouter
  `ServiceProviderProfile::reviews()`. La note moyenne (approuvée) est exposée dans le carnet de
  prestataires de l'agence, par `withAvg`.
- [x] `GET /api/me/review-opportunities` : bien, agent, agence et prestataire éligibles, pas encore
  notés, avec leur contexte. Remplace l'assemblage fait côté client.
- [x] Front : invitations à noter dans les avis du profil, formulaire commun bien + agent après
  une visite ou un bail, avis d'agence relié à l'endpoint existant.
- [x] Tests `AgentReviewTest`, `ServiceProviderReviewTest` et `ReviewOpportunitiesTest` :
  éligible → 201, non éligible → 403, doublon → 422, se noter soi-même → 403.

### 6. Doublons et avis suspects (S18), après ADR B

- [x] Migration `create_media_fingerprints_table` (`media_id` unique, `property_id`, `agency_id`,
  empreinte, index nommés) et migration `create_duplicate_suspicions_table` (paire de biens,
  signal `photo`|`address`, score, `resolved_at`, `decision`, unicité de la paire).
- [x] Job `App\Jobs\Media\ComputePhotoFingerprintJob` sur la file `media`, déclenché à l'ajout
  d'une photo. Le calcul se fait sur l'**original**.
- [x] Service `App\Services\Moderation\DuplicateListingDetector` :
  - empreinte proche, **entre agences différentes seulement** ;
  - clé d'adresse normalisée : ville et quartier repliés par `CaseInsensitive::fold`, position
    arrondie, surface et prix à ±5 %, même transaction ;
  - un bien dupliqué volontairement (TCK-074) dans la même agence n'est jamais signalé.
- [x] `source_type = suspected_duplicate` dans la file unifiée. Décisions `hide` (verrou §2) et
  `reject`.
- [x] Avis suspects : `metadata.ip_hash` posé à la création, et drapeau `suspicious` calculé à la
  lecture de la file (rafale sur un même sujet, compte récent, empreinte partagée entre auteurs),
  qui sert au tri. Aucune action automatique.
- [x] Tests `DuplicateListingDetectorTest` et `SuspiciousReviewFlagTest`.

### 7. File de modération (S20)

- [x] Migration `create_moderation_claims_table` (`item_key` unique, `claimed_by_id`,
  `claimed_at`, `expires_at`).
- [x] `POST|DELETE /api/admin/moderation/{id}/claim`. `decide` avec verrou et 409 (Contraintes 4).
- [x] Enum `ModerationReasonCode` (codes traduits côté front) : `reason_code` est requis, `reason`
  est requis seulement pour `other`.
- [x] `POST /api/admin/moderation/decide-batch` : au plus 50 identifiants, une décision et un motif
  communs, une transaction par élément, résultat rendu par élément.
- [x] Front : prise en charge, décisions filtrées par type, âge de l'élément, sélection multiple.
- [x] Tests `ModerationQueueConcurrencyTest` (deux décisions sur le même élément : la seconde rend
  409) et `ModerationBatchTest`.

### 8. La modération d'agence tient à toute mise en ligne (constat neuf)

- [x] `AgencyUpdateRequest::rules()` : `'moderation_required' => ['sometimes', 'boolean']`. Rien
  d'autre dans ce fichier (Contraintes 9). L'autorisation reste `AgencyPolicy::update`.
- [x] `PropertyObserver::updating`, seconde règle (après le verrou du §2) : si
  `$property->isDirty('status')`, que le statut d'origine est `draft`, `pending_review` ou
  `rejected`, que le nouveau est `available` ou `published`, et que l'agence du bien est
  `moderation_required`, alors `status = pending_review` et `submitted_at = now()` (conservé s'il
  était déjà posé et que le bien était `pending_review`). Les autres attributs de la sauvegarde
  (`visibility`, `published_at`) passent tels quels : le bien reste hors catalogue tant qu'il est
  `pending_review` (`Property::scopePublic` et `shouldBeSearchable` l'excluent déjà, territoire 600).
  ⚠ **Remplacée par §9 (B1)** : juger l'activation sur le statut d'origine laissait passer un
  détour par `archived`, `unavailable`, `under_maintenance` ou `pending`.
- [x] `Property::withoutModerationGate(callable)` (statique, remis à zéro dans un `finally`) ;
  `PropertyModerationService::approve` (l.27-43) enveloppe son `update` dedans, et c'est son seul
  appelant.
- [x] Front : quand une mise en ligne revient avec `status = pending_review`, l'écran dit « envoyé
  pour validation à l'administrateur de l'agence », jamais « publié ». La case « modération » de la
  configuration d'agence relit la valeur rendue par l'API après l'enregistrement, pour qu'un refus
  silencieux ne puisse plus se faire passer pour un succès.
- [x] Tests `PropertyModerationGateTest` (AC13) et un cas ajouté à un test d'agence existant pour
  la persistance de la case (AC14).

### 9. Ajoutés après vérification adverse (verif-597, 2026-10-08)

Rapport du vérificateur : REFUSÉ, 1 bloquant, 4 majeurs, 6 mineurs. Décisions de session suivies.

- [x] **B1** — `PropertyObserver::updating` juge l'activation sur la **destination** et l'**histoire**
  du bien : sous `moderation_required`, tout passage d'un statut non affichable vers `available`,
  `published` ou `pending` va dans la file, sauf si le bien porte une approbation debout
  (`approved_at` non nul et postérieur à `rejected_at`). Un retour en `draft`, `pending_review` ou
  `rejected` efface `approved_at` et `approved_by_user_id`. La duplication n'hérite pas de
  l'approbation et hérite explicitement de `platform_hold_*`. ADR-0043 §5.
- [x] **M1** — `UnifiedModerationService::lockSource` verrouille le bien (`withTrashed`) avant un
  `property_report` ou un `suspected_duplicate` ; un interblocage résiduel rend 409
  `moderation.concurrent_decision`, à l'unité et ligne à ligne en lot. ADR-0043 §7.
- [x] **M2** — `withTrashed()` dans les quatre contrôles d'unicité et dans `opportunities` : un avis
  retiré par la plateforme interdit d'en redéposer un (422 `review.*_already_reviewed`). ADR-0043 §3.
- [x] **M3** (décision de session, réversible) — l'admin d'agence ne tranche qu'un avis `pending`,
  par `approve` ou `hide` ; `pending_count` d'agence ne compte plus `reported` ; le front n'offre
  plus que Approuver et Masquer. ADR-0043 §1, motif « juge et partie ».
- [x] **M4** — `storeForProperty` et `storeForAgency` : contrôle et `create` sous `lockForUpdate` de
  la ligne parent, dans une transaction. ADR-0043 §3.
- [x] **m1** — `ReviewResource` rend `can_reply` et `can_moderate` (policy) ; `ModerationDetail` et
  `ProfileReviewsList` ne lisent plus que ces drapeaux.
- [x] **m2** — `PhotoFingerprint::isDegenerate` (poids < 8 ou > 56) : ni source ni candidat ;
  candidats triés par `bit_count` de la distance. ADR-0054 §2.
- [x] **m3** — `ReviewReportService::report` rend 404 sur un avis non publié, pour les deux routes.
- [x] **m4** — « Nouvel avis » ne part qu'à la première publication (`approved_at` d'origine nul).
- [x] **m5** — `reason_code` passe à part et se traduit au rendu (`lang/*/moderation.php`,
  `common.moderationReasons`) ; `reason` ne porte que le texte libre. ADR-0043 §7.
- [x] **m6** — `VisitorFingerprint::network` tronque l'IPv6 au /64, dans l'empreinte et dans la clé
  du limiteur. ADR-0043 §6.
- [x] **Raccord 591** — fusion d'`origin/dev` (`383fa6f8`), puis tests des actions de lot
  (`441d8f74`) : archivage en lot, dépublication en lot, verrou plateforme.

## Critères d'acceptation

- [x] **AC1 (cloisonnement, rouge sur le code actuel).** Prenons deux agences A et B, et un admin
  de A. Sur un avis d'un bien de B :
  - `PATCH /api/reviews/{id}/moderate`, `POST …/approve`, `POST …/reject` et `GET …/reports`
    rendent **403**, et l'avis est inchangé en base ;
  - `GET /api/reviews` ne rend **aucun** avis de B, et `meta.pending_count` est égal au nombre
    d'avis en attente de A **seulement** (valeur attendue écrite dans le test) ;
  - `GET /api/reviews?per_page=1000` rend `meta.per_page = 100`.

  Le même admin modère un avis de A et obtient 200. **Ablation** : on remet l'expression
  d'autorisation actuelle et le test redevient rouge.

  **Preuve :** `ReviewModerationScopeTest` (14 verts) : refus inter-agences, liste et `pending_count` de A seulement, `per_page` 100, succès dans A. Ablation : comparaison d'agence retirée de `canModerate` → 2 rouges.

- [x] **AC2 (rouge sur le code actuel).** Un bailleur dont le profil actif est dans l'agence A
  répond à un avis d'un bien de A qui n'est pas le sien : `POST /api/reviews/{id}/reply` rend 403,
  et `DELETE /api/reviews/{id}/reply` sur la réponse d'un agent rend 403 ; `reply_content` est
  inchangé en base. Le publieur du bien et un agent de A obtiennent 200. **Ablation** : remettre
  la clause `agency_id === $user->agency_id` (`ReviewController.php:225,245`) rend le test rouge.

  **Preuve :** `ReviewModerationScopeTest::test_a_landlord_member_cannot_reply_nor_delete_an_agent_reply` et `test_the_publisher_and_an_agent_of_a_reply`. Ablation : clause `agency_id === $user->agency_id` remise → 1 rouge.

- [x] **AC3 (S1, l'état du bien, pas celui du signalement).** On signale un bien public deux fois,
  puis le super-admin décide `hide` sur l'un des signalements. Résultat :
  - le bien est `rejected`, `private`, avec `published_at = null` et `platform_hold_at` non nul ;
  - `GET /api/public/properties/{slug}` rend 404, et le bien est absent de
    `GET /api/public/properties` ;
  - `shouldBeSearchable()` vaut `false` ;
  - les **deux** signalements sont clos, avec `decision = hide` et `resolved_by_id` posés ;
  - le propriétaire du bien reçoit une notification de masquage, et le signalant connecté (son
    `reporter_user_id` est posé) une notification d'issue (`Notification::fake()`,
    `assertSentTo` sur les deux) ; un signalant anonyme ne déclenche rien.

  Ensuite, l'agence appelle `POST /api/properties/{id}/publish`, puis
  `PUT …/status {status: available}` : les deux rendent 422, et le bien reste non public.
  **Ablation** : sans la méthode `updating`, la republication passe et le test rougit.

  **Preuve :** `PropertyReportDecisionTest::test_hide_takes_the_listing_offline_closes_every_report_and_notifies` et `test_the_agency_cannot_put_a_hidden_listing_back_online_by_any_path`. Ablation : sans `updating` → 1 rouge.

- [x] **AC4.** `remove` supprime le bien (suppression douce, 404 public). `reject` laisse le bien
  public et inchangé, et clôt seulement le signalement. Une décision `approve` sur un
  `property_report` rend 422, et une décision `hide` ou `remove` sur un élément `property` rend 422
  (aujourd'hui confondue avec `reject`, `UnifiedModerationService.php:282-289`).

  **Preuve :** `PropertyReportDecisionTest` (`remove`, `reject`, couples invalides par type). Ablation : sans `DECISIONS` par type → 1 rouge.

- [x] **AC5.** Un admin d'agence approuve un bien verrouillé : 403. Un super-admin l'approuve : le
  verrou est levé et le bien redevient publiable.

  **Preuve :** `PropertyReportDecisionTest::test_only_a_super_admin_approval_lifts_the_hold_and_the_listing_becomes_publishable`. Ablation : policy + service sans verrou → 2 rouges.

- [x] **AC6 (V12).** Sans jeton, `POST /api/public/reviews/{id}/report` rend 200 et ajoute un
  signalement. Quand le champ piège est rempli, la réponse est 204 et rien n'est enregistré. Le même
  visiteur qui signale deux fois fait monter `reported_count` de 1 seulement. Un avis `approved`
  signalé une fois par un anonyme passe `reported`, **reste** dans
  `GET /api/public/properties/{slug}/reviews`, et la moyenne du bien est inchangée (valeur écrite).
  Côté annonce : le même visiteur qui signale deux fois le même bien en 24 h crée **une** ligne
  `property_reports` (aujourd'hui deux). Côté front : un visiteur non connecté ouvre le formulaire de
  signalement d'une annonce sans voir de boîte de connexion ; chaque avis public affiche un geste
  « Signaler » ; connecté, l'action envoie le jeton (test de l'action : en-tête `Authorization`
  présent), et l'API enregistre son `reporter_user_id`.

  **Preuve :** API : `PublicReportTest` (6 verts : enregistré, piège 204, dédoublonnage, `reported` mais visible, moyenne 4.0 inchangée, jeton rattaché) et `PropertyReportTest` (une ligne en 24 h, `reporter_user_id` sous jeton). Front : `ReportButtons.test.tsx` (formulaire sans boîte de connexion, « Signaler » sur l'avis), `property.signalement.test.ts` (en-tête `Authorization` présent connecté, absent sinon). Ablations : sans dédoublonnage par empreinte → 1 rouge ; action sans jeton → 1 rouge (front).

- [x] **AC7 (A15).** Un agent voit les avis de ses biens et ceux qui le visent, jamais ceux d'un
  autre agent de l'agence. Avec `filter[replied]=0`, un **seul** appel rend exactement les avis
  sans réponse (comptes attendus écrits dans le test). L'approbation d'un avis crée une
  notification pour le publieur du bien. Le libellé de cette notification vient d'une clé, et le
  test l'affirme dans deux langues.

  **Preuve :** `ReceivedReviewsTest` (périmètres, `filter[replied]=0` en un appel, comptes écrits) et `ReviewNotificationTest` (notification au publieur ; libellé fr en base, en par le rendu). Ablations : biens de toute l'agence → 1 rouge ; sans notification « reçu » → 2 rouges.

- [x] **AC8 (C18).** Un client dont la visite accompagnée par l'agent X est `completed` note X :
  201, et l'avis apparaît sur `GET /api/public/agents/{slug}` une fois approuvé. Un client sans
  visite ni bail avec X reçoit 403. Un agent qui se note lui-même reçoit 403.

  **Preuve :** `AgentReviewTest` (201 puis visible sur `GET /api/public/agents/{slug}` une fois approuvé, 403 sans preuve, 403 soi-même, 422 doublon). Ablation : sans refus de soi-même → 1 rouge.

- [x] **AC9 (P20).** Le demandeur d'une intervention `completed` note le prestataire assigné : 201.
  Une seconde note sur la **même** intervention rend 422. Une note sur une intervention `open` rend
  403. La note moyenne exposée au carnet ne compte que les avis approuvés : avec trois avis (5 et 3
  approuvés, 1 en attente), elle vaut **4.0**.

  **Preuve :** `ServiceProviderReviewTest` (201, 422 même intervention, 403 intervention `open`, moyenne du carnet 4.0). Ablation : moyenne sur tous les avis → 1 rouge.

- [x] **AC10 (S18).** Deux biens d'agences différentes partagent une photo identique au pixel près
  (originaux), ce qui crée **une** suspicion. Le même cas dans une seule agence, issu d'une
  duplication volontaire, n'en crée **aucune**. Une photo différente mais avec le même filigrane
  d'agence n'en crée aucune non plus.

  **Preuve :** `DuplicateListingDetectorTest` (même original entre deux agences → une suspicion ; duplication volontaire → aucune ; même filigrane sur photos différentes → aucune). Ablation : sans exclusion du même publieur → 1 rouge ; empreinte sur `getPath()` → 3 rouges.

- [x] **AC11 (S20).** Deux super-admins décident le même élément l'un après l'autre : la seconde
  décision rend 409 et ne change rien. Un élément pris en charge par A rend 409 à B jusqu'à
  l'expiration de la prise. Avec `reason_code=other` sans `reason`, la réponse est 422.

  **Preuve :** `ModerationQueueConcurrencyTest` (seconde décision 409 sans effet ; prise de A → 409 pour B jusqu'à expiration ; `other` sans `reason` → 422). Ablations : sans contrôle « encore ouvert » → 2 rouges ; prise sans expiration → 1 rouge.

- [x] **AC12 (moyenne stockée, rouge sur le code actuel).** Une agence reçoit un avis 5 approuvé et
  un avis 1 en attente : `GET /api/agencies/{id}` rend `average_rating = 5.0` et
  `reviews_count = 1` (aujourd'hui 3.0 et 2). On approuve l'avis 1 : 3.0 et 2. On rejette l'avis 5 :
  1.0 et 1. Un signalement anonyme de l'avis 1 approuvé ne change rien. **Ablation** : sans la
  méthode `updated` de `ReviewObserver`, l'étape « approuver » reste à 5.0 et le test rougit.

  **Preuve :** `ReviewAggregateTest` (5.0/1 → 3.0/2 → 1.0/1 ; signalement anonyme sans effet). Ablation : sans `ReviewObserver::updated` → 1 rouge.

- [x] **AC13 (§8, rouge sur le code actuel).** Agence `moderation_required = true`, bien `draft`
  publié par un agent de l'agence :
  - `POST /api/properties/{id}/publish` rend 200 avec `data.status = pending_review` ; en base,
    `status = pending_review` et `submitted_at` non nul ; le bien est absent de
    `GET /api/public/properties`, `GET /api/public/properties/{slug}` rend 404, et il apparaît dans
    `GET /api/properties/moderation` de l'admin de l'agence ;
  - même résultat par `PUT /api/properties/{id}/status {status: available}` et par
    `PUT /api/properties/{id} {status: available}` ;
  - un bien `rejected` puis publié reste `pending_review` ; un bien `pending_review` publié reste
    `pending_review` ;
  - l'admin approuve (`POST /api/properties/{id}/approve`) : `available`, public.
  Témoin : agence `moderation_required = false`, même `publish` → `available`. **Ablation** : sans
  la seconde règle de `updating`, le premier point rend `available` et le test rougit ; sans
  `withoutModerationGate` dans `approve`, l'approbation reste `pending_review` et le test rougit.

  **Preuve :** `PropertyModerationGateTest` (5 verts : `publish`, `PUT …/status`, `PUT …`, `rejected`/`pending_review`, approbation, témoin sans modération, présence dans `GET /api/properties/moderation`). Ablations : sans la seconde règle → 3 rouges ; sans `withoutModerationGate` → 1 rouge.

- [x] **AC14 (§8, rouge sur le code actuel).** L'admin de l'agence envoie
  `PATCH /api/agencies/{id} {moderation_required: true}` : 200, `data.moderation_required = true`,
  et la colonne vaut `true` en base (aujourd'hui `false` : la clé est jetée). `{moderation_required:
  "oui"}` rend 422. Un agent de l'agence reçoit 403.

  **Preuve :** `AgencyTest --filter=moderation_required` (200 et colonne `true`, `"oui"` → 422, agent → 403). Ablation : sans la ligne de `AgencyUpdateRequest` → 1 rouge. Front : `AgencyConfigForm.moderation.test.tsx` (la case relit la valeur rendue).


### Ajoutés après vérification adverse (verif-597, 2026-10-08)

« Rouge sur 31968d11 » : les sources du correctif remises à 31968d11, le test joué, puis restaurées
par `cp` avec contrôle md5. Chaque ablation est restaurée de même.

- [x] **AC15 (B1).** Sous `moderation_required`, un bien jamais approuvé ne se met pas en ligne par
  un détour : `draft→archived→available`, `rejected→archived→available`, `draft→pending`,
  `draft→unavailable` puis `PUT …/visibility public`, `pending_review→under_maintenance→available`
  finissent `pending_review`, hors catalogue. Un bien approuvé qui sort d'archive revient en ligne ;
  un bien jamais approuvé qui sort d'archive va dans la file. Approuvé puis refusé : la file.
  Dépublié : l'approbation tombe. Une copie d'un bien approuvé va dans la file ; une copie d'un bien
  masqué hérite du verrou.

  **Preuve :** `PropertyModerationGateTest` (approved/never-approved archive, `detours` × 5,
  approbation puis refus, dépublication, copie) et
  `PropertyReportDecisionTest::test_a_copy_of_a_hidden_listing_inherits_the_hold`. Rouge sur
  31968d11 : 9 tests. Ablations : héritage du verrou annulé dans `PropertyDuplicationService` → 1
  rouge ; effacement de `approved_at` retiré → 1 rouge ; exception « approbation debout » retirée →
  1 rouge.

- [x] **AC16 (M1).** Une décision sur un signalement verrouille `properties` en premier ; une
  `DeadlockException` rend 409 `moderation.concurrent_decision` à `/decide` et ligne à ligne à
  `/decide-batch`, jamais 500.

  **Preuve :** `ModerationQueueConcurrencyTest` (ordre des verrous par `DB::listen`, interblocage
  simulé à l'unité et en lot). Rouge sur 31968d11 : 2 tests. Course réelle à deux processus (base
  jetable `takussan_tck597_conc`, supprimée) : 3 manches sur 3 « succès + 409 », contre 3 sur 3
  `DeadlockException` sur 31968d11.

- [x] **AC17 (M2).** Un avis d'agent ou de prestataire retiré par la plateforme : renoter rend 422
  `review.*_already_reviewed`, jamais 500, et l'invitation ne réapparaît pas.

  **Preuve :** `AgentReviewTest` et `ServiceProviderReviewTest`
  `test_a_review_removed_by_the_platform_cannot_be_posted_again`. Rouge sur 31968d11 : 2 tests.
  Ablation : `withTrashed()` retiré d'`opportunities` → 1 rouge.

- [x] **AC18 (M3).** Un admin d'agence face à un avis publié sur son bien reçoit 403 sur `hide`,
  `delete` et `reject`, et la moyenne ne bouge pas ; sur un avis en attente, `delete` lui reste
  refusé : il approuve ou masque ;
  `pending_count` ne compte plus `reported`. Front : sur un avis publié, la vue d'agence n'offre
  aucun geste et dit pourquoi.

  **Preuve :** `ReviewModerationScopeTest::test_an_agency_admin_cannot_take_down_a_published_review_and_the_average_holds`
  et le compte ramené à 2 ; `ModerationWorkspace.test.tsx` (2 cas de vue d'agence). Rouge sur
  31968d11 : API 2, front 2. Ablations : garde `status === pending` retirée → 1 rouge ; garde de
  décision retirée → 1 rouge.

- [x] **AC19 (M4).** Poster un avis sur un bien ou une agence verrouille la ligne parent ; sous
  quatre envois simultanés, un seul avis par sujet.

  **Preuve :** `ReviewTest::test_posting_a_property_or_agency_review_locks_the_parent_row`. Rouge
  sur 31968d11 : 1 test. Course réelle (base jetable, supprimée) : 1 avis par sujet à chaque manche,
  contre 3 sur le bien et 2 sur l'agence sur 31968d11.

- [x] **AC20 (m1).** L'API dit qui peut répondre et qui peut trancher ; le front ne montre que ces
  gestes : aucun bouton de modération sur un avis de prestataire dans la file d'agence, aucun
  « Répondre » quand `can_reply` est faux.

  **Preuve :** `ReceivedReviewsTest::test_the_inbox_says_who_may_reply`,
  `ReviewModerationScopeTest::test_the_queue_says_which_reviews_the_agency_may_decide` (rouge sur
  31968d11 : 2) ; `ModerationWorkspace.test.tsx` et `ProfileReviewsList.test.tsx` (rouge sur
  31968d11 : 4). Ablation : `decidable` recalculé sur le statut → 2 rouges.

- [x] **AC21 (m2).** Deux aplats de couleurs différentes ne font aucune suspicion ; un candidat
  dégénéré ne correspond jamais ; la borne des candidats garde les plus proches, pas les plus
  anciens.

  **Preuve :** `DuplicateListingDetectorTest` (3 cas). Rouge sur 31968d11 : 2 tests. Ablation : rejet
  des candidats dégénérés retiré → 1 rouge.

- [x] **AC22 (m3).** Signaler un avis non publié rend 404 par la route authentifiée comme par la
  route publique, et le statut ne change pas.

  **Preuve :** `PublicReportTest::test_an_unpublished_review_cannot_be_reported_by_an_account_either`.
  Rouge sur 31968d11 : 1 test. Ablation : garde `is_approved` retirée → 2 rouges.

- [x] **AC23 (m4).** Signalement puis réapprobation, trois fois : une seule notification « Nouvel
  avis ».

  **Preuve :** `ReviewNotificationTest::test_reapproving_after_a_report_does_not_notify_the_subject_again`.
  Rouge sur 31968d11 : 1 test.

- [x] **AC24 (m5).** Le propriétaire lit le motif traduit, jamais `personal_data` en clair, en
  français, en anglais et en wolof, côté API et côté front.

  **Preuve :** `PropertyReportDecisionTest::test_the_owner_reads_a_translated_reason_never_the_raw_code`
  et `NotificationRow` (`it.each` fr, en, fr avec texte libre). Rouge sur 31968d11 : API 1, front 3.
  Ablations : libellé remplacé par le code brut, côté API → 1 rouge, côté front → 3 rouges.

- [x] **AC25 (m6).** Deux adresses IPv6 du même /64 donnent la même empreinte et la même clé de
  limiteur.

  **Preuve :** `PublicReportTest::test_two_ipv6_addresses_of_the_same_64_are_one_visitor`. Rouge sur
  31968d11 : 1 test. Ablation : clé du limiteur sur l'adresse entière → 1 rouge.

- [x] **AC26 (raccord 591).** Un bien jamais approuvé, archivé en lot puis désarchivé, va dans la
  file ; dépublier en lot efface l'approbation ; aucune action de lot ne remet en ligne un bien sous
  verrou de plateforme (`bulk-visibility public` → 422, `private` → `invalid_status`, sortie
  d'archive → 422 `moderation.platform_hold`).

  **Preuve :** `PropertyModerationGateTest` (2 cas `bulk`) et
  `PropertyReportDecisionTest::test_bulk_actions_never_put_a_hidden_listing_back_online`. Les routes
  de lot n'existent pas sur 31968d11 : la preuve de rouge est l'observateur de 31968d11 sous le code
  fusionné (2 rouges) ; ablation : `guardPlatformHold` retiré → 1 rouge.

## Hors périmètre

- **L'annuaire public des prestataires** (seconde moitié de P20). Aucune ligne de spec ne le porte
  aujourd'hui. Il viendra après la notation, dans un ticket de suite, sur consentement du
  prestataire.
- **NINEA et RIB partagés entre agences** : TCK-601.
- **La minimisation de l'auteur d'un avis public** : TCK-537.
- **La page « bien retiré »** : TCK-598.
- **Le plafond de `per_page` sur `public/properties/{slug}/reviews`** : TCK-598 (V16).
- **L'auto-masquage d'une annonce après N signalements** : refusé par ADR B (contournable).

## Notes d'implémentation

### Re-mesure (2026-10-08, `6dc81542`)

- 587 est fusionné : le périmètre se juge par `isAgencyAdminAt` sur l'agence du profil actif
  (modération) et par `isStaffOf` / `MembershipCapabilityResolver::isStaffAt` (réponse), sans la
  forme provisoire `isAgentAt || isAgencyAdminAt`.
- `agencies` n'a **pas** de colonne `reviews_count` et `AgencyResource` n'en rend pas : la prémisse
  « aujourd'hui 3.0 et 2 » d'AC12 ne vaut que pour la moyenne. Voir §4.
- L'index unique partiel porte `reviewable_type` en plus des trois colonnes nommées (ADR-0043 §3) :
  sans lui, le formulaire commun « bien + agent » d'un même bail se refuserait à lui-même.

### §1 — cloisonnement (commit `f59dcd7e`)

- `ReviewModerationScope` porte la règle (agence du profil actif, admin actif, agence `standard`,
  cible bien ou agent) ; `ReviewPolicy` la lit. `pending_count` compte ce que l'admin peut trancher
  (les avis sur l'agence elle-même sont listés mais relèvent de la plateforme).
- Preuve : `php artisan test tests/Feature/Api/ReviewModerationScopeTest.php` → 13 verts.
  Ablations rejouées (restaurées par `cp`) : comparaison d'agence retirée de `canModerate` → 2
  rouges ; `restrict()` retiré de `index` → 1 rouge ; `pending_count` sur la plateforme → 1 rouge ;
  plafond `per_page` retiré → 1 rouge ; clause `agency_id === $user->agency_id` remise dans
  `reply` → 1 rouge (bailleur).


### §2 + §8 — le signalement agit sur le bien, la modération d'agence tient à toute mise en ligne

- `PropertyModerationService::resolveReport` : `hide` (rejected + private + `published_at` nul +
  verrou), `remove` (verrou puis suppression douce), `reject` (le signalement seul). `hide`/`remove`
  closent **tous** les signalements ouverts du bien. Notifications après la transaction : publieur
  (`moderation.property_hidden|removed`, motif = texte, sinon code), signalants connectés
  (`moderation.report_upheld|dismissed`).
- `PropertyObserver::updating` (seul ajout à l'observateur) : verrou plateforme, puis modération
  d'agence sur toute activation `draft|pending_review|rejected → available|published`.
  `archived → available` n'est pas une activation (témoin dans le test). `approve` seul passe outre,
  par `Property::withoutModerationGate()`.
- Verrou et approbation : la policy **et** le service refusent l'admin d'agence ; un seul des deux
  retiré laisse le test vert (l'autre couvre), les deux retirés le rougissent — ablation notée
  ci-dessous.
- Signalement public d'annonce : empreinte HMAC au lieu de l'IP (la reprise efface les IP
  existantes), piège `company` (comme `ContactLeadPublicRequest`), une ligne par visiteur et par
  bien sur 24 h, sous verrou de la ligne du bien.
- Preuves : `PropertyReportDecisionTest` 6 verts, `PropertyModerationGateTest` 5 verts,
  `AgencyTest --filter=moderation_required` 1 vert, `PropertyReportTest` 10 verts ;
  67 classes `*Property*` / `*Moderation*` : 543 verts, 0 rouge (deux lots, 123 s et 141 s, sous
  charge 26-29).
- Ablations (restaurées par `cp`) : sans `updating` → 1 rouge (republication) ; sans la seconde
  règle → 3 rouges (AC13) ; sans `withoutModerationGate` → 1 rouge (AC5) ; `resolveReport` sans
  action sur le bien → 4 rouges ; sans `DECISIONS` par type → 1 rouge ; sans la ligne
  `moderation_required` → 1 rouge (AC14) ; policy seule sans verrou → 0 rouge (le service couvre),
  policy + service → 2 rouges ; sans dédoublonnage 24 h → 1 rouge ; sans piège → 1 rouge.

### §7 — file de modération : verrou, prise en charge, lot

- `decide` verrouille la ligne source et rend 409 `moderation.already_decided` (élément tranché,
  y compris supprimé) ou `moderation.claimed_by_other` (prise d'un autre non expirée). La prise est
  rendue avec la décision. `claim` (10 min, `insertOrIgnore` puis relecture verrouillée — jamais une
  exception attendue) ; `DELETE …/claim` rend 409 `moderation.claim_not_held` sur la prise active
  d'un autre. `decide-batch` : ≤ 50 identifiants, un `decide` (donc une transaction) par élément,
  un résultat `{id, ok, status?, code?}` par élément. La ressource rend `claim` (nom, heures) et
  `age_minutes`.
- `models-spec` : entrée minimale `72. ModerationClaim` (exigée par `check-models-spec`).
- Preuves : `ModerationQueueConcurrencyTest` 5 verts, `ModerationBatchTest` 3 verts,
  `ModerationQueueTest` + `AdminConsoleValidationTest` verts.
- Ablations (restaurées par `cp`) : sans contrôle « encore ouvert » → 2 rouges ; sans contrôle de
  prise dans `decide` → 1 rouge ; prise sans expiration → 1 rouge ; sans capture des erreurs
  métier par élément du lot → 1 rouge.

### §3 — signaler sans compte (API)

- `ReviewReportService` porte la règle des deux routes : dédoublonnage par compte, sinon par
  empreinte ; verrou de la ligne de l'avis ; `REPORTED_THRESHOLD = 1` (constante commentée). Le
  réglage fantôme `config('takussan.reviews.report_threshold')` n'est plus lu ;
  `ReviewModerationWorkflowTest` qui le posait est réécrit sur la constante.
- `POST /api/public/reviews/{review}/report` (`public.reviews.report`, `throttle:public-report`) :
  200 ; piège → 204 sans écriture ; 404 sur un avis non publié. Le signalement d'annonce (piège,
  24 h, empreinte) est livré avec §2.
- Preuves : `PublicReportTest` 6 verts ; 81 tests `Review*` verts.
- Ablations (restaurées par `cp`) : sans dédoublonnage par empreinte → 1 rouge ; sans piège → 1
  rouge ; un signalement qui masque (`is_approved = false`) → 3 rouges (liste publique, moyenne) ;
  sans le filtre « avis publié » → 1 rouge.

### §4 — boîte des avis reçus, notifications, agrégats

- `GET /api/reviews/received` (`ReceivedReviews`) : avis **publiés** des biens publiés par
  l'acteur ou dont il est collaborateur, avis publiés qui le visent (agent, prestataire) ; l'admin
  actif d'une agence voit en plus tous les avis de l'agence, en attente compris. Jamais un avis
  rejeté (`filter[status]=rejected` → 422). Filtres serveur `property_id`, `replied`, `status`,
  `subject_type` ; `per_page` ≤ 50 (51 → 422).
- `ReviewObserver::updated` recompte quand `is_approved` ou `status` change ; `syncCounts` ne compte
  plus que `is_approved = true`. Migration : `agencies.reviews_count` (absent, constaté à la
  re-mesure) + recompte de reprise SQL des agences et des biens ; `AgencyResource` rend
  `reviews_count`.
- Notifications par `ReviewNotifier` : « reçu » au passage `approved` (observateur) au publieur du
  bien, à l'agent, aux admins actifs de l'agence notée, au prestataire, jamais à l'auteur ;
  « à modérer » aux admins actifs de `reviews.agency_id` (agence `standard`, cible bien ou agent).
  **Écart :** « à modérer » part des endpoints de création, pas de l'observateur — `ReviewSeeder`
  crée des centaines d'avis en attente par `Review::create`, et un observateur aurait écrit à tous
  les admins à chaque `migrate:fresh --seed`. Les endpoints sont les seuls chemins de création.
- `metadata.ip_hash` (empreinte HMAC) posé à la création par l'API (sert au drapeau « suspect »).
- Preuves : `ReceivedReviewsTest` 3, `ReviewNotificationTest` 3 (libellé fr en base, en par le
  rendu), `ReviewAggregateTest` 1 ; lot `*Review*` + `Agency*` : 301 verts ; profils publics 39
  verts.
- Ablations (restaurées par `cp`) : sans `updated` → 1 rouge (AC12) ; `syncCounts` sans filtre
  `is_approved` → 1 rouge ; sans notification « reçu » → 2 rouges ; sans « à modérer » → 1 rouge ;
  biens de toute l'agence au lieu des siens → 1 rouge ; avis non publiés dans la boîte → 1 rouge.

### §5 — noter un agent, un prestataire ; invitations

- `ReviewEligibility` écrit les quatre règles une fois (bien et agence reprises telles quelles, les
  deux FormRequest existants y délèguent) et calcule `GET /api/me/review-opportunities`.
- `POST /api/agents/{user}/reviews` : preuve (visite `completed` menée, ou bail / réservation
  honorés sur un bien publié), jamais soi-même ; `context_*` et `agency_id` (agence du bien de la
  preuve) posés ; une fois par auteur et par agent, sous verrou de la ligne de l'agent (422).
- `POST /api/service-providers/{serviceProviderProfile}/reviews` : intervention
  `completed`/`closed` assignée au prestataire, par son demandeur ou le personnel de l'agence ;
  une fois par intervention (422, l'index partiel en filet). `ServiceProviderProfile::reviews()` ;
  carnet de l'agence : `average_rating` et `reviews_count` des seuls avis approuvés (`withAvg`).
- `ReviewResource` rend la cible `service_provider`.
- Preuves : `AgentReviewTest` 4, `ServiceProviderReviewTest` 3, `ReviewOpportunitiesTest` 2 ; lot
  `*Review*` / `*ServiceProvider*` / profils publics : 204 verts.
- Ablations (restaurées par `cp`) : sans refus de soi-même → 1 rouge ; visite de n'importe quel
  agent → 1 rouge ; agent sans contrôle de doublon → 1 rouge ; prestataire sans contrôle du statut
  → 1 rouge ; moyenne du carnet sur tous les avis → 1 rouge ; prestataire sans contrôle de doublon
  → 1 rouge (l'index rend 500 au lieu de 422).

### §6 — doublons et avis suspects (ADR-0054, commit `1099bfa5` avant le code)

- `media_fingerprints` (dHash 64 bits + 4 bandes de 16 bits indexées), `duplicate_suspicions`
  (une ligne par paire : index unique `LEAST`/`GREATEST`, écriture par `insertOrIgnore`).
- `FingerprintAddedPhotoListener` (découvert, `MediaHasBeenAddedEvent`) → `ComputePhotoFingerprintJob`
  (file `media`, original lu par son disque) → `DuplicateListingDetector` : photo (distance ≤ 3,
  candidats par bande, ≤ 200) et adresse (ville/quartier repliés ICU, position au millième, même
  contrat, surface et prix ±5 %), entre publieurs différents seulement.
- File : `suspected_duplicate` (`hide` = verrou plateforme sur le bien soupçonné via
  `PropertyModerationService::resolveDuplicate`, `reject`), ressource `duplicate` (signal, annonce
  recopiée) ; drapeau `suspicious` des avis calculé en SQL (rafale, compte < 7 j, empreinte
  partagée), tri en tête, aucune action.
- **Écart :** le signal d'adresse est déclenché par le job de la photo (ADR-0054 §4) — une annonce
  sans photo n'est pas examinée par l'adresse.
- `models-spec` : entrées minimales 73 `MediaFingerprint`, 74 `DuplicateSuspicion`.
- Preuves : `DuplicateListingDetectorTest` 7, `SuspiciousReviewFlagTest` 2 ; lot Media + Events +
  Admin + Moderation + duplication : 421 verts (559 s sous charge 38 — **la commande a dépassé la
  limite de l'outil et a fini en tâche de fond** ; résultat lu à la fin, pas relancé).
- Ablations (restaurées par `cp`) : sans exclusion du même publieur → 1 rouge ; empreinte lue par
  `getPath()` (conversion/chemin local) → 3 rouges ; seuil ignoré → 1 rouge (après ajout du test du
  seuil : la première version passait verte, aucun candidat ne partageait de bande) ; seuil à 4 →
  1 rouge ; adresse sans repli de casse → 1 rouge ; sans drapeau « compte récent » → 1 rouge ; sans
  tri par suspicion → 1 rouge (après correction du test, d'abord vert par l'ordre des identifiants).

### API complémentaire pour le front (commit `864a3344`)

- `ModerationItemResource` émet `source_type` et `decisions`
  (`UnifiedModerationService::DECISIONS[source_type]`) : le front n'affiche plus que les décisions
  que l'API accepte pour ce type, au lieu de les deviner (assertion ajoutée à `ModerationQueueTest`).
- `GET /api/reviews?sort=pending_first` : avis à décider en tête (`pending`, puis `reported`, puis
  le reste). Test : `ReviewModerationScopeTest::test_pending_first_sort_puts_reviews_to_decide_on_top`.
  Ablations : décisions retirées de la ressource → 1 rouge ; tri `pending_first` ignoré → 1 rouge.
- ⚠ Ce commit embarque par erreur la suppression de `takussan-web/src/hooks/useReportProperty.ts`
  (indexée plus tôt par un `git rm`) : l'arbre de `864a3344` seul est incohérent côté front, celui
  de `005aca4d` l'est de nouveau. Historique non réécrit.

### Front (commits `005aca4d`, `293c877a`)

- **Signaler sans compte (V12)** : `components/reports/ReportDialog.tsx` générique (aucune boîte de
  connexion, piège `company` étiqueté, confirmation « nous allons examiner » et « prévenu de
  l'issue » seulement si connecté), `ReviewReportButton` (« Signaler » sur chaque avis public, sans
  champ libre), `PropertyReportButton` réécrit (motif « arnaque » en tête). `submitPropertyReport`
  envoie le jeton quand il existe ; `submitReviewReport` vise `/api/public/reviews/{id}/report`.
  L'ancien `reportReview` (authentifié) et `useReportReview` sont retirés.
- **Boîte des avis reçus (A15)** : `/app/profile/reviews` — `ReceivedReviewsInbox` (un seul appel
  paginé à `/api/reviews/received`, filtres bien / répondu / statut / sujet côté serveur, réponse en
  ligne, avis « en attente » signalés comme tels), `ReviewOpportunitiesList` groupé par contexte
  avec `StarRatingInput` (radios natives), liste des avis écrits. Entrée `receivedReviews` dans
  `AppSidebar` pour propriétaire, agent, admin.
- **Modération d'agence (AD1)** : `/admin/moderation` ouverte à tout admin d'agence standard
  (`platform` seulement pour le super-admin), motif codé (`lib/moderation-reasons.ts`, texte exigé
  pour `other`), tri par défaut `pending_first,-reported_count,-created_at`, note « plateforme
  seulement » sur les avis d'agence.
- **File unifiée (S20, S18)** : colonne de sélection, prise en charge (prendre / libérer), drapeau
  suspect, bloc doublon, âge depuis `age_minutes`, décisions lues dans `item.decisions`,
  `ModerationBatchBar` (intersection des décisions des éléments choisis, résultat par élément).
- **§8** : `PropertyHeaderActions` / `PropertyRowActions` affichent « envoyé en revue » sur un
  `pending_review` ; `AgencyConfigForm` relit `moderation_required` rendu par l'API.
- Clés mortes retirées : `property.report.{loginTitle,loginBody,signIn,sent}`,
  `profile.reviews.{stayCompleted,leaseActive,leaseEnded,details,replyFilterPlaceholder,reportPrompt,reportToastTitle,reportToastDescription}`,
  `superAdmin.moderation.{ageToday,typeProperty,typeReview}`. `ENCRES_INVERSES` 248 → 249 (le
  « Signaler » de `ReviewsSection`), commentaire daté.
- Ablations front (restaurées par `cp`) : action sans jeton → 1 rouge ; garde « plateforme
  seulement » retirée → 1 rouge ; `reason_code` retiré → 2 rouges ; filtre de statut de la boîte
  retiré → 1 rouge ; `maintenance_request_id` du prestataire retiré → 1 rouge ; regroupement par
  sujet au lieu du contexte → 2 rouges ; les quatre décisions affichées → 1 rouge (après ajout d'un
  test de panneau d'avis : la première version restait verte, le mutant égalait l'ensemble réel) ;
  prise en charge non gardée → 1 rouge ; lot en `some` au lieu de `every` → 2 rouges ; message
  « en attente » retiré → 1 rouge ; relecture de la config d'agence retirée → 1 rouge.
- Preuves : vitest sur les zones touchées 171 fichiers / 1716 tests verts ; `tsc --noEmit` propre ;
  `npm run lint` 0 erreur ; `check:i18n` et `check:i18n-namespaces` verts.
- **Écarts** : pas d'entrée de navigation pour le prestataire (la garde « AUCUNE césure » de sa
  barre latérale l'interdit ; ses avis restent lisibles par l'API) ; un avis en attente ne se
  répond ni ne se signale depuis la boîte ; aucune passe au navigateur.

### Raccord avec le lot de TCK-591 (fait après la fusion d'`origin/dev`, `383fa6f8`)

- **Conflits** : `docs/adr/README.md` (0034-0036 de dev, puis 0043 et 0054), `docs/backlog/INDEX.md`
  (régénéré), `docs/models-spec.md` (sections de ce ticket renumérotées `73. ModerationClaim`,
  `74. MediaFingerprint`, `75. DuplicateSuspicion`) et `NotificationCode.php` (union avec
  `ProspectMatchDigest`).
- **`PropertyPublication` passe par l'observateur** : l'unitaire écrit par `update()`, les deux
  services de lot par `forceFill()->save()`. Sous l'observateur de 31968d11, les deux tests de lot
  rougissent.
- **Le trou relevé avant la fusion** (un bien `pending_review` archivé puis désarchivé sautait la
  file) est fermé par B1 : `test_unarchiving_is_not_an_activation` est remplacé, et le test de lot
  prévu ici est devenu `test_a_never_approved_listing_archived_in_bulk_then_restored_goes_to_the_queue`.
- **Seconde fusion, avec TCK-590** (`d1498063`) : conflits résolus par union (cliquet de
  `check-agency-scope-clause` à 5, les deux tickets ayant retiré leurs exemptions ; barre latérale
  d'`agency_admin` à 25 entrées ; contraste public à 257). Les limiteurs publics de 590 passent
  par `visitorRateLimitKey` et comptent donc l'IPv6 au /64 (m6). Les classes de 590 (449 tests,
  dossier `tests/Feature/Public` compris), celles de 597 et vitest (49 fichiers) sont rejoués et passent.
- **La sonde « réapprobation » de verif-597** rend maintenant 403 : depuis M3, l'admin d'agence ne
  tranche plus un avis signalé. Comportement voulu.

### Ce que ce ticket ne porte pas

- Aucun AC « suite entière » : la suite backend complète reste à la session (dernier lot ciblé :
  les 15 classes de TCK-597, 71 tests / 456 assertions verts, 88,85 s, charge 53/42/34 — chiffre
  pris sous charge, il ne dit rien du dépôt).
