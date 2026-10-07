---
id: TCK-592
title: "Une intervention de bout en bout : le prestataire ne contourne plus la machine d'état, n'est assigné que s'il collabore, et ne clôt plus seul"
status: doing
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
- [ ] `MaintenanceRequestPolicy` : branche prestataire gardée par la collaboration active et le profil
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

- [ ] Assignation et planification depuis la fiche, invitation d'un nouveau prestataire avec lien profond
- [ ] Actions, formulaire de devis (y compris après refus) et bouton de création rendus depuis `abilities`
- [ ] Accepter / refuser ; kit d'accès ; galerie Avant / Après / Devis ; confirmation du locataire
- [ ] Le prestataire ne se voit plus proposer le lien vers la fiche du bien, qui le mène à un refus
      (`MaintenanceDetail.tsx:169-177`) : le kit d'accès en tient lieu
- [ ] Le choix des pièces du devis n'offre que les PDF et images acceptés par l'API ; un refus de type
      est affiché, les autres pièces restent sélectionnées
- [ ] Photos de fin envoyées **dans** `PUT …/complete` ; photos « avant » au démarrage ; prise de vue directe
- [ ] « Mes interventions » triée par créneau, avec quartier et agence
- [ ] Section prestataire du profil ; `updateTrades` n'écrit que les clés présentes (test back)
- [ ] Types front alignés (`awaiting_owner`, `abilities`, `media`, `access`)

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
- [ ] Front : « Discuter » sur la fiche ; enregistrer, écouter une note vocale
- [x] Tests : `MessageTypeSpoofingTest`, `MaintenanceConversationTest`, `AudioMessageTest`

## Critères d'acceptation

