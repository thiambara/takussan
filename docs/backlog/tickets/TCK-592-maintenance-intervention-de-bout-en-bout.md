---
id: TCK-592
title: "Une intervention de bout en bout : le prestataire ne contourne plus la machine d'état, n'est assigné que s'il collabore, et ne clôt plus seul"
status: done
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-07
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#17-communication--messagerie
    - docs/features.md#23-notifications
    - docs/features.md#112-agence--équipe
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#21-maintenancerequest-
    - docs/models-spec.md#37-serviceproviderprofile-
    - docs/models-spec.md#39-serviceprovideragencycollaboration-
    - docs/models-spec.md#34-ownerprofile-
    - docs/models-spec.md#20-message-
tags: [back, front, maintenance, prestataire, securite, machine-d-etat, notifications, messagerie, adr-requise]
---

## Objectif utilisateur

- **Prestataire 🔧** : il reçoit une intervention qui lui est vraiment destinée, l'accepte ou la refuse, trouve
  le logement et le locataire, documente son travail en photos depuis un téléphone, et la rend sans
  pouvoir la clore lui-même.
- **Agent / agence 🧑‍💼🛡️** : il assigne et planifie depuis l'écran, voit les photos et le devis avant
  d'approuver, et ne voit jamais un prestataire hors collaboration agir sur ses biens.
- **Locataire 🏠** : il est tenu au courant de chaque étape de sa demande et confirme (ou conteste) la réparation.
- **Bailleur 🏢** : il est averti de tout devis sur son bien et décide au-delà du plafond convenu avec
  l'agence ; il ne voit pas les interventions des autres bailleurs de son agence.

## Contexte

Analyse par acteur du 2026-10-06 (vague 73) : rapport prestataire P1-P7, P10-P19 ; client C7 ;
propriétaire O14 et la partie `MaintenanceRequestPolicy` de O1 ; courtier B13 et B17 (branches
prestataire). **Chaque constat ci-dessous a été re-mesuré** sur `e3ab4a4e` (arbre
`takussan-analyse-acteurs`) ; les écarts au rapport sont dans les notes de rédaction.

### 1. Machine d'état : deux tables, aucun acteur, et un contournement (sécurité)

- `PATCH /api/maintenance-requests/{id}` accepte `status` (tout l'enum,
  `UpdateMaintenanceRequestRequest.php:88`), `completed_at` (`:93`) et `actual_cost` (`:90`) ;
  `PRINCIPAL_FIELDS` ne garde que `assigned_to` et `priority` (`:39`), et le contrôleur fait
  `fill($data)->save()` **sans passer par `transition()`** (`MaintenanceRequestController.php:163`).
  Le prestataire assigné passe `update` (`MaintenanceRequestPolicy.php:49`) : il peut poser
  `approved` sur son propre devis (geste réservé à `manageQuotes`), ou `closed` depuis `open`.
  `MaintenancePrincipalFieldsTest::test_assigned_provider_keeps_status_and_report` (`:126`) **fige**
  ce passage.
- Deux tables de transitions sans acteur : `MaintenanceRequestService::TRANSITIONS` (`:24-32`) et
  `MaintenanceQuoteWorkflow::TRANSITIONS` (`:14-20`). La première n'a aucune clé pour les états de
  devis : une demande en `quote_requested`/`quote_submitted`/`rejected` ne peut plus être annulée.
- `PUT …/status` n'exige que `update` (`UpdateStatusMaintenanceRequestRequest.php:31`) : le
  prestataire peut **annuler toute la demande** (`assigned|in_progress → cancelled`) et **clore**
  la sienne (`completed → closed`, `:29`) — personne côté locataire n'est consulté (P10, C7).

### 2. Assignation et collaboration (sécurité)

- `assigned_to` n'est validé que par `exists:users,id` (`StoreMaintenanceRequestRequest.php:36`,
  `UpdateMaintenanceRequestRequest.php:86`) : n'importe quel compte reçoit la demande, et avec elle
  le bien, le quartier et l'e-mail du demandeur (`MaintenanceRequestResource.php:36-38,84`).
- `view`/`update`/`actAsProvider` ne lisent que `assigned_to === $user->id`
  (`MaintenanceRequestPolicy.php:31,49,112`) : une collaboration `ended` ou un profil `suspended` ne
  retirent rien (`grep -rn "ServiceProviderProfileStatus::Suspended\|CollaborationStatus::Ended" app`
  → 0 lecteur). Aucun endpoint ne met fin à une collaboration (`routes/api/me.php:132-135` : lecture
  seule).
- B13 : `AgencyController::visibleAgencyIds` ouvre l'agence à toute collaboration prestataire non
  supprimée, **sans filtre de statut** (`AgencyController.php:338-343`). Même défaut dans
  `HasProfiles::isProviderAt` (`:173-178`) et `MembershipCapabilityResolver::serviceProviderRoleAllows`
  (`:400-416`).
- B17 (prestataire) : `unique(['service_provider_profile_id','agency_id'])` **non partiel** sur une
  table en `SoftDeletes` (`2026_05_02_000006_…:24`). Défaut **latent** aujourd'hui (aucun chemin ne
  supprime une collaboration ; `InvitationService::ensureServiceProviderCollaboration`, `:667-690`,
  réactive la ligne) — il devient réel dès qu'une fin de collaboration est codée en `delete()`.
- Capacités : `maintenance.assign` et `maintenance.close` sont accordées à l'agent et au prestataire
  (`SystemRoleCapabilities.php:84-85,103-104`) et **lues par aucune policy** (`grep -rn
  "Capability::Maintenance" app` → le catalogue seul). Accorder `close` au prestataire contredit P10.
- O1 (partie maintenance) : `view` (`:33`), `update` (`:51`) et `isPrincipalFor` (`:103`) accordent
  sur `$user->agency_id === $property->agency_id`, sans regarder le type de profil. Un bailleur invité
  porte un `OwnerProfile` de l'agence (`User.php:228-251`) : il lit, modifie, assigne et approuve les
  devis des interventions des **autres** bailleurs. `index` reprend la même clause (`:43-44`).
- P18 : `from_maintenance_request_id` n'est validé que comme entier > 0
  (`ServiceProviderInvitationService.php:297-311`), puis renvoyé tel quel en fin d'onboarding
  (`ServiceProviderOnboardingService.php:145-161`) sans que la demande soit assignée : le prestataire
  atterrit sur un 403. Aucun composant ne produit d'ailleurs ce lien (seul le TODO
  `MaintenanceForm.tsx:4-13`).
- Carnet de l'agence : `ServiceProviderProfileController::scopeForAgency` (`:55-61`) prend toute
  collaboration du couple, **sans filtre de statut**. Dès qu'une fin de collaboration existe (B), un
  prestataire `ended` reste présenté comme prestataire de l'agence.
- Fin d'onboarding **rejouable** : `POST /api/service-provider/onboard/complete`
  (`routes/api/onboarding.php:32`) n'a aucune garde « déjà fait » ; l'OTP est sauté si le téléphone
  est vérifié (`ServiceProviderOnboardingService.php:46-53`). Chaque appel repasse le profil à
  `active` **quel que soit son statut** (`:64-66`, `suspended` compris) et réactive **toutes** les
  collaborations `paused` du prestataire (`:68-71`), pas seulement celles d'une invitation en
  attente. Aujourd'hui seul l'envoi d'invitation pose `paused` (`ServiceProviderInvitationService.php:124-131`)
  et rien ne pose `suspended` : le défaut devient réel **avec ce ticket**, qui crée la pause par
  l'agence et donne un sens à `suspended` — le prestataire lèverait l'une et l'autre lui-même.

### 3. Ce que personne n'apprend (C7, P4, P13, O14)

- `transition()` (`MaintenanceRequestService.php:41-69`) et `complete()` (`:75-104`) ne notifient
  personne ; l'assignation non plus. Les seules notifications du domaine sont la création, l'urgence
  et les devis (`MaintenanceRequestController.php:107-126`, `MaintenanceQuoteController.php:29-109`),
  en prose française écrite en dur. La clé de préférence `maintenance_status_changed` existe déjà
  (`NotificationService.php:28`).
- P13 : un devis soumis notifie `$mr->requester ?? owner` (`MaintenanceQuoteController.php:57`). Le
  demandeur est le plus souvent le **locataire** : il reçoit le prix négocié, l'agence rien. Et
  `GET show` lui sert `quote_amount`/`quote_currency` (`MaintenanceRequestResource.php:26-27`).
- O14 : si un agent a ouvert la demande, le bailleur n'entend jamais parler du devis, et l'agent
  approuve n'importe quel montant (`manageQuotes` → `isPrincipalFor`). Aucune notion de mandat ni de
  plafond (`grep -rni "mandat\|mandate" app database/migrations` → rien du domaine).

### 4. Ce que personne ne voit (P5, P6, P7, P12)

- Pas d'acceptation ni de refus (`MaintenanceStatus.php:7-17`). ⚠ L'assignation ne change pas le
  statut, et `assigned` n'a pas de chemin vers le devis (`MaintenanceQuoteWorkflow.php:15`) :
  l'acceptation **ne peut pas** devenir un statut sans casser le devis.
- `propertySummary()` n'expose ni rue ni coordonnées (`MaintenanceRequestResource.php:44-71`),
  `userSummary()` pas de téléphone (`:73-87`) ; le lien vers le bien (`MaintenanceDetail.tsx:169-177`)
  mène le prestataire à un refus (`PropertyPolicy.php:42-57`).
- Les collections `photos`, `completion_photos`, `quotes` (`MaintenanceRequest.php:102-104`) sont
  écrites et **jamais relues** : ni la ressource ni la fiche n'en exposent une seule.
- Devis : un `amount` unique et une devise **libre** (`SubmitQuoteRequest.php:26-27`, placeholder
  « XOF, EUR... »).
- Pièces du devis **sans contrôle de type** : `attachments.*` = `['file', 'max:5120']`
  (`SubmitQuoteRequest.php:28-29`), aucun `mimes` — contrairement aux photos de la même demande
  (`UploadPhotosMaintenanceRequestRequest.php:50`, `CompleteMaintenanceRequestRequest.php:40` :
  `image`, `mimes:jpg,jpeg,png,webp`). Tout fichier part dans la collection `quotes`
  (`MaintenanceQuoteWorkflow.php:70-71`) ; le champ du front n'a pas d'`accept`
  (`QuoteSubmitForm.tsx:79-84`). La sortie privée sert un média avec **son** type et en `inline`
  (`PrivateMediaAccess.php:54-83`) : le jour où E expose `media.quotes`, un `.html` ou un `.svg`
  déposé par un prestataire s'ouvrirait dans le navigateur de l'agence.

### 5. Front (P1, P11, P14, P15, P16, P17)

- P1 : `useUpdateMaintenanceRequest` et `maintenanceUpdateSchema` n'ont **aucun appelant** ; aucun
  écran n'assigne ni ne planifie.
- P11 : après un refus, `QuoteSubmitForm` disparaît (`QuoteSubmitForm.tsx:46`) et le bouton proposé
  part en `PUT …/status` (`types/maintenance.ts:79-80`) → **422 garanti**.
- P14 : les actions sont rendues sans rôle (`MaintenanceDetail.tsx:204`) ; le formulaire de devis
  s'affiche à l'agence ; « Nouvelle demande » est poussée au prestataire (`MaintenanceList.tsx:115-121`)
  qui prend un 403 (`MaintenanceRequestController.php:91`).
- P15 : les photos de fin partent **après** la transition et leur échec est avalé
  (`MaintenanceCompleteForm.tsx:52-64`) — alors que `PUT …/complete` accepte déjà `photos[]`
  (`CompleteMaintenanceRequestRequest.php:39-40`). Pas de photo « avant ».
- P16 : métiers, zones, tarifs, disponibilités ne s'éditent que dans l'assistant ; `/app/profile` n'a
  pas de section prestataire (`profile/page.tsx:38-41`) ; `metadata.availability` n'a aucun lecteur ;
  `updateTrades` remplace tout (une édition partielle efface).
- P17 (liste) : la liste ne charge pas le bien (`lib/queries/maintenance.ts:38-50`) et trie par
  `-created_at` (`:97`).

### 6. Fil de discussion (P19)

Une conversation peut porter `maintenance_request_id` (`GroupConversationService.php:47`), mais rien
ne la crée, la fiche n'y renvoie pas, et `MessagingReach` ne rend pas un prestataire joignable.
`MessageType` ne connaît pas l'audio, et l'API d'envoi n'accepte **aucun fichier**
(`SendMessageConversationRequest` : `content` string requis).

**Usurpation d'un avis système (sécurité)** : la même requête accepte `type` = **tout**
`MessageType` (`SendMessageConversationRequest.php:44`), que le contrôleur écrit tel quel
(`ConversationController.php:280-284`). Un participant poste donc un `type=system` : le front le
rend comme un avis de la plateforme (`ChatView.tsx:409`), il n'est pas compté non lu
(`ConversationController.php:38`) et **personne ne peut le supprimer ni le corriger**
(`ConversationPolicy.php:59-62`, `MessageObserver.php:26-57`). `image`/`document` passent de même,
sans fichier. Le seul auteur légitime d'un avis système est `SystemMessageFactory` (`:93`). Le fil
par intervention de H y poste ses messages d'étape : la porte doit être fermée avant.