- [ ] **AC1 (P2)** — Prestataire assigné, demande en `quote_submitted` : `PATCH {status: approved}`
      → **422 qui nomme `status`**, statut en base inchangé ; idem `{status: closed}` depuis `open`.
      `{completed_at: …}` et `{started_at: …}` → 422 qui nomme le champ, colonne inchangée ;
      `{actual_cost: 15000}` → **403**, `actual_cost` inchangé. Tous rougissent sur `e3ab4a4e` (200
      aujourd'hui) et en retirant `prohibited` / l'ajout à `PRINCIPAL_FIELDS`.
- [ ] **AC2 (P10, P14)** — Prestataire : `PUT …/status` vers `cancelled` (depuis `in_progress`) et
      vers `closed` (depuis `completed`) → **403**. Donneur d'ordre : `cancelled` depuis
      `quote_requested` → 200 (422 aujourd'hui).
- [ ] **AC3 (P3)** — `assigned_to` = un compte sans collaboration `active` avec l'agence du bien →
      **422 sur `assigned_to`** (store et update) ; collaboration `ended` → 422 ; `active` + profil
      `active` → 200. Rouge aujourd'hui (200).
- [ ] **AC4 (P3)** — Collaboration passée à `ended` (ou profil `suspended`) : `GET show` → 403, la
      demande absente de `GET index`, `PATCH` → 403 ; ses demandes non terminales de cette agence
      reviennent à `assigned_to = null`, `status = open`.
- [ ] **AC5 (O1)** — Deux bailleurs de la même agence, B1 et B2 : B2 sur une intervention du bien de
      B1 → `show` 403, absente de `index`, `PATCH {priority}` 403, `quote/approve` 403, `store` sur
      le bien de B1 403. Un
      agent de l'agence → 200 (témoin). Rouge aujourd'hui pour B2.
- [ ] **AC6 (B13)** — Prestataire à collaboration `ended` : `GET /api/agencies/{id}` → 404 ; `active` → 200.
      Même prestataire, collaboration `ended` portant un `agency_role_id` dont le rôle accorde une
      capacité : `MembershipCapabilityResolver` la **refuse** (accordée aujourd'hui) et
      `isProviderAt($agencyId)` rend `false` (`true` aujourd'hui) ; `active` → accordée / `true`.
- [ ] **AC7 (B17)** — Fin puis reprise de la collaboration du même couple : une seule ligne vivante,
      statut `active`, aucune erreur 23505 ; une ligne supprimée en douceur n'empêche pas une création.
- [ ] **AC8** — Chaque chemin de changement émet **exactement un** `MaintenanceStatusChanged` portant
      `from`, `to` et l'acteur (`Event::fake`, un test par chemin) ; le diff ne crée aucun
      `MaintenanceRequestObserver`.
- [ ] **AC9 (C7, P4)** — Assignation : le prestataire reçoit une notification dont le titre est la
      chaîne de **sa** langue (compte en `wo` → texte wolof du fichier `lang/wo/maintenance.php`). Le
      locataire demandeur reçoit une notification à `assigned`, `in_progress` et `completed`.
- [ ] **AC10 (P13, O14)** — Devis soumis sur une demande ouverte par le locataire : aucune
      notification au locataire, une à l'équipe de l'agence **et** au bailleur du bien ; même chose
      quand un agent a ouvert la demande. `GET show` par le locataire : `data.quote_amount` **absent**.
- [ ] **AC11 (P5)** — `accept` par le prestataire assigné pose `accepted_at` ; par un autre → 403.
      `decline {reason}` avant acceptation : `assigned_to = null`, `status = open`, donneur d'ordre
      notifié avec le motif ; après acceptation ou démarrage → 422.
- [ ] **AC12 (P10)** — `completed` → `confirm-resolution` par le demandeur → `closed` ;
      `contest-resolution` → `in_progress`, prestataire et donneur d'ordre notifiés. `maintenance:auto-close`
      clôt une demande `completed` il y a 7 jours et **pas** une à 6 jours.
- [ ] **AC13 (P6)** — Prestataire accepté, demande `in_progress` : `access.street`,
      `access.requester_phone`, `access.latitude` présents. Avant acceptation, après `closed`, ou pour
      le demandeur : clé `access` **absente**.
- [ ] **AC14 (P7)** — `GET show` rend `media.photos`, `media.completion_photos`, `media.before_photos`
      en URL signées qui se téléchargent pour un lecteur autorisé ; `media.quotes` absent pour le
      demandeur locataire.
- [ ] **AC15 (P12)** — Devis `lines` = 2 × 7 500 (main-d'œuvre) + 1 × 12 000 (fourniture) →
      `quote_amount` = **27000.00** ; `currency` envoyée → 422 ; approbation après `valid_until` → 422.
- [ ] **AC16 (O14)** — Seuil du bailleur 50 000 : l'agent approuve un devis de 75 000 →
      `awaiting_owner`, bailleur notifié ; le bailleur approuve → `approved` ; un autre bailleur de
      l'agence → 403. Devis de 40 000 → `approved` directement. Seuil nul → comportement actuel.
- [ ] **AC17 (capacités)** — Un agent dont le rôle personnalisé n'a pas `maintenance.assign` :
      `PATCH {assigned_to}` → 403 ; avec → 200. Un agent dont le rôle n'a pas `maintenance.close` :
      `PUT …/status {closed}` depuis `completed` → 403 (200 aujourd'hui) ; avec → 200. Après la
      migration de données, aucun rôle système `service_provider` ne porte `maintenance.*`.
- [ ] **AC18 (P18)** — Invitation portant la demande d'une **autre** agence → 422. Demande de
      l'agence non terminale : en fin d'onboarding, elle est assignée au nouveau prestataire et son
      `GET show` rend 200.
- [ ] **AC18b (fin d'onboarding rejouée)** — Prestataire actif, téléphone vérifié, une collaboration
      `paused` avec `metadata.paused_by` (pause de l'agence) et une `paused` sans (invitation en
      attente) : `POST /api/service-provider/onboard/complete` → la première **reste `paused`**, la
      seconde passe `active` (aujourd'hui les deux passent `active` : rouge). Profil `suspended` : même
      appel → 403, profil toujours `suspended`, aucune collaboration modifiée (aujourd'hui 200 et
      profil `active` : rouge). Ablation : retirer le filtre `paused_by` ou la garde `suspended` → rouge.
- [ ] **AC18c (carnet)** — `GET /api/agencies/{id}/service-providers` sans filtre : un prestataire à
      collaboration `ended` **absent**, un `active` présent ; `filter[collaboration_status]=ended` le
      rend. Rouge aujourd'hui (le `ended` est listé).
- [ ] **AC19 (P1, P11, P14 — front, vitest)** — Fiche vue par le prestataire en `quote_submitted` :
      ni « Approuver » ni « Annuler » ; en `rejected` : le formulaire de devis est présent et aucun
      bouton n'appelle `PUT …/status`. Vue par l'agence : pas de formulaire de devis, un bloc
      d'assignation qui appelle `PATCH` avec `assigned_to` et `scheduled_at`. Vue par le prestataire :
      aucun lien vers `/app/properties/{id}`.
- [ ] **AC20 (P15 — front)** — Un échec de `PUT …/complete` avec photos affiche une erreur et garde
      les fichiers sélectionnés ; aucune requête d'upload séparée n'est émise après la complétion.
- [ ] **AC21 (P16, P17)** — `PATCH …/trades` portant seulement `intervention_zones` laisse
      `specialties` inchangé ; la liste du prestataire part avec `sort=scheduled_at` et inclut le bien
      (quartier) et l'agence ; « Nouvelle demande » ne lui est pas proposée.
- [ ] **AC22 (P19)** — Première assignation : une conversation `maintenance_request_id` avec le
      prestataire et le locataire ; une seconde assignation n'en crée pas une deuxième ; une note
      `audio` de ≤ 60 s est acceptée (201, fichier privé), un `type=audio` sans fichier ou un fichier
      texte → 422.
- [ ] **AC22b (avis système usurpé)** — Participant actif d'une conversation :
      `POST /api/conversations/{id}/messages {content: "…", type: "system"}` → **422 qui nomme
      `type`**, aucun message créé (201 aujourd'hui, message `system` créé : rouge) ; idem `image` et
      `document` ; sans `type` ou `type=text` → 201. Ablation : remettre `Rule::enum(MessageType::class)` → rouge.
- [ ] **AC23** — Aucun `notify(`/`abort(` ajouté ou réécrit par ce ticket ne porte de littéral ;
      chaque clé ajoutée existe en `fr`, `en` et `wo`.
- [ ] **AC24 (pièces du devis)** — Prestataire assigné, demande en `quote_requested` :
      `POST …/quote/submit` avec `attachments[0]` = `UploadedFile::fake()->create('devis.html', 10, 'text/html')`
      → **422 qui nomme `attachments.0`**, statut toujours `quote_requested`, collection `quotes`
      vide ; idem un `.svg` (`image/svg+xml`). Avec `devis.pdf` (`application/pdf`) → 200 et
      **1** média dans `quotes`. Rouge aujourd'hui (200 et le `.html` stocké) ; ablation : retirer
      `mimes` → rouge. Écrit en E avec le corps en vigueur ; F le garde en passant au corps `lines[]`.

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