**Articulation avec [TCK-446](TCK-446-spec-muette-sur-le-prestataire.md)** : 446 écrit la spec de ce
que le produit sert déjà au prestataire ; ce ticket construit. La ligne « consulter ses interventions
assignées » est le delta de 446 ; le fil par intervention tranche **pour la maintenance** sa question
« messagerie du prestataire : voulue ou défaut ? » (voulue, limitée au fil de l'intervention).

## Contrat de données

Back, nouveaux ou modifiés :

- `PUT /api/maintenance-requests/{id}/status` — inchangé en forme ; autorisé par **(acteur, cible)**.
- `PATCH /api/maintenance-requests/{id}` — `status`, `started_at`, `completed_at` deviennent
  `prohibited` ; `estimated_cost`, `actual_cost`, `scheduled_at`, `access_instructions` rejoignent les
  champs du donneur d'ordre (`scheduled_at` reste ouvert au prestataire **accepté**).
- `POST …/accept`, `POST …/decline {reason}` (prestataire assigné).
- `POST …/confirm-resolution`, `POST …/contest-resolution {comment, photos[]?}` (demandeur ou donneur d'ordre).
- `POST …/quote/submit` — `lines[] {label, kind: labour|supply, quantity, unit_price}`, `valid_until`,
  `estimated_duration_days` ; `amount` **calculé** côté serveur ; `currency` `prohibited`.
- `GET …/{id}` ajoute `accepted_at`, `quote_lines`, `quote_valid_until`, `media {photos,
  before_photos, completion_photos, quotes}` (URL signées), `access {street, latitude, longitude,
  requester_phone, instructions}` (fenêtre restreinte), `abilities {can_manage_quotes,
  can_submit_quote, can_accept, transitions[]}` ; masque `quote_*` au demandeur non donneur d'ordre.
- `PATCH /api/agencies/{agency}/service-providers/{sp_profile}/collaboration {status}` (agence) ;
  `PATCH /api/me/service-provider/collaborations/{collaboration} {status: ended}` (prestataire).
- `GET /api/agencies/{agency}/service-providers` : `filter[specialty]`, `filter[zone]`,
  `filter[collaboration_status]` (défaut `active`).
- `POST /api/conversations/{conversation}/messages` : `type=audio` + fichier `audio`.
- Événement `App\Events\Maintenance\MaintenanceStatusChanged(mr, from, to, actor)`.

Modèles : `MaintenanceRequest` (colonnes `accepted_at`, `access_instructions`, `quote_lines` jsonb,
`quote_valid_until`, `quote_estimated_duration_days` ; collection `before_photos` ; statut
`awaiting_owner` si l'ADR 1 le retient), `OwnerProfile` (seuil, ADR 1),
`ServiceProviderAgencyCollaboration` (index unique partiel), `Message` (type `audio`, ADR 2).

## Direction UX / Artistique

- **Terrain d'abord** : le prestataire travaille sur un téléphone, en 3G, souvent plus à l'aise à
  l'oral qu'à l'écrit (wolof). Gros boutons, une action principale par écran, aucun champ inutile.
- **Le serveur dit ce qui est permis** : chaque bouton d'action naît des `abilities` de l'API, jamais
  d'une table de transitions recopiée côté front. Un bouton qui rend 403 ou 422 est un défaut.
- Fiche d'intervention : en tête, pour le prestataire, « J'accepte / Je refuse » tant qu'il n'a pas
  accepté ; ensuite « Itinéraire », « Appeler le locataire », « Discuter ». Pour le donneur d'ordre, un
  bloc « Prestataire et créneau » (choix parmi les collaborations actives du bon métier, indication
  d'indisponibilité ce jour-là, « Inviter un nouveau prestataire » qui produit le lien profond).
- Galerie Avant / Après / Devis ; prise de vue directe à l'appareil ; aucune photo perdue en silence :
  un échec se voit, et les fichiers restent pour réessayer.
- Pour le locataire : une ligne de temps lisible et, à la fin, « C'est réparé » / « Le problème
  persiste ».
- « Mes interventions » : Aujourd'hui / À venir / Terminées, triées par créneau, avec quartier et
  agence. **Ce n'est pas un tableau de bord** (décision de [§2.5](../../features.md#25-reporting--tableaux-de-bord)).
- Section prestataire dans le profil : métiers, zones, tarifs, disponibilités — mêmes contrôles que
  l'assistant, éditables un à un.
- Ancrage Local Contemporain (`docs/design-guidelines.md`) ; textes fr/en/wo.

## Contraintes strictes (métier)

**Sécurité**

- Le statut ne change **que** par la machine d'état, et chaque transition est autorisée pour un
  **acteur** : prestataire (`in_progress`, `completed`, `accept`, `decline`), donneur d'ordre (tout,
  sauf soumettre un devis), demandeur (`confirm`/`contest`). Le prestataire ne passe **jamais**
  `cancelled` ni `closed`.
- Est assignable : un utilisateur dont le `ServiceProviderProfile` est `active` et qui a une
  collaboration `active` avec **l'agence du bien** (option retenue par défaut, non tranchée par le
  porteur : plus un membre de l'équipe de cette agence). Le même contrôle garde
  `view`/`update`/`actAsProvider` côté prestataire : collaboration finie ou profil suspendu = plus
  d'accès, historique compris (option retenue par défaut : les données des locataires priment ; 594
  sert ses factures par un autre chemin).
- Une pause ou une suspension posée par l'agence ou la plateforme ne se lève **jamais** par le
  prestataire lui-même : la fin d'onboarding n'active que les collaborations d'une invitation en
  attente, et refuse un profil `suspended`.
- Un participant n'écrit que `text` (et `audio` avec son fichier, H) : `system` est réservé à
  `SystemMessageFactory`.
- Pièces d'un devis : PDF ou image seulement (`pdf,jpg,jpeg,png,webp`), avant que E ne les expose.
- Fin de collaboration = `status=ended` + `ended_at`, **jamais** `delete()`. Les interventions non
  terminales du prestataire dans cette agence sont désassignées (retour à `open`, événement émis).
- Côté donneur d'ordre, l'équipe d'agence se juge par le prédicat « personnel de l'agence » de
  TCK-587. Avant sa fusion : `isAgentAt($id) || isAgencyAdminAt($id)` avec un commentaire `TCK-587`.
  Un bailleur n'est donneur d'ordre que de **ses** biens (`property.user_id`).
- Téléphone du demandeur, rue et coordonnées : au seul prestataire assigné, **après acceptation**,
  tant que la demande n'est ni `closed` ni `cancelled`. Le montant du devis : jamais au demandeur qui
  n'est pas donneur d'ordre (ni dans la ressource, ni dans une notification).
- **Toute garde est prouvée par ablation** : le test rougit sur le code actuel et redevient rouge
  quand on retire le correctif.

**Métier**

- Montant décimal en base (principe n°3) ; lignes de devis en chaînes décimales dans le jsonb ;
  devise imposée (celle du bail, sinon de l'agence — `resolveCurrency`, `MaintenanceQuoteWorkflow.php:153`).
- Clôture automatique d'une demande `completed` sans réponse du demandeur après **7 jours** (option
  retenue par défaut, non tranchée par le porteur), tracée comme telle.
- Aucun littéral de prose dans l'API : clés `__('maintenance.…', $params, $locale)` dans un nouveau
  fichier `lang/{fr,en,wo}/maintenance.php`, langue du **destinataire**.
- PostgreSQL : index et FK nommés explicitement (< 63 car.) ; pas de `try/catch` sur une contrainte
  d'unicité ; événements `ShouldDispatchAfterCommit` (modèle `App\Events\Lease\LeaseActivated`).

**ADR requis** (avant le code de la sous-partie concernée)

- **ADR 1 — plafond de travaux du bailleur (O14)** : où vit l'accord bailleur–agence ? Option
  retenue par défaut (non tranchée par le porteur), minimale : une colonne `works_approval_threshold` (decimal, nullable = pas d'accord
  requis) sur `owner_profiles`, qui **est** la relation bailleur–agence ; au-delà, l'approbation du
  donneur d'ordre fait passer le devis en `awaiting_owner`, et seul le bailleur du bien tranche.
  Pas d'entité `ManagementMandate` tant que commission et fréquence de versement n'en ont pas besoin.
- **ADR 2 (léger) — note vocale (P19)** : type `audio` dans `MessageType`, fichier privé dans la
  collection `attachments` du message (R2, ADR-0029), ≤ 60 s et ≤ 2 Mo, formats acceptés, rétention.

**Coordination vague 73**

- **587** possède `SystemRoleCapabilities`, `MembershipCapabilityResolver` et la garde « capacité
  sans lecteur ». Ce ticket touche **seulement** `SystemRoleCapabilities::serviceProvider()` (retrait
  de `maintenance.*`) et `MembershipCapabilityResolver::serviceProviderRoleAllows()` (filtre
  collaboration `active`) ; il **donne un lecteur** à `maintenance.assign` et `maintenance.close`.
- **588** possède `NotificationService`, les canaux et `PreferenceResolver` : l'écouteur de ce ticket
  appelle l'API de notification telle qu'elle est ; le choix SMS/WhatsApp et le défaut « SMS pour le
  prestataire » sont à 588. Les `notify(` du domaine maintenance réécrits ici font foi (règle 1).
- **589** (P9) envoie les invitations prestataire par téléphone dans `InvitationService` ; ce ticket
  ne touche que la validation du lien profond (`ServiceProviderInvitationService::normaliseMaintenanceRequestId`)
  et l'assignation en fin d'onboarding (`ServiceProviderOnboardingService`). 589 touche aussi
  `ServiceProviderOnboardingService::verifyOtp` (retrait du code fixe `123456`) : seul `complete()`
  (filtre d'activation, refus du profil suspendu, assignation) est à nous ; ordre de fusion
  indifférent, conflit de lignes voisines.
- **Messagerie** : `SendMessageConversationRequest` et `MessageType` ne sont dans aucun autre
  territoire ; ce ticket les prend (fermeture de `type`, audio). `ConversationController::sendMessage`
  n'est modifié que pour l'écriture du fichier audio.
- **601** porte les `mimes` des uploads KYC et laisse `SubmitQuoteRequest` hors de son périmètre :
  ses `mimes` sont à nous (E).
- **591** ajoute le type `maintenance` au calendrier (P17) : il lit `scheduled_at` et doit réutiliser
  le périmètre `MaintenanceRequest::scopeVisibleTo()` livré ici.
- **594** crée `MaintenanceRequestObserver` (facture prestataire). **Ce ticket n'en crée pas** ; il
  émet `MaintenanceStatusChanged`. Avec la clôture contradictoire, `closed` (et non `completed`) est
  le moment où le travail est reconnu : à arbitrer avec 594.
- **597** (P20) note le prestataire après `closed`.
- **601** possède `OwnerProfile` : ce ticket n'y ajoute que la colonne de l'ADR 1 (fillable + cast).
- **586** retire la branche courtier voisine dans `AgencyController::visibleAgencyIds` (`:332-337`) :
  conflit de lignes voisines seulement.

## Delta à produire

Sous-parties livrables en commits successifs, **A et B d'abord**.

**A. Machine d'état et autorisation par acteur (P2, P10 back, P14 back)**

- [x] `App\Services\Maintenance\MaintenanceStateMachine` : table **unique** (générique + devis, y
      compris `cancelled` depuis les états de devis pour le donneur d'ordre) et matrice (acteur, cible) ;
      `MaintenanceRequestService` et `MaintenanceQuoteWorkflow` la lisent
- [x] `MaintenanceRequestPolicy::transitionTo(User, MaintenanceRequest, MaintenanceStatus)` ;
      `UpdateStatusMaintenanceRequestRequest::authorize()` l'appelle
- [x] `UpdateMaintenanceRequestRequest` : `status`, `started_at`, `completed_at` → `prohibited` ;
      `PRINCIPAL_FIELDS` += `estimated_cost`, `actual_cost`, `access_instructions`
- [x] `actAsPrincipal` exige `maintenance.assign` pour la branche équipe ; la clôture par le donneur
      d'ordre exige `maintenance.close`
- [x] Réécrire `MaintenancePrincipalFieldsTest::test_assigned_provider_keeps_status_and_report`
- [x] Tests : `MaintenanceStatusBypassTest`, `MaintenanceStateMachineTest`

**B. Assignation gardée, collaboration, cloisonnement (P3, P5, P18, B13, B17, O1)**

- [x] Règle `App\Rules\AssignableProvider` sur `assigned_to` (store et update)
- [x] `MaintenanceRequestPolicy` : branche prestataire gardée par la collaboration active et le profil
      actif ; branche équipe par le prédicat 587 ; `MaintenanceRequest::scopeVisibleTo(User)` lu par
      `index`
- [x] `MaintenanceRequestService::assign()` (appelé par `update` quand `assigned_to` change) :
      remet `accepted_at` à null, émet l'événement
- [x] Migration `add_assignment_fields_to_maintenance_requests` (`accepted_at`, `access_instructions`)
- [x] `POST …/accept`, `POST …/decline` + `DeclineMaintenanceRequestRequest` ; refus possible tant que
      non accepté : `assigned_to` → null, retour à `open`, motif tracé (`activity()`) ; démarrer
      (`in_progress`) pose `accepted_at` s'il est nul
- [x] `AgencyController::visibleAgencyIds` (`:338-343`), `HasProfiles::isProviderAt`,
      `MembershipCapabilityResolver::serviceProviderRoleAllows` : collaboration `active` seulement
- [x] Migration `make_sp_agency_collab_unique_partial` : `sp_agency_collab_unique` remplacé par
      `sp_agency_collab_live_unique` `WHERE deleted_at IS NULL` ; `down()` le restaure
- [x] Endpoints de fin / pause de collaboration (agence, prestataire) + `ServiceProviderProfilePolicy::manageCollaboration`
- [x] Migration de données : retirer `maintenance.assign` / `maintenance.close` des rôles **système**
      `service_provider` ; `SystemRoleCapabilities::serviceProvider()` rendu vide
- [x] Lien profond : `InviteServiceProviderRequest` vérifie que la demande est de l'agence et non
      terminale ; fin d'onboarding : assignation (`accepted_at` null) à la demande de l'invitation
- [x] La pause par l'agence (endpoint ci-dessus) écrit `metadata.paused_by` et `metadata.paused_at`
      sur la collaboration ; `ServiceProviderOnboardingService::complete()` n'active plus que les
      collaborations `paused` **sans** `metadata.paused_by` (invitation en attente), et sur un profil
      `suspended` lève un 403 (clé `service_providers.onboarding.errors.suspended`, fr/en/wo) sans
      rien écrire — au lieu de le repasser à `active` (`:64-66`)
- [x] `ServiceProviderProfileController::scopeForAgency` (`:55-61`) : `filter[collaboration_status]`
      (défaut `active`), `filter[specialty]`, `filter[zone]` — un prestataire `ended` ne figure plus
      dans le carnet par défaut
- [x] Tests : `MaintenanceAssignableProviderTest`, `MaintenanceCollaborationAccessTest`,
      `MaintenanceOwnerIsolationTest`, `ServiceProviderCollaborationLifecycleTest`,
      `AgencyVisibilityForProviderTest`, `MaintenanceAcceptDeclineTest`, `ServiceProviderInvitationDeepLinkTest`,
      `ServiceProviderOnboardingReplayTest`, `ServiceProviderDirectoryFilterTest`,
      `MembershipCapabilityResolverTest` (cas collaboration `ended` / `paused`)

**C. Événement et notifications (C7, P4, P13, O14 partie notification)**

- [x] `App\Events\Maintenance\MaintenanceStatusChanged` émis par **chaque** chemin qui change le
      statut ou l'assignation (machine, devis, `complete`, accept/decline, confirm/contest, auto-clôture)
- [x] Écouteur `App\Listeners\Maintenance\NotifyMaintenanceParticipants` (découvert, pas
      d'`Event::listen`) : prestataire à l'assignation et aux décisions ; demandeur à chaque étape (avec
      `scheduled_at`) ; donneurs d'ordre (équipe + bailleur du bien) au devis soumis, au refus, à la fin
- [x] Réécrire les `notify(` de `MaintenanceRequestController` et `MaintenanceQuoteController` en clés
      `lang/{fr,en,wo}/maintenance.php`
- [x] `MaintenanceRequestResource` : `quote_*` masqués au demandeur non donneur d'ordre
- [x] Tests : `MaintenanceStatusChangedEventTest`, `MaintenanceNotificationsTest`

**D. Clôture contradictoire (P10, C7)**

- [x] `confirm-resolution` (`completed → closed`) et `contest-resolution` (`completed → in_progress`,
      commentaire + photos) + FormRequests
- [x] Commande `maintenance:auto-close` (quotidienne) : `completed` depuis 7 jours → `closed`, acteur nul
- [x] Tests : `MaintenanceResolutionConfirmationTest`, `MaintenanceAutoCloseCommandTest`

**E. Lecture des pièces et kit d'accès (P6, P7, P15 back)**

- [x] **En premier, avant tout bloc `media`** : `SubmitQuoteRequest` — `attachments.*` →
      `['file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:5120']` (`:29`). La réécriture de F garde cette
      règle à l'identique
- [x] Collection `before_photos` ; `UploadPhotosMaintenanceRequestRequest` l'accepte pour le
      prestataire accepté
- [x] Bloc `media` (URL signées par `PrivateMediaAccess::signedUrl`) ; `quotes` au donneur d'ordre et
      au prestataire seulement
- [x] Bloc `access` dans la fenêtre définie ci-dessus
- [x] Tests : `MaintenanceQuoteAttachmentTypeTest`, `MaintenanceMediaExposureTest`, `MaintenanceAccessKitTest`

**F. Devis (P11 back, P12, O14) — ADR 1 d'abord**

- [x] ADR 1 écrit et accepté
- [x] Migration `add_structured_quote_to_maintenance_requests` (`quote_lines` jsonb,
      `quote_valid_until`, `quote_estimated_duration_days`) ; `SubmitQuoteRequest` réécrit
- [x] Approbation refusée (422) sur un devis dont `valid_until` est passé
- [x] PDF du devis par le service Pdf existant
- [x] Migration `add_works_approval_threshold_to_owner_profiles` ; statut `awaiting_owner` ;
      `approveQuote`/`rejectQuote` tranchés par le bailleur du bien en `awaiting_owner`
- [x] Tests : `MaintenanceStructuredQuoteTest`, `MaintenanceOwnerApprovalThresholdTest`

**G. Front (P1, P11, P14, P15, P16, P17 liste)**

- [x] Assignation et planification depuis la fiche, invitation d'un nouveau prestataire avec lien profond
- [x] Actions, formulaire de devis (y compris après refus) et bouton de création rendus depuis `abilities`
- [x] Accepter / refuser ; kit d'accès ; galerie Avant / Après / Devis ; confirmation du locataire
- [x] Le prestataire ne se voit plus proposer le lien vers la fiche du bien, qui le mène à un refus
      (`MaintenanceDetail.tsx:169-177`) : le kit d'accès en tient lieu
- [x] Le choix des pièces du devis n'offre que les PDF et images acceptés par l'API ; un refus de type
      est affiché, les autres pièces restent sélectionnées
- [x] Photos de fin envoyées **dans** `PUT …/complete` ; photos « avant » au démarrage ; prise de vue directe
- [x] « Mes interventions » triée par créneau, avec quartier et agence
- [x] Section prestataire du profil ; `updateTrades` n'écrit que les clés présentes (test back)
- [x] Types front alignés (`awaiting_owner`, `abilities`, `media`, `access`)

**H. Fil de discussion et note vocale (P19) — ADR 2 d'abord, sauf la première case**

- [x] **Sans attendre l'ADR 2, livrable avec A et B** : `SendMessageConversationRequest` — `type` →
      `['nullable', Rule::in([MessageType::Text->value])]` (`:44`), étendu à `audio` par la case
      `MessageType::Audio` ci-dessous ; `system`, `image`, `document` postés par un participant → 422
      qui nomme `type`. `SystemMessageFactory` reste le seul écrivain de `system`
- [x] ADR 2 écrit et accepté
- [x] À la première assignation : conversation de groupe `maintenance_request_id` (donneur d'ordre
      qui assigne, prestataire, demandeur locataire), créée par `GroupConversationService` ;
      réassignation = échange du participant prestataire ; message système (code d'événement) à
      chaque `MaintenanceStatusChanged`
- [x] `MessageType::Audio` ; envoi d'un fichier audio dans `SendMessageConversationRequest`
- [x] Front : « Discuter » sur la fiche ; enregistrer, écouter une note vocale
- [x] Tests : `MessageTypeSpoofingTest`, `MaintenanceConversationTest`, `AudioMessageTest`

### Ajouté après vérification adverse (verif-592, 2026-10-07)

- [x] B1 — lien profond d'onboarding : une fois par invitation acceptée, demande libre et non
      commencée, prestataire assignable, sous verrou (`ServiceProviderOnboardingService`)
- [x] B2 — `ConversationAccess` : un fil d'intervention exige `MaintenanceRequestPolicy::view` en
      lecture, écriture, liste et notification
- [x] M1 — coût réel au donneur d'ordre à `complete` ; `OwnerApprovalThreshold` pour le devis et
      `actual_cost`
- [x] M2 — `update()` et `assign()` refusent l'état terminal
- [x] m1 — arrondi à l'unité de la devise dans `priceLines`
- [x] m8 — la réassignation archive et remet le devis à zéro
- [x] m9 — `manageQuotes` lit `maintenance.assign` ; limiteur `conversation-message` ; e-mail du
      demandeur après acceptation


## Critères d'acceptation

- [x] **AC1 (P2)** — Prestataire assigné, demande en `quote_submitted` : `PATCH {status: approved}`
      → **422 qui nomme `status`**, statut en base inchangé ; idem `{status: closed}` depuis `open`.
      `{completed_at: …}` et `{started_at: …}` → 422 qui nomme le champ, colonne inchangée ;
      `{actual_cost: 15000}` → **403**, `actual_cost` inchangé. Tous rougissent sur `e3ab4a4e` (200
      aujourd'hui) et en retirant `prohibited` / l'ajout à `PRINCIPAL_FIELDS`.
- [x] **AC2 (P10, P14)** — Prestataire : `PUT …/status` vers `cancelled` (depuis `in_progress`) et
      vers `closed` (depuis `completed`) → **403**. Donneur d'ordre : `cancelled` depuis
      `quote_requested` → 200 (422 aujourd'hui).
- [x] **AC3 (P3)** — `assigned_to` = un compte sans collaboration `active` avec l'agence du bien →
      **422 sur `assigned_to`** (store et update) ; collaboration `ended` → 422 ; `active` + profil
      `active` → 200. Rouge aujourd'hui (200).
- [x] **AC4 (P3)** — Collaboration passée à `ended` (ou profil `suspended`) : `GET show` → 403, la
      demande absente de `GET index`, `PATCH` → 403 ; ses demandes non terminales de cette agence
      reviennent à `assigned_to = null`, `status = open`.
- [x] **AC5 (O1)** — Deux bailleurs de la même agence, B1 et B2 : B2 sur une intervention du bien de
      B1 → `show` 403, absente de `index`, `PATCH {priority}` 403, `quote/approve` 403, `store` sur
      le bien de B1 403. Un
      agent de l'agence → 200 (témoin). Rouge aujourd'hui pour B2.
- [x] **AC6 (B13)** — Prestataire à collaboration `ended` : `GET /api/agencies/{id}` → 404 ; `active` → 200.
      Même prestataire, collaboration `ended` portant un `agency_role_id` dont le rôle accorde une
      capacité : `MembershipCapabilityResolver` la **refuse** (accordée aujourd'hui) et
      `isProviderAt($agencyId)` rend `false` (`true` aujourd'hui) ; `active` → accordée / `true`.
- [x] **AC7 (B17)** — Fin puis reprise de la collaboration du même couple : une seule ligne vivante,
      statut `active`, aucune erreur 23505 ; une ligne supprimée en douceur n'empêche pas une création.
- [x] **AC8** — Chaque chemin de changement émet **exactement un** `MaintenanceStatusChanged` portant
      `from`, `to` et l'acteur (`Event::fake`, un test par chemin) ; le diff ne crée aucun
      `MaintenanceRequestObserver`.
- [x] **AC9 (C7, P4)** — Assignation : le prestataire reçoit une notification dont le titre est la
      chaîne de **sa** langue (compte en `wo` → texte wolof du fichier `lang/wo/maintenance.php`). Le
      locataire demandeur reçoit une notification à `assigned`, `in_progress` et `completed`.
- [x] **AC10 (P13, O14)** — Devis soumis sur une demande ouverte par le locataire : aucune
      notification au locataire, une à l'équipe de l'agence **et** au bailleur du bien ; même chose
      quand un agent a ouvert la demande. `GET show` par le locataire : `data.quote_amount` **absent**.
- [x] **AC11 (P5)** — `accept` par le prestataire assigné pose `accepted_at` ; par un autre → 403.
      `decline {reason}` avant acceptation : `assigned_to = null`, `status = open`, donneur d'ordre
      notifié avec le motif ; après acceptation ou démarrage → 422.
- [x] **AC12 (P10)** — `completed` → `confirm-resolution` par le demandeur → `closed` ;
      `contest-resolution` → `in_progress`, prestataire et donneur d'ordre notifiés. `maintenance:auto-close`
      clôt une demande `completed` il y a 7 jours et **pas** une à 6 jours.
- [x] **AC13 (P6)** — Prestataire accepté, demande `in_progress` : `access.street`,
      `access.requester_phone`, `access.latitude` présents. Avant acceptation, après `closed`, ou pour
      le demandeur : clé `access` **absente**.
- [x] **AC14 (P7)** — `GET show` rend `media.photos`, `media.completion_photos`, `media.before_photos`
      en URL signées qui se téléchargent pour un lecteur autorisé ; `media.quotes` absent pour le
      demandeur locataire.
- [x] **AC15 (P12)** — Devis `lines` = 2 × 7 500 (main-d'œuvre) + 1 × 12 000 (fourniture) →
      `quote_amount` = **27000.00** ; `currency` envoyée → 422 ; approbation après `valid_until` → 422.
- [x] **AC16 (O14)** — Seuil du bailleur 50 000 : l'agent approuve un devis de 75 000 →
      `awaiting_owner`, bailleur notifié ; le bailleur approuve → `approved` ; un autre bailleur de
      l'agence → 403. Devis de 40 000 → `approved` directement. Seuil nul → comportement actuel.
- [x] **AC17 (capacités)** — Un agent dont le rôle personnalisé n'a pas `maintenance.assign` :
      `PATCH {assigned_to}` → 403 ; avec → 200. Un agent dont le rôle n'a pas `maintenance.close` :
      `PUT …/status {closed}` depuis `completed` → 403 (200 aujourd'hui) ; avec → 200. Après la
      migration de données, aucun rôle système `service_provider` ne porte `maintenance.*`.
- [x] **AC18 (P18)** — Invitation portant la demande d'une **autre** agence → 422. Demande de
      l'agence non terminale : en fin d'onboarding, elle est assignée au nouveau prestataire et son
      `GET show` rend 200.
- [x] **AC18b (fin d'onboarding rejouée)** — Prestataire actif, téléphone vérifié, une collaboration
      `paused` avec `metadata.paused_by` (pause de l'agence) et une `paused` sans (invitation en
      attente) : `POST /api/service-provider/onboard/complete` → la première **reste `paused`**, la
      seconde passe `active` (aujourd'hui les deux passent `active` : rouge). Profil `suspended` : même
      appel → 403, profil toujours `suspended`, aucune collaboration modifiée (aujourd'hui 200 et
      profil `active` : rouge). Ablation : retirer le filtre `paused_by` ou la garde `suspended` → rouge.
- [x] **AC18c (carnet)** — `GET /api/agencies/{id}/service-providers` sans filtre : un prestataire à
      collaboration `ended` **absent**, un `active` présent ; `filter[collaboration_status]=ended` le
      rend. Rouge aujourd'hui (le `ended` est listé).
- [x] **AC19 (P1, P11, P14 — front, vitest)** — Fiche vue par le prestataire en `quote_submitted` :
      ni « Approuver » ni « Annuler » ; en `rejected` : le formulaire de devis est présent et aucun
      bouton n'appelle `PUT …/status`. Vue par l'agence : pas de formulaire de devis, un bloc
      d'assignation qui appelle `PATCH` avec `assigned_to` et `scheduled_at`. Vue par le prestataire :
      aucun lien vers `/app/properties/{id}`.
- [x] **AC20 (P15 — front)** — Un échec de `PUT …/complete` avec photos affiche une erreur et garde
      les fichiers sélectionnés ; aucune requête d'upload séparée n'est émise après la complétion.
- [x] **AC21 (P16, P17)** — `PATCH …/trades` portant seulement `intervention_zones` laisse
      `specialties` inchangé ; la liste du prestataire part avec `sort=scheduled_at` et inclut le bien
      (quartier) et l'agence ; « Nouvelle demande » ne lui est pas proposée.
- [x] **AC22 (P19)** — Première assignation : une conversation `maintenance_request_id` avec le
      prestataire et le locataire ; une seconde assignation n'en crée pas une deuxième ; une note
      `audio` de ≤ 60 s est acceptée (201, fichier privé), un `type=audio` sans fichier ou un fichier
      texte → 422.
- [x] **AC22b (avis système usurpé)** — Participant actif d'une conversation :
      `POST /api/conversations/{id}/messages {content: "…", type: "system"}` → **422 qui nomme
      `type`**, aucun message créé (201 aujourd'hui, message `system` créé : rouge) ; idem `image` et
      `document` ; sans `type` ou `type=text` → 201. Ablation : remettre `Rule::enum(MessageType::class)` → rouge.
- [x] **AC23** — Aucun `notify(`/`abort(` ajouté ou réécrit par ce ticket ne porte de littéral ;
      chaque clé ajoutée existe en `fr`, `en` et `wo`.
- [x] **AC24 (pièces du devis)** — Prestataire assigné, demande en `quote_requested` :
      `POST …/quote/submit` avec `attachments[0]` = `UploadedFile::fake()->create('devis.html', 10, 'text/html')`
      → **422 qui nomme `attachments.0`**, statut toujours `quote_requested`, collection `quotes`
      vide ; idem un `.svg` (`image/svg+xml`). Avec `devis.pdf` (`application/pdf`) → 200 et
      **1** média dans `quotes`. Rouge aujourd'hui (200 et le `.html` stocké) ; ablation : retirer
      `mimes` → rouge. Écrit en E avec le corps en vigueur ; F le garde en passant au corps `lines[]`.

### Ajoutés après vérification adverse (verif-592)

Chaque AC ci-dessous a été vérifié deux fois :

- rouge sur `05dce4fc`, sauf mention contraire (fichiers de production remis à leur version
  `05dce4fc`, restaurés par `cp`) ;
- rouge à son ablation, restaurée par `cp`.

Le détail est dans les Notes, section « Corrections après vérification adverse ».

- [x] **AC25 (B1)** — `onboard/complete` rejoué rend 200 et ne fait rien de plus : il ne reprend
      ni une demande réassignée et démarrée (v07), ni une demande libérée entre-temps.
      `completed`, une demande tenue par un autre, un prestataire en pause et une invitation non
      acceptée ne déclenchent aucune assignation.
      Preuve : `ServiceProviderInvitationDeepLinkTest`, 5 rouges sur `05dce4fc`, 5 ablations
      rouges (dont X17).
- [x] **AC26 (B2)** — Un prestataire en pause (v08), suspendu (v09) ou en fin de collaboration sur
      une demande `completed` (v10) n'a plus accès au fil :
      - la conversation et ses messages rendent 403, en lecture comme en écriture ;
      - la conversation est absente de sa liste ;
      - il ne reçoit plus de notification de message.

      Un prestataire actif garde le fil.
      Preuve : `MaintenanceThreadAccessTest`, 3 rouges sur `05dce4fc`, 4 ablations rouges.
- [x] **AC27 (M1)** — Le prestataire qui porte `cost` ou `actual_cost` à `complete` reçoit 403
      (v04). Un `actual_cost` au-delà du plafond du bailleur et de ce qu'il a approuvé reçoit 422
      quand l'équipe l'écrit (v05) ; le bailleur, lui, l'écrit. Égal au plafond : l'équipe
      l'écrit.
      Preuve : `MaintenanceActualCostTest`, 4 rouges sur `05dce4fc`, 5 ablations API et 2 ablations
      front rouges.
- [x] **AC28 (M2)** — Une demande `closed` ou `cancelled` rend 422 `terminal_request` au `PATCH`
      et à l'assignation (v01, v02, v03). En `completed`, les notes restent au prestataire et le
      coût au donneur d'ordre.
      Preuve : `MaintenanceTerminalRequestTest`, 3 rouges sur `05dce4fc`, 2 ablations rouges.
- [x] **AC29 (m1)** — En XOF, 1,5 × 333,33 donne 500 (v06), chaque ligne puis le total arrondis à
      l'unité, la moitié vers le haut. En EUR, 1,5 × 10,01 donne 15,02.
      Preuve : `MaintenanceStructuredQuoteTest`, 2 rouges sur `05dce4fc`, 4 ablations rouges.
- [x] **AC30 (m2 à m6)** — Les branches X5, X7, X14, X25 et X11 sont gardées.
      Preuve : `MaintenanceGuardedBranchesTest`, 5 tests, chaque ablation 1 rouge. Le code était
      juste sur `05dce4fc` : ces tests y sont verts.
- [x] **AC31 (m8)** — Réassigner après un devis l'archive dans `metadata.previous_quotes[]`, le vide
      et revient en `quote_requested` ; B ne démarre plus sur le devis de A (v19).
      Preuve : `MaintenanceReassignmentQuoteResetTest`, 2 rouges sur `05dce4fc`, 3 ablations rouges.
- [x] **AC32 (m9)** — Quatre points, chacun rouge sur `05dce4fc` sauf le dernier, et chacun avec
      ses ablations rouges :
      - un agent sans capacité `maintenance.*` reçoit 403 pour décider d'un devis (v16) ;
      - le 31ᵉ message en une minute reçoit 429, et un autre utilisateur poste encore ;
      - l'e-mail du demandeur n'atteint le prestataire qu'après acceptation ;
      - le prestataire ne voit pas le bloc d'assignation (F1 : 2 rouges).


## Hors périmètre

- Facture prestataire et paiement Wave / Orange Money (P8) : TCK-594.
- Invitation et connexion par téléphone (P9) : TCK-589.
- Notation et annuaire public des prestataires (P20) : TCK-597.
- Type `maintenance` du calendrier (partie calendrier de P17) : TCK-591.
- Acheminement SMS/WhatsApp et préférences par défaut : TCK-588.
- Le reste de O1 (baux, loyers, versements, documents…) : TCK-587.
- Code de fin à 4 chiffres saisi sur place, file d'attente hors ligne des photos, mise en concurrence
  de plusieurs devis, contrats de maintenance récurrents (P3 de §1.8).
- La spec : les lignes manquantes sont remises à la session (notes), TCK-446 garde la sienne.

## Notes d'implémentation

### 2026-10-07 — re-mesure sur 5f872f1f (worktree `takussan-tck-592`)

- Constats §1-§2 re-lus et confirmés aux mêmes lignes : `UpdateMaintenanceRequestRequest.php:39,88,90,93`,
  `MaintenanceRequestPolicy.php:31,33,49,51,103,112`, `SystemRoleCapabilities.php:84-85,103-104`,
  `SubmitQuoteRequest.php:28-29`, `SendMessageConversationRequest.php:44`.
  `grep -rn "ServiceProviderProfileStatus::Suspended\|CollaborationStatus::Ended" app` → 0.
- `properties.agency_id` est **nullable** (factory : `null`). Décision : un bien **sans agence** n'a aucun
  prestataire assignable (aucune collaboration ne peut le viser) ; son donneur d'ordre reste son
  bailleur (`property.user_id`). Les tests existants qui assignaient un compte quelconque sur un bien
  sans agence sont réécrits sur un bien d'agence avec une collaboration `active`.
- Les quatre classes `Quote*` (`QuoteSubmitted`, `QuoteApproved`, `QuoteRejected`,
  `MaintenanceQuoteRequested`) n'ont **aucun** `new` dans `app/` (seule la table d'`AppDatabaseChannel`
  les nomme) : supprimées par ce ticket (coordination 588, contrainte 8).

### A — machine d'état et autorisation par acteur

- `MaintenanceStateMachine` porte la table unique (les deux constantes `TRANSITIONS` sont supprimées)
  et la matrice (acteur, cible). Ajouts à la table : `assigned → quote_requested` (une demande
  `assigned` n'avait aucun chemin vers le devis), `* → cancelled` depuis les quatre états de devis,
  `completed → in_progress` (contestation, D). `PUT …/status` refuse en **422** les cibles de devis et la
  contestation (`isGeneric`) : approuver par le générique contournerait la validité du devis et le
  plafond du bailleur (F).
- Le bailleur du bien (`property.user_id`) n'est pas gardé par `maintenance.assign` / `maintenance.close` :
  ces capacités sont d'agence, et seule la branche **équipe** les lit (`isTeamPrincipalFor`).
- `PATCH` retire en plus `status`/`started_at`/`completed_at` du corps validé : `prohibited` laisse passer
  `null`, et `{status: null}` aurait écrit `null`.
- Exécutions : `php artisan test tests/Feature/Maintenance tests/Unit/Services/Maintenance
  tests/Feature/Api/MaintenanceRequestTest.php tests/Feature/Services/MaintenanceQuoteWorkflowTest.php
  tests/Feature/Api/MaintenancePrincipalFieldsTest.php` → 45 verts.
- Ablations (script `abl.sh` : remplacer, rejouer, restaurer) : `status` non `prohibited` → 2 rouges ;
  `completed_at` non `prohibited` → 1 rouge ; coûts hors `PRINCIPAL_FIELDS` → 1 rouge (le témoin reste
  vert) ; `authorize()` du statut ramené à `update` → 1 rouge ; lecteur `maintenance.assign` retiré →
  1 rouge ; lecteur `maintenance.close` retiré → 1 rouge ; `quote_requested → cancelled` retiré → 1 rouge.

### H (première case) — fermeture de `type`

- `SendMessageConversationRequest::PARTICIPANT_TYPES = [Text]` (`Rule::in`), étendu à `Audio` avec l'ADR 2.
  Le front n'envoie jamais `type` (`useSendMessage` : `{content}` seul) — rien à adapter.
- `php artisan test tests/Feature/Messaging/MessageTypeSpoofingTest.php` → 2 verts. Ablation
  `Rule::enum(MessageType::class)` remis → 1 rouge (le refus), le témoin `text` reste vert.

### B — assignation gardée, collaboration, cloisonnement

- `ProviderEligibility` porte le prédicat unique « assignable au bien » (collaboration `active` + profil
  `active` avec l'agence du bien, ou personnel de l'agence) ; la règle `AssignableProvider`, la policy
  (`isAssignedProvider`) et `scopeVisibleTo` le lisent tous. Écart avec le ticket : la case « branche
  équipe par le prédicat 587 » reste ouverte — `isAgentAt || isAgencyAdminAt` en attendant la fusion.
- Fin de collaboration : interventions non démarrées **et** `in_progress` désassignées (`open`), une
  `completed` reste à son prestataire. Pause : posée par l'agence seule (`metadata.paused_by`), le
  prestataire ne peut que mettre fin (`status` ∈ [ended], 422 sinon). Reprise = la même ligne.
- Le carnet : `filter[collaboration_status]` accepte une liste à virgules (`active,paused`) — le front
  peut ainsi montrer les invitations en attente. `viewAny(agency)` ouvert à `maintenance.assign` : qui
  assigne choisit dans le carnet, sans pouvoir inviter.
- Rôle système prestataire : l'agence sème un rôle système par type à sa création — le test de la
  migration de données réinjecte l'ancien catalogue sur ces rôles-là, puis joue `up()`.
- Exécutions : `tests/Feature/{Maintenance,ServiceProvider,Onboarding,Agency,Invitation}`,
  `tests/Unit/Services/{Membership,Maintenance}`, `tests/Feature/Api/Maintenance*` → 336 verts ;
  27 autres fichiers qui nomment maintenance / collaboration / prestataire (`Database`, `Validation`,
  `Policies`, `Messaging`, `Authorization`, `Media`, `Dashboard`…) → 368 verts.
- Ablations (chacune rejouée sur sa classe, puis restaurée) : `AssignableProvider` neutralisée → 5
  rouges ; filtre collaboration `active` d'éligibilité → 1 ; filtre profil `active` → 2 ; policy sans
  éligibilité → 1 ; `scopeVisibleTo` sans agence assignable → 1 ; `isPrincipalFor` sans prédicat équipe
  → 1 ; `scopeVisibleTo` sans prédicat équipe → 1 ; `visibleAgencyIds` sans filtre → 2 ; résolveur sans
  filtre → 2 ; `isProviderAt` sans filtre → 2 ; onboarding sans filtre `paused_by` → 1 ; sans garde
  `suspended` → 1 ; carnet sans filtre de statut → 1 ; fin sans désassignation → 2 ; onboarding sans
  assignation du lien profond → 1 ; invitation sans « même agence » → 1, sans « non terminale » → 1 ;
  `respondToAssignment` élargi à tout prestataire de l'agence → 1 ; refus sans garde `accepted_at` → 1 ;
  `assign()` sans remise à zéro → 1 ; index unique sans `WHERE deleted_at IS NULL` → 1 ; catalogue
  prestataire rempli → 1 ; migration de données neutralisée → 1.
- Écart re-mesuré : la policy seule ne fait rougir qu'**un** test d'accès (le profil suspendu) — une
  collaboration finie désassigne déjà, l'accès tombe par `assigned_to`. Les deux gardes se recouvrent
  pour `ended`, pas pour `suspended`.

### C — événement et notifications

- Chaque geste du devis émet l'événement ; `start` emprunte la transition du service (une seule
  source pour `started_at`, `accepted_at` et l'événement). Soumettre un devis pose `accepted_at` :
  chiffrer, c'est accepter (un refus ensuite → 422).
- `NotifyMaintenanceParticipants` (découvert : `php artisan event:list` le liste, aucun `Event::listen`)
  rend chaque texte dans la langue du destinataire (`preferredLocale()`). Les donneurs d'ordre sont
  le bailleur du bien et l'équipe de l'agence qui tient `maintenance.assign` (`MaintenanceParticipants`,
  relu par H pour le fil). L'auteur d'un geste n'en est jamais notifié ; un destinataire à deux rôles
  n'en reçoit qu'une.
- Le demandeur ne voit que `acknowledged / assigned / in_progress / completed / closed / cancelled` —
  aucun état de devis. Les `quote_*` (et `quote_decision_by`) sont retirés de la ressource pour qui
  n'est ni prestataire assigné ni donneur d'ordre : `mergeWhen()` n'est **pas** utilisable ici, les
  contrôleurs appellent `toArray()` directement et une valeur conditionnelle n'y est jamais résolue.
  `DateRepresentationTest` prend désormais le prestataire comme appelant représentatif.
- Les quatre classes `Quote*` mortes et leurs lignes d'`AppDatabaseChannel` sont **supprimées**
  (coordination 588). Seuls `tests/impact-map.json` (généré) et un ticket clos (TCK-095) les nomment.
- Exécutions : `tests/Feature/Maintenance tests/Feature/ServiceProvider tests/Feature/Api/Maintenance*
  …MaintenanceQuoteControllerTest …MaintenanceQuoteWorkflowTest tests/Feature/Notifications
  tests/Unit/Http/Resources …` → 270 verts (après correction de `DateRepresentationTest`).
- Ablations : devis soumis sans événement → 1 rouge ; `start` qui émet deux fois → 1 ; devis notifié au
  demandeur → 1 ; titre rendu sans la langue du destinataire → 3 ; `quote_*` rendus au locataire → 1 ;
  auteur notifié → 1 ; refus sans motif → 1 ; équipe retirée des donneurs d'ordre → 2.

### D — clôture contradictoire

- `POST …/confirm-resolution` et `…/contest-resolution` : le **demandeur ou un donneur d'ordre** (contrat
  de données ; les contraintes ne nomment que le demandeur, le contrat tranche), **jamais le
  prestataire** ; policy `respondToResolution` = statut `completed` ET (demandeur ou donneur d'ordre)
  ET `transitionTo` (l'équipe clôt sous `maintenance.close`). Un autre bailleur de l'agence → 403.
- La contestation remet `completed_at` à nul (le délai de 7 jours repart de la fin suivante), garde le
  prestataire, range les photos dans `photos` (privée) et trace le commentaire (`activity()`).
- `maintenance:auto-close {--days=7}` : planifiée `dailyAt('04:00')` dans `routes/console.php`,
  clôt par `confirmResolution(…, null, auto_closed)` — un seul chemin d'écriture.
- Exécutions : `MaintenanceResolutionConfirmationTest` + `MaintenanceAutoCloseCommandTest` → 10 verts ;
  `MaintenanceStatusChangedEventTest` (confirm et contest ajoutés) → 16 verts.
- Ablations : confirm/contest ouverts à tout lecteur (`return true`) → 2 rouges (prestataire, autre
  bailleur) ; seuil à 6 jours → 1 ; contestation
  sans remise à nul de `completed_at` → 1.

### E — lecture des pièces, kit d'accès, `abilities`

- `SubmitQuoteRequest` (`mimes:pdf,jpg,jpeg,png,webp`) committé **seul et avant** le bloc `media`
  (03da56b5). `MaintenanceQuoteAttachmentTypeTest` : `.html`, `.svg`, `.txt` → 422 sur `attachments.0` ;
  témoin PDF + image → 200. Ablation `mimes` retiré → 3 rouges.
- `media`, `access` et `abilities` ne sont rendus que pour **la demande de la route**
  (`{maintenanceRequest}` lié) : la liste n'en porte pas (sinon une requête de médias et une batterie
  de policies par ligne). Garde `hasParameter()` : une route non liée lève sur `parameters()`
  (`DateInventoryByValueTest` l'a montré).
- `access` : prestataire assigné ET `accepted_at` ET ni `closed` ni `cancelled` ET `actAsProvider`
  (collaboration toujours active). `access_instructions` n'est lu, en clair, que par le donneur
  d'ordre ; le demandeur ne le reçoit pas.
- `abilities.transitions` suit les deux portes de `PUT …/status` : `update` puis (acteur, cible),
  cibles génériques seulement. Le demandeur n'y a rien — il confirme par son geste.
- Photos « avant » : `before_photos` (privée), prestataire assigné (403 sinon), accepté (422
  `before_photos_requires_acceptance` sinon). `MediaDiskCollectionsTest` enregistre la collection.
- Disque de test : la sortie privée **redirige** (302, le disque factice émet une URL temporaire) ; le
  test de téléchargement accepte 200 ou 302 et vérifie la signature (une signature altérée → 403).
- Exécutions : `tests/Unit/Http/Resources tests/Feature/Media tests/Feature/Maintenance` → 355 verts.
- Ablations : `media.quotes` pour tous → 1 rouge ; kit d'accès avant acceptation → 1 ; après clôture
  ou annulation → 2 ; photos « avant » sans acceptation → 1 ; transitions sans la porte `update` → 1 ;
  consignes rendues au demandeur → 1.

### F — devis structuré et plafond du bailleur (ADR-0037, 74dc631f)

- `SubmitQuoteRequest` : `lines[] {label, kind: labour|supply, quantity, unit_price}` (≤ 2 décimales),
  `valid_until` (requis, ≥ aujourd'hui), `estimated_duration_days` ; `amount` et `currency`
  `prohibited`. La règle `mimes` de E est gardée à l'identique. `authorize()` délègue à
  `actAsProvider` (403 avant 422) ; `RejectQuoteRequest` à `decideQuote`.
- Montant en `bcmath` (exact), lignes en chaînes décimales dans `quote_lines` (jsonb). Re-soumettre
  après refus efface la décision précédente (`quote_decision_*`, motif).
- Écart avec le ticket : `valid_until` est **requis** (le contrat de données le liste sans dire
  optionnel ; un devis sans validité ne s'expire jamais, ce qui vide AC15 de son sens).
- `awaiting_owner` : `quote_submitted → awaiting_owner`, sortie `approved | rejected | cancelled`, hors
  `GENERIC_TARGETS` (PUT → 422). Le plafond lu est celui du couple (bailleur du bien, agence du bien) ;
  strictement au-delà. Le bailleur qui approuve lui-même approuve directement.
- PDF : `GET …/quote/pdf` (policy `viewQuote` : prestataire ou donneur d'ordre ; 404 sans devis) →
  `DocumentPdfService::stream('pdf.maintenance.quote', …)`, libellés `maintenance.quote_pdf.*` dans la
  langue du lecteur. Le gabarit est rendu réellement par Blade dans un test (wo).
- Exécutions : `MaintenanceStructuredQuoteTest` + `MaintenanceOwnerApprovalThresholdTest` → 16 verts ;
  `tests/Feature/{Maintenance,ServiceProvider,Media,Validation,Database}`, `tests/Unit/{Services/Maintenance,
  Http/Resources,Policies}`, `tests/Feature/Api/Maintenance*` et les tests de devis → 615 verts.
- Ablations : montant = dernière ligne → 1 rouge ; devise acceptée → 1 ; validité non contrôlée → 1 ;
  plafond ignoré → 1 ; `awaiting_owner` ouvert à l'équipe → 1 ; le bailleur attend aussi → 1 ;
  `quote_lines` rendues au locataire → 1 (ce dernier était **vert** avant que le test d'AC10 n'assère
  aussi l'absence de `quote_lines` et `quote_currency` : assertion ajoutée).

### H — fil par intervention et note vocale (ADR-0038, 23e24f87)

- `SyncMaintenanceConversation` (écouteur synchrone, découvert) : à la première `CAUSE_ASSIGNED`,
  conversation de groupe `maintenance_request_id` (créateur = l'acteur, sinon le bailleur ; assigné +
  demandeur) ; réassignation, désassignation, refus → échange du participant prestataire ; un message
  `system` codé (`event=maintenance`, cause, statuts) à chaque événement, rendu par `maintenance.system.*`.
  `conversation_id` est rendu au seul participant actif, sur le détail.
- `MessageType::Audio` : `audio` requis/interdit selon `type`, mimes webm/ogg/mp4/m4a/aac/mpeg, ≤ 2 Mo,
  `duration` 1..60 déclarée (ADR-0038 §3) ; fichier dans `attachments` (privée), `MessageResource` rend
  `attachments[]` signés et `metadata`.
- Exécutions : `AudioMessageTest` (7) + `MaintenanceConversationTest` (4) verts ; `tests/Feature/{Messaging,
  Maintenance,Media}`, `GroupConversationCreationTest`, `tests/Unit/Http/Resources` → 474 verts.
- Ablations : taille non bornée → 1 rouge ; type de fichier non contrôlé → 1 ; fichier non requis → 1 ;
  réassignation sans échange → 2 ; aucun avis d'étape → 1 ; un fil par assignation → 3.

### G (côté API) — ce que le front lit pour ne plus deviner

- `abilities` gagne `can_request_quote` (`manageQuotes` + machine), `can_decide_quote` (`decideQuote`,
  `quote_submitted|awaiting_owner`) et `can_view_quote_pdf` (`viewQuote`, devis soumis) — chacun rejoué
  contre l'endpoint dans `MaintenanceAbilitiesTest`.
- Liste : `meta.abilities.can_create` (`MaintenanceRequestPolicy::openRequests`, mêmes portes que `store`
  jugées sans bien) ; avec `include=property`, le bien vient avec adresse (quartier) et agence `{id, name}`.
- `updateTrades` n'écrit que les clés présentes ; une liste vide explicite efface toujours.
- Exécutions : `MaintenanceAbilitiesTest`, `MaintenanceProviderListTest`, `ServiceProviderTradesPartialUpdateTest`,
  `ServiceProviderOnboardingTest` → 20 verts ; `tests/Feature/Maintenance` + `tests/Unit/Http/Resources` → 179 ;
  les 19 autres fichiers qui appellent `maintenance-requests` → 136 verts.
- Ablations : clé métiers absente lue comme vide → 2 rouges ; création ouverte à tous → 1 ; liste sans
  adresse ni agence → 1 ; décision proposée à l'équipe en `awaiting_owner` → 1.

### G — front : la fiche, la liste, le profil, le fil

- Fiche : chaque action naît de `abilities` (`MAINTENANCE_TRANSITIONS` supprimé). Blocs neufs :
  `MaintenanceProviderResponse` (accepter / refuser + motif), `MaintenanceAccessKit` (adresse,
  itinéraire, appel, consignes, « Discuter » → `/app/messages?conversation=`), `MaintenanceAssignmentBlock`
  (carnet `filter[collaboration_status]=active` du métier, indisponibilité du jour signalée, `PATCH
  {assigned_to, scheduled_at}`, invitation à lien profond par `InviteServiceProviderSheet`),
  `MaintenanceGallery` (Signalement / Avant / Après / Devis, photos « avant » à l'appareil),
  `MaintenanceResolutionResponse`, `QuoteActions` (demander, trancher, PDF en blob). Le lien vers le
  bien n'est rendu qu'au donneur d'ordre (`can_manage_quotes`).
- Devis en lignes (`QuoteSubmitForm`), `accept` limité aux types de l'API, refus de type nommé à la
  sélection. Photos de fin DANS `PUT …/complete` (multipart `POST` + `_method=PUT` : PHP ne lit pas
  un corps multipart sur `PUT`) ; un échec s'affiche et garde les fichiers.
- Liste : `include=property` + `agency_id`, quartier et agence par ligne, `sort=scheduled_at` pour le
  prestataire (rôle principal), « Nouvelle demande » derrière `meta.abilities.can_create`.
- Profil : `ProfileServiceProviderSection`, quatre réglages enregistrés un par un (lecture :
  `GET /api/me/profiles/{sp}`, ajouté avec son test). Fil : `VoiceNoteRecorder` (`MediaRecorder`,
  60 s, rien rendu sans support), lecteur `audio` dans la bulle, avis `maintenance` rendus par code.
- Dictionnaires : `maintenance.status.awaiting_owner` (une ligne), puis blocs propres
  `maintenance.intervention`, `messaging.voiceNote`, `messaging.maintenanceEvents`,
  `profile.serviceProvider` (fr/en/wo), insérés sans reformater le fichier (diff : ajouts seuls).
- Exécutions : `MaintenanceDetail` (8), `MaintenanceCompleteForm` (2), `MaintenanceList` (3),
  `QuoteSubmitForm` (3), `SystemMessageBubble` → verts ; `src/components/{maintenance,messages,profile,
  service-providers,onboarding}`, `src/types`, `src/lib/{queries,__tests__}` et les pages maintenance /
  profil → 97 fichiers, 1100 verts. `npm run lint` et `tsc --noEmit` propres, `check-i18n`,
  `check-i18n-namespaces`, `check-classes-emises` verts. API : `ServiceProviderTradesPartialUpdateTest` (3).
- Ablations : « Approuver » offert à tous → 1 rouge ; formulaire de devis pour tous → 1 ; lien du bien
  pour tous → 1 ; table de transitions recopiée → 3 ; `PATCH` sans créneau → 1 ; photos hors de la
  complétion → 1 ; fichiers perdus à l'échec → 1 ; liste non triée par créneau → 1 ; « Nouvelle
  demande » pour tous → 1 ; liste sans le bien → 1.
- **Non vérifié au navigateur** : aucun parcours n'a été joué dans Chrome (enregistrement réel d'une
  note vocale, rendu mobile). Les critères front sont prouvés en vitest, pas à l'écran.

### Critères d'acceptation — l'exécution qui coche chacun

- AC1, AC2, AC17 : A (`MaintenanceStatusBypassTest`, `MaintenanceStateMachineTest`, `MaintenancePrincipalFieldsTest`)
  et B (migration de données) ; « rouge sur `e3ab4a4e` » prouvé par ablation (`prohibited` et
  `PRINCIPAL_FIELDS` retirés, lecteurs `maintenance.assign` / `.close` retirés).
- AC3-AC7, AC11, AC18, AC18b, AC18c : B (336 + 368 verts, ablations listées). AC8-AC10 : C (`event:list`
  le liste ; `git diff dev --name-only | grep -i observer` → rien). AC12 : D. AC13, AC14, AC24 : E.
  AC15, AC16 : F (bailleur notifié : `AppNotification` dans sa langue). AC19-AC21 : G (vitest, et
  `ServiceProviderTradesPartialUpdateTest`). AC22, AC22b : H (`MaintenanceConversationTest`,
  `AudioMessageTest`, `MessageTypeSpoofingTest`).
- AC23 : `git diff dev -U0 -- app` → aucun `abort*(`/`notify(` ajouté à libellé littéral ; les 17 clés
  littérales ajoutées existent en fr/en/wo (`Lang::hasForLocale`), et `lang/{fr,en,wo}/{maintenance,
  messaging,service_providers}.php` ont les mêmes clés feuilles (0 manquante, 0 en trop).
- La case Delta « branche équipe par le prédicat 587 » est fermée après la fusion de TCK-587 :
  voir la section suivante. La suite entière n'a pas été lancée ici : elle l'est par la session.

### Après 587 — le prédicat du personnel branché (merge de `origin/dev` à fd4bd805)

Fusion de `origin/dev` (TCK-587). Deux conflits, tous deux documentaires : `docs/adr/README.md`
(lignes 0031, 0037, 0038 conservées) et `INDEX.md` (régénéré). Le prédicat provisoire de 592
(`isAgentAt || isAgencyAdminAt`) lisait le profil sans son état : un agent **suspendu** restait
équipe, et une **délégation** active du rôle agent ne comptait pas. Les cinq sites lisent
désormais le prédicat de 587 :

- `MaintenanceRequestPolicy::isPrincipalFor` et `openRequests` → `$user->staffAgencyId()` ;
- `MaintenanceRequest::scopeVisibleTo` → `$user->staffAgencyId()` ;
- `ProviderEligibility::isStaffAt` → `MembershipCapabilityResolver::isStaffAt()` ;
  `staffAgencyIds` filtre ses candidats (profils agent et admin, délégations) par ce même prédicat ;
- `MaintenanceParticipants::principals` : les candidats incluent les délégations, et le prédicat du
  personnel tranche avant `maintenance.assign`, comme `isPrincipalFor` dans la policy.

Gardes : les quatre exemptions `TCK-592` de `check-agency-scope-clause.mjs` sont retirées, et
`CLIQUET` passe de 10 à 6. Trois de ces exemptions étaient déjà mortes à la fusion : la garde
était rouge sur le merge nu. `maintenance.assign` et `maintenance.close` sortent de
`CapabilityEnforcementInventory::AWAITING`, et le `CLIQUET` de `check-capability-readers.mjs`
passe de 16 à 14. Les deux gardes sont vertes.

`MaintenanceStaffPredicateTest` (7 tests) : agent suspendu non assignable, privé de l'intervention
qui lui est assignée, ni donneur d'ordre ni notifié ; bailleur délégué agent qui voit, liste, crée,
approuve et reçoit une assignation ; délégué assigné dans une autre agence que celle de son profil
actif ; agent suspendu dont un rôle de bailleur personnalisé porte `maintenance.assign`. Chaque
ablation ci-dessous rend 1 test rouge :

| Ablation | Résultat |
|---|---|
| A1 `ProviderEligibility::isStaffAt` revient à `isAgentAt \|\| isAgencyAdminAt` | 1 rouge |
| A2 `staffAgencyIds` sans le filtre `isStaffAt` | 1 rouge |
| A2b `staffAgencyIds` sans les délégations | 1 rouge |
| A3 `scopeVisibleTo` sur `isAgentAt(agency_id)` | 1 rouge |
| A4 `isPrincipalFor` sur `isAgentAt(agency_id)` | 1 rouge |
| A5 `openRequests` sur `isAgentAt(agency_id)` | 1 rouge |
| A6 `principals` sans les délégations | 1 rouge |
| A7 `principals` sans `isStaffAt` | 1 rouge |

A2b et A7 sont d'abord restées vertes. Les deux tests qui les font rougir, délégué d'une autre
agence et rôle de bailleur personnalisé, ont été écrits pour elles.

Exécuté au premier plan :

- `tests/Feature/Maintenance` : 113 verts ;
- 29 chemins touchant maintenance, prédicat, inventaire, messagerie, notifications, autorisation et
  `Unit/Services/Membership` : 796 verts ;
- front `npm run lint` propre, `tsc --noEmit` propre, vitest `maintenance`, `messages`, `profile`,
  `admin/roles` : 231 verts ;
- toutes les gardes racine sont vertes, `gen-index --check` et `check-backlog` aussi.


### Corrections après vérification adverse (verif-592 : REFUSÉ, 2 bloquants, 2 majeurs, 9 mineurs)

Méthode, à chaque étape :

- La reproduction du vérificateur (`Verif592AdversarialTest`) est rejouée hors commit.
- Les tests neufs sont rejoués avec les fichiers de production remis à leur version `05dce4fc`
  (`git show 05dce4fc:… >` le fichier), puis restaurés par `cp` et vérifiés par `cmp`.
- Chaque ablation est restaurée de la même manière.

**B1 — fin d'onboarding rejouée.**

- `assignDeepLinkedRequest()` n'assigne plus que sous verrou de la ligne, et seulement si quatre
  conditions tiennent :
  - l'invitation n'a encore assigné personne (`metadata.deep_link_assigned_at`, posé à
    l'assignation) ;
  - la demande est libre (`assigned_to` nul) ;
  - elle n'a pas commencé (`open`, `acknowledged`) ;
  - le prestataire y est assignable.
- L'invitation lue est désormais la plus récente **acceptée**, et non plus la plus récente quel que
  soit son statut.
- `ServiceProviderInvitationDeepLinkTest` gagne six tests : rejeu après réassignation (v07), rejeu
  après désassignation, demande prise entre-temps, demande `completed`, prestataire en pause (X17),
  invitation non acceptée.
- Sur `05dce4fc`, cinq rouges. Le sixième, X17, était juste mais non éprouvé.
- Chacune des cinq ablations rend 1 rouge : sans `assigned_to` nul, sans état non commencé, sans
  la marque, sans `isAssignable`, invitation de n'importe quel statut.

**B2 — le fil reste ouvert au prestataire écarté.**

- Une seule garde, `App\Services\Messaging\ConversationAccess` : participation active **et**,
  pour un fil qui porte `maintenance_request_id`, `MaintenanceRequestPolicy::view`.
- Elle sert partout :
  - les quatre FormRequests de conversation (`AuthorizesTransitionally::isActiveParticipant`) ;
  - `ConversationController::ensureParticipant` (`show`, `read`, `archive`) ;
  - `ConversationPolicy` (sourdine, départ) ;
  - la liste (`constrainListing` : `MaintenanceRequest::visibleTo`) ;
  - `NotifyNewMessageJob` : l'aperçu de 80 caractères ne part plus au prestataire écarté.
- Personne n'est retiré du fil : la policy de la demande suffit, et couvre les états futurs.
- `MaintenanceThreadAccessTest` (4 tests) couvre la pause posée par l'endpoint (v08), la suspension
  posée en base (v09) et la fin de collaboration sur une demande `completed` (v10). Pour chacun :
  fiche 403, conversation 403, messages 403, écriture 403, absente de la liste, aucune
  notification. Un témoin vérifie qu'un prestataire actif garde le fil.
- Sur `05dce4fc`, 3 rouges. Ablations, chacune 3 rouges :
  - requêtes sur la seule participation ;
  - liste sans contrainte ;
  - notification sans filtre ;
  - garde sans la policy de la demande.
- La messagerie (18 classes, 150 tests), `tests/Feature/Maintenance` et `tests/Unit/Policies` sont
  verts.

**M1 — `actual_cost` par `PUT …/complete` (option a).**

- `CompleteMaintenanceRequestRequest` : la seule présence de `cost` ou `actual_cost` exige
  `actAsPrincipal`. Le prestataire prend un 403, comme au `PATCH` (AC1).
- Nouveau `OwnerApprovalThreshold`, qui lit seul le plafond d'ADR-0037 (le workflow du devis
  l'emprunte). Un `actual_cost` écrit par un autre que le bailleur est refusé par un 422 codé
  `maintenance.errors.actual_cost_needs_owner` (fr, en, wo) s'il dépasse **à la fois** :
  - le plafond ;
  - ce que le bailleur a lui-même approuvé (`quote_decision_by_id` = bailleur).
- Le bailleur l'inscrit : c'est son accord, comme pour un devis au-delà du plafond.
- La règle s'applique au `PATCH` et à `complete`.
- Front : `MaintenanceCompleteForm` ne montre et n'envoie le coût qu'avec `withCost`, lu de
  `abilities.can_assign`.
- Tests :
  - `MaintenanceActualCostTest` (4) : v04, v05, égalité au plafond, montant approuvé par le
    bailleur. Sur `05dce4fc`, 4 rouges.
  - `MaintenanceCompleteForm.test.tsx` : +2.
- Ablations, toutes rouges :

  | Ablation | Résultat |
  |---|---|
  | `complete` sans `actAsPrincipal` | 2 rouges |
  | `PATCH` sans plafond | 3 rouges |
  | `complete` sans plafond | 1 rouge |
  | accord du bailleur ignoré | 1 rouge |
  | égalité au plafond (`>= 0`) | 1 rouge |
  | front, champ de coût pour tous | 1 rouge |
  | front, coût envoyé | 1 rouge |

**M2 — intervention close ou annulée modifiable par `PATCH`.**

- `MaintenanceRequestController::update()` et `MaintenanceRequestService::assign()`, seul point
  d'assignation, refusent l'état terminal par un 422 `maintenance.errors.terminal_request`. Le
  libellé, partagé avec le kit et les photos, est généralisé en fr, en et wo : « ne se modifie
  plus ».
- En `completed`, les notes restent au prestataire et le coût au donneur d'ordre (403 pour le
  prestataire).
- `MaintenanceTerminalRequestTest` (4 tests) couvre v01, v02 et v03 (par le `PATCH` et par le
  service), plus le cas `completed`.
- Sur `05dce4fc` : 3 rouges.
- Ablations :
  - `update` sans garde : 2 rouges ;
  - `assign` sans garde : 1 rouge.

**Mineur 1 — montants à l'unité de la devise.**

- `priceLines($input, $currency)` arrondit chaque ligne, puis le total, à l'unité de la devise
  résolue : `Currency::decimalPlaces()` donne 0 pour le XOF et le XAF, 2 pour l'EUR et l'USD.
- Mode : au plus proche, la moitié vers le haut. Il est écrit dans une seule méthode,
  `roundToUnit`.
- Le produit est d'abord calculé exactement, sur 4 décimales. Aucun `bcmul` ne tronque plus.
- L'aide de TCK-593 (V1) n'est pas sur `dev` : elle n'est pas accessible d'ici.
- Tests ajoutés à `MaintenanceStructuredQuoteTest` :
  - XOF : 1,5 × 333,33 → 500 (v06), 0,5 × 1,01 → 1, 0,49 → 0, total 501 ;
  - EUR : 1,5 × 10,01 → 15,02.
- Sur `05dce4fc` : 2 rouges.
- Ablations :
  - ligne tronquée : 2 rouges ;
  - arrondi en troncature : 2 rouges ;
  - échelle fixée à 2 : 1 rouge ;
  - échelle fixée à 0 : 1 rouge.

**Mineurs 2 à 6 — cinq branches justes, mais non éprouvées.**

`MaintenanceGuardedBranchesTest` compte 5 tests, un par ablation du vérificateur. Chacune de ces
ablations rend désormais **1 rouge** :

| Ablation | Branche gardée | Réponse attendue |
|---|---|---|
| X5 | `confirm-resolution` sans `maintenance.close` | 403 |
| X7 | créneau posé par un prestataire non accepté | 403 |
| X14 | refus après un démarrage par le donneur d'ordre | 422 |
| X25 | `{status: null, started_at: null}` | rien n'est écrit |
| X11 | devis égal au plafond | approuvé directement |

Le code était juste sur `05dce4fc` : ces tests y sont verts. Ils gardent la branche, ils ne
corrigent rien.

**Mineur 8 — réassignation après un devis.**

- Dans `assign()`, quand un prestataire précédent existait et qu'un devis avait été soumis :
  - le devis est archivé dans `metadata.previous_quotes[]` `{provider_id, amount, approved_at}`,
    avec `approved_at` nul s'il n'avait pas été approuvé ;
  - les neuf champs `quote_*` sont vidés ;
  - le statut revient à `quote_requested` depuis `quote_submitted`, `awaiting_owner`, `rejected`,
    `approved` ou `in_progress`.
- Transition retenue : elle est écrite dans le service, comme `unassignProviderFromAgency`, et non
  dans la table, où ces arcs n'existent pas.
- L'événement d'assignation porte maintenant le vrai `from`.
- Les pièces jointes du devis (collection `quotes`) restent sur la demande.
- `MaintenanceReassignmentQuoteResetTest` (3 tests) couvre :
  - v19 : B ne démarre plus (422) et soumet son propre devis ;
  - un devis soumis, non approuvé ;
  - une réassignation sans devis, qui ne change pas le statut.
- Sur `05dce4fc` : 2 rouges.
- Ablations, 2 rouges chacune : sans remise à zéro, statut inchangé, sans archive.

**Mineur 9a — décider d'un devis lit une capacité.**

- `manageQuotes` délègue à `actAsPrincipal` : le bailleur du bien, ou le personnel qui tient
  `maintenance.assign`. C'est la capacité la plus juste de `maintenance.*` : commander le devis,
  c'est commander l'intervention.
- `decideQuote` hérite de cette règle hors `awaiting_owner`.
- Test `MaintenanceCapabilitiesTest::test_agent_without_any_maintenance_capability_cannot_decide_a_quote`
  (v16) :
  - un agent sans capacité reçoit 403 en approbation et en refus ;
  - le témoin, avec `maintenance.assign`, reçoit 200.
- Sur `05dce4fc` : 1 rouge. L'ablation (retour à `isPrincipalFor`) donne 1 rouge.
- `check-capability-readers` reste vert.

**Mineur 9b — limiteur sur `POST /api/conversations/{id}/messages`.**

- Limiteur nommé `conversation-message`, sur le modèle de ceux d'`AppServiceProvider` : 30 par
  minute, par utilisateur authentifié. Sans utilisateur, la clé de visiteur sert de repli.
- `ConversationMessageRateLimitTest` :
  - 30 messages passent, le 31ᵉ reçoit 429 ;
  - un autre participant poste encore.
- Ablations :
  - sans le middleware : 1 rouge ;
  - clé par IP : 1 rouge. Sous `Sanctum::actingAs`, `visitorRateLimitKey` retombe sur l'IP :
    c'est ce rouge qui a fait retenir `$request->user()`.
- Les 46 tests qui postent un message sont verts.

**Mineur 9c — e-mail du demandeur avant acceptation.**

- `requesterSummary()` retire `email` pour le prestataire assigné qui n'est ni demandeur ni donneur
  d'ordre, tant que le kit d'accès ne lui est pas ouvert (`opensAccess` : accepté, non terminal).
  C'est la règle du téléphone.
- La règle vaut pour la fiche comme pour la liste.
- Test : `MaintenanceAccessKitTest::test_requester_email_reaches_the_provider_only_after_acceptance`.
- Sur `05dce4fc` : 1 rouge.
- Ablations :
  - sans retrait : 1 rouge ;
  - jamais après acceptation : 1 rouge.
- Le front type déjà `email?` comme facultatif.

**Mineur 9d — front, le bloc d'assignation.**

- `MaintenanceDetail.test.tsx` gagne « prestataire : aucun bloc d'assignation, aucun
  « Enregistrer » ».
- Ablation F1 (`can_assign` → `true`) : 2 rouges, dont ce test. Avant, seul un test de libellés
  rougissait, par effet de bord.
