# Takussan — Spécification des Modèles

> Document de référence pour tous les modèles de données du backend Laravel.
> Chaque modèle est décrit avec son nom, sa description, ses colonnes et ses relations.
> Les changements par rapport à l'existant sont signalés.

---

## Packages transversaux

Ces packages sont utilisés de manière transversale et impactent plusieurs modèles :

### `spatie/laravel-medialibrary`

Gère **tous les fichiers** (images, documents, pièces jointes) via le trait `InteractsWithMedia`.
Chaque modèle qui a besoin de fichiers déclare une ou plusieurs **media collections** (ex: `photos`, `avatar`, `documents`).
Les colonnes de stockage de fichiers (`file_path`, `file_size`, `mime_type`, `logo_path`, `avatar_url`) sont **remplacées** par des media collections gérées par le package.
Les conversions d'images (thumbnails, responsive) sont configurées dans `registerMediaConversions()`.

**Modèles utilisant `InteractsWithMedia` :**

> **La source fait foi** : `grep -rn "addMediaCollection" takussan-api/app/Models`. Tableau relevé
> contre elle le 2026-10-14 (passe 012 de `/sync-specs`) : il annonçait jusque-là une collection
> `virtual_tours` qui n'a jamais existé, et des médias sur `Guarantor` et `Customer`, qui n'en
> déclarent aucun (leurs pièces passent par `Document`) ; six modèles porteurs y manquaient.

| Modèle | Collections | Description |
|--------|-------------|-------------|
| User | `avatar`, `avatars`, `photos`, `documents` | Photo de profil (`avatar`, `avatars` : fichier unique, disque public) ; `photos` et `documents` restent sur le disque privé (ADR-0029 §3) |
| Agency | `logo` | Logo de l'agence (fichier unique, disque public) |
| Property | `photos`, `videos`, `plans` | Photos (originaux privés, conversions filigranées publiques — TCK-539), vidéos et plans (publics, sans conversion). La visite virtuelle n'est pas une collection : c'est le lien `properties.virtual_tour_url` (TCK-598) |
| Message | `attachments` | Pièces jointes aux messages, notes vocales comprises |
| MaintenanceRequest | `photos`, `before_photos`, `completion_photos`, `quotes` | Photos du problème, état constaté avant l'intervention (TCK-592), photos après intervention, pièces jointes des devis — toutes privées (TCK-538) |
| Document | `file`, `versions` | Le fichier du document (unique) et ses versions numérotées (`custom_properties.version_number`) — toutes deux privées |
| Inventory | `photos`, `room_photos` | Photos de l'état des lieux, par pièce |
| Lease | `signed_contract`, `lease_deposit_refund` | Contrat figé que les parties signent (fichier unique, privé — ADR-0042 §1) ; pièces de la restitution du dépôt de garantie (`DepositRefundService`) |
| KycDossier | `documents` | Pièces du dossier KYC |
| BankStatement | `statement` | Fichier du relevé importé (unique, disque privé) |
| PrivacyRequest | `proof` | Preuve jointe à une demande de droits (unique) |

### ~~`spatie/laravel-permission`~~ — **DÉSINSTALLÉ** (TCK-278)

> 🚫 **Ce paquet n'est plus installé.** Il est absent de `composer.json` et de
> `composer.lock`, et une garde CI (`api-ci.yml`) casse sur tout import de son namespace.
> Il reste listé ici, barré, parce qu'il l'a été longtemps et que son absence est une
> information — pas parce qu'il fait partie de la pile. Décision : [ADR-0002](adr/0002-role-est-un-profil-polymorphe.md).

> ⚠️ **Refonte architecturale TCK-278 → TCK-279.** Le trait `HasRoles` est **retiré du modèle `User`**. Le « rôle » d'un humain dans le système n'est plus un attribut auth-level mais une **propriété dérivée du profil polymorphe** dont il dispose dans un contexte donné (agence ou plateforme). Voir [Règle 5 — Profil = rôle](#règle-5--profil--rôle).

**Phase 1 (TCK-278) — Suppression de spatie sur User.**
- `User` ne porte plus de rôle direct. Les checks `$user->hasRole('agent')` sont remplacés par `$user->isAgentAt(int $agencyId)` / `$user->hasProfileAt(int $agencyId, string $profileType)` / `$user->canActAt(Capability::xxx, ?Agency $agency)`.
- Les rôles « plateforme » (`super_admin`, `support`, `viewer`) deviennent un nouveau modèle polymorphe : [PlatformProfile](#51-platformprofile-).
- Les rôles « customer » et « tenant » ne deviennent pas des profils en phase 1 : ils sont **dérivés** dans `HasProfiles` (TCK-492) — `customer` pour toute identité authentifiée, `tenant` pour un compte qui a un bail actif (`hasActiveTenantLease()`). Il n'existe ni `isCustomerOf()` ni `isTenantOf()`. Profile-isation reportée si TCK-020 / TCK-090 en font émerger le besoin.
- L'enum `Capability` (code-defined) catalogue toutes les capacités atomiques de l'application, groupées par domaine (`<domaine>.<verbe>` ; le nombre se lit dans `app/Models/Enums/Capability.php`, pas ici). Un résolveur `MembershipCapabilityResolver` mappe `(Capability, ProfileType) → bool`.
- Les tables spatie (`roles`, `permissions`, `model_has_roles`, `model_has_permissions`, `role_has_permissions`) **disparaissent**.

**Phase 2 (TCK-279, `done` le 2026-08-16 ; TCK-315 pour le prestataire) — rôles personnalisés par agence.**

> Cette phase était d'abord décrite comme une « réintroduction du trait `HasRoles` + `HasPermissions`
> sur les Profils » — impossible, les deux traits appartenant au paquet désinstallé. Elle a été livrée
> comme un mécanisme **maison** — `AgencyRole` + `agency_role_capabilities` — dont les tables existent
> depuis `2026_08_16_120000` et `120100`. Cet en-tête l'a dit « non livrée » jusqu'au 2026-10-14
> (passes 011-012 de `/sync-specs`).

- Les porteurs de rôle d'agence (`AgentProfile`, `AgencyAdminProfile`, `OwnerProfile`, et la collaboration `ServiceProviderAgencyCollaboration` pour le prestataire — ADR-0016) portent un rôle d'agence, **sans trait spatie** : le pointeur `agency_role_id` suffit (trait `HasAgencyRole`).
- La table [AgencyRole](#52-agencyrole--tck-279) tient le rôle côté agence (`name`, `base_profile_type`, `is_system`) — la place que tenait la table `roles` avant TCK-278.
- Un porteur pointe vers exactement un `AgencyRole` (`agency_role_id` NOT NULL depuis `2026_08_16_120400` et `2026_08_17_090200`) — voir [Règle 6](#règle-6--1-profil--1-rôle-personnalisé).
- Permissions atomiques (catalogue `Capability`) attachées à un `AgencyRole` via le pivot `agency_role_capabilities`.
- `MembershipCapabilityResolver` consulte le pivot ; les sites d'appel `$user->canActAt(...)` restent inchangés.

**Rôles métier actuels** (= types de profils en phase 1+) : owner, agent, agency_admin, service_provider, *(customer/tenant dérivés)*.

> ⚠️ **`broker` a quitté cette liste le 2026-08-31** ([ADR-0027](adr/0027-le-courtier-sort-de-la-surface-commutable.md), TCK-495), puis **le code et la base le 2026-10-07** ([ADR-0030](adr/0030-le-courtier-quitte-le-code-et-la-base.md), qui remplace ADR-0027 ; TCK-586) : `2026_10_07_090100_drop_broker_tables` supprime `broker_profiles` et `broker_agency_collaborations`, aucun modèle courtier ne subsiste (§36 et §38 ne gardent que leur numéro). *Un rôle qu'on peut choisir doit mener quelque part ; celui-ci n'avait aucun écran.*

### `spatie/laravel-activitylog`

Version 5 (`^5.0`). Le journal d'audit est la table `activity_log`, écrite par `App\Models\Activity`
(`config/activitylog.php`, `activity_model`), via le trait `App\Models\Bases\Auditable` (qui porte
`LogsActivity`) sur les modèles tracés. Le détail d'un changement vit dans `attribute_changes`.
Voir la section [13. ActivityLog](#13-activitylog--remplacé-par-spatielaravel-activitylog).

### `lemonsqueezy/laravel` — les tables `lemon_squeezy_*`

Cinq tables créées par les migrations **du paquet** (`vendor/lemonsqueezy/laravel/database/migrations/2023_01_16_00000{1..5}`),
hors de `database/migrations/` : `lemon_squeezy_customers`, `lemon_squeezy_subscriptions`,
`lemon_squeezy_orders`, `lemon_squeezy_license_keys`, `lemon_squeezy_license_key_instances`. Les
trois premières portent la clé polymorphe `billable`, qui vise `Agency` (trait `LemonSqueezyBillable`,
voir [§2](#2-agency)). La base compte donc cinq migrations de plus que le dépôt n'a de fichiers.

### `laravel/scout`

Recherche plein texte sur Meilisearch (`config/scout.php`). Modèles `Searchable` au 2026-10-19 :
`Agency`, `Customer`, `Document`, `MaintenanceRequest`, `Message`, `Property`, `User`
(la source fait foi : les classes de `app/Models` qui portent le trait — `HasQueryBuilder` importe la classe sans la porter).

### `laravel/ai`

Version 1.3 (`^1.3`, `v1.3.0` au verrou) : le SDK des agents du socle IA ([ADR-0076](adr/0076-le-socle-ia.md)),
appelé par `AiGateway` seul. Le paquet publie une migration `agent_conversations` que le dépôt **n'a
pas publiée** : aucune table de plus. Les tables du socle sont les nôtres
([§102](#102-airoleassignment-) → [§106](#106-aievaluationrun-)).

### `laravel/sanctum` — la table `personal_access_tokens`

La table et le modèle sont ceux de Sanctum (`Laravel\Sanctum\PersonalAccessToken`, non surchargé :
aucun modèle de `app/Models/` ne la porte). **Deux colonnes sont à nous**, ajoutées par
`2026_10_07_150100_add_session_bounds_to_personal_access_tokens_table` (TCK-589) pour les sessions
bornées :

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| idle_timeout_minutes | smallint | oui | null | Inactivité tolérée pour **ce** jeton (`auth.sessions.idle_minutes`, 7 j ; super-admin `super_admin_idle_minutes`, 30 min), jugée à chaque requête par `AccessTokenGate` sur `COALESCE(last_used_at, created_at)`. Nulle sur un jeton antérieur : la borne de tout compte s'applique |
| two_factor_verified_at | timestamp | oui | null | Dernière confirmation TOTP faite **avec ce jeton** : vaut step-up pendant `auth.sessions.step_up_minutes` (10 min) pour lui seul — une autre session du même compte n'en hérite pas (`RequireRecentTwoFactor`) |

- **Émetteur unique** des jetons de session : `SessionTokenIssuer::issue()` (mot de passe, inscription,
  téléphone, OAuth), qui pose aussi `expires_at` (30 j ; super-admin : réglage
  `platform.session_max_minutes`). Les jetons morts d'inactivité sont purgés chaque jour
  (`sessions:prune-idle`).
- **Jeton d'impersonation** : `name = 'impersonation'`, capacité `impersonation:read`, émis par
  `ImpersonationService` et non par `SessionTokenIssuer` — il ne porte donc jamais
  `two_factor_verified_at` ; voir [§83 ImpersonationSession](#83-impersonationsession-).
- Index (Sanctum) : `token` unique, `(tokenable_type, tokenable_id)`, `expires_at`.

### Tables du framework

Créées par les migrations de base de Laravel (`0001_01_01_000000` à `000002`), sans modèle dans
`app/Models` :

- **`password_reset_tokens`** — `email` (clé primaire), `token` (haché), `created_at`. Un seul jeton
  par adresse : **un compte sans e-mail n'emprunte pas ce chemin** (il se connecte par téléphone,
  ADR-0033). Deux jeux de `config/auth.php` partagent la table : `users` (réinitialisation, 60 min) et
  `activations` (lien d'activation du gérant provisionné, 7 jours — TCK-781, TCK-209). Au 2026-10-19,
  la table **n'est jamais purgée** (`auth:clear-resets` n'est pas planifiée) et l'effacement d'un
  compte ne retire pas ses lignes : les deux sont validés par la piste P57.03.
- `sessions` — sessions web de Laravel.
- `cache`, `cache_locks` — magasin de cache et verrous du pilote `database`.
- `jobs`, `job_batches`, `failed_jobs` — file de travaux du pilote `database`.

Les tables `lemon_squeezy_*` viennent d'un paquet, voir [`lemonsqueezy/laravel`](#lemonsqueezylaravel--les-tables-lemon_squeezy_).

---

## Légende

- ✅ **Existe** — Modèle déjà présent dans le code
- 🆕 **Nouveau** — Modèle à créer
- 🔄 **Renommé** — Nom modifié par rapport à l'existant
- ➕ Colonne ajoutée
- ➖ Colonne supprimée
- ✏️ Colonne renommée
- FK = Foreign Key
- PK = Primary Key

> **Le moteur est PostgreSQL 17, sur tous les environnements, suite de tests comprise**
> ([ADR-0020](adr/0020-postgresql-sur-tous-les-environnements.md), 2026-08-21). SQLite et MySQL ont
> été retirés : ce ne sont plus des variantes supportées. Ce document décrivait encore le schéma
> par les contraintes de MySQL jusqu'au 2026-08-22 — la lecture ci-dessous en dépend sur deux
> points, et il faut les poser une fois plutôt que les répéter par colonne :
>
> - **Le type `json` de ce document est un `jsonb` en base.** Mesuré le 2026-08-22 :
>   `grep -rho '\->jsonb(' database/migrations/ | wc -l` → **69**, et **zéro** `->json(`. La
>   distinction n'est pas cosmétique : le type `json` de PostgreSQL n'a **aucun opérateur
>   d'égalité** — `DISTINCT`, `GROUP BY` et `UNION` y sont impossibles, et aucun index GIN ne s'y
>   pose. Les 56 lignes de type `json` de ce document sont écrites `jsonb` depuis cette date.
>   ⚠ 56 < 69 : les tableaux ci-dessous ne couvrent pas toutes les colonnes du schéma. **Le compte
>   se prend à la source, jamais ici.**
> - **La limite d'un nom d'index est 63 caractères, pas 64** — et PostgreSQL ne REFUSE pas, il
>   **tronque** avec un simple `NOTICE`. L'index existe alors sous un nom que Laravel ne calculera
>   jamais, et c'est le `dropIndex()` d'une migration future qui échouera sur un index
>   « introuvable » qui est pourtant là. C'est pourquoi ce document nomme ses index explicitement.

---

## Table des matières

### Modèles existants (à ajuster)
1. [User](#1-user)
2. [Agency](#2-agency)
3. [Property](#3-property)
4. [Address](#4-address)
5. [Booking](#5-booking)
6. [BookingPayment](#6-bookingpayment)
7. [Customer](#7-customer)
8. [PropertyCollaborator](#8-propertycollaborator)
9. [UserCustomerRelationship](#9-usercustomerrelationship)
10. [Tag](#10-tag)
11. [Review](#11-review)
12. [AppNotification](#12-appnotification-) ✏️ (ex-Notification, table `app_notifications`)
13. [ActivityLog](#13-activitylog--remplacé-par-spatielaravel-activitylog) ➖ (remplacé par spatie/laravel-activitylog)

### Nouveaux modèles
14. [Lease](#14-lease-)
15. [LeasePayment](#15-leasepayment-)
16. [Favorite](#16-favorite-)
17. [PropertyVisit](#17-propertyvisit-)
18. [Conversation](#18-conversation-)
19. [ConversationParticipant](#19-conversationparticipant-)
20. [Message](#20-message-)
21. [MaintenanceRequest](#21-maintenancerequest-)
22. [Document](#22-document-)
23. [SavedSearch](#23-savedsearch-)
24. [Inventory](#24-inventory-)
25. [Invoice](#25-invoice-) 🆕
26. [PropertyPriceHistory](#26-propertypricehistory-) 🆕
27. [Guarantor](#27-guarantor-) 🆕
28. [Payout](#28-payout-) 🆕
29. [DocumentShareLink](#29-documentsharelink-) 🆕
30. [Setting](#30-setting-) 🆕
31. [Integration](#31-integration-) 🆕
32. [Task](#32-task-) 🆕
33. [CustomerNote](#33-customernote-) 🆕

### Profils polymorphes 🆕 (TCK-138 → TCK-142)
34. [OwnerProfile](#34-ownerprofile-) 🆕
35. [AgentProfile](#35-agentprofile-) 🆕
36. ~~[BrokerProfile](#36-brokerprofile-)~~ ➖ supprimé le 2026-10-07 (ADR-0030, TCK-586)
37. [ServiceProviderProfile](#37-serviceproviderprofile-) 🆕
38. ~~[BrokerAgencyCollaboration](#38-brokeragencycollaboration-)~~ ➖ supprimé le 2026-10-07 (ADR-0030, TCK-586)
39. [ServiceProviderAgencyCollaboration](#39-serviceprovideragencycollaboration-) 🆕

### Comptabilité bancaire 🆕
40. [BankStatement](#40-bankstatement-) 🆕
41. [BankStatementLine](#41-bankstatementline-) 🆕

### Gouvernance plateforme 🆕
42. [KycDossier](#42-kycdossier-) 🆕
43. [Plan](#43-plan-) 🆕
44. [AgencySubscription](#44-agencysubscription-) 🆕
45. [PlatformPayout](#45-platformpayout-) 🆕
46. [Announcement](#46-announcement-) 🆕
47. [AnnouncementDismissal](#47-announcementdismissal-) 🆕

### Onboarding 🆕
48. [Invitation](#48-invitation-) 🆕
49. [AgencyUpgradeRequest](#49-agencyupgraderequest-) 🆕
50. [TenantOnboardingChecklist](#50-tenantonboardingchecklist-) 🆕

### RBAC refondu 🆕 (TCK-278 → TCK-279)
51. [PlatformProfile](#51-platformprofile-) 🆕
52. [AgencyRole](#52-agencyrole--tck-279) 🆕
53. [AgencyRoleCapability](#53-agencyrolecapability--tck-279) 🆕

### Messagerie WhatsApp 🆕
54. [WhatsappContact](#54-whatsappcontact-) 🆕
55. [NotificationTemplate — extension WhatsApp](#55-notificationtemplate--extension-whatsapp-) 🆕

### Modèles documentés a posteriori ✅ (TCK-310)

> Ces seize modèles **existent en base et en code depuis des mois** ; ils n'avaient jamais été
> écrits ici. Voir l'avertissement en tête de la section — ils sont décrits **d'après le code et
> les migrations**, pas d'après une intention.

#### Confidentialité & RGPD
56. [AccountDeletionRequest](#56-accountdeletionrequest-) ✅
57. [DataExport](#57-dataexport-) ✅

#### Exploitation de la plateforme
58. [FeatureFlag](#58-featureflag-) ✅
59. [AlertRule](#59-alertrule-) ✅
60. [MaintenanceWindow](#60-maintenancewindow-) ✅
61. [ScheduledTaskRun](#61-scheduledtaskrun-) ✅
62. [ReportExport](#62-reportexport-) ✅
63. [IntegrationWebhookLog](#63-integrationwebhooklog-) ✅

#### Pilotage agence
64. [KpiConfig](#64-kpiconfig-) ✅
65. [ThresholdAlert](#65-thresholdalert-) ✅
66. [RoleDelegation](#66-roledelegation-) ✅

#### Diffusion publique & modération
67. [PropertyContactLead](#67-propertycontactlead-) ✅
68. [PropertyReport](#68-propertyreport-) ✅

#### Notifications
69. [NotificationDeliveryAttempt](#69-notificationdeliveryattempt-) ✅

#### Parcours utilisateur
70. [WizardDraft](#70-wizarddraft-) ✅
71. [WelcomeView](#71-welcomeview-) ✅

### Modèles ajoutés depuis TCK-310 🆕

> Rangés sous [leur propre titre](#modèles-ajoutés-depuis-tck-310) depuis la passe 012 de
> `/sync-specs` : ils étaient jusque-là sous l'en-tête des seize modèles de TCK-310, qui dit
> « documentés a posteriori » — or §72 à §97 sont des modèles **posés après** TCK-310, par le ticket
> que cite leur sous-titre (le plus ancien, §72, par `2026_10_07_591100`). Seuls §98 et §99 sont
> des modèles antérieurs restés sans fiche jusqu'à la passe 011.

#### Agenda
72. [CalendarFeed](#72-calendarfeed-) ✅

#### Modération (TCK-597)
73. [ModerationClaim](#73-moderationclaim-) 🆕
74. [MediaFingerprint](#74-mediafingerprint-) 🆕
75. [DuplicateSuspicion](#75-duplicatesuspicion-) 🆕

#### Sorties d'argent (TCK-594, ADR-0039)
76. [PayoutMethod](#76-payoutmethod-) 🆕
77. [ServiceProviderBill](#77-serviceproviderbill-) 🆕
78. [PayoutMethodVerification](#78-payoutmethodverification-) 🆕

#### Données personnelles (TCK-601)
79. [PrivacyRequest](#79-privacyrequest-) ✅

#### Calendrier d'hôte 🆕 (TCK-596, ADR-0041)
80. [PropertyUnavailability](#80-propertyunavailability-) 🆕
81. [PropertyCalendarFeed](#81-propertycalendarfeed-) 🆕

#### Signature du bail 🆕 (TCK-596, ADR-0042)
82. [LeaseSignature](#82-leasesignature-) 🆕

#### Console plateforme
83. [ImpersonationSession](#83-impersonationsession-) 🆕
#### Paiement sans compte (TCK-602, ADR-0051)
84. [LeasePaymentLink](#84-leasepaymentlink-) 🆕

#### Pilotage 🆕 (TCK-595, ADR-0049, ADR-0057)
85. [CommissionEntry](#85-commissionentry-) 🆕
86. [PlatformMetricDaily](#86-platformmetricdaily-) 🆕

#### Alertes de recherche (TCK-599)
87. [AlertSubscriber](#87-alertsubscriber-) 🆕

#### Publication — contacts sur place 🆕 (TCK-633, lot C)
88. [PropertyContact](#88-propertycontact-) 🆕

#### Référentiel géographique 🆕 (TCK-633, ADR-0062)
89. [GeoRegion](#89-georegion-) 🆕
90. [GeoCity](#90-geocity-) 🆕
91. [GeoNeighborhood](#91-geoneighborhood-) 🆕

#### Crédits d'espace et boost 🆕 (TCK-633, ADR-0061)
92. [BoostProduct](#92-boostproduct-) 🆕
93. [PropertyBoost](#93-propertyboost-) 🆕
94. [PropertyBoostDailyStat](#94-propertyboostdailystat-) 🆕
95. [CreditLot](#95-creditlot-) 🆕
96. [CreditMovement](#96-creditmovement-) 🆕
97. [CreditWelcomeGrant](#97-creditwelcomegrant-) 🆕

#### Rattrapage — modèles en base sans fiche (passes 011-012 de `/sync-specs`)
98. [AgencyAdminProfile](#98-agencyadminprofile-) ✅ (TCK-271, TCK-279)
99. [NotificationPreference](#99-notificationpreference-) ✅ (TCK-070, TCK-588)

#### Crédits d'espace et boost — tranches d'une Vedette 🆕 (TCK-942, ADR-0061 amendement du 2026-10-18)
100. [PropertyBoostTranche](#100-propertyboosttranche-) 🆕

#### Relevé de gérance — l'instantané envoyé 🆕 (TCK-2321, ADR-0039 amendement du 2026-10-25)
101. [OwnerStatementSnapshot](#101-ownerstatementsnapshot-) 🆕

#### Socle IA 🆕 (TCK-2383 → TCK-2385, ADR-0076)
102. [AiRoleAssignment](#102-airoleassignment-) 🆕
103. [AiUsageSetting](#103-aiusagesetting-) 🆕
104. [AiCall](#104-aicall-) 🆕
105. [AiSuggestion](#105-aisuggestion-) 🆕
106. [AiEvaluationRun](#106-aievaluationrun-) 🆕

#### Sorties d'argent — la reprise au bailleur 🆕 (TCK-2151, ADR-0039 amendement du 2026-10-24)
107. [PayoutClawback](#107-payoutclawback-) 🆕

#### Radar 🆕 (TCK-2386, TCK-2388, TCK-2392, TCK-2431, ADR-0077, ADR-0080, ADR-0083)
108. [RadarAdvertiser](#108-radaradvertiser-) 🆕
109. [RadarListing](#109-radarlisting-) 🆕
110. [RadarOutreach](#110-radaroutreach-) 🆕
111. [RadarConsent](#111-radarconsent-) 🆕
112. [RadarCrawlSource](#112-radarcrawlsource-) 🆕
113. [RadarCrawlRun](#113-radarcrawlrun-) 🆕
114. [RadarListingSnapshot](#114-radarlistingsnapshot-) 🆕
115. [RadarNatureCount](#115-radarnaturecount-) 🆕

### Enums

- [Enums](#enums-1)

### Sections transversales

- [Règles d'invariance](#règles-dinvariance)
- [Contraintes d'unicité](#contraintes-dunicité)
- [Comportements FK (onDelete)](#comportements-fk-ondelete)
- [Index recommandés](#index-recommandés)
- [Évolutions futures](#évolutions-futures)

---

## Modèles existants

---

### 1. User

**Table :** `users`
**Description :** **Identité authentifiée pure.** Le User porte uniquement ce qui caractérise un humain (email, mot de passe, contacts, 2FA, OAuth, préférences). Sa **nature métier** (propriétaire, agent, admin agence, prestataire, opérateur plateforme — le
courtier a quitté le code et la base le 2026-10-07, [ADR-0030](adr/0030-le-courtier-quitte-le-code-et-la-base.md)) est portée par des **profils
polymorphes** dédiés liés au user et scopés par agence — ou par la plateforme pour `PlatformProfile`. Un même humain peut cumuler plusieurs profils chez plusieurs agences via une seule identité.

> **Évolution TCK-138 → TCK-142.** Les colonnes `type` (enum `UserType`) et `agency_id` sont **dépréciées** ; elles disparaissent de `users` au cutover (TCK-142). Toute logique d'autorisation/scoping est rebasée sur le **profil actif** de la requête (voir [Règle 4 — Active profile context](#règle-4--active-profile-context)).

> **Évolution TCK-278 (refonte RBAC).** Le User **ne porte plus de rôle direct** (`HasRoles` retiré). Le rôle est la conséquence de l'existence d'un profil dans un scope. Voir [Règle 5 — Profil = rôle](#règle-5--profil--rôle). Les rôles plateforme (super_admin, support, viewer) sont portés par [PlatformProfile](#51-platformprofile-).

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| username | string | oui | null | Nom d'utilisateur unique. Sert aussi de **slug public** de la fiche `/agents/{slug}` (`PublicAgentController`, `PropertyResource` → `owner.slug`, TCK-177) | |
| email | string | oui | null | Adresse email, unique casse repliée (`users_email_lower_unique`, ADR-0025). **Nullable depuis TCK-589** (`2026_10_07_150200`, ADR-0033) : un compte ouvert par téléphone n'en a pas | |
| password | string | | | Mot de passe hashé — reste NOT NULL : un compte sans mot de passe choisi porte un hash machine que personne ne connaît | |
| password_set_at | timestamp | oui | null | Date à laquelle l'utilisateur a **choisi** son mot de passe ; `null` = `password` est une valeur machine (compte OAuth, invitation acceptée sans mot de passe). Hors `$fillable` (`forceFill`). Backfill imparfait, décrit par l'en-tête de `2026_08_15_100000_add_password_set_at_to_users_table` (TCK-272) | ➕ |
| ~~type~~ | — | — | — | ~~Supprimée — la nature métier est portée par les profils polymorphes (cutover TCK-142)~~ | ➖ |
| status | UserStatus | | 'active' | Statut du compte | |
| first_name | string | | | Prénom. **NOT NULL sans défaut** : un compte ouvert par téléphone (`PhoneLoginService`) ou anonymisé (`AccountDeletionService`) reçoit une chaîne **vide**, jamais `null` — l'interface et `PublishReadiness` la traitent comme absente | |
| last_name | string | | | Nom de famille — même règle que `first_name` | |
| phone | string(30) | oui | null | Numéro de téléphone principal. **Pas unique en soi** : seul un numéro *vérifié* l'est, sur sa forme canonique (`users_phone_verified_unique`, voir « Index » ci-dessous) | |
| email_verified_at | datetime | oui | null | Date de vérification email | |
| phone_verified_at | datetime | oui | null | Date de vérification téléphone | ➕ |
| phone_whatsapp | boolean | oui | null | Le numéro principal reçoit WhatsApp. **`null` = jamais répondu** (l'écran de publication pose alors la question), `false` = non. Remis à `null` par `User::booted()` (`updating`) dès que `phone` change sans réponse dans la même écriture (TCK-633, lot C) | ➕ |
| secondary_phone | string(30) | oui | null | Second numéro, forme canonique (`CanonicalPhone::fold`). **Non assignable en masse** : écrit par `PhoneVerificationService` (`forceFill`) (TCK-633, lot C) | ➕ |
| secondary_phone_verified_at | timestamp | oui | null | Vérification du second numéro — sans elle, il n'est servi nulle part au public (`numeroSecondairePublic()`) (TCK-633) | ➕ |
| secondary_phone_whatsapp | boolean | | false | Le second numéro reçoit WhatsApp — sans `null` : il ne se vérifie qu'avec sa case (TCK-633) | ➕ |
| terms_accepted_at | timestamp | oui | null | Acceptation datée des CGU, demandée à la première publication ; écrite par `PublishReadiness` (`forceFill`) (TCK-633, lot C) | ➕ |
| terms_version | string(40) | oui | null | Version des CGU acceptée (TCK-633) | ➕ |
| ~~avatar_url~~ | — | — | — | ~~Remplacé par media collection `avatar` (spatie/medialibrary)~~ | ➖ |
| bio | text | oui | null | Biographie / présentation | ➕ |
| preferred_language | string(10) | | 'fr' | Langue préférée (fr, en, wo) | ➕ |
| last_login_at | datetime | oui | null | Dernière connexion | ➕ |
| ~~agency_id~~ | — | — | — | ~~Supprimée — l'attache à une agence est portée par le profil actif (cutover TCK-142)~~ | ➖ |
| added_by_id | FK users | oui | null | Créateur du compte (si ajouté par un admin/agent) | |
| google_id | string | oui | null | Identifiant OAuth Google | |
| facebook_id | string | oui | null | Identifiant OAuth Facebook | ➕ |
| apple_id | string | oui | null | Identifiant OAuth Apple | ➕ |
| remember_token | string(100) | oui | null | Token de session persistante | |
| timezone | string(50) | | 'Africa/Dakar' | Fuseau horaire préféré | ➕ |
| two_factor_enabled | boolean | | false | Authentification à deux facteurs activée | ➕ |
| two_factor_secret | text (encrypted) | oui | null | Secret TOTP (chiffré) | ➕ |
| two_factor_recovery_codes | text (encrypted) | oui | null | Codes de récupération 2FA (chiffrés) | ➕ |
| force_2fa_at_first_login | boolean | | false | Exige l'enrôlement d'un facteur TOTP à la première connexion web — posé par la commande d'amorçage super-admin et la cooptation (TCK-263, TCK-264 ; `2026_05_10_120000`). Voir §48 | ➕ |
| deletion_requested_at | timestamp | oui | null | Indexé. Miroir de `AccountDeletionRequest.requested_at` (§56) pour filtrer à bas coût — bannière, exclusion des relances (TCK-080 ; `2026_04_24_224305`) | ➕ |
| notifications_email_enabled | boolean | | true | Alertes par email activées | ➕ |
| notifications_push_enabled | boolean | | true | Alertes push activées | ➕ |
| notifications_sms_enabled | boolean | | false | Alertes SMS activées | ➕ |
| email_frequency | string(16) — `EmailFrequency` | | 'instant' | Fréquence des e-mails : `instant`, `daily`, `weekly`, `off` (TCK-103 ; `2026_04_26_200001`). Les interrupteurs fins par événement et par canal vivent dans [NotificationPreference](#99-notificationpreference-) | ➕ |
| digest_send_at | string(5) | | '08:00' | Heure locale d'envoi du récapitulatif (`HH:MM`) (TCK-103) | ➕ |
| digest_day_of_week | string(16) | | 'monday' | Jour du récapitulatif hebdomadaire (TCK-103) | ➕ |
| preferences | jsonb | oui | null | Indications de personnalisation **choisies par l'utilisateur** et exposées par l'API (ville, intention de recherche — fiche de profil minimal différée). Distinct de `metadata`, état interne (TCK-253 ; `2026_05_10_140000`) | ➕ |
| metadata | jsonb | oui | null | État interne, jamais exposé tel quel — clés lues par le code ci-dessous | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | Date de création | |
| updated_at | datetime | | auto | Date de modification | |

> Nullabilités et longueurs relevées en base le 2026-10-19 (passe 013 de `/sync-specs`, C2) : le
> tableau écrivait `status`, `first_name` et `last_name` nullables, et `preferred_language` en
> `string(5)` nullable.

**Clés de `metadata` lues par le code :**
- `failed_login_attempts`, `failed_login_first_at`, `locked_at` — verrou du **canal mot de passe**
  (`LoginLock`, TCK-589, ADR-0033 §6) : 10 échecs consécutifs posent `locked_at`, le verrou court
  15 min, la série vit 24 h depuis son premier échec ; `UserSupportService::unlock()` efface les
  trois clés. Le verrou du canal téléphone et le leurre d'une adresse inconnue vivent **en cache**,
  sans colonne.
- `force_2fa_reconfigure` — posé par `UserSupportService::resetTwoFactor()`, impose le réenrôlement
  du second facteur (`RequireTwoFactor`) ; retiré par `TwoFactorController` et
  `SuperAdminTwoFactorController` à l'enrôlement, exposé par `UserResource`.

**Colonnes supprimées :**
- ➖ `model_id` + `model_type` (nullableMorphs 'model') — non utilisés, redondants avec les profils et la relation `customer()`
- ➖ `avatar_url` — remplacé par media collection `avatar` via spatie/medialibrary
- ➖ `type` (enum `UserType`) — la nature métier est portée par les profils polymorphes ; cutover effectif en TCK-142
- ➖ `agency_id` — l'attache à une agence est portée par chaque profil ; cutover effectif en TCK-142

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collections `avatar`, `avatars`, `photos`, `documents` ; seules `avatar` et `avatars` sont sur le disque public (ADR-0029 §3)
- `LogsActivity` (spatie/laravel-activitylog), `Searchable` (laravel/scout), `SoftDeletes`, `Notifiable`, `HasQueryBuilder`
- ~~`HasRoles` (spatie/laravel-permission)~~ — **retiré en TCK-278.** Le rôle est dérivé des profils ; voir [Règle 5](#règle-5--profil--rôle).
- `HasApiTokens` (laravel/sanctum) — authentification API
- `HasProfiles` (custom, TCK-140 / enrichi TCK-278) — expose `ownerProfiles()`, `agentProfiles()`, `agencyAdminProfiles()`, `serviceProviderProfile()`, `platformProfile()`, `profiles()`, `activeProfile()`, `hasProfileAt()`, `isAgentAt()`, `isAgencyAdminAt()`, `isOwnerAt()`, `isProviderAt()`, `hasActiveSuperAdminProfile()`, `canActAt(Capability, Agency)` etc. (`brokerProfile()` retiré par TCK-586 ; `isSuperAdmin()`, que cette ligne citait, n'existe pas dans le trait)

**Accesseurs :**
- `full_name` : concaténation de `first_name` + `last_name`

**Numéros servis au public (TCK-633, lot C) :** `numeroPrincipalPublic()` et
`numeroSecondairePublic()` sont **le seul point** où s'écrit la règle « un numéro non vérifié n'est
servi au public nulle part » — ni par `…/contact` d'un bien, ni par la fiche `/agents/{slug}`.
`tests/Feature/Public/NumeroPublieVerifieTest.php` balaie toutes les routes `GET api/public/*`.

**Index :**
- `users_username_lower_unique`, `users_email_lower_unique` — uniques sur la valeur casse repliée par
  ICU (`2026_08_22_100000`, ADR-0025). Ils s'ajoutent aux uniques simples d'origine (`->unique()` de
  `0001_01_01_000000` et `2026_04_15_210400`), qu'aucune migration ne retire. Deux `NULL` ne se
  comparent pas : plusieurs comptes sans e-mail coexistent.
- `users_phone_verified_unique` (TCK-589, ADR-0033 ; `2026_10_07_150200_make_email_nullable_and_phone_unique_on_users_table`) —
  unique partiel sur la **forme canonique** du numéro principal (expression de
  `App\Support\CanonicalPhone::sql`, recopiée en littéral dans la migration)
  `WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL`. Un numéro n'est *vérifié* que sur un
  compte vivant à la fois ; un numéro non vérifié ne prouve rien et peut figurer sur plusieurs
  comptes. Les doublons antérieurs ont été résolus par
  `2026_10_07_150190_retirer_la_verification_des_telephones_en_doublon`, qui trie avant l'index : par
  numéro canonique, le compte vérifié le plus récemment (puis l'id le plus grand) garde
  `phone_verified_at`, les autres la perdent — ni le numéro ni le compte ; `down()` vide.
- `users_secondary_phone_verified_unique` (TCK-633) — même règle pour le second numéro : unique
  partiel sur `secondary_phone` `WHERE secondary_phone_verified_at IS NOT NULL AND deleted_at IS NULL`.
- Index simple sur `deletion_requested_at`.

Pour les deux index de téléphone, dernier recours seulement : `PhoneVerificationService` teste avant
d'écrire (piège PostgreSQL n°1 — une violation abandonne la transaction entière).

**Relations** (noms tels que le code les déclare — Eloquent ne résout pas un nom en snake_case ; relevé du 2026-10-19) :
- `addedBy()` → belongsTo User (via `added_by_id`)
- `ownerProfiles()` → hasMany OwnerProfile 🆕 (trait `HasProfiles`)
- `agentProfiles()` → hasMany AgentProfile 🆕 (trait `HasProfiles`)
- `agencyAdminProfiles()` → hasMany AgencyAdminProfile 🆕 (TCK-271, trait `HasProfiles`)
- `serviceProviderProfile()` → hasOne ServiceProviderProfile 🆕 (trait `HasProfiles`)
- `platformProfile()` → hasOne PlatformProfile 🆕 (TCK-278, trait `HasProfiles`)
- `profiles()` → collection unifiée des profils du user (Eloquent `Collection` retournée par accesseur, pas une relation Eloquent native) 🆕
- `agency()` → hasOneThrough Agency via AgentProfile — la **première** agence dont le compte est agent, pont de compatibilité de TCK-142. **Pas l'agence active** : ne jamais s'en servir pour juger une capacité ([Règle 4](#règle-4--active-profile-context))
- `properties()` → hasMany Property
- `bookings()` → hasMany Booking (via `created_by_id`)
- `customers()` → hasMany Customer (via `added_by_id`)
- ~~`customer()`~~ — **retirée** (TCK-2372, P250.03) : un `hasOne` sur `customers.user_id`, qui n'est pas unique (un compte porte un dossier client **par agence**), et sans lecteur. Les fiches d'un compte se lisent par `Customer::where('user_id', …)`
- `customerRelationships()` → hasMany UserCustomerRelationship
- `relatedCustomers()` → belongsToMany Customer (pivot `user_customer_relationships`)
- `addresses()` → morphMany Address
- `leases()` → hasMany Lease (via `landlord_id` — en tant que bailleur) 🆕
- `tenantLeases()` → hasManyThrough Lease via Customer (`customers.user_id` → `leases.tenant_id`) — en tant que **locataire** (TCK-492) ; `leases.tenant_id` référence `customers`, pas `users`
- `payouts()` → hasMany Payout (via `landlord_id`)
- `favorites()` → hasMany Favorite 🆕
- `conversations()` → belongsToMany Conversation (via `conversation_participants`) 🆕
- `savedSearches()` → hasMany SavedSearch 🆕
- `appNotifications()` → hasMany AppNotification (table `app_notifications`) 🆕
- `writtenReviews()` → hasMany Review (via `author_id`, avis rédigés par cet utilisateur) 🆕
- `receivedReviews()` → morphMany Review (avis reçus sur cet utilisateur, via `reviewable`) 🆕
- `documents()` → morphMany Document (pièces d'identité, RIB, etc.) 🆕
- `roleDelegations()` → hasMany RoleDelegation (délégations dont le compte est bénéficiaire, TCK-108)
- `deletionRequest()` → hasOne AccountDeletionRequest (au plus une par compte, TCK-080)
- `notificationPreferences()` → hasMany [NotificationPreference](#99-notificationpreference-) (TCK-070) 🆕

---

### 2. Agency

**Table :** `agencies`
**Description :** Agence immobilière enregistrée sur la plateforme, regroupant des agents et gérant un portefeuille de biens.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| name | string | | | Raison sociale | |
| slug | string | | | Identifiant URL unique | |
| kind | AgencyKind (string(20)) | | 'standard' | Type d'agence — `standard` (multi-membres, pleine capacité) ou `individual` (host solo auto-créé via CTA "Publier") ; indexé | ➕ |
| license_number | string | oui | null | Numéro de licence professionnelle — **unique** | |
| email | string | oui | null | Email de contact | |
| phone | string(30) | oui | null | Téléphone principal | |
| website | string | oui | null | Site web | |
| ~~logo_path~~ | — | — | — | ~~Remplacé par media collection `logo` (spatie/medialibrary)~~ | ➖ |
| description | text | oui | null | Présentation de l'agence | |
| status | AgencyStatus | | 'active' | Statut (active, inactive, suspended). La suspension et sa levée (`AgencyModerationController`, super-admin, TCK-600, ADR-0048) exigent un **motif, qui n'a pas de colonne** : il vit dans le journal (`super_admin_agency_suspended` / `super_admin_agency_reinstated`, propriétés `old_status`, `new_status`, `reason`) et dans la notification aux administrateurs de l'agence. Ni la date ni l'auteur de la suspension ne sont sur la ligne | |
| commission_rate | decimal(5,2) | oui | null | Taux de commission par défaut (%) | ➕ |
| currency | Currency (char(3)) | | 'XOF' | Devise par défaut de l'agence (`2026_04_24_000001`, TCK-084) ; l'espace auto-créé la pose en XOF | ➕ |
| founded_at | date | oui | null | Date de création de l'agence | ➕ |
| is_verified | boolean | | false | Agence vérifiée par l'admin Takussan | ➕ |
| verified_at | datetime | oui | null | Date de vérification | ➕ |
| primary_admin_id | FK users | oui | null | Responsable principal de l'agence | ➕ |
| properties_count | integer | | 0 | Compteur biens (cache — mettre à jour via Observer ou job) | ➕ |
| active_leases_count | integer | | 0 | Compteur baux actifs (cache) | ➕ |
| average_rating | decimal(3,2) | oui | null | Note moyenne des avis **publiés** (`is_approved = true`) — cache | ➕ |
| reviews_count | unsigned integer | | 0 | Nombre d'avis publiés — cache, recompté avec la moyenne (`2026_10_08_100400`, TCK-597, ADR-0043 §6) | ➕ |
| settings | jsonb | oui | null | Réglages de l'agence — **fusionnés clé par clé** par `AgencyController::update` (TCK-593) : une clé envoyée à `null` est retirée et revient au défaut du code. Clés ci-dessous | |
| moderation_required | boolean | | false | Modération avant publication activée par l'admin d'agence (`2026_04_26_000002`) — lue par `PropertyObserver` (TCK-597) | ➕ |
| bank_csv_mapping | jsonb | oui | null | Correspondance des colonnes d'un relevé bancaire CSV, propre à l'agence (`2026_04_28_000006`) — cf. [§40](#40-bankstatement-) | ➕ |
| payout_approval_threshold | decimal(14,2) | oui | null | Seuil d'approbation des reversements (quatre yeux) — **ni défaut ni reprise** : `null` tant que l'agence ne l'active pas ; écrit par `PayoutApprovalThreshold` seul, hors `$fillable` (`2026_10_07_200500`, TCK-594, ADR-0039 §4) | ➕ |
| pending_payout_threshold | decimal(14,2) | oui | null | Valeur demandée d'un **relâchement** du seuil (coupure ou relèvement), en attente de la confirmation d'un second détenteur de `payouts.approve` (`2026_10_08_100100`, TCK-594, VERIF-594 M-2) | ➕ |
| pending_payout_threshold_requested_by_id | FK users | oui | null | Auteur de la demande en attente (`nullOnDelete`, FK `agencies_pending_threshold_by_fk`) | ➕ |
| pending_payout_threshold_requested_at | timestamp | oui | null | **Marqueur** d'une demande en attente : une demande de coupure laisse `pending_payout_threshold` à `null` | ➕ |
| default_tax_rate | decimal(5,2) | oui | null | Taux de TVA par défaut des factures de l'agence (`2026_10_07_200500`, TCK-594, ADR-0039 §5) | ➕ |
| legal_name | string | oui | null | Raison sociale légale, imprimée sur chaque facture (ADR-0039 §7) | ➕ |
| ninea | string(30) | oui | null | NINEA (mention légale) | ➕ |
| rccm | string(30) | oui | null | RCCM (mention légale) | ➕ |
| legal_address | text | oui | null | Adresse fiscale (mention légale) | ➕ |
| metadata | jsonb | oui | null | Données supplémentaires flexibles | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Colonnes supprimées :**
- ➖ `logo_path` — remplacé par media collection `logo` via spatie/medialibrary

**Reversements, TVA et mentions légales (TCK-594, ADR-0039).** `payout_approval_threshold` est une
colonne et non une clé de `settings`, parce qu'il a un écrivain unique et un contrôle à quatre yeux
(`PayoutApprovalThreshold::change()`, sous `updatePayoutThreshold`), qu'une clé de `settings` écrite
par `PATCH /api/agencies/{id}` contournerait.
Le **relâchement** du seuil (le couper ou le relever) ne prend effet qu'à la confirmation d'un second
détenteur de `payouts.approve` : la valeur demandée attend dans les trois colonnes
`pending_payout_threshold*` ; c'est `pending_payout_threshold_requested_at` qui marque la demande,
puisqu'une demande de coupure laisse `pending_payout_threshold` à `null`. Les quatre mentions légales
ont été reprises de `metadata.legal_info` (`company_legal_name`, `ninea`, `rc`, `address_fiscale`) par
`2026_10_07_200500`, dans des colonnes vides seulement — une valeur plus longue que la colonne reste
dans `metadata`, non tronquée. **Jamais `rib_pro`** : un RIB n'a pas sa place dans une colonne lue en
clair par chaque facture (TCK-601).

**Clés de `settings`** (relevé du 2026-10-19). **La source fait foi** :
`App\Domain\Settings\AgencySettings` (TCK-970) est le catalogue des clés qu'un admin écrit ; il
donne à `AgencyUpdateRequest` ses règles `settings.*`, et `Agency::setting()` y lit chaque valeur
dans son type, défaut compris quand la clé est absente.

| Clé | Type | Défaut (clé absente) | Lecteur |
|-----|------|----------------------|---------|
| `watermark_enabled` | bool | `true` | `AgencyWatermarkContext` (filigrane des photos, TCK-539) |
| `watermark_position` | `WatermarkPosition` | `WatermarkPosition::default()` | `AgencyWatermarkContext` |
| `watermark_opacity` | int, 10-100 | 60 | `AgencyWatermarkContext` |
| `require_team_two_factor` | bool | `false` | `TwoFactorRequirement`, `RequireTwoFactor`, `ProtectedActions` — 2FA exigée du personnel (TCK-589) |
| `late_fee_online_collection` | bool | `false` | `Agency::collectsLateFeesOnline()` (TCK-593) |
| `booking_pending_expiry_hours` | int, 0-168 | 48 (0 = désactivé) | `BookingExpirationService` (TCK-963) |
| `tenant_onboarding_enabled` | bool | `true` | `TenantOnboardingService` — `false` comme `0` coupent la checklist (TCK-963, TCK-970) |

Les clés que l'onboarding déposait (`primary_city`, `primary_property_type`, `onboarding_source`,
`payment.preferred_provider`) ne sont plus enregistrées depuis TCK-966 ; celles d'une ligne ancienne
sont retirées de la réponse par `AgencyResource`. `settings.currency` n'est plus lue :
la devise est la colonne `currency`.

**Traits :**
- `Auditable` (journal, voir [§13](#13-activitylog--remplacé-par-spatielaravel-activitylog)), `Searchable` (laravel/scout), `SoftDeletes`
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `logo`
- `LemonSqueezyBillable` (`LemonSqueezy\Laravel\Billable`, TCK-079) — l'agence est le payeur d'un
  `checkout()` Lemon Squeezy (`LemonSqueezyDriver`) ; le trait ajoute `customer()` et `orders()`.
  ⚠ **`Agency::subscriptions()` (→ AgencySubscription) masque la méthode homonyme du trait** :
  `subscribed()`, `onTrial()` et `subscription()` du paquet ne sont pas utilisables sur une agence.

**Relations :**
- `properties()` → hasMany Property
- `customers()` → hasMany Customer
- `addresses()` → morphMany Address 🆕
- `reviews()` → morphMany Review 🆕
- `leases()` → hasMany Lease (via agency_id) 🆕
- `invoices()`, `payouts()`, `bankStatements()` → hasMany 🆕
- `subscriptions()` → hasMany AgencySubscription ; `currentSubscription()` → hasOne 🆕
- `kycDossier()` → morphOne KycDossier 🆕
- `upgradeRequests()` → hasMany AgencyUpgradeRequest ; `pendingUpgradeRequest()` → hasOne 🆕
- `primaryAdmin()` → belongsTo User (via primary_admin_id) 🆕
- `creditLots()` → hasMany [CreditLot](#95-creditlot-) 🆕 (TCK-633, ADR-0061 §1)

Il n'existe **ni `users()`** — `users.agency_id` a été supprimée (TCK-142) : les membres se lisent par
les profils polymorphes — **ni `documents()`** : les pièces légales vivent dans le dossier KYC.

**Crédits et boosts (TCK-633, lot F) — aucune colonne ajoutée à `agencies`.** Le solde de crédits
est celui de l'espace ([ADR-0061 §1](adr/0061-credits-d-espace-et-boost-des-annonces.md)) : il se
calcule sur `credit_lots` (somme des restants non expirés), jamais dans une colonne. La ligne
`agencies` est le **point de sérialisation** de toute dépense (`lockForUpdate()->firstOrFail()`,
piège PostgreSQL n°2). `#[ObservedBy(AgencyBoostObserver)]` : suspendre l'espace met ses boosts en
pause, le réactiver les reprend (ADR-0061 §8).

---

### 3. Property

**Table :** `properties`
**Description :** Bien immobilier mis en vente ou en location. Entité centrale de la plateforme autour de laquelle gravitent les réservations, baux, visites et paiements.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| parent_id | FK properties | oui | null | Bien parent (ex: immeuble contenant des appartements) | |
| user_id | FK users | | | Titulaire du bien (`restrictOnDelete`) — son propriétaire pour un particulier ; sur un bien d'agence, **le bailleur désigné à la saisie** (un bailleur actif de l'agence), ou **l'auteur** quand l'agence garde le bien en propre ou en attendant qu'un bailleur invité accepte ; un lot prend à sa création le titulaire bailleur de son parent, et la copie celui de sa source. **Ce n'est pas l'agent responsable** (le collaborateur principal, [§8](#8-propertycollaborator) ; [ADR-0036](adr/0036-l-agent-responsable-est-le-collaborateur-principal.md), amendé le 2026-10-19). La désignation du bailleur à la saisie, le titulaire bailleur d'un lot et la copie sont faits (TCK-997, 2026-10-25), ainsi que « changer le titulaire » (TCK-999, 2026-10-25 : `PUT /api/properties/{id}/owner`, après l'aperçu `GET …/owner-transfer`) et l'invitation en attente (TCK-1000, 2026-10-25 : `pending_owner_profile_id` à la création, transfert à l'acceptation). **Aujourd'hui**, hors création, seules trois voies le réécrivent, jamais depuis un bailleur : la passation d'un bien saisi par un partant (TCK-603), l'acceptation de l'invitation du bailleur en attente (TCK-1000) et « changer le titulaire » par l'admin d'agence (TCK-999). Un bien saisi avant TCK-997 garde son titulaire, l'auteur de la saisie, tant que l'admin d'agence ne le change pas | ✏️ |
| pending_owner_profile_id | FK owner_profiles | oui | null | Bailleur invité pour qui le bien a été saisi (FK `properties_pending_owner_profile_fk`, `nullOnDelete`, index `properties_pending_owner_profile_idx` ; TCK-1000, `2026_10_25_120000`) : un profil `draft` de l'agence du bien dont l'invitation est `sent` et non échue, jamais avec `owner_id`. Le bien lui passe quand il accepte l'invitation, si son titulaire est encore du personnel ; le lien s'efface à l'acceptation, à la révocation (effacement du compte compris) ou à l'expiration. Ajoutée sans reprise : aucun bien saisi avant n'en porte | ➕ |
| agency_id | FK agencies | oui | null | Agence gestionnaire (`nullOnDelete`) | |
| title | string | | | Titre de l'annonce | |
| slug | string | | | Identifiant URL — **unique** ; fabriqué par `Str::slug()`, donc sans variante de casse possible | |
| description | text | oui | null | Description détaillée | |
| reference_number | string | oui | null | Référence unique du bien (ex: TK-2025-001) | ➕ |
| type | PropertyType | | | Type de bien (voir enum PropertyType) — indexé | ✏️ |
| status | PropertyStatus | | 'available' | Statut du bien — indexé | |
| visibility | PropertyVisibility | | 'public' | Visibilité de l'annonce | |
| contract_type | ContractType | | | Type de contrat proposé (sale, rent) | ✏️ |
| rent_period | RentPeriod | oui | null | Période du loyer (`daily`, `weekly`, `monthly`, `yearly`) — `2026_04_18_224400`. Une location `daily` / `weekly` a un calendrier d'hôte (export iCal, flux importés : `scopeWithHostCalendar`) | ➕ |
| price | decimal(14,2) | | | Prix de vente ou loyer (par `rent_period`) | |
| currency | Currency | | 'XOF' | Devise (XOF, XAF, EUR, USD) | ✏️ |
| area | integer | oui | null | Superficie en m² | |
| bedrooms | integer | oui | null | Nombre de chambres | ➕ |
| bathrooms | integer | oui | null | Nombre de salles de bain | ➕ |
| furnished | boolean | | false | Meublé ou non | ➕ |
| floor_number | integer | oui | null | Étage du bien (pour appartement/bureau) | ➕ |
| total_floors | integer | oui | null | Nombre total d'étages du bâtiment | ➕ |
| year_built | integer | oui | null | Année de construction | ➕ |
| condition | PropertyCondition | oui | null | État du bien (sur plan, neuf, rénové, bon état, à rénover) — sans objet pour la famille foncière (`land`, `farm`), toujours `null` pour elle. Déclaré, jamais déduit de `year_built`. À ne pas confondre avec `Inventory.general_condition`, qui décrit l'état physique relevé lors d'un état des lieux | ➕ |
| parking_spaces | integer | oui | null | Nombre de places de parking | ➕ |
| lot_position | string | oui | null | Position du lot (angle, mitoyen) | ✏️ ancien `position` |
| level | integer | oui | null | Niveau dans la hiérarchie (immeuble → étage) | |
| title_type | TitleType | oui | null | Type de titre foncier (bail, titre_foncier, deliberation, autre) | ✏️ |
| admin_monitored | boolean | | false | Avec suivi administratif | ✏️ ancien `with_administrative_monitoring` |
| is_test | boolean | | false | Bien de démonstration / fixture : exclu de toute surface publique (`scopePublic`) — index `(is_test, visibility)` (`2026_05_05_000002`) | ➕ |
| deposit_months | unsigned smallint | oui | null | Coût d'entrée d'une location mensuelle : mois de caution (`2026_10_08_100000`, TCK-598) | ➕ |
| advance_months | unsigned smallint | oui | null | Mois d'avance | ➕ |
| agency_fee_months | decimal(4,2) | oui | null | Frais d'agence **en mois de loyer** (0,5 ou 1 le plus souvent) | ➕ |
| monthly_charges | decimal(14,2) | oui | null | Charges mensuelles (montant) — le total à l'entrée est calculé par l'API, jamais stocké | ➕ |
| virtual_tour_url | string(2048) | oui | null | Visite virtuelle ou vidéo : un **lien https** vers un hébergeur autorisé, pas un fichier (TCK-598) | ➕ |
| submitted_at | timestamp | oui | null | Soumission à la modération de l'agence (`2026_04_26_000001`, TCK-597) | ➕ |
| approved_at | timestamp | oui | null | Validation | ➕ |
| approved_by_user_id | FK users | oui | null | Qui a validé (`nullOnDelete`) | ➕ |
| rejected_at | timestamp | oui | null | Refus | ➕ |
| rejected_by_user_id | FK users | oui | null | Qui a refusé (`nullOnDelete`) | ➕ |
| rejection_reason | text | oui | null | Motif du refus | ➕ |
| platform_hold_at | timestamp | oui | null | **Verrou de la plateforme**, posé quand un super-admin masque ou supprime l'annonce sur signalement : tant qu'il l'est, `PropertyObserver::updating` refuse toute sauvegarde qui rendrait le bien public ; seule l'approbation d'un super-admin l'efface (`2026_10_08_100100`, TCK-597, ADR-0043 §4) | ➕ |
| platform_hold_by_id | FK users | oui | null | Qui l'a posé (`nullOnDelete`, FK `properties_platform_hold_by_fk`) | ➕ |
| platform_hold_reason | string | oui | null | Motif du verrou | ➕ |
| ical_export_token_hash | string(64) | oui | null | Empreinte SHA-256 du jeton d'export iCal du bien — **unique** (`properties_ical_token_hash_unique`), cachée (`$hidden`) ; le jeton clair n'est jamais stocké (`2026_10_08_010200`, TCK-596 §3B, ADR-0041 ; cf. [§81](#81-propertycalendarfeed-)) | ➕ |
| ~~amenities~~ | — | — | — | ~~Remplacé par Tags de type `amenity` (migration P3.10 — données seedées en Tags via TagSeeder)~~ | ➖ |
| featured | boolean | | false | **État dérivé « une Vedette est active »** depuis TCK-633 ([ADR-0061 §5](adr/0061-credits-d-espace-et-boost-des-annonces.md)) : écrit par `BoostLifecycle::project()` — et une fois par la migration `500400`, qui a converti les mises en avant antérieures (Vedette offerte de 30 jours, ou `false` pour un bien sans agence) —, refusé par le PATCH du bien (`UpdatePropertyRequest` : `prohibited`). Le filtre public `featured=true` et la rangée vedette le lisent ; le tri organique ne le lit plus | ✏️ dérivé |
| ranked_at | timestamp | oui | null | Ordre organique (`ranked_at DESC`, ADR-0061 §7) : la date de publication, ou la dernière Remontée. Posé à `published_at` par `Property::booted()` (`saving`) s'il est plus ancien ; rattrapé par la migration `500300` sur les biens publiés. Index `properties_ranked_at_idx` (TCK-633) ; l'ordre du catalogue public se lit par `properties_public_ranked_order_idx (ranked_at DESC NULLS LAST, id DESC)`, partiel sur le prédicat de `scopePublic()` (`visibility = 'public' AND NOT is_test`) (TCK-863, `2026_10_18_050100`) | ➕ |
| sponsored_until | timestamp | oui | null | Projection : fin de la Vedette active (`BoostLifecycle` seul) (TCK-633) | ➕ |
| badge | string(20) | oui | null | Projection : `BoostBadge` du Badge actif — `urgent`, `price_drop` (TCK-633) | ➕ |
| badge_until | timestamp | oui | null | Projection : fin du Badge actif (TCK-633) | ➕ |
| views_count | integer | | 0 | Nombre de vues de l'annonce (cache — incrémenter via `DB::increment()` ou job asynchrone, pas via `save()`) | ➕ |
| favorites_count | integer | | 0 | Nombre de fois ajouté en favoris (cache) | ➕ |
| visits_count | integer | | 0 | Nombre de visites planifiées (cache) | ➕ |
| reviews_count | integer | | 0 | Nombre d'avis approuvés (cache) | ➕ |
| average_rating | decimal(3,2) | oui | null | Note moyenne des avis approuvés (cache) | ➕ |
| available_from | date | oui | null | Date de disponibilité | ➕ |
| published_at | datetime | oui | null | Date de publication de l'annonce | ➕ |
| archived_at | timestamp | oui | null | Date d'archivage — indexé (`2026_04_23_000001`) | ➕ |
| metadata | jsonb | oui | null | Attributs supplémentaires spécifiques au type | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collections `photos` (originaux privés, conversions filigranées publiques), `videos` et `plans` (publics, sans conversion). Il n'y a **pas** de collection `virtual_tours` : la visite virtuelle est le lien `virtual_tour_url`
- `Searchable` (laravel/scout) — indexation pour la recherche

**Colonnes renommées :**
- ✏️ `position` → `lot_position` (plus explicite sur ce que ça représente)
- ✏️ `with_administrative_monitoring` → `admin_monitored` (plus concis)
- ✏️ `servicing` → `amenities` — puis ➖ supprimée : migration P3.10 unifie sur Tags (type `amenity`)

**Scopes :**
- `public()` → ce que servent `/public/properties` et le sitemap : agence publique (ou aucune), `visibility = public`, `is_test = false`, `published_at` non nul, et hors huit statuts (draft, sold, rented, archived, under_maintenance, unavailable, pending_review, rejected)
- `available()` → status = available
- `publicPortfolio()` → `public()` ET `available()` — le portefeuille d'une fiche agence / agent (TCK-436)
- `ofPublicAgency()` → sans agence, ou agence `active` (TCK-600, ADR-0048)
- `withHostCalendar()` → location `daily` / `weekly`, ni archivée ni vendue (TCK-596, ADR-0041 §5)
- `roots()` → `parent_id` nul

**Relations :**
- `owner()` → belongsTo User (via `user_id`, le titulaire)
- `agency()` → belongsTo Agency
- `parent()` → belongsTo Property
- `children()` → hasMany Property
- `address()` → morphOne Address
- `bookings()` → hasMany Booking
- `collaborators()` → hasMany PropertyCollaborator
- `tags()` → morphToMany Tag
- `reviews()` → morphMany Review
- `leases()` → hasMany Lease 🆕
- `visits()` → hasMany PropertyVisit 🆕
- `favorites()` → hasMany Favorite 🆕
- `maintenanceRequests()` → hasMany MaintenanceRequest 🆕
- `documents()` → morphMany Document 🆕
- `priceHistory()` → hasMany PropertyPriceHistory (historique des variations de prix) 🆕
- `approvedBy()`, `rejectedBy()`, `platformHoldBy()` → belongsTo User 🆕
- `unavailabilities()` → hasMany PropertyUnavailability ; `calendarFeeds()` → hasMany PropertyCalendarFeed 🆕
- `contacts()` → hasMany [PropertyContact](#88-propertycontact-), `orderBy('position')` 🆕 (TCK-633, lot C)
- `boosts()` → hasMany [PropertyBoost](#93-propertyboost-) 🆕 (TCK-633, ADR-0061 §5)
- `tagsVisibles()` → `tags()->visiblesSurUneFiche()` 🆕 (TCK-633, D9) — lecture seule ; c'est ce que
  `toSearchableArray()` indexe sous `tags` (voir [Tag](#10-tag))

Le modèle ne déclare **ni `user()`** (c'est `owner()`), **ni `inventories()`, `conversations()`,
`invoices()` ou `collaborating_users()`**.

**Boost (TCK-633, lot F) :** `featured`, `sponsored_until`, `badge`, `badge_until` sont des
**projections** des boosts actifs, écrites par `App\Services\Boost\BoostLifecycle` seul.
`replicating` les remet à zéro avec `ranked_at` : une copie (`PropertyDuplicationService`)
n'hérite d'aucune mise en avant payée pour l'original. Le document de recherche porte `ranked_at`
(repli sur `published_at`).

---

### 4. Address

**Table :** `addresses`
**Description :** Adresse physique avec coordonnées GPS, rattachable à tout modèle via relation polymorphique (bien, utilisateur, agence).

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| addressable_id | bigint | | | FK polymorphique (ID) — `morphs()` : NOT NULL, index composé `(addressable_type, addressable_id)` | |
| addressable_type | string | | | FK polymorphique (type) | |
| label | string | oui | null | Libellé libre de l'adresse | |
| street | string | oui | null | Rue | |
| neighborhood | string | oui | null | Quartier (ex: Almadies, Plateau, Mermoz) — texte affiché ; réécrit par la canonisation quand il pointe un quartier du référentiel | ➕ |
| city | string | | 'Dakar' | Ville — texte affiché et indexé ; réécrit au nom canonique de `geo_city_id` | |
| region | string | oui | null | Nom canonique de la région, écrit par `GeoAddressCanonicalizer` depuis la ville du référentiel ; départage deux villes homonymes | |
| country | string(2) | | 'SN' | Code pays ISO 3166-1 alpha-2 | |
| postal_code | string(20) | oui | null | Code postal | |
| latitude | decimal(10,7) | oui | null | Latitude GPS | |
| longitude | decimal(10,7) | oui | null | Longitude GPS | |
| geo_city_id | FK geo_cities | oui | null | Ville du référentiel — FK `addresses_geo_city_fk`, `nullOnDelete`, index `addresses_geo_city_idx` (TCK-633, ADR-0062 §4) | ➕ |
| geo_neighborhood_id | FK geo_neighborhoods | oui | null | Quartier du référentiel — FK `addresses_geo_neighborhood_fk`, `nullOnDelete`, index `addresses_geo_neighborhood_idx` (TCK-633, ADR-0062 §4) | ➕ |
| metadata | jsonb | oui | null | Données complémentaires | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Référentiel (TCK-633, [ADR-0062 §4](adr/0062-referentiel-geographique-region-ville-quartier.md)) :**
l'adresse **pointe et garde son texte**. Les colonnes texte restent la vérité affichée et indexée par
la recherche ; les identifiants canonisent. `Address::booted()` (`saving`) passe **toute** écriture
par `GeoAddressCanonicalizer` — création, modification, duplication, rattachement en console. Une
ligne de référentiel supprimée n'emporte jamais une adresse (`nullOnDelete`) ; renommer ou fusionner
un quartier réécrit le texte des adresses qui y pointent et réindexe leurs biens.

Il n'existe **ni `address`, ni `state`, ni `district`, ni `building`** : l'adresse lisible est
l'accesseur `full_address` (rue, quartier, code postal et ville, région, pays — `null` si tout est
vide), utilisé par les PDF.

**Relations :**
- `addressable()` → morphTo (Property, User, Agency, Customer)
- `geoCity()` → belongsTo [GeoCity](#90-geocity-) (via `geo_city_id`) 🆕
- `geoNeighborhood()` → belongsTo [GeoNeighborhood](#91-geoneighborhood-) (via `geo_neighborhood_id`) 🆕

---

### 5. Booking

**Table :** `bookings`
**Description :** Réservation d'un bien immobilier par un client. Étape préalable à la signature d'un bail, permettant de bloquer un bien et de recueillir un acompte.

> **Réécrit sur la table réelle le 2026-10-14** (`/sync-specs` passe 012, M19). Le tableau précédent
> décrivait un schéma qu'aucune migration n'a jamais créé (`booking_date`, `expiration_date`,
> `confirmation_date`, `rejection_date`, `cancellation_date`, `completion_date`, `price_at_booking`,
> `deposit_date`, `reason_for_rejection`, `reason_for_cancellation`, `customer_id` NOT NULL) et
> taisait `agency_id`, `currency`, `expires_at`. Sources : `2026_04_17_160010_create_bookings_table`,
> `2026_04_26_133355_add_expired_at_and_expiry_reason_to_bookings_table`,
> `2026_06_18_000001_add_performance_indexes_to_transactional_tables` — les seules qui touchent
> `bookings`.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| property_id | FK properties | | | Bien réservé (`restrictOnDelete`) | |
| customer_id | FK customers | oui | null | Client concerné (`nullOnDelete`). **Nullable en base** : la règle « une réservation a un client » est applicative | |
| created_by_id | FK users | oui | null | Utilisateur ayant créé la réservation (`nullOnDelete`) | ✏️ ancien `user_id` |
| agency_id | FK agencies | oui | null | Agence du bien (`nullOnDelete`) | |
| reference_number | string | oui | null | Numéro de référence (unique) | |
| status | BookingStatus | | 'pending' | Statut de la réservation — passe à `completed` au lendemain de sa fin (`CompleteEndedBookingsJob`), ou, encore `pending` ou `confirmed`, à la création du bail qui en est tiré (`LeaseService::create`, P48.03, TCK-2352) : ses nuits ne bloquent plus | |
| total_amount | decimal(14,2) | | | Montant total de la réservation (NOT NULL) | |
| deposit_amount | decimal(14,2) | oui | null | Montant de l'acompte demandé | |
| currency | Currency | | 'XOF' | Devise (string(3)) | |
| start_date | date | oui | null | Date d'arrivée souhaitée | |
| end_date | date | oui | null | Date de départ souhaitée — **exclusive** (la nuit du `end_date` n'est pas réservée, cf. `property_unavailabilities.ends_on`) | |
| notes | text | oui | null | Notes internes | |
| confirmed_at | timestamp | oui | null | Date de confirmation | |
| cancelled_at | timestamp | oui | null | Date d'annulation | |
| expires_at | timestamp | oui | null | **Échéance** de la demande : au-delà, une demande `pending` expire (`ExpireBookings`, raison `deadline`) | |
| expired_at | timestamp | oui | null | **Constat** de l'expiration : posé par `BookingExpirationService::expire()` en même temps que `status = expired` (TCK-596) | ➕ |
| expiry_reason | string | oui | null | Chemin de l'expiration : `auto` (seuil de l'agence, `ExpirePendingBookingsJob`), `deadline` (échéance `expires_at` atteinte), `manual` (`expire-now`). Constantes `BookingExpirationService::REASON_*`, pas d'enum | ➕ |
| cancellation_by | CancellationBy | oui | null | Qui a annulé | ✏️ |
| cancellation_reason | text | oui | null | Motif d'annulation | |
| metadata | jsonb | oui | null | | |
| deleted_at | timestamp | oui | null | Soft delete | |
| created_at | timestamp | | auto | | |
| updated_at | timestamp | | auto | | |

**`expires_at` et `expired_at` ne disent pas la même chose** : le premier est une échéance posée
d'avance (et peut rester dans le passé d'une demande confirmée entre-temps), le second l'heure à
laquelle la demande a effectivement expiré. Une demande expirée avant TCK-596 par l'ancien `update`
de masse de `ExpireBookings` peut porter `status = expired` avec `expired_at = null`. Les deux sont
dans les `$queryFields` (TCK-575) : `response_deadline` en dépend.

**Index :** `(property_id, status)`, `customer_id`, `status`, `(agency_id, status)`, `start_date`,
`end_date` ; unique `reference_number`.

**Colonnes renommées :**
- ✏️ `user_id` → `created_by_id` (lève l'ambiguïté avec le customer)

**Colonnes supprimées :**
- ➖ `deposit_paid` — source de désynchronisation avec `booking_payments`. ⚠ L'accesseur dynamique
  qui devait le remplacer **n'existe pas** dans `app/Models/Booking.php` (relevé 2026-10-14) :
  l'état de l'acompte se lit sur les `BookingPayment` de la réservation.

**Relations :**
- `property()` → belongsTo Property
- `customer()` → belongsTo Customer
- `createdBy()` → belongsTo User (via created_by_id) ✏️ ancien `user()`
- `agency()` → belongsTo Agency
- `payments()` → hasMany BookingPayment
- ~~`lease()`~~ — **retirée** (TCK-2372, P250.03) : un `hasOne` sur `leases.booking_id`, colonne sans unicité, et sans lecteur

---

### 6. BookingPayment

**Table :** `booking_payments`
**Description :** Paiement ponctuel lié à une réservation : acompte, avance sur caution ou frais de dossier.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| booking_id | FK bookings | | | Réservation concernée (`cascadeOnDelete`) | |
| payer_id | FK customers | oui | null | Client payeur (`nullOnDelete`) — le client de la réservation à la saisie | |
| collector_id | FK users | oui | null | Utilisateur qui a encaissé / saisi le paiement (`nullOnDelete`) | |
| reference_number | string | oui | null | Référence du paiement (`ReferenceNumberGenerator::bookingPayment()`) — **pas d'index unique** | |
| receipt_number | string | oui | null | Numéro de reçu | |
| amount | decimal(14,2) | | | Montant payé | |
| currency | Currency (string(3)) | | 'XOF' | Devise (XOF, XAF, EUR, USD) — celle de la réservation à la saisie | ✏️ |
| payment_method | PaymentMethod | oui | null | Moyen de paiement (cash, bank_transfer, mobile_money, card) | |
| payment_type | BookingPaymentType (string) | | | Nature du paiement (deposit, advance, fee) — indexé | |
| status | PaymentStatus | | 'pending' | Statut du paiement | |
| refund_amount | decimal(14,2) | oui | null | Montant remboursé (si applicable) | ➕ |
| refund_reason | text | oui | null | Motif du remboursement | ➕ |
| paid_at | timestamp | oui | null | Date effective du paiement — posée seulement quand le paiement est `paid` | |
| bank_reconciled_at | datetime | oui | null | Rapprochement bancaire (`2026_04_28_000003`) | ➕ |
| bank_statement_line_id | FK bank_statement_lines | oui | null | Ligne de relevé rapprochée (`nullOnDelete`) — index unique partiel `booking_payments_bank_line_unique` (`WHERE bank_statement_line_id IS NOT NULL`) : une ligne ne rapproche qu'un paiement | ➕ |
| platform_fee_pct_at_payment | decimal(5,2) | oui | null | Taux de commission plateforme figé au paiement (`2026_05_07_000224`) | ➕ |
| platform_payout_id | FK platform_payouts | oui | null | Reversement plateforme qui l'a soldé (`nullOnDelete`) — cf. [§45](#45-platformpayout-) | ➕ |
| transaction_id | string | oui | null | ID transaction externe (passerelle) | |
| notes | text | oui | null | Notes | |
| metadata | jsonb | oui | null | Données passerelle / complémentaires | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Index :** `(booking_id, status)`, `payment_type`, `booking_payments_bank_line_unique` (partiel, ci-dessus),
`booking_payments_transaction_id_idx (transaction_id)` — lu à chaque webhook entrant par
`PaymentGatewayService::paymentsForEvent()` (TCK-891, `2026_10_18_080000`).

Il n'existe **ni `user_id`, ni `payment_date`, ni `confirmed_date`** : la personne est dédoublée en
payeur (`payer_id`, un client) et encaisseur (`collector_id`, un utilisateur), et la date est
`paid_at`.

**Traits :**
- `HasPaymentAttributes` (`App\Models\Concerns`) — casts et matrice de transitions partagés avec LeasePayment (amount, currency, payment_method, status, paid_at) ➕

**Relations :**
- `booking()` → belongsTo Booking
- `payer()` → belongsTo Customer (via `payer_id`)
- `collector()` → belongsTo User (via `collector_id`)
- `payouts()` → belongsToMany Payout (pivot `payout_booking_payment`, PK `(payout_id, booking_payment_id)`)
- `bankStatementLine()` → belongsTo BankStatementLine

⚠ Le modèle ne déclare **pas** de relation `invoice()` ni `platformPayout()` ; l'inverse
`PlatformPayout::bookingPayments()` existe. `User` n'en déclare aucune vers `BookingPayment` : le
lien d'un utilisateur à ses paiements de réservation passe par `collector_id` (encaisseur) ou, comme
payeur, par `customers` (`payer_id`). L'ancienne `User::bookingPayments()`, qui visait une colonne
`user_id` inexistante, a été retirée (TCK-640).

---

### 7. Customer

**Table :** `customers`
**Description :** Personne physique suivie par un agent ou un propriétaire. Peut être un prospect, un locataire ou un acheteur potentiel. Peut être liée à un compte utilisateur ou exister de manière autonome (gestion CRM).

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| agency_id | FK agencies | oui | null | **Agence propriétaire de la fiche** (`nullOnDelete`, indexé) — la frontière d'isolation du CRM (principe n°2 de `CLAUDE.md`). `null` pour une fiche hors agence, visible de son seul auteur | |
| first_name | string | | | Prénom | |
| last_name | string | | | Nom de famille | |
| email | string | oui | null | Email — **aucune contrainte d'unicité** ; les doublons se détectent dans l'agence, casse repliée (index `customers_agency_email_ci_idx`) | |
| phone | string(30) | oui | null | Téléphone, normalisé à toute écriture (mutateur, `CustomerPhoneNormalizer`) — **aucune contrainte d'unicité** ; doublons détectés par agence (index `customers_agency_phone_idx`) | |
| status | CustomerStatus | | 'active' | Statut administratif du contact (active, inactive, blocked, deleted) — indexé | |
| pipeline_stage | CustomerPipelineStage | | 'lead' | Étape CRM (lead, prospect, qualified, negotiating, converted, lost) — distinct du statut administratif ; indexé | ➕ |
| id_type | IdType | oui | null | Type de pièce d'identité (id_card, passport, driving_license) — `id_card` couvre la CNI et toute carte nationale | ✏️ |
| id_number | text (cast `encrypted`) | oui | null | Numéro de pièce d'identité — **chiffré** (TCK-953, [ADR-0070](adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md), `2026_10_19_100000`) ; voir « Données sensibles » | ➕ |
| occupation | string | oui | null | Profession / activité | ➕ |
| emergency_contact_name | string | oui | null | Nom du contact d'urgence | ➕ |
| emergency_contact_phone | string(30) | oui | null | Téléphone du contact d'urgence, normalisé comme `phone` | ➕ |
| locale | string(5) | oui | null | Langue des messages d'un client **sans compte** (`fr`, `en`, `wo`), saisie par l'agence ; sans valeur, `ContactSansCompte::fromCustomer()` garde son repli `fr` (TCK-921, `2026_10_18_163900`) | ➕ |
| notes | text | oui | null | Note libre de la fiche (les notes datées vivent dans [CustomerNote](#33-customernote-)) | |
| seeking_contract_type | string(20) | oui | null | Critère de recherche du prospect : `ContractType` (`sale`, `rent`), contrôlé par l'application (ADR-0007) — `2026_10_07_591200`, TCK-591 | ➕ |
| budget_min | decimal(15,2) | oui | null | Budget minimum recherché | ➕ |
| budget_max | decimal(15,2) | oui | null | Budget maximum recherché | ➕ |
| seeking_property_types | jsonb | oui | null | Types de bien recherchés (liste) | ➕ |
| seeking_cities | jsonb | oui | null | Villes recherchées (liste) | ➕ |
| seeking_neighborhoods | jsonb | oui | null | Quartiers recherchés (liste) | ➕ |
| min_bedrooms | unsigned smallint | oui | null | Nombre minimum de chambres | ➕ |
| added_by_id | FK users | oui | null | Agent / propriétaire ayant ajouté ce contact (`nullOnDelete`) | |
| user_id | FK users | oui | null | Compte utilisateur lié, si le client est inscrit (`nullOnDelete`) | |
| metadata | jsonb | oui | null | | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

Il n'existe **pas de colonne `birth_date`**. Les critères de recherche reprennent le vocabulaire de
`PropertySearchService`, pour qu'un prospect se convertisse en recherche sauvegardée sans traduction
(TCK-599).

**Index :** `agency_id`, `status`, `pipeline_stage` ; `customers_agency_phone_idx (agency_id, phone)`
et `customers_agency_email_ci_idx (agency_id, LOWER(email COLLATE "und-x-icu"))` — les deux index du
détecteur de doublons `CustomerDuplicateDetector`, qui écrit exactement ces expressions (ADR-0025 ;
`2026_10_07_591200`) ; `customers_user_id_index (user_id)`, que lit à chaque `/api/auth/me` la
jointure de `HasProfiles::hasActiveTenantLease()` (TCK-862, `2026_10_18_050000`).

**Données sensibles** (TCK-953, TCK-955, ADR-0070) : `id_number` (`Customer::SENSITIVE`) est chiffré
en base, en `text`, absent de toute sérialisation par défaut (`$hidden`) et hors de `$queryFields` —
`fields[customers]=…,id_number` rend 400. Il ne sort que par trois voies : masqué par
`CustomerResource` (`id_number_masked`, les quatre derniers caractères) ; en clair par
`GET /api/customers/{id}/sensitive`, réservé à l'admin de l'agence de la fiche et au super-admin,
sous second facteur récent, consultation journalisée (surface `customer_sensitive`) — une fiche sans
agence n'est lisible en clair que par le super-admin ; et par l'export du droit d'accès de
l'utilisateur lié (`customers.json`, colonnes d'identité seules, ADR-0070 § 7).

**Visibilité (`scopeVisibleTo`)** : un détenteur de `crm.view_all` voit les fiches de son agence de
personnel, plus celles qu'il a ajoutées ; les autres ne voient que leurs propres ajouts, hors agence
ou dans une agence dont ils sont membres. Le super-admin voit tout.

**Traits :**
- `Searchable` (Laravel Scout) — indexe `first_name`, `last_name`, `email`, `phone`
- ⚠ **Pas** d'`InteractsWithMedia` : la fiche n'a aucune collection média ; les pièces passent par `documents()`.

**Accesseurs :**
- `full_name` : concaténation de `first_name` + `last_name`

**Relations :**
- `agency()` → belongsTo Agency
- `addedBy()` → belongsTo User (via `added_by_id`)
- `user()` → belongsTo User
- `bookings()` → hasMany Booking
- `addresses()` → morphMany Address
- `tags()` → morphToMany Tag
- `relationships()` → hasMany UserCustomerRelationship
- `notes()` → hasMany CustomerNote
- `leases()` → hasMany Lease (via `tenant_id`, en tant que locataire) 🆕
- `leasePayments()` → hasMany LeasePayment (via `payer_id`) 🆕
- `visits()` → hasMany PropertyVisit (via customer_id) 🆕
- `documents()` → morphMany Document 🆕
- `invoices()` → hasMany Invoice (factures reçues en tant que destinataire) 🆕
- `tasks()` → morphMany Task 🆕

---

### 8. PropertyCollaborator

**Table :** `property_collaborators`
**Description :** Utilisateur associé à la gestion d'un bien, avec un rôle et une part de commission. Le collaborateur `agent` **marqué principal** est l'agent responsable du bien : celui que la fiche publique nomme et qui reçoit les demandes ([ADR-0036](adr/0036-l-agent-responsable-est-le-collaborateur-principal.md), [ADR-0053](adr/0053-l-agent-principal-est-une-marque-unique-par-bien.md)).

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| property_id | FK properties | | | Bien concerné (`cascadeOnDelete`) | |
| user_id | FK users | | | Utilisateur collaborateur (`cascadeOnDelete`) | |
| role | CollaboratorRole (string) | | | Rôle attribué (`manager`, `co_owner`, `agent`, `viewer`) | ✏️ |
| is_primary | boolean | | false | **Agent principal** du bien — au plus une ligne marquée par bien, et seulement de rôle `agent` (deux garanties du schéma, ci-dessous). Hors `$fillable` : seul `PrimaryAgentDesignator` la déplace (`2026_10_08_120000`, TCK-504, ADR-0053) | ➕ |
| commission_share | decimal(5,2) | oui | null | Part de commission allouée à ce collaborateur (%), de 0 à 100 par ligne. La somme par bien **n'est pas contrôlée à l'écriture** : le grand livre des commissions plafonne la part du négociateur à `100 − Σ` des parts servies (TCK-595, ADR-0049 §3). Écrite et lue par le seul personnel de l'agence du bien qui tient `leases.create` (`PropertyPolicy::manageCommissionShares`), à l'ajout, à la modification et à la copie ; absente de la réponse pour tout autre lecteur (TCK-2364) | ➕ |
| invited_at | timestamp | oui | null | Date d'ajout, posée par `PropertyCollaboratorController::store()` ; sert d'ordre au repli du contact principal | |
| accepted_at | timestamp | oui | null | **Aucun sens métier aujourd'hui** : rien dans l'application ne l'écrit (seul le seeder la remplit) et il n'existe aucun parcours d'acceptation ; ni le contact principal ni le grand livre ne la lisent (TCK-504) | |
| metadata | jsonb | oui | null | Données libres | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Contraintes (SQL brut, `2026_10_08_120000`) :**
- unique `(property_id, user_id)` — une ligne par utilisateur et par bien ;
- index unique **partiel** `property_collaborators_one_primary_per_property` sur `(property_id) WHERE is_primary` — un seul agent principal par bien ;
- `CHECK property_collaborators_primary_is_agent (NOT is_primary OR role = 'agent')` — une ligne principale a le rôle `agent`. Changer le rôle d'un principal lui retire d'abord la marque (hooks `saving` et `updating` du modèle).

La migration a posé la marque sur la ligne que la règle d'avant désignait déjà, pour qu'aucune fiche ne change de contact ; son `down()` perd les choix posés depuis et rend le repli.

**Éligibilité (TCK-586, TCK-587)** : un collaborateur `agent` ou `manager` est du **personnel actif** de l'agence du bien, un `co_owner` un bailleur de cette agence, un `viewer` l'un ou l'autre (`CollaboratorEligibleForProperty`) ; changer le rôle rejuge l'éligibilité.

**Le contact principal** (`App\Services\Property\PrimaryPropertyContact`, une seule définition) : la ligne marquée si son agent est éligible (joignable, personnel actif de l'agence du bien) ; à défaut le collaborateur `agent` éligible le plus anciennement invité (`invited_at` NULLS LAST, puis `id`) ; à défaut le titulaire du bien s'il est joignable. Une marque posée sur un agent devenu inéligible reste en place et ne vaut rien tant qu'il l'est. **Changer l'agent responsable** (réattribution unitaire, en lot, passation) passe par `ResponsibleAgentAssigner`, qui déplace la marque et **n'écrit jamais `properties.user_id`** (TCK-603, ADR-0036).

**Relations :**
- `property()` → belongsTo Property
- `user()` → belongsTo User

Il n'existe ni colonne `permissions`, `notes`, `invited_by`, ni relation `inviter()`.

---

### 9. UserCustomerRelationship

**Table :** `user_customer_relationships`
**Description :** Lien formel entre un utilisateur (propriétaire, agent) et un customer (locataire, acheteur). Permet de tracer qui gère qui, avec quel type de relation et sur quelle période.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| user_id | FK users | | | Utilisateur (propriétaire/agent) | |
| customer_id | FK customers | | | Client concerné | |
| relationship_type | RelationshipType | | | Type de relation (owner_tenant, agent_client). `broker_client` a disparu avec le courtier : ses lignes sont supprimées par `2026_10_07_090000_delete_broker_client_customer_relationships` (TCK-586, ADR-0030) | ✏️ |
| is_primary | boolean | | false | Contact principal pour ce client | |
| status | RelationshipStatus | | 'active' | Statut de la relation (active, ended, suspended) | ✏️ |
| start_date | datetime | | now | Début de la relation | |
| end_date | datetime | oui | null | Fin de la relation | |
| notes | text | oui | null | Notes | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Relations :**
- `user()` → belongsTo User
- `customer()` → belongsTo Customer

---

### 10. Tag

**Table :** `tags` + `taggables` (pivot polymorphique)
**Description :** Étiquette polymorphique pour catégoriser des biens, des clients ou d'autres entités. Utilisé pour les équipements, les caractéristiques ou le classement CRM.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| name | string | | | Nom du tag — unique **deux fois** : `tags_name_unique` (à l'octet, `2026_04_17_160004`) et `tags_name_lower_unique` sur `LOWER(name COLLATE "und-x-icu")`, casse repliée par ICU, accents distincts (`2026_08_21_130000` puis `2026_08_22_100000`, [ADR-0025](adr/0025-repli-de-casse-par-collation-icu.md)). Une recherche par nom doit écrire exactement cette expression pour emprunter l'index | |
| slug | string | | | Slug URL (unique `tags_slug_unique`) — dérivé de `name` par `Str::slug()` à la création s'il est vide (`Tag::booted()`) | |
| description | text | oui | null | Description | |
| type | TagType | | | Catégorie du tag (amenity, feature, label, crm) — NOT NULL, sans défaut, indexé. Les `feature` sont **fondus dans `amenity`** par la migration `2026_10_12_400200` (TCK-633 : deux types disaient la même chose, le formulaire n'en laissait cocher qu'un). Le cas `Feature` subsiste dans l'enum ; la fusion n'est pas défaite par `down()` | ✏️ |
| icon | string | oui | null | Icône d'affichage (colonne d'origine, absente de ce tableau jusqu'au 2026-10-12) | |
| color | string(7) | oui | null | Couleur d'affichage (hex `#rrggbb`) | |
| status | string(16) | | 'approved' | `ReferentialStatus` : `approved`, `pending`, `rejected`. Un nom saisi inconnu naît `pending` ; le catalogue entre `approved`. Index `tags_status_idx` (TCK-633) | ➕ |
| created_by_id | FK users | oui | null | Auteur d'une proposition — FK `tags_created_by_id_fk`, `nullOnDelete`, index `tags_created_by_id_idx` (TCK-633) | ➕ |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Propositions et modération (TCK-633, lot D) :** les équipements se proposent et se modèrent comme
les quartiers ([ADR-0062 §5](adr/0062-referentiel-geographique-region-ville-quartier.md), même
`ReferentialStatus`). `TagModeration` approuve, rejette (les liaisons de la ligne refusée sont
supprimées), renomme ou **fusionne** : la fusion, réservée aux `amenity` qui ne portent que des
biens, reporte les liaisons de la source sur la cible (`insertOrIgnoreUsing`, `attached_by_id`
conservé) puis **supprime la source** — contrairement aux quartiers, aucun `merged_into_id`.
Chaque décision réindexe les biens touchés.

**Relations :**
- `properties()` → morphedByMany Property
- `customers()` → morphedByMany Customer
- `createdBy()` → belongsTo User (via `created_by_id`) 🆕 (TCK-633)

**Scope :** `visiblesSurUneFiche()` (TCK-633, D9) — les approuvées, plus une proposition `pending`
là seulement où son auteur l'a rattachée. ⚠ Ne s'emploie que sur `Property::tags()` : il lit la
table de liaison.

**Pivot `taggables` :** `tag_id` (FK tags, `cascadeOnDelete`), `taggable_type` / `taggable_id`
(`morphs`, NOT NULL), `created_at` / `updated_at` ; **pas de colonne `id`** — clé primaire composite
`(tag_id, taggable_id, taggable_type)`, nommée `taggables_pkey` en base (`2026_04_17_160004` demande
`taggables_primary`, nom que PostgreSQL ignore). Une même étiquette
ne se rattache donc qu'une fois à une même cible.

**`taggables.attached_by_id` (TCK-633, D9, `2026_10_12_400300`) :** FK users, nullable, `nullOnDelete` — qui a
rattaché l'étiquette. Une proposition d'équipement `pending` ne sort sur une fiche publique que là
où son auteur l'a rattachée (`attached_by_id = tags.created_by_id`, `Tag::scopeVisiblesSurUneFiche`).
La même règle borne ce qui rend un bien TROUVABLE : l'index (`Property::tagsVisibles` dans
`toSearchableArray`) et le filtre d'équipements de la carte (`FiltresDeLaCarte`) ; l'approbation
réindexe donc les biens de l'étiquette. Une copie de bien (`PropertyDuplicationService`) marque
chaque liaison au nom de CELUI QUI DUPLIQUE, jamais l'auteur recopié de la source.
FK `taggables_attached_by_id_fk`, **sans index** (aucune lecture ne part de cette colonne — piège
n°8 : indexer par mesure). Les liaisons antérieures n'ont pas d'auteur : une proposition en attente
qu'elles portent reste masquée jusqu'à son approbation, ce qui est le sens sûr.

---

### 11. Review

**Table :** `reviews`
**Description :** Avis laissé par un utilisateur sur un bien, une agence, un agent (`User`) ou un
prestataire (`ServiceProviderProfile`), rendu éligible par une preuve (visite, bail, réservation ou
intervention) et soumis à modération avant publication
([ADR-0043](adr/0043-avis-cible-eligibilite-moderation-et-verrou-plateforme.md), TCK-597).

> Schéma mesuré le 2026-10-14 sur les trois migrations qui touchent `reviews` :
> `2026_04_17_160031_create_reviews_table`, `2026_04_22_000001_add_moderation_workflow_to_reviews_table`,
> `2026_10_08_100000_add_moderation_scope_to_reviews_table` ; complété le 2026-10-27 par
> `2026_10_24_040000_widen_reviews_author_context_unique_index` (TCK-2062, l'unicité ci-dessous).

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| reviewable_type | string | | | Cible (type) — `morphs`, NOT NULL : `Property`, `Agency`, `User` (agent), `ServiceProviderProfile` | ✏️ ancien `model_type` |
| reviewable_id | bigint | | | Cible (ID) | ✏️ ancien `model_id` |
| author_id | FK users | | | Auteur de l'avis (`cascadeOnDelete`) | ✏️ |
| agency_id | FK agencies | oui | null | **Périmètre de modération**, figé à la création : dérivé de la cible si l'appelant ne l'a pas posé (bien → son agence, agence → elle-même), reçu du contexte pour un agent ou un prestataire, `null` pour un avis qui relève de la plateforme seule. `Review::booted()` refuse toute réécriture. FK `reviews_agency_id_fk`, `nullOnDelete` (TCK-597) | ➕ |
| context_type | string | oui | null | Preuve d'éligibilité (type) : visite, bail, réservation ou intervention (ADR-0043 §3) | ➕ |
| context_id | bigint | oui | null | Preuve d'éligibilité (ID) — sans FK (morph) | ➕ |
| rating | unsigned tinyint | | | Note **entière** de 1 à 5 — bornes applicatives (`Store*ReviewRequest` : `integer`, `min:1`, `max:5`), aucune contrainte CHECK | ✏️ |
| title | string | oui | null | Titre de l'avis | |
| content | text | oui | null | Contenu de l'avis | |
| is_approved | boolean | | false | Miroir booléen de `status = approved`, écrit avec lui par `ReviewModerationService` ; c'est lui que lisent les écrans publics (moyenne, compte) | |
| status | ReviewStatus | | 'pending' | Cycle de modération : `pending`, `approved`, `rejected`, `reported` (`2026_04_22_000001`) | ➕ |
| reported_count | unsigned integer | | 0 | Nombre de signalements (`2026_04_22_000001`) | ➕ |
| approved_at | timestamp | oui | null | Date d'approbation | |
| approved_by_id | FK users | oui | null | Modérateur (`nullOnDelete`) | ✏️ |
| reply_content | text | oui | null | Réponse publique du propriétaire/agence à l'avis | ➕ |
| replied_by_id | FK users | oui | null | Auteur de la réponse (`nullOnDelete`) | ➕ |
| replied_at | timestamp | oui | null | Date de publication de la réponse | ➕ |
| metadata | jsonb | oui | null | Dont le motif d'une décision de modération (ADR-0043 §7) | |
| deleted_at | timestamp | oui | null | Soft delete | |
| created_at | timestamp | | auto | | |
| updated_at | timestamp | | auto | | |

**Index :**
- `reviews_reviewable_approved_index` `(reviewable_type, reviewable_id, is_approved)` ;
- `reviews_reviewable_status_index` `(reviewable_type, reviewable_id, status)` ;
- `reviews_agency_status_idx` `(agency_id, status)` — la file de modération d'une agence ;
- **`reviews_author_subject_context_uniq`** — unique partiel `(author_id, reviewable_type,
  reviewable_id, context_type, context_id) WHERE context_id IS NOT NULL` : un avis par auteur,
  **sujet noté** et preuve (TCK-2062, `2026_10_24_040000`, ADR-0043 amendé le 2026-10-23). Un même
  bail rend éligible à noter le bien, l'agence, l'agent et chaque collaborateur. Il **remplace**
  `reviews_author_context_uniq` (`2026_10_08_100000`), qui laissait `reviewable_id` hors clé et
  n'admettait donc qu'un avis de cible `User` par auteur et par preuve : l'agent du bail et un
  collaborateur étant tous deux notables, le second avis rendait 500. Les avis sans preuve
  (`context_id` nul) n'y sont pas soumis.

**Reprise (`2026_10_08_100000`) :** les avis existants reçoivent `agency_id` — l'agence du bien pour
un avis de bien, l'agence elle-même pour un avis d'agence ; un avis sur un `User` reste `null`.

**Colonnes renommées :**
- ✏️ `model_id` → `reviewable_id` / `model_type` → `reviewable_type` (convention standard Laravel pour les morphs)

**Relations :**
- `reviewable()` → morphTo (Property, Agency, User, ServiceProviderProfile)
- `context()` → morphTo — la preuve d'éligibilité 🆕 (TCK-597)
- `agency()` → belongsTo Agency 🆕 (TCK-597)
- `author()` → belongsTo User (via author_id)
- `approvedBy()` → belongsTo User (via approved_by_id)
- `repliedBy()` → belongsTo User (via replied_by_id) 🆕

**Modération par l'agence :** `Review::AGENCY_MODERATED_TYPES` (`Property`, `User`) — un admin
d'agence ne modère que les avis de ces cibles ; les autres relèvent de la plateforme seule
(`isAgencyModerated()`).

---

### 12. AppNotification ✏️

**Table :** `app_notifications` ✏️ ancien `notifications` (approche hybride : table applicative propre, distincte de la table `notifications` de Laravel)
**Description :** Notification in-app envoyée à un utilisateur suite à un événement (nouvelle réservation, paiement reçu, rappel de loyer, demande de maintenance, etc.). Le modèle s'appelle `AppNotification` pour éviter toute confusion avec `Illuminate\Notifications\Notification`.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| user_id | FK users (`cascadeOnDelete`) | | | Destinataire | |
| type | NotificationType | | | Type de notification — douze valeurs, voir l'[inventaire des enums](#enums) | ✏️ |
| delivery_channel | NotificationChannel | | 'app' | Canal (`app`, `email`, `sms`, `push`, `whatsapp`) | ✏️ |
| title | string | | | Titre ; pour une ligne à `code`, simple repli (voir TCK-588 ci-dessous) | |
| body | text | oui | null | Texte de la notification ; pour une ligne à `code`, simple repli, re-rendu à la lecture | |
| data | jsonb | oui | null | Charge libre de la notification (identifiants des entités liées, dont `NotificationTarget::derive()` déduit une cible) ; `is_critical` y fait contourner le récapitulatif (`isCritical()`) | |
| code | string(100) | oui | null | Code du message (`lease_payment.overdue`), cas de `App\Domain\Notifications\NotificationCode` ([ADR-0032](adr/0032-l-api-n-ecrit-plus-de-prose.md)). Null pour les classes `Notification` historiques | 🆕 TCK-588 |
| params | jsonb | oui | null | Paramètres BRUTS du code (montant `{amount, currency}`, date ISO, compte, texte saisi) — jamais une phrase | 🆕 TCK-588 |
| target | jsonb | oui | null | Cible `{kind, id, path}` (`NotificationTarget`). Null : dérivée à la lecture de `data`/`referenceable_*` | 🆕 TCK-588 |
| referenceable_id | bigint | oui | null | ID de l'entité liée (morph manuel, voir [Règle 3](#règle-3--morph-referenceable-dans-appnotification)) | ✏️ ancien `reference_id` |
| referenceable_type | string | oui | null | Type de l'entité liée : un alias court (`booking`, `lease`, `lease_payment`, `maintenance`, `property_visit`…) **ou** un nom de classe (`SavedSearchMatchesNotification` écrit `SavedSearch::class`) | ✏️ ancien `reference_type` |
| is_read | boolean | | false | Lue oui/non | |
| read_at | timestamp | oui | null | Date de lecture | |
| sent_at | timestamp | oui | null | Date d'envoi | |
| delivery_attempts | jsonb | oui | null | **Héritée** (TCK-102, `2026_04_26_160847`) : les tentatives vivent dans [NotificationDeliveryAttempt](#69-notificationdeliveryattempt-) depuis TCK-110 et plus aucun code n'écrit cette colonne. Son retrait de `$fillable` est validé (piste P58.05) ; celui de la colonne attend une mesure de la préproduction | |
| digested_at | timestamp | oui | null | Date d'inclusion dans un récapitulatif (TCK-103, `2026_04_26_200002`) — `null` = pas encore récapitulée (`scopeUndigested()`, `DigestBuilderService`) | ➕ |
| created_at | timestamp | | auto | | |
| updated_at | timestamp | | auto | | |

> **Réécrit sur la table réelle le 2026-10-19** (passe 013 de `/sync-specs`, C1). Le tableau
> décrivait sept colonnes qu'aucune migration n'a jamais créées — `content`, `is_actioned`,
> `actioned_at`, `delivered`, `delivered_at`, `metadata`, `deleted_at` (la table n'est pas en
> suppression douce) — et en omettait cinq.

**Index :** `(user_id, is_read)`, `(referenceable_type, referenceable_id)`, `(user_id, digested_at)`.

**Colonnes renommées :**
- ✏️ `reference_id` → `referenceable_id` / `reference_type` → `referenceable_type` (convention standard Laravel pour les morphs)
- ✏️ `type` et `delivery_channel` passent de `string` à enum typé

**TCK-588 ([ADR-0032](adr/0032-l-api-n-ecrit-plus-de-prose.md)) — le texte n'est plus la donnée.**
Une ligne émise par `NotificationService::send()` porte `code` + `params` + `target` ; `title` et
`body` y sont rendus dans la langue du DESTINATAIRE à l'écriture, et **re-rendus à la lecture**
dans la langue de la requête (`AppNotificationResource`) — ils ne servent plus que de repli pour
les lignes sans code. Un contact sans compte (`ContactSansCompte`) ne crée **aucune** ligne.

**Note :** le lien vers l'entité est un morph manuel, sans relation Eloquent — voir [Règle 3](#règle-3--morph-referenceable-dans-appnotification).

> ⚠️ **Le canal a changé de nom, et cette phrase a coûté quatre mois — corrigé le 2026-08-21.**
> Cette note annonçait un canal **`app_database` enregistré dans `AppServiceProvider` via
> `ChannelManager::extend()`**. Il n'a jamais été écrit : `grep -rn app_database app/ config/ tests/`
> ne rendait rien. Les 29 classes de `app/Notifications/` déclaraient donc `'database'`, le canal
> **natif** de Laravel, qui vise la table `notifications` que l'approche hybride ci-dessus écarte
> justement — et qu'aucune migration ne créait. **Vingt-quatre d'entre elles sont réellement
> envoyées depuis `app/` : elles écrivaient dans le vide, en production comme en test.**
>
> Rien ne pouvait le voir : l'échec d'insertion était avalé, la requête rendait 201, le test
> passait. C'est la bascule PostgreSQL ([ADR-0020](adr/0020-postgresql-sur-tous-les-environnements.md))
> qui l'a rendu bruyant — un moteur qui abandonne la transaction au premier échec ne laisse pas
> une écriture perdue passer inaperçue.
>
> **Le canal existe désormais, et il PREND LA PLACE de `database`** :
> `App\Notifications\Channels\AppDatabaseChannel`, enregistré par
> `AppServiceProvider::bootNotificationChannels()`. Le nom `app_database` est abandonné
> délibérément : il aurait fallu réécrire le `via()` des 29 classes **et** le trou serait resté
> ouvert pour la trentième. Rien ne dépendait des sémantiques de Laravel — `unreadNotifications`,
> `DatabaseNotification` et `Notifiable::notifications()` n'ont aucun appelant dans ce dépôt.
>
> Chaque notification fournit son `type` (carte `AppDatabaseChannel::TYPES`) et son `title`
> (`toArray()['title']`, que 23 des 29 portent déjà ; les 6 autres déclarent un
> `toAppNotification()`). `tests/Feature/Notifications/AppDatabaseChannelTest.php` garde la carte :
> une notification qui emprunte `'database'` sans être rangée fait rougir la suite.
>
> *Une décision qui n'est écrite que dans une spec n'est pas appliquée ; elle est seulement
> espérée.*

**Scope :** `undigested()` → `whereNull('digested_at')`.

**Méthodes :**
- `isCritical()` : `data.is_critical` — une notification critique part tout de suite, quelle que soit
  `users.email_frequency`.
- Aucune méthode ne résout `referenceable_*` : `reference()`, sans appelant, est retirée par
  TCK-1045 (P11.11, 2026-10-20). La cible d'une ligne se lit par `target`, ou se déduit par
  `NotificationTarget::fromReferenceable()` (Règle 3).
- La lecture se marque par `NotificationController::markAsRead()` (`is_read`, `read_at`) ; le
  modèle ne porte ni `markAsRead()` ni scope `unread()`.

**Relations :**
- `user()` → belongsTo User
- `deliveryAttempts()` → hasMany [NotificationDeliveryAttempt](#69-notificationdeliveryattempt-), triées par `attempt` (TCK-110)

---

### 13. ActivityLog ➖ (remplacé par spatie/laravel-activitylog)

> **Le journal est la table `activity_log` de `spatie/laravel-activitylog` v5** (`^5.0`), écrite par
> `App\Models\Activity` (ci-dessous). Le modèle custom `ActivityLog` n'a pas de
> table : **aucune migration n'a jamais créé `activity_logs` ni `activity_log_changes`** — réécrit le
> 2026-10-19 (passe 013 de `/sync-specs`, C16 ; piste P56.04), la section annonçait une migration de
> données depuis une table qui n'a jamais existé.

**Mécanisme :**
- Le trait **`App\Models\Bases\Auditable`** porte `LogsActivity` avec une configuration commune :
  colonnes modifiées seules (`logOnlyDirty`), pas de ligne vide (`dontLogEmptyChanges`), `log_name` =
  nom court de la classe. 28 modèles le portent au 2026-10-19.
- **Liste blanche** (TCK-601, ADR-0044 §3) : un modèle qui déclare `AUDIT_ONLY` ne journalise que ces
  colonnes (`Agency`, `AgencyRole`, `Integration`, `OwnerProfile`, `AgentProfile`,
  `AgencyAdminProfile`) ; sans elle, tout le `$fillable` entre dans le journal. Un modèle qui porte une
  donnée personnelle ou un secret déclare donc sa liste, ou surcharge `getActivitylogOptions()`
  (`Customer`, `CustomerNote`, `Task`, `PrivacyRequest`, `BookingPayment`, `LeasePayment`).
- `User` et `Invitation` portent `LogsActivity` directement, avec leurs propres options.
- Un acte hors modèle s'écrit par `activity('…')->event(…)->withProperties([…])->log(…)`.
- `causer` = l'utilisateur authentifié ; `subject` = le modèle tracé.

**Où vit quoi :**

| Ancien champ | Colonne de `activity_log` |
|---|---|
| `user_id` | `causer_id` / `causer_type` (morphTo) |
| `loggable_id` / `loggable_type` | `subject_id` / `subject_type` (morphTo) |
| `action` | `event` (created, updated, deleted, ou un nom d'acte) |
| `description` | `description` |
| `changes` | **`attribute_changes`** (jsonb : `old`, `attributes`) — le détail d'un événement de modèle. Depuis la v5, `properties` ne le porte plus |
| `ip_address`, `user_agent` | **aucune** : aucun chemin n'écrit l'IP ni l'agent utilisateur au journal, et l'export ne les annonce plus (TCK-1703). Le contexte libre d'un acte hors modèle va dans `properties`, écrit par `withProperties()` |

`properties` ne porte que ce qu'écrit `withProperties()` : pour un événement `created` ou `updated`
d'un modèle, il est vide.

**`App\Models\Activity` (TCK-601, ADR-0044 §3)** — étend le modèle spatie, déclaré dans
`config/activitylog.php` (`activity_model`). Colonne ajoutée à `activity_log` :

| Colonne | Type | Nullable | Défaut | Description |
|---|---|---|---|---|
| agency_id | FK agencies (`activity_log_agency_fk`, `nullOnDelete`) | oui | null | Agence du **sujet**, résolue à la création par `AuditAgencyResolver` (explicite → `HasAuditAgency::auditAgencyId()` → colonne `agency_id` réelle du sujet → sujet `Agency` → sans sujet : profil actif). Jamais l'acteur. `null` = visible du seul super-admin |
| impersonator_id | FK users (`activity_log_impersonator_fk`, `nullOnDelete`) | oui | null | Super-admin qui agissait sous l'identité du causeur — voir [§83 ImpersonationSession](#83-impersonationsession-) |

Index : `activity_log_agency_created_idx (agency_id, created_at)`, `activity_log_created_idx (created_at)`,
`activity_log_impersonator_idx (impersonator_id)` ; et ceux du paquet : `subject`, `causer`, `log_name`.
Relation : `agency()` (belongsTo). Un admin d'agence ne lit que `agency_id = <agence du profil actif>`
(`AuditScope`).

**Conservation** (TCK-2342, [ADR-0044, amendement du 2026-10-25](adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md#amendement-du-2026-10-25--le-journal-dactivité-se-conserve-par-famille-tck-2342)) :
une ligne se purge au-delà de la durée de sa famille de `log_name`, comptée depuis `created_at`,
par `audit:prune-activity-log` (chaque jour, 04:10 Dakar) — **12 mois** par défaut et pour un
`log_name` nul ; **5 ans** pour `PersonalDataAccess`, `Privacy`, `Security`, `UserSupport`, `KYC`,
`KycDossier`, `Account`, `Membership`, `AgencyRole`, `Integration`, `export` ; **10 ans** pour
`LeasePayment`, `BookingPayment`, `Invoice`, `Payout`, `PlatformPayout`, `CommissionEntry`,
`Billing`. Les listes vivent dans `App\Console\Commands\PruneActivityLog`.

**Ce que rendent les lectures.** Les lectures du journal d'agence et de la console rendent
`properties`, et **jamais `attribute_changes`** : aucun écran ne montre le détail d'un événement
(décision du porteur du 2026-10-19, piste P56.03 — à rouvrir avec un écran qui le montre).
`properties` y passe par `PropertyRedactor`, sauf dans la fiche utilisateur de la console
(`UserDetailController::activity()`), dont l'alignement est validé (piste P56.05). L'export du journal
(`ActivityLogExporter`) rend l'avant et l'après, expurgés.

---

## Nouveaux modèles

---

### 14. Lease 🆕

**Table :** `leases`
**Description :** Contrat formalisant un accord de location ou de vente entre un propriétaire (bailleur) et un client (locataire/acheteur). Centralise les conditions financières, la durée, et les informations du garant.

> Schéma mesuré le 2026-10-14 sur les migrations qui altèrent `leases` : `2026_04_17_160011` (création),
> `2026_04_25_120000` (pénalités), `130000` (restitution de caution), `140000` (index),
> `150000` (départ anticipé), `2026_05_10_190000` (accueil), `2026_06_18_000001` (index),
> `2026_10_08_020000` (empreinte du contrat), `030000` (termes figés), `150000` (négociateur).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| property_id | FK properties | | | Bien concerné (`restrictOnDelete`) |
| landlord_id | FK users | | | Propriétaire / bailleur (`restrictOnDelete`) |
| tenant_id | FK customers | | | Locataire / acheteur (`restrictOnDelete`) |
| agency_id | FK agencies | oui | null | Agence intermédiaire |
| booking_id | FK bookings | oui | null | Réservation d'origine (si applicable) — une réservation du même bien, dont le client est `tenant_id` (sinon 422 sur `tenant_id`) ; la création du bail la passe à `completed` si elle est encore ouverte (P48.03, TCK-2352) |
| agent_id | FK users | oui | null | **Négociateur** du bail ou de la vente — FK `leases_agent_id_fk`, `nullOnDelete` ; index `leases_agent_id_signed_at_idx` `(agent_id, signed_at)` pour la vue agent et la performance d'équipe. Interne à l'agence, pas une partie au contrat (TCK-595, [ADR-0049 §1](adr/0049-attribution-des-transactions-et-grand-livre-des-commissions.md), `2026_10_08_150000`) |
| renewed_from_lease_id | FK leases | oui | null | Bail parent — rempli si ce bail est un renouvellement ou avenant (`nullOnDelete`, index `leases_renewed_from_idx`) |
| reference_number | string | | | Numéro de contrat unique |
| type | LeaseType | | | Type de contrat (residential_rent, commercial_rent, seasonal_rent, sale) |
| status | LeaseStatus | | 'draft' | Statut du contrat — dont `terminating` (départ anticipé demandé, préavis en cours : le loyer reste dû jusqu'à `early_termination_effective_date`, TCK-090). Valeurs : `app/Models/Enums/LeaseStatus.php` |
| start_date | date | | | Date de début du contrat |
| end_date | date | oui | null | Date de fin (null si durée indéterminée) |
| renewal_date | date | oui | null | Date de renouvellement prévue |
| monthly_rent | decimal(14,2) | oui | null | Loyer mensuel (pour les locations) |
| sale_price | decimal(14,2) | oui | null | Prix de vente (pour les ventes) |
| currency | Currency | | 'XOF' | Devise (XOF, XAF, EUR, USD) |
| deposit_amount | decimal(14,2) | oui | null | Montant de la caution |
| deposit_refunded_amount | decimal(14,2) | oui | null | Montant de caution restitué (`2026_04_25_130000`) |
| deposit_refunded_at | timestamp | oui | null | Date de la restitution |
| deposit_refund_reason | text | oui | null | Motif de la restitution (sortie du bail, pas un terme du contrat). Le modèle déclare aussi une collection média `lease_deposit_refund` |
| commission_amount | decimal(14,2) | oui | null | Commission d'agence |
| commission_rate | decimal(5,2) | oui | null | Taux de commission (%) |
| payment_frequency | PaymentFrequency | | 'monthly' | Fréquence de paiement (monthly, quarterly, yearly) |
| payment_day | unsigned tinyint | oui | null | Jour du mois pour le paiement (1-28) |
| late_fee_percent | decimal(5,2) | oui | null | Taux de pénalité de retard, appliqué au **restant dû** de l'échéance ; nul ou 0 : aucune pénalité (`LateFeeCalculator`, TCK-087, `2026_04_25_120000`) |
| late_fee_grace_days | unsigned smallint | oui | null | Jours de grâce avant pénalité ; nul : 0 jour |
| terms | text | oui | null | Conditions générales du contrat |
| special_conditions | text | oui | null | Conditions particulières |
| guarantor_id | FK guarantors | oui | null | **Ancienne colonne** de garant unique (`nullOnDelete`), conservée pour compatibilité : les garants du bail — et ceux que le contrat imprime — sont ceux du pivot `lease_guarantor` (voir plus bas) ✏️ |
| contract_sha256 | string(64) | oui | null | Empreinte du contrat **figé** que les parties signent (PDF dans la collection média privée `signed_contract`). Nulle : aucun contrat figé — brouillon, ou défigé par la modification d'une colonne du contrat hors `Lease::CONTRACT_NEUTRAL_COLUMNS` ou par un garant attaché/détaché pendant `pending_signature` (TCK-596, ADR-0042 §1, `2026_10_08_020000` ; voir [LeaseSignature](#82-leasesignature-)) |
| signature_requested_at | timestamp | oui | null | Heure de la demande de signature (remise à `null` avec `contract_sha256`) |
| early_termination_penalty_months | unsigned smallint | oui | null | Indemnité de départ anticipé, en mois, **figée** avec le contrat. Nulle : bail antérieur, le réglage de l'agence du bail puis le global s'appliquent (TCK-596 VERIF passe 2 N1, TCK-600, `2026_10_08_030000`) |
| rent_review_max_pct | decimal(5,2) | oui | null | Plafond de révision du loyer, figé avec le contrat ; même repli que la colonne précédente. Un renouvellement hérite des deux du parent, sauf valeur renégociée |
| signed_at | timestamp | oui | null | Date de signature |
| tenant_welcomed_at | timestamp | oui | null | Sentinelle d'idempotence de la notification de bienvenue au locataire (`SendTenantWelcomeNotification` sur `LeaseActivated`) : non nulle, une nouvelle activation n'accueille pas deux fois (TCK-265, `2026_05_10_190000`) |
| terminated_at | timestamp | oui | null | Date de résiliation |
| termination_reason | text | oui | null | Motif de résiliation |
| terminated_by_id | FK users | oui | null | Qui a résilié (`nullOnDelete`) |
| early_termination_requested_at | timestamp | oui | null | Demande de départ anticipé — le bail passe `terminating` (`2026_04_25_150000`) |
| early_termination_requested_by | FK users | oui | null | Auteur de la demande (`nullOnDelete`) — ⚠ sans suffixe `_id` |
| early_termination_effective_date | date | oui | null | Date d'effet ; à cette date une tâche quotidienne passe le bail `terminated`, si la facture d'indemnité est réglée |
| early_termination_penalty_amount | decimal(14,2) | oui | null | Montant de l'indemnité |
| early_termination_reason | text | oui | null | Motif de la demande |
| notice_period_days | unsigned smallint | oui | null | Préavis appliqué, en jours |
| early_termination_invoice_id | FK invoices | oui | null | Facture de l'indemnité (`nullOnDelete`) |
| metadata | jsonb | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :** `(status, property_id)`, `landlord_id`, `tenant_id`, `leases_renewed_from_idx`,
`leases_status_early_termination_idx` `(status, early_termination_effective_date)`,
`(agency_id, status)`, `start_date`, `end_date`, `leases_agent_id_signed_at_idx` ; unique
`reference_number`.

**Pivot `lease_guarantor` (`2026_04_22_000003`) :** `id`, `lease_id` (FK, `cascadeOnDelete`),
`guarantor_id` (FK, `cascadeOnDelete`), `role` (string, nullable), timestamps ; unique
`lease_guarantor_unique (lease_id, guarantor_id)`. Trois garants au plus par bail — borne
**applicative** (`LeaseController`, code `lease.max_guarantors`, sous verrou du pivot), aucune
contrainte en base.

**Colonnes supprimées :**
- ➖ `guarantor_name`, `guarantor_phone`, `guarantor_id_number` — remplacées par une FK `guarantor_id` vers le modèle [Guarantor](#27-guarantor-) (permet d'y attacher des documents justificatifs via medialibrary et de réutiliser un même garant sur plusieurs baux), elle-même relayée depuis par le pivot `lease_guarantor`.

**Collections média :** `lease_deposit_refund` ; `signed_contract` (privée, un seul fichier — le contrat figé, TCK-596).

**Relations** (`app/Models/Lease.php`) :
- `property()` → belongsTo Property
- `landlord()` → belongsTo User
- `tenant()` → belongsTo Customer
- `agency()` → belongsTo Agency
- `agent()` → belongsTo User (via agent_id) 🆕 (TCK-595)
- `commissionEntries()` → hasMany [CommissionEntry](#85-commissionentry-) 🆕 (TCK-595)
- `booking()` → belongsTo Booking
- `renewedFrom()` → belongsTo Lease (via renewed_from_lease_id) 🆕
- `renewals()` → hasMany Lease (via renewed_from_lease_id) 🆕
- `guarantor()` → belongsTo Guarantor (ancienne colonne)
- `guarantors()` → belongsToMany Guarantor (pivot `lease_guarantor`, `role`) 🆕
- `terminatedBy()` → belongsTo User (via terminated_by_id)
- `earlyTerminationRequestedBy()` → belongsTo User 🆕
- `earlyTerminationInvoice()` → belongsTo Invoice 🆕
- `payments()` → hasMany LeasePayment
- `inventories()` → hasMany Inventory
- `maintenanceRequests()` → hasMany MaintenanceRequest
- `documents()` → morphMany Document
- `payouts()` → hasMany Payout 🆕
- `invoices()` → morphMany Invoice 🆕
- `onboardingChecklist()` → hasOne TenantOnboardingChecklist 🆕 (TCK-266)
- `signatures()` → hasMany [LeaseSignature](#82-leasesignature-) 🆕 (TCK-596) — seules comptent celles de l'empreinte courante (`currentSignatures()`)

Aucune relation `conversations()` : `Conversation.lease_id` existe, mais le modèle ne la déclare pas.

---

### 15. LeasePayment 🆕

**Table :** `lease_payments`
**Description :** Paiement récurrent lié à un bail : loyer, charges, régularisation ou pénalité de retard. Chaque entrée correspond à une échéance ou à un versement effectif.

> Schéma mesuré le 2026-10-14 sur les migrations qui altèrent `lease_payments` :
> `2026_04_17_160013` (création), `2026_04_25_120001` (pénalité), `2026_04_28_000004`
> (rapprochement bancaire), `2026_05_07_000224` (commission plateforme), `2026_10_07_150000`
> (pénalité réglée) ; `2026_10_07_150100` ne touche que des données (voir `status`). Complété le
> 2026-10-27 (passe 016 de `/sync-specs`) : `2026_10_22_150000` (enregistrement du paiement,
> TCK-1342), `2026_10_24_160000` (pénalité reversée, P206.01) et `2026_10_24_160100` (pénalité
> remboursée, P206.04).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| lease_id | FK leases | | | Bail concerné (`cascadeOnDelete`) |
| payer_id | FK customers | | | Client payeur (`restrictOnDelete`) |
| collector_id | FK users | oui | null | Utilisateur ayant collecté le paiement (`nullOnDelete`) |
| reference_number | string | oui | null | Numéro de reçu / référence |
| amount | decimal(14,2) | | | Montant dû ou payé |
| currency | Currency | | 'XOF' | Devise (string(3)) |
| payment_method | PaymentMethod | oui | null | Moyen de paiement — valeurs : `app/Models/Enums/PaymentMethod.php` |
| payment_type | LeasePaymentType | | | Nature (rent, charges, deposit, deposit_refund, regularization, penalty) |
| period_start | date | | | Début de la période couverte |
| period_end | date | | | Fin de la période couverte |
| due_date | date | oui | null | Date d'échéance (nullable : un paiement hors échéancier n'en a pas) |
| paid_at | timestamp | oui | null | Date de paiement effectif |
| marked_paid_at | timestamp | oui | null | Moment où l'agence a **enregistré** le paiement (`LeasePaymentService::markPaid`), distinct de `paid_at`, date effective saisie qui peut être ancienne. La fenêtre de quittance du lien `/pay/{jeton}` court depuis le plus tardif des deux (`LeasePaymentLinkService::effectiveExpiry`) (TCK-1342, `2026_10_22_150000`) |
| bank_reconciled_at | timestamp | oui | null | Rapprochement bancaire (`2026_04_28_000004`) ; scope `whereNotReconciled()` |
| bank_statement_line_id | FK bank_statement_lines | oui | null | Ligne de relevé rapprochée (`nullOnDelete`, voir [BankStatementLine](#41-bankstatementline-)) ; unique partiel `lease_payments_bank_line_unique` `WHERE bank_statement_line_id IS NOT NULL` |
| platform_fee_pct_at_payment | decimal(5,2) | oui | null | Taux de commission plateforme **figé** au passage à `paid` par `PaymentPlatformFeeObserver` (TCK-223, `2026_05_07_000224`) ; jamais recalculé ensuite |
| platform_payout_id | FK platform_payouts | oui | null | Reversement plateforme qui a retenu cette commission (`nullOnDelete`, voir [PlatformPayout](#45-platformpayout-)) |
| status | PaymentStatus | | 'pending' | Statut du **loyer**. Depuis TCK-593, un échec de paiement en ligne n'écrit plus `failed` : les lignes `failed` existantes ont été rouvertes en `pending` et marquées `metadata.reopened_from_failed_at` (`2026_10_07_150100`) |
| late_fee_amount | decimal(14,2) | oui | null | Pénalité de retard appliquée — **renommée** depuis `late_fee` (`2026_04_25_120001`) |
| late_fee_applied_at | timestamp | oui | null | Application de la pénalité ; non nulle, `LateFeeCalculator` ne la réapplique jamais (une pénalité au plus par ligne) |
| late_fee_paid_at | timestamp | oui | null | Pénalité **réglée** (TCK-593, `2026_10_07_150000`). `status` décrit le loyer : sans cette colonne, un loyer soldé faisait disparaître la pénalité des écrans. `lateFeeOutstanding()` s'en dérive |
| late_fee_payout_id | FK payouts | oui | null | Reversement au bailleur qui a pris la pénalité réglée, ligne propre du reversement sans pivot (`lease_payments_late_fee_payout_fk`, `nullOnDelete` ; P206.01, `2026_10_24_160000`, [ADR-0039, amendement du 2026-10-24](adr/0039-les-sorties-d-argent.md), point 6). Un reversement `cancelled` ou `failed` remet à nul cette colonne et les trois suivantes (`PayoutService`) |
| late_fee_payout_amount | decimal(14,2) | oui | null | Copie figée du montant de pénalité pris par ce reversement, comme les pivots depuis TCK-2017 ([§28](#28-payout-)) |
| late_fee_payout_commission_rate | decimal(5,2) | oui | null | Copie figée du taux de commission appliqué à la pénalité |
| late_fee_payout_commission_amount | decimal(14,2) | oui | null | Copie figée de la commission retenue sur la pénalité |
| late_fee_refund_amount | decimal(14,2) | oui | null | Part de pénalité rendue par un remboursement, qui s'impute d'abord à elle ; `refund_amount` reste plafonné au loyer. Une colonne et non `metadata` : le calcul des reversements, l'*Encaissé* et la clôture plateforme l'agrègent en SQL (P206.04, `2026_10_24_160100`, point 7) |
| transaction_id | string | oui | null | ID transaction externe (mobile money, banque) — exclu du journal d'activité |
| refund_amount | decimal(14,2) | oui | null | Montant remboursé, comme `booking_payments.refund_amount` : `HasPaymentAttributes::paidAmount()` en déduit le reçu d'une échéance `refunded` (TCK-873, `2026_10_18_070000`) |
| notes | text | oui | null | Notes |
| metadata | jsonb | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Traits :**
- `HasPaymentAttributes` (`App\Models\Concerns`) — casts et scopes partagés avec BookingPayment (amount, currency, payment_method, status, transaction_id) ➕

**Index :** `(due_date, status)`, `(lease_id, period_start)`, `lease_payments_transaction_id_idx (transaction_id)` (TCK-891, `2026_10_18_080000`), `lease_payments_late_fee_payout_idx (late_fee_payout_id)` (P206.01, `2026_10_24_160000`), `lease_payments_bank_line_unique`
(partiel, ci-dessus).

**Relations** (`app/Models/LeasePayment.php`) :
- `lease()` → belongsTo Lease
- `payer()` → belongsTo Customer
- `collector()` → belongsTo User
- `payouts()` → belongsToMany Payout (pivot `payout_lease_payment`) 🆕
- `bankStatementLine()` → belongsTo BankStatementLine 🆕

Le modèle ne déclare **ni** `invoice()` **ni** `platformPayout()` (relevé 2026-10-14), **ni** de
relation vers le reversement de la pénalité (`late_fee_payout_id`, relevé 2026-10-27) ; la facture
d'une échéance se lit côté Invoice (`invoiceable`), le lien de paiement côté
[LeasePaymentLink](#84-leasepaymentlink-).

---

### 16. Favorite 🆕

**Table :** `favorites`
**Description :** Bien immobilier ajouté aux favoris par un utilisateur pour consultation ultérieure.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| user_id | FK users | | | Utilisateur |
| property_id | FK properties | | | Bien sauvegardé |
| notes | text | oui | null | Note personnelle de l'utilisateur (500 caractères, `PATCH /api/favorites/{property}` — TCK-599) |
| alert_baseline_price | decimal(14,2) | oui | null | Prix de référence de l'alerte de baisse : posé à la mise en favori (`FavoriteObserver`), rebasé à chaque passage de `SendFavoriteChangeAlerts` (TCK-599 §5) |
| unavailable_notified_at | timestamp | oui | null | Sortie du public déjà annoncée ; remise à `null` au retour au public (TCK-599 §5) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contrainte :** unique(user_id, property_id)

**Disponibilité** (TCK-599, [ADR-0050](adr/0050-alertes-de-recherche-un-seul-moteur-et-des-abonnes-sans-compte.md)) :
`Favorite::availabilityOf()` rend `available`, `rented`, `sold`, `unavailable` ou `removed`, jugée par
`scopePublic()` (`withExists`), jamais par une copie de ses conditions. Seul un favori `available`
porte la carte complète ; les autres une projection `{id, slug, title}`, `removed` aucune.

**Relations :**
- `user()` → belongsTo User
- `property()` → belongsTo Property

---

### 17. PropertyVisit 🆕

**Table :** `property_visits`
**Description :** Visite planifiée d'un bien immobilier. Peut être demandée par un utilisateur inscrit, un customer géré par un agent, ou un visiteur non inscrit.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| property_id | FK properties | | | Bien à visiter (`cascadeOnDelete`) |
| visitor_id | FK users | oui | null | Visiteur inscrit (`nullOnDelete`) |
| customer_id | FK customers | oui | null | Customer (géré par un agent) (`nullOnDelete`) |
| agent_id | FK users | oui | null | Agent accompagnateur (`nullOnDelete`) |
| visitor_name | string | oui | null | Nom du visiteur (si non inscrit) |
| visitor_phone | string(30) | oui | null | Téléphone du visiteur (si non inscrit). Les saisies antérieures ont été réécrites en E.164 quand leur forme normalisée l'était (`2026_10_07_150200_normaliser_les_telephones_saisis`, `down()` vide) |
| visitor_email | string | oui | null | Email du visiteur (si non inscrit) |
| type | VisitType | | 'in_person' | Type de visite (in_person, virtual, self_guided, hybrid) |
| status | VisitStatus | | 'scheduled' | Statut de la visite |
| scheduled_at | timestamp | | | Date et heure prévues |
| duration_minutes | unsigned integer | oui | null | Durée estimée |
| completed_at | timestamp | oui | null | Date de réalisation effective |
| cancelled_at | timestamp | oui | null | Date d'annulation |
| cancellation_reason | text | oui | null | Motif d'annulation |
| feedback | text | oui | null | Retour du visiteur après la visite |
| rating | decimal(2,1) | oui | null | Note donnée au bien, saisie à la clôture de la visite (`CompletePropertyVisitRequest` : 0 à 5) — distincte d'un [Review](#11-review) |
| notes | text | oui | null | Notes internes de l'agent |
| source | string(40) | oui | null | Provenance de la demande — le lien partagé qui l'a amenée (TCK-590, `2026_10_07_150100_add_attribution_to_property_visits`). Format `[a-z0-9_.-]`, `ContactLeadPublicRequest::ATTRIBUTION` |
| medium | string(40) | oui | null | Canal de cette provenance, même format |
| locale | string(5) | oui | null | Langue dans laquelle prévenir un visiteur **sans compte** (qui n'a pas de `preferred_language`) : la langue de la requête, ou la langue préférée du visiteur connu |
| metadata | jsonb | oui | null | |
| created_at | timestamp | | auto | |
| updated_at | timestamp | | auto | |

**Index :** `(property_id, scheduled_at)`, `(scheduled_at, status)`.

**Identification du visiteur — règle applicative, pas une contrainte :** aucune migration ne pose de
`CHECK` sur `property_visits` (relevé 2026-10-14 sur les trois migrations qui la touchent). Ce que
l'application exige : sur la route publique, un visiteur **anonyme** donne nom et téléphone
(`VisitRequestPublicPropertyRequest`), un visiteur connecté est rattaché par `visitor_id` ; sur la
route interne, le personnel qui gère le bien donne un `customer_id`, ou à défaut nom et téléphone
(`StorePropertyVisitRequest`, `required_without:customer_id`). Une ligne écrite hors de ces deux
voies peut n'identifier personne.

**Relations :**
- `property()` → belongsTo Property
- `visitor()` → belongsTo User
- `customer()` → belongsTo Customer
- `agent()` → belongsTo User

---

### 18. Conversation 🆕

**Table :** `conversations`
**Description :** Fil de discussion entre deux ou plusieurs utilisateurs, pouvant être lié à un bien ou un bail spécifique.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| subject | string | oui | null | Sujet de la conversation |
| property_id | FK properties | oui | null | Bien lié à la discussion (`nullOnDelete`) |
| lease_id | FK leases | oui | null | Bail lié à la discussion (`nullOnDelete`) |
| maintenance_request_id | FK maintenance_requests | oui | null | Demande de maintenance liée (`nullOnDelete`, FK posée par `2026_04_17_160033`) (remplace le morphOne côté MaintenanceRequest) |
| type | ConversationType | | 'direct' | Type — les six valeurs de `app/Models/Enums/ConversationType.php` : direct, group, booking, lease, property, support |
| status | ConversationStatus | | 'active' | Statut (active, archived, closed) |
| created_by | FK users | | | Initiateur de la conversation (FK sans `onDelete` : la suppression physique d'un utilisateur qui a ouvert une conversation est refusée) — ⚠ sans suffixe `_id` |
| last_message_id | FK messages | oui | null | Dernier message envoyé (`nullOnDelete`) — cache, mis à jour via `MessageObserver::created()` |
| last_message_preview | string(255) | oui | null | Extrait texte du dernier message (cache, affichage liste sans JOIN) |
| last_message_at | datetime | oui | null | Horodatage du dernier message (cache) |
| metadata | jsonb | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Relations :**
- `property()` → belongsTo Property
- `lease()` → belongsTo Lease
- `maintenanceRequest()` → belongsTo MaintenanceRequest
- `creator()` → belongsTo User (via created_by)
- `participants()` → belongsToMany User, pivot `conversation_participants` porté par le modèle
  ConversationParticipant (`using`), colonnes de pivot `id`, `role`, `last_read_at`, `is_muted`,
  `joined_at`, `left_at`, `archived_at`
- `messages()` → hasMany Message
- `lastMessage()` → belongsTo Message (via last_message_id) 🆕

**Index :** `conversations_parent_index` `(property_id, lease_id, maintenance_request_id)`.

---

### 19. ConversationParticipant 🆕

**Table :** `conversation_participants`
**Description :** Participant à une conversation avec suivi de lecture et préférences de notification. Sert de table pivot enrichie entre Conversation et User.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| conversation_id | FK conversations | | | Conversation |
| user_id | FK users | | | Participant |
| role | string | | 'member' | Rôle dans la conversation (member, admin) |
| last_read_at | datetime | oui | null | Dernier message lu (pour calcul des non-lus) |
| is_muted | boolean | | false | Notifications désactivées pour cette conversation |
| joined_at | datetime | | now | Date d'ajout à la conversation (distinct de `created_at` : utile si un participant quitte puis est réajouté) |
| left_at | datetime | oui | null | Date de départ (si quitté) |
| archived_at | timestamp | oui | null | Conversation archivée **pour ce participant** (`2026_04_22_000002`) ; lue en pivot par `Conversation::participants()` |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contrainte :** unique(conversation_id, user_id)
**Index :** `conversation_participants_user_archived_index (user_id, archived_at)` (`2026_04_22_000002`).

**Relations :**
- `conversation()` → belongsTo Conversation
- `user()` → belongsTo User

---

### 20. Message 🆕

**Table :** `messages`
**Description :** Message individuel envoyé dans une conversation.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| conversation_id | FK conversations | | | Conversation parente (`cascadeOnDelete`) |
| sender_id | FK users | oui | null | Expéditeur — **nullable** depuis `2026_04_24_120000_make_messages_sender_id_nullable_for_system` : un avis `system` n'a pas d'expéditeur ; `nullOnDelete` |
| content | text | | | Contenu du message (NOT NULL). Pour une note vocale, un aperçu neutre traduit (`messaging.audio_preview`) qui sert à la liste des conversations |
| type | MessageType | | 'text' | Type — les cinq valeurs de `app/Models/Enums/MessageType.php` : text, image, document, system, **audio** (note vocale, TCK-592, [ADR-0038](adr/0038-note-vocale-dans-la-messagerie.md)). Un participant n'écrit que `text` ou `audio` (`SendMessageConversationRequest::PARTICIPANT_TYPES`) ; `system` est réservé à `SystemMessageFactory` |
| metadata | jsonb | oui | null | Métadonnées — pour `audio` : `{"duration": <secondes déclarées>}` |
| deleted_at | timestamp | oui | null | Soft delete |
| created_at | timestamp | | auto | |
| updated_at | timestamp | | auto | |

**Index :** `(conversation_id, created_at)`.

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `attachments` (pièces jointes ; le fichier d'une note vocale y est rangé, collection privée — ADR-0038 : formats `SendMessageConversationRequest::AUDIO_MIMETYPES`, 2 Mo et 60 s au plus)
- `Searchable` (Scout) — indexe `content` sous la clé `body` ; un message supprimé n'est pas indexé

**Note :** Le statut de lecture est déterminé en comparant `message.created_at` avec `conversation_participant.last_read_at`. Pas de colonne `read_at` sur le message lui-même.

**Relations :**
- `conversation()` → belongsTo Conversation
- `sender()` → belongsTo User

---

### 21. MaintenanceRequest 🆕

**Table :** `maintenance_requests`
**Description :** Demande d'intervention ou de réparation soumise par un locataire sur un bien loué. Peut être assignée à un prestataire et suivie jusqu'à résolution.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| property_id | FK properties | | | Bien concerné (`cascadeOnDelete`) |
| lease_id | FK leases | oui | null | Bail en cours (si applicable) (`nullOnDelete`) |
| requester_id | FK users | | | Demandeur (locataire) — FK sans `onDelete` |
| assigned_to | FK users | oui | null | Prestataire assigné (`nullOnDelete`) — ⚠ sans suffixe `_id` |
| accepted_at | timestamp | oui | null | Acceptation de l'assignation par le prestataire. **Pas un statut**, délibérément : l'assignation ne change pas `status`, et en faire un état aurait coupé le chemin vers le devis. Nul : assigné, pas encore accepté ; remis à `null` à chaque réassignation (TCK-592, `2026_10_07_120000`) |
| title | string | | | Titre court du problème |
| description | text | | | Description détaillée |
| category | MaintenanceCategory | | | Catégorie (plumbing, electrical, structural, appliance, painting, cleaning, pest_control, locksmith, other) |
| priority | MaintenancePriority | | 'normal' | Priorité (low, normal, high, urgent) — `medium` est devenu `normal`, données et défaut, par `2026_04_26_013446_add_priority_to_maintenance_requests_table` ; tri métier par `MaintenancePrioritySort` |
| status | MaintenanceStatus | | 'open' | Statut de la demande — valeurs : `app/Models/Enums/MaintenanceStatus.php` (dont le circuit du devis : `quote_requested`, `quote_submitted`, `awaiting_owner`, `approved`, `rejected`) |
| quote_amount | decimal(14,2) | oui | null | Montant du devis — la colonne lue partout (principe n°3), **calculée** depuis `quote_lines` à la soumission depuis TCK-592 (`2026_04_26_010004`) |
| quote_currency | string(3) | oui | null | Devise du devis |
| quote_lines | jsonb | oui | null | Lignes du devis ; les nombres y sont des **chaînes décimales** (un flottant JSON n'a pas d'arithmétique exacte) (TCK-592 P12, `2026_10_07_130000`) |
| quote_valid_until | date | oui | null | Validité du devis |
| quote_estimated_duration_days | unsigned smallint | oui | null | Durée estimée des travaux, en jours |
| quote_submitted_at | timestamp | oui | null | Soumission du devis |
| quote_decision_at | timestamp | oui | null | Décision sur le devis |
| quote_decision_by_id | FK users | oui | null | Auteur de la décision (`nullOnDelete`) |
| quote_rejection_reason | text | oui | null | Motif d'un refus de devis |
| estimated_cost | decimal(14,2) | oui | null | Coût estimé |
| actual_cost | decimal(14,2) | oui | null | Coût réel |
| scheduled_at | timestamp | oui | null | Date d'intervention planifiée |
| started_at | timestamp | oui | null | Date de début d'intervention |
| completed_at | timestamp | oui | null | Date de fin d'intervention |
| resolution_notes | text | oui | null | Notes de résolution — porte aussi le rapport d'intervention : **aucune** colonne `resolution_report` n'existe (TCK-474) |
| access_instructions | text | oui | null | Kit d'accès au logement, rédigé par le donneur d'ordre pour le prestataire (TCK-592, `2026_10_07_120000`) |
| metadata | jsonb | oui | null | |
| deleted_at | timestamp | oui | null | Soft delete |
| created_at | timestamp | | auto | |
| updated_at | timestamp | | auto | |

**Index :** `(property_id, status)`, `(assigned_to, status)`.

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collections **privées** (ADR-0029 §3, TCK-538) `photos` (photos du problème), `before_photos` (état constaté par le prestataire avant d'intervenir, TCK-592), `completion_photos` (photos après intervention), `quotes` (devis joints)
- `Searchable` (Scout) — `title`, `description`

**Note :** `requester_id` pointe vers un User (la personne connectée). ⚠ Le modèle ne déclare
**aucune** relation `requesterCustomer()` (relevé 2026-10-14) : le Customer du demandeur se lit
depuis l'utilisateur.

**Relations** (`app/Models/MaintenanceRequest.php`) :
- `property()` → belongsTo Property
- `lease()` → belongsTo Lease
- `requester()` → belongsTo User
- `assignee()` → belongsTo User (via assigned_to)
- `quoteDecisionBy()` → belongsTo User (via quote_decision_by_id) 🆕
- `documents()` → morphMany Document
- `conversation()` → hasOne Conversation (via `maintenance_request_id`) — **le fil de l'intervention et sa seule lecture** : le plus ancien groupe (`type = group`, `ofMany(['id' => 'min'])`) qui porte la demande. Seule l'assignation le crée (`SyncMaintenanceConversation`) : `POST /api/conversations` refuse `maintenance_request_id` à un groupe créé à la main (TCK-2372, P250.03)

La facture du prestataire est une ligne de [ServiceProviderBill](#77-serviceproviderbill-)
(`maintenance_request_id`, `cascadeOnDelete`), que ce modèle ne déclare pas en relation.

---

### 22. Document 🆕

**Table :** `documents`
**Description :** Pièce justificative ou document officiel rattaché à un dossier (bail, client, bien, demande de maintenance). Le fichier lui-même est stocké via `spatie/laravel-medialibrary` (collection `file`), ce modèle porte les métadonnées métier (type, vérification, expiration).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| documentable_id | bigint | | | FK polymorphique (ID) |
| documentable_type | string | | | FK polymorphique (type) |
| uploaded_by | FK users | | | Utilisateur ayant uploadé |
| name | string | | | Nom affiché du document |
| type | DocumentType | | | Catégorie (id_card, passport, lease_contract, receipt, invoice, insurance, inventory_report, other) |
| description | text | oui | null | Description / contexte |
| is_verified | boolean | | false | Document vérifié par un admin/agent |
| verified_by | FK users | oui | null | Vérificateur |
| verified_at | datetime | oui | null | Date de vérification |
| expiry_date | date | oui | null | Date d'expiration (CNI, assurance, etc.) |
| metadata | jsonb | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `file` (le fichier d'origine : PDF, image, scan, etc.) et collection `versions` (les versions suivantes, une seule active)
- **Le fichier servi est la version active, sinon `file`** (`Document::currentFile()`, TCK-2300) : le lien de partage, la page publique d'un bien, `file_url` de la fiche et la revue des demandes de passage en agence le lisent tous. Une nouvelle version d'un document public de bien devient donc publique aussitôt.
- **Une nouvelle version vide `is_verified`, `verified_by`, `verified_at` et `expiry_date`** (TCK-2300), comme le renvoi d'une pièce par les assistants (TCK-1063) : la vérification remplacée s'écrit au journal (`document_verification_reset`), et l'échéance se reprend si la requête en porte une neuve. Une pièce de profil (`isProfilePiece()`) ne se versionne pas (422 `document.profile_piece_not_versioned`) : elle se renvoie par les assistants.

**Note :** Les colonnes `original_filename`, `file_path`, `file_size`, `mime_type` ne sont **pas** nécessaires dans cette table car elles sont gérées automatiquement par la table `media` de spatie/medialibrary.

**Relations :**
- `documentable()` → morphTo (Lease, Customer, Property, MaintenanceRequest, Inventory, **User**, **Agency**, **Booking**) 🆕 User (pièces d'identité, RIB), Agency (licence, K-bis), Booking (promesse de vente, offre signée)
- `uploader()` → belongsTo User
- `verifier()` → belongsTo User (via verified_by)

---

### 23. SavedSearch 🆕

**Table :** `saved_searches`
**Description :** Critères de recherche sauvegardés par un utilisateur pour recevoir des alertes automatiques lorsque de nouveaux biens correspondent.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| user_id | FK users | oui | | Utilisateur — `null` pour une alerte sans compte (TCK-599) |
| alert_subscriber_id | FK alert_subscribers | oui | null | Abonné sans compte (`saved_searches_alert_subscriber_fk`, `cascadeOnDelete`). CHECK `saved_searches_one_owner_chk` : exactement l'un des deux propriétaires (TCK-599) |
| name | string | | | Nom donné à la recherche (ex: "3 pièces Dakar < 200k") |
| criteria | jsonb | | | Critères dans le vocabulaire FERMÉ de `/properties` : `App\Support\SavedSearchCriteria::KEYS` (23 clés), toute autre clé → 422 (TCK-599) |
| notification_frequency | string | | 'daily' | Fréquence d'alerte (`daily`, `weekly`, `off` — `instant` retiré par TCK-599, ramené à `daily`). **NOT NULL** — la sentinelle « ne pas notifier » est `off`, jamais `null` ni `""` (TCK-330) |
| is_active | boolean | | true | Alerte active |
| last_notified_at | datetime | oui | null | Dernière notification envoyée |
| results_count | integer | | 0 | Nombre de résultats actuels (cache — mettre à jour via job planifié, pas à la volée) |
| metadata | jsonb | oui | null | |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Relations :**
- `user()` → belongsTo User
- `alertSubscriber()` → belongsTo AlertSubscriber (TCK-599)

`recipient()` rend le destinataire de l'alerte : l'utilisateur, ou l'abonné **confirmé**, sinon `null`.

---

### 24. Inventory 🆕

**Table :** `inventories`
**Description :** État des lieux réalisé à l'entrée ou à la sortie d'un locataire. Documente la condition du bien pièce par pièce et recueille les signatures des parties.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| lease_id | FK leases | | | Bail concerné (`cascadeOnDelete`, indexé) |
| property_id | FK properties | | | Bien inspecté (`cascadeOnDelete`) |
| type | InventoryType | | | Type (move_in, move_out) |
| conducted_by | FK users | | | Personne ayant réalisé l'état des lieux — FK sans `onDelete` ; ⚠ sans suffixe `_id` |
| tenant_id | FK customers | | | Locataire présent (`restrictOnDelete`) |
| conducted_at | timestamp | | | Date de réalisation |
| status | InventoryStatus | | 'draft' | Statut (draft, pending_signature, signed, disputed) |
| general_condition | InventoryCondition | | | État général (excellent, good, fair, poor) |
| rooms | jsonb | | | Détail pièce par pièce : `name`, `condition` (`InventoryCondition`), `notes`, et `elements[]` — `label`, `state` (**`InventoryElementState`** : `bon`, `usé`, `endommagé`, `manquant`, valeurs en français comme le vocabulaire montré au locataire), `notes`. Schéma validé par `InventoryStoreRequest`, pas par la base |
| notes | text | oui | null | Observations générales |
| tenant_signed | boolean | | false | Locataire a signé |
| tenant_signed_at | timestamp | oui | null | Date de signature locataire |
| tenant_signature_data | text | oui | null | Tracé de la signature du locataire (SVG en base64). **Caché** (`$hidden`) : jamais sérialisé par l'API, lu pour le PDF (TCK-076, `2026_04_24_120000_add_signature_data_to_inventories_table`) |
| tenant_signature_hash | string(64) | oui | null | SHA-256 du tracé — seul ce condensat voyage |
| owner_signed | boolean | | false | Propriétaire a signé |
| owner_signed_at | timestamp | oui | null | Date de signature propriétaire |
| owner_signature_data | text | oui | null | Tracé de la signature côté bailleur — **caché**, comme celui du locataire |
| owner_signature_hash | string(64) | oui | null | SHA-256 du tracé |
| owner_signed_by_user_id | FK users | oui | null | **Qui** a signé pour le bailleur — FK `inventories_owner_signed_by_fk`, `nullOnDelete` (TCK-596 §5, `2026_10_07_235910`) |
| owner_signed_on_behalf_of_user_id | FK users | oui | null | Bailleur pour le compte duquel un membre du personnel a signé au titre du mandat — FK `inventories_owner_on_behalf_fk`, `nullOnDelete` |
| signed_at | timestamp | oui | null | Seconde signature : l'état des lieux est signé des deux parties |
| traceability_hash | string(64) | oui | null | Empreinte SHA-256 complète, **figée une fois** à la seconde signature, photos par pièce comprises (`InventorySignatureService`). Nulle pour un état des lieux signé avant TCK-596 : son PDF garde l'empreinte qu'il imprimait |
| metadata | jsonb | oui | null | |
| deleted_at | timestamp | oui | null | Soft delete |
| created_at | timestamp | | auto | |
| updated_at | timestamp | | auto | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collections **privées** (ADR-0029 §3, TCK-538) `photos` et `room_photos` (photos par pièce)

**Relations** (`app/Models/Inventory.php`) :
- `lease()` → belongsTo Lease
- `property()` → belongsTo Property
- `conductor()` → belongsTo User (via conducted_by)
- `tenant()` → belongsTo Customer

Le modèle ne déclare ni `documents()` ni de relation vers les deux signataires `owner_signed_*`
(relevé 2026-10-14).

---

### 25. Invoice 🆕

**Table :** `invoices`
**Description :** Facture générée pour une réservation ou un paiement de bail. Sert à la comptabilité, à l'archivage légal et à la génération de PDF via medialibrary. La relation `invoiceable` est polymorphique : une facture peut être émise pour un `Booking`, un `Lease`, un `LeasePayment` ou un `BookingPayment`.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| invoiceable_id | bigint | oui | null | FK polymorphique (ID de l'entité facturée) — `nullableMorphs`, indexé |
| invoiceable_type | string | oui | null | FK polymorphique (type de l'entité facturée) |
| customer_id | FK customers | | | Destinataire de la facture (Customer — locataire ou acheteur) (`restrictOnDelete`) |
| issued_by_id | FK users | oui | null | Utilisateur émetteur de la facture (`nullOnDelete`) |
| agency_id | FK agencies | oui | null | Agence émettrice (`nullOnDelete`) |
| reference_number | string | | | Numéro de facture — unique **par agence**, pas globalement (voir Contraintes). `FA-AAAA-NNNNN` / `AV-AAAA-NNNNN` pour une facture numérotée ; une facture sans agence garde sa référence `INV-…` |
| status | InvoiceStatus | | 'draft' | Statut (draft, sent, paid, overdue, cancelled, void) |
| kind | InvoiceKind (string(20)) | | 'invoice' | `invoice` ou `credit_note` (avoir) — une facture émise ne s'annule que par un avoir (TCK-594, ADR-0039 §7, `2026_10_07_200700`) |
| credited_invoice_id | FK invoices | oui | null | Pour un avoir : la facture qu'il annule (`nullOnDelete`, FK `invoices_credited_invoice_fk`, index `invoices_credited_invoice_idx`) (TCK-594) |
| sequence_year | smallint | oui | null | Année de la séquence de numérotation. **Non assignable en masse** : seul `InvoiceNumberAllocator` l'écrit, à l'émission — jamais au brouillon (TCK-594) |
| sequence_number | integer | oui | null | Rang continu par `(agency_id, kind, sequence_year)` ; même écrivain unique (TCK-594) |
| issue_date | date | | | Date d'émission |
| due_date | date | oui | null | Date d'échéance de paiement |
| last_reminder_sent_at | timestamp | oui | null | Dernière relance envoyée (`2026_04_25_160000`) |
| reminders_sent_count | smallint | | 0 | Nombre de relances envoyées (`2026_04_25_160000`) |
| bank_reconciled_at | datetime | oui | null | Date du rapprochement bancaire (`2026_04_28_000005`) |
| bank_statement_line_id | FK bank_statement_lines | oui | null | Ligne de relevé rapprochée (`nullOnDelete`) ; unicité partielle `invoices_bank_line_unique` sur les lignes non nulles (`2026_04_28_000005`) |
| subtotal | decimal(14,2) | | | Montant hors taxes |
| tax_rate | decimal(5,2) | oui | null | Taux de taxe appliqué (%) |
| tax_amount | decimal(14,2) | oui | null | Montant de la taxe |
| total_amount | decimal(14,2) | | | Montant total TTC |
| currency | Currency (string(3)) | | 'XOF' | Devise |
| transaction_id | string | oui | null | Identifiant de transaction du fournisseur de paiement, nul tant qu'aucun paiement en ligne n'est amorcé ; index `invoices_transaction_id_idx` — lu à chaque webhook entrant (TCK-285, `2026_08_16_090000`) |
| payment_method | string | oui | null | Canal du règlement en ligne, écrit par `PaymentGatewayService::recordInitiation()` (TCK-285, `2026_08_16_090000`) |
| notes | text | oui | null | Libellé ou notes complémentaires |
| metadata | jsonb | oui | null | Données complémentaires |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes et index** (mesurés sur `2026_04_17_160023`, `2026_04_28_000005`, `2026_06_18_000001`, `2026_08_16_090000`, `2026_10_07_200700`) :
- `invoices_agency_reference_unique` — unique `(agency_id, reference_number)`. **L'unicité globale de `reference_number` a été retirée** par `2026_10_07_200700` : elle aurait fait collisionner `FA-2026-00001` d'une agence à l'autre.
- `invoices_reference_no_agency_unique` — unique partiel `(reference_number) WHERE agency_id IS NULL` : PostgreSQL tient deux `NULL` pour distincts, l'unicité précédente ne couvrirait pas les factures sans agence.
- `invoices_agency_kind_seq_unique` — unique `(agency_id, kind, sequence_year, sequence_number)` : garde de dernier recours de la numérotation continue. La garde première est `InvoiceNumberAllocator`, qui sérialise deux émissions concurrentes de la même agence sur le verrou de la ligne `agencies`.
- `invoices_bank_line_unique` — unique partiel `(bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL`.
- Index : `(customer_id, status)`, `(agency_id, status)`, `issue_date`, `due_date`, `transaction_id`, `credited_invoice_id`.

**Invariant applicatif :** une facture `paid` ne revient pas à `draft`, `sent` ni `overdue` (`Invoice::booted()`, `updating` → 422 `invoice.status_transition_invalid`).

**Relations** (mesurées sur `App\Models\Invoice`) :
- `invoiceable()` → morphTo
- `customer()` → belongsTo Customer (destinataire)
- `issuer()` → belongsTo User (via issued_by_id)
- `agency()` → belongsTo Agency
- `creditNotes()` → hasMany Invoice (via credited_invoice_id — les avoirs qui l'annulent) (TCK-594)
- `creditedInvoice()` → belongsTo Invoice (via credited_invoice_id — pour un avoir, la facture annulée) (TCK-594)
- `bankStatementLine()` → belongsTo BankStatementLine

⚠ Le modèle ne porte **pas** de relation `documents()` : le PDF n'est pas rattaché par ce chemin.

**Inverse sur les modèles liés :**
- `Lease.invoices()` → morphMany Invoice
- `Agency.invoices()` → hasMany Invoice
- `Customer.invoices()` → hasMany Invoice

⚠ `Booking.invoices()`, `LeasePayment.invoice()` et `BookingPayment.invoice()`, décrites ici jusqu'au 2026-10-14, **n'existent pas** dans le code.

---

### 26. PropertyPriceHistory 🆕

**Table :** `property_price_histories`
**Description :** Journal append-only des variations de prix d'un bien. Chaque entrée est créée automatiquement via `PropertyObserver::updating()` lorsque `Property.price` change.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| property_id | FK properties | | | Bien concerné (`cascadeOnDelete`) |
| changed_by_id | FK users | oui | null | Utilisateur ayant modifié le prix (`nullOnDelete`) |
| old_price | decimal(14,2) | oui | null | Prix avant la modification |
| new_price | decimal(14,2) | | | Nouveau prix |
| currency | Currency | | 'XOF' | Devise |
| reason | PriceChangeReason | oui | null | Motif du changement (market_adjustment, negotiation, renovation, urgent_sale, seasonal, correction) |
| notes | text | oui | null | Notes complémentaires |
| changed_at | datetime | | | Date effective de la modification |
| created_at | datetime | | auto | |

> **Note :** Pas de `updated_at` — ce modèle est append-only. Pas de `deleted_at` — les entrées ne doivent pas être supprimées.

**Relations :**
- `property()` → belongsTo Property
- `changedBy()` → belongsTo User (via changed_by_id)

---

### 27. Guarantor 🆕

**Table :** `guarantors`
**Description :** Personne physique se portant garante pour un bail. Extrait des colonnes texte précédemment stockées sur `Lease` afin de permettre l'attachement de documents justificatifs (CNI, attestation de revenus, fiches de paie) via medialibrary et la réutilisation d'un même garant sur plusieurs baux.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| first_name | string | | | Prénom du garant |
| last_name | string | | | Nom du garant |
| phone | string | oui | null | Téléphone principal |
| email | string | oui | null | Email de contact |
| id_type | IdType | oui | null | Type de pièce d'identité |
| id_number | text (cast `encrypted`) | oui | null | Numéro de pièce d'identité — **chiffré** (TCK-954, ADR-0070) |
| occupation | string | oui | null | Profession / activité |
| employer | string | oui | null | Nom de l'employeur |
| monthly_income | text (cast `encrypted`) | oui | null | Revenu mensuel déclaré (XOF) — **chiffré** (TCK-954, ADR-0070) ; le `down()` de `2026_10_19_110000` rend `numeric(14,2)` |
| relationship_to_tenant | string | oui | null | Lien avec le locataire (parent, conjoint, employeur, autre) |
| added_by_id | FK users | oui | null | Utilisateur ayant saisi le garant (`nullOnDelete`) |
| agency_id | FK agencies | oui | null | Agence de la caution (`nullOnDelete`, index), posée à la création (`GuarantorController` : l'agence de l'auteur) ; nulle pour une caution ajoutée hors de toute agence. Elle ne dépend plus de la vie de l'auteur : une caution dont l'auteur efface son compte restait illisible dans l'agence (TCK-1993, `2026_10_23_230000`). **Reprise**, dans cet ordre et seulement quand la source désigne **une** agence : l'agence des baux qui portent la caution (`leases.guarantor_id` ou `lease_guarantor`), sinon celle des profils de son auteur (agent, admin d'agence, bailleur, supprimés compris) ; sinon nulle |
| notes | text | oui | null | Notes internes |
| metadata | jsonb | oui | null | Données complémentaires |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Données sensibles** (TCK-954, TCK-955, [ADR-0070](adr/0070-piece-et-revenu-du-locataire-et-de-la-caution-chiffres-masques-lus-sous-step-up.md)) :
`id_number` et `monthly_income` (`Guarantor::SENSITIVE`) sont chiffrés en base, en `text`, et absents
de toute sérialisation par défaut (`$hidden`). Ils ne sortent que masqués par
`GuarantorController::format` — `id_number_masked` (les quatre derniers caractères) et
`monthly_income_masked` (`••••` ou `null`, sans rien révéler du montant) —, et en clair par
`GET /api/guarantors/{id}/sensitive`, réservé à l'admin de l'agence de la caution (`GuarantorPolicy::agencyOf` :
`agency_id`, à défaut l'agence de l'auteur) et au super-admin, sous second facteur récent, consultation journalisée (surface
`guarantor_sensitive`).

**Traits :** `HasFactory`, `SoftDeletes`. ⚠ Le modèle ne porte **pas** `InteractsWithMedia` (relevé
2026-10-27) : aucune collection medialibrary ; les pièces justificatives s'attachent par `documents()`.

**Accesseurs :** aucun — l'accesseur `full_name` que cette section décrivait n'existe pas (relevé 2026-10-27).

**Relations** (mesurées sur `App\Models\Guarantor`, 2026-10-27) :
- `addedBy()` → belongsTo User (via `added_by_id`)
- `agency()` → belongsTo Agency (TCK-1993)
- `leases()` → hasMany Lease, via `leases.guarantor_id` (un même garant peut couvrir plusieurs baux)
- `leasesPivot()` → belongsToMany Lease (pivot `lease_guarantor`, `withPivot(['role'])`, horodaté)
- `documents()` → morphMany Document (`documentable`)

Le modèle ne déclare **pas** `addresses()`.

---

### 28. Payout 🆕

**Table :** `payouts`
**Description :** Sortie d'argent de l'agence vers un bénéficiaire : le bailleur (reversement des loyers après commission), le locataire (caution rendue) ou le prestataire (facture d'intervention) — `payee_role` le dit (TCK-594, ADR-0039). Assure la traçabilité comptable des flux sortants. Un reversement au bailleur agrège typiquement un ou plusieurs `LeasePayment` / `BookingPayment` d'une période donnée, par les pivots.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| lease_id | FK leases | oui | null | Bail concerné (si reversement locatif) (`nullOnDelete`) |
| booking_id | FK bookings | oui | null | Réservation concernée (si reversement sur acompte) (`nullOnDelete`) |
| service_provider_bill_id | FK service_provider_bills | oui | null | Facture d'intervention payée par ce reversement, quand `payee_role = service_provider` (`nullOnDelete`, FK `payouts_sp_bill_fk`, index `payouts_sp_bill_idx`) (TCK-594, `2026_10_07_200200`) |
| agency_id | FK agencies | oui | null | Agence émettrice du reversement (`nullOnDelete`) |
| landlord_id | FK users | | | Utilisateur bénéficiaire (`restrictOnDelete`). Le nom est historique : pour un reversement `service_provider`, c'est l'utilisateur prestataire (`PayoutService`) ; pour une caution rendue (`tenant`), c'est le bailleur du bail, et le bénéficiaire réel se lit par `beneficiaryUserId()` (le locataire du bail) |
| payee_role | PayeeRole (string(30)) | | 'landlord' | Qui reçoit l'argent : `landlord`, `tenant`, `service_provider`. Chaîne, pas `enum()` SQL (ADR-0007). Tout cumul de « reversements au bailleur » filtre `landlord`. Les remboursements de caution antérieurs ont été passés à `tenant` par `2026_10_07_200300` (TCK-594, ADR-0039 §2) |
| issued_by_id | FK users | oui | null | Utilisateur ayant initié le reversement (`nullOnDelete`) |
| approved_by_id | FK users | oui | null | Approbateur, quand le net atteint le seuil d'approbation de l'agence (`nullOnDelete`, FK `payouts_approved_by_fk`) (TCK-594, ADR-0039 §4) |
| approved_at | timestamp | oui | null | Date de l'approbation (TCK-594) |
| processed_by_id | FK users | oui | null | Membre qui a exécuté le paiement (`nullOnDelete`, FK `payouts_processed_by_fk`) (TCK-594) — émission, approbation et paiement sont les trois gestes d'une sortie d'argent (ADR-0039 §4) |
| reference_number | string | | | Numéro de bordereau (unique) |
| status | PayoutStatus | | 'pending' | Statut du reversement — `awaiting_approval` tant qu'un second membre détenant `payouts.approve` n'a pas approuvé (ADR-0039 §4). Un reversement `completed` n'en sort plus (`Payout::booted()`, 422 `payout.status_transition_invalid`) |
| period_start | date | oui | null | Début de la période couverte |
| period_end | date | oui | null | Fin de la période couverte |
| gross_amount | decimal(14,2) | | | Montant brut collecté |
| commission_amount | decimal(14,2) | | 0 | Commission agence retenue |
| fees_amount | decimal(14,2) | oui | null | Frais annexes retenus (transfert, fiscalité) |
| clawback_amount | decimal(14,2) | oui | null | Reprise au bailleur imputée à ce reversement, à côté de `fees_amount` : `net_amount` vaut brut − commission − frais − reprise imputée (TCK-2151, `2026_10_24_050000`, voir [§107](#107-payoutclawback-)) |
| net_amount | decimal(14,2) | | | Montant net reversé |
| currency | Currency | | 'XOF' | Devise |
| payment_method | PaymentMethod | oui | null | Moyen de reversement (bank_transfer, mobile_money, cash, check) |
| payout_method_id | FK payout_methods | oui | null | Destination enregistrée du bénéficiaire (§76) ; la relation lit aussi une destination supprimée (`withTrashed`) (`nullOnDelete`, FK `payouts_payout_method_fk`) (TCK-594, `2026_10_07_200200`) |
| transaction_id | string | oui | null | ID transaction externe (banque / mobile money) |
| scheduled_at | timestamp | oui | null | Date planifiée du reversement |
| processed_at | timestamp | oui | null | Date effective du reversement |
| bank_reconciled_at | datetime | oui | null | Date du rapprochement bancaire (TCK-593, `2026_10_07_150200`) |
| bank_statement_line_id | FK bank_statement_lines | oui | null | Ligne de relevé rapprochée (`nullOnDelete`, FK `payouts_bank_line_fk`) ; un reversement n'est rapproché qu'à une seule ligne (TCK-593) |
| refunded_payment_type / refunded_payment_id | nullableMorphs | oui | null | Le `LeasePayment` ou le `BookingPayment` dont ce `Payout` **constate** le remboursement déjà sorti (TCK-2052, `2026_10_24_030000`, [ADR-0039, amendement du 2026-10-23](adr/0039-les-sorties-d-argent.md)). Ces colonnes sont à la fois la marque et le lien : un constaté est **exactement** un `Payout` où elles sont non nulles (`isObservedRefund()`). Il naît `completed`, `payee_role = tenant`, brut = net sans commission, sans pivot (`ObservedRefundPayout`). Nulles pour tout autre `Payout`, caution rendue comprise |
| failed_reason | text | oui | null | Motif d'échec (si `status = failed`) |
| notes | text | oui | null | Notes internes |
| metadata | jsonb | oui | null | Données passerelle / complémentaires |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes et index** (mesurés sur `2026_04_17_160025`, `2026_08_22_090000`, `2026_10_07_150200`, `2026_10_07_200200`, `2026_10_07_200400`, `2026_10_24_030000`) :
- `reference_number` unique.
- `payouts_bank_line_unique` — unique partiel `(bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL`.
- Index : `(landlord_id, status)`, `(lease_id, period_start)`, `(status, scheduled_at)`, `payouts_agency_id_created_at_index (agency_id, created_at)`, `payouts_agency_status_idx (agency_id, status)`, `payouts_sp_bill_idx (service_provider_bill_id)`, `payouts_refunded_payment_idx (refunded_payment_type, refunded_payment_id)` (TCK-2052).
- **Aucune contrainte CHECK ne porte sur `payouts`.** Le CHECK « `lease_id IS NOT NULL OR booking_id IS NOT NULL` » qu'écrivait cette section n'a jamais été posé, et ne le sera pas : un reversement couvre plusieurs baux d'un même bailleur, ou une facture de prestataire. L'origine se garantit à l'écriture (au moins une pièce) et se lit dans les pivots (docblock de `2026_10_07_200200`).

**Pivots `payout_lease_payment` et `payout_booking_payment`** (`2026_04_17_160025`) : `payout_id` FK `cascadeOnDelete`, `lease_payment_id` / `booking_payment_id` FK `cascadeOnDelete`, clé primaire composée. **Un paiement n'est reversé qu'une fois** : unicités `payout_lp_lease_payment_unique (lease_payment_id)` et `payout_bp_booking_payment_unique (booking_payment_id)` (TCK-594, ADR-0039 §3, `2026_10_07_200400`). Avant de les poser, la migration a détaché les pièces des reversements `cancelled` ou `failed` et gardé, pour chaque paiement, le plus ancien reversement — comme le fait désormais le service.

Chaque pivot porte aussi la **copie figée de la ligne** : `amount` decimal(14,2), `commission_rate` decimal(5,2) et `commission_amount` decimal(14,2), nullables (TCK-2017, `2026_10_24_010000`) — ce que le reversement a pris de la pièce, posé à sa création par `PayoutService::createLocked`. Le relevé ne suit donc plus le taux d'agence du jour. Une ligne antérieure n'a pas de copie : le relevé la lit alors au taux du jour, et elle ne donne jamais de reprise ([§107](#107-payoutclawback-)). La pénalité de retard reversée n'a pas de pivot : sa copie est sur la ligne du loyer (`lease_payments.late_fee_payout_*`, [§15](#15-leasepayment-)).

**Relations** (mesurées sur `App\Models\Payout`) :
- `lease()` → belongsTo Lease
- `booking()` → belongsTo Booking
- `agency()` → belongsTo Agency
- `landlord()` → belongsTo User (via landlord_id)
- `issuer()` → belongsTo User (via issued_by_id)
- `approver()` → belongsTo User (via approved_by_id) (TCK-594)
- `processor()` → belongsTo User (via processed_by_id) (TCK-594)
- `payoutMethod()` → belongsTo PayoutMethod, `withTrashed` (TCK-594)
- `serviceProviderBill()` → belongsTo ServiceProviderBill — la facture que ce reversement paie (TCK-594)
- `refundedPayment()` → morphTo (`refunded_payment_type` / `refunded_payment_id`) — le payable dont ce `Payout` constate le remboursement (TCK-2052)
- `imputedBills()` → hasMany ServiceProviderBill (via `imputed_payout_id`) — les factures d'intervention retenues en frais de ce reversement au bailleur
- `leasePayments()` → belongsToMany LeasePayment (pivot `payout_lease_payment` — agrégation des paiements couverts)
- `bookingPayments()` → belongsToMany BookingPayment (pivot `payout_booking_payment`)

⚠ Le modèle ne porte **pas** de relation `documents()`.

**Inverse sur les modèles liés :**
- `Lease.payouts()` → hasMany Payout
- `Agency.payouts()` → hasMany Payout
- `LeasePayment.payouts()`, `BookingPayment.payouts()` → belongsToMany Payout (par les pivots)
- `ServiceProviderBill.payouts()` → hasMany Payout
- `User.payouts()` → hasMany Payout (via landlord_id)

⚠ `Booking.payouts()`, décrite ici jusqu'au 2026-10-14, **n'existe pas** dans le code.

---

### 29. DocumentShareLink 🆕

**Table :** `document_share_links`
**Description :** Lien de partage sécurisé et temporaire pour un `Document`. Permet d'envoyer une URL signée, éventuellement protégée par mot de passe et limitée en nombre de téléchargements, à un destinataire externe sans compte utilisateur.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| document_id | FK documents | | | Document partagé (`cascadeOnDelete`) |
| token | text (cast `encrypted`) | | | Jeton du lien, **chiffré** au repos — relu seulement par qui gère le document, pour réafficher l'URL. **N'est plus unique ni cherché** : la résolution passe par `token_hash` (TCK-602, ADR-0051 §7, `2026_10_08_180000`) |
| token_hash | char(64) | | | Empreinte sha256 du jeton, unique (`dsl_token_hash_unique`) — **la seule colonne cherchée** à la résolution d'un lien public. Écrite par `DocumentShareLink::booted()` (`saving`) dès que `token` change : service, fabrique et seeders n'écrivent que `token`. Masquée à la sérialisation (`$hidden`) (TCK-602) |
| expires_at | timestamp | oui | null | Date d'expiration du lien (null = pas d'expiration) |
| password_hash | string | oui | null | Hash du mot de passe d'accès (optionnel) ; masqué à la sérialisation |
| max_downloads | integer | oui | null | Nombre maximum de téléchargements autorisés |
| downloads_count | integer | | 0 | Nombre de téléchargements effectués |
| created_by_id | FK users | oui | null | Utilisateur ayant généré le lien (`nullOnDelete`) |
| revoked_at | timestamp | oui | null | Date de révocation manuelle |
| last_accessed_at | timestamp | oui | null | Dernière consultation |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes et index** (mesurés sur `2026_04_17_160026` et `2026_10_08_180000`) :
- `dsl_token_hash_unique` — unique `(token_hash)`.
- L'unicité de `token` (`document_share_links_token_unique`) **a été retirée** par `2026_10_08_180000` : un texte chiffré n'est pas déterministe, il ne se compare pas. Les liens existants ont été hachés et chiffrés par la même migration — un lien déjà envoyé reste valide ; `down()` rétablit le clair en déchiffrant.
- Index : `(document_id, expires_at)`.

**Relations :**
- `document()` → belongsTo Document
- `creator()` → belongsTo User (via created_by_id)

**Inverse :**
- `Document.shareLinks()` → hasMany DocumentShareLink

---

### 30. Setting 🆕

**Table :** `settings`
**Description :** Paramètres de configuration clé/valeur, scopés globalement ou par agence. Permet de persister les réglages de la plateforme sans multiplier les colonnes dédiées.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| key | string | | | Clé du paramètre (ex: `booking.auto_expire_hours`) |
| value | jsonb | | | Valeur (typage libre via JSON) |
| scope | SettingScope | | 'global' | Portée (`global`, `agency`) |
| scope_id | bigint | oui | null | FK vers l'entité de scope (ex: `agencies.id` si `scope = agency`) |
| updated_by_id | FK users | oui | null | Dernier utilisateur ayant modifié (`nullOnDelete`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes :**
- Unique composé `settings_key_scope_scope_id_unique (key, scope, scope_id)` en **`NULLS NOT
  DISTINCT`** : une clé `global` (`scope_id` nul) est unique en base, pas seulement par les
  `updateOrCreate` des écrivains (TCK-640, `2026_10_14_120000`).

**Clés de plateforme.** Une clé de portée `global` que le code lit s'écrit par un catalogue **en
code**, et seulement par lui ([ADR-0065](adr/0065-les-reglages-metier-a-repli-global-entrent-au-catalogue.md)).
Il y en a deux :

- **Paramètres plateforme** — `App\Domain\Settings\EditablePlatformSettings`, écrit par
  `PlatformSettingService` (`PATCH /api/admin/settings`, typé, validé, journalisé
  `super_admin_setting_updated`), réduit aux clés qu'un code lit (TCK-600, garde
  `scripts/check-platform-catalogue-readers.mjs`) — la liste se lit là. **Clés de crédits et de
  boost** (TCK-633, catégorie `boost`, [ADR-0061 §6](adr/0061-credits-d-espace-et-boost-des-annonces.md),
  lues par `App\Services\Boost\BoostSettings`) : `credits.welcome_amount`,
  `credits.welcome_validity_days`, `credits.expiry_notice_days`, `boost.bump_cooldown_hours`,
  `boost.sponsored_slots_per_page`, `boost.reserved_top_results`. **Réglages métier à repli par
  agence** (TCK-651, catégorie `rentals`) : `invoice.reminder_offsets_days`,
  `lease.rent_review_max_pct`, `lease.early_termination_penalty_months`, `lease.require_signature`,
  `late_fees.cap_percent` (vide = aucun plafond) — lus par `App\Support\ScopedSetting` : la ligne
  `agency` de l'agence, sinon la valeur du catalogue, dont le défaut est la constante du service.
  Défauts dans le catalogue.
- **Énumérations métier** — clés `enum.{key}.values`, catalogue `App\Domain\Settings\EditableBusinessEnums`,
  écrites par `BusinessEnumService`.

**Route brute** (`/api/settings`, `SettingController`). Elle lit la table (`index`) et n'écrit que la
portée `agency` — admin de l'agence, ou super-admin sous second facteur ; `value` y est un objet
JSON libre (`{"value": …}`), sans journal, `updated_by_id` pour seule trace. Une écriture en portée
`global` (`store`, `update`, `destroy`) rend **422 `setting.global_not_writable`**, super-admin compris
(TCK-651) ; un appelant qui n'est pas super-admin reçoit d'abord 403.

**Relations :**
- `updatedBy()` → belongsTo User (via updated_by_id)

---

### 31. Integration 🆕

**Table :** `integrations`
**Description :** Intégration tierce configurée sur la plateforme (passerelle de paiement mobile money, service d'envoi SMS, MLS, etc.). Stocke les identifiants d'API de manière chiffrée et les métadonnées associées.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| provider | string | | | Identifiant du fournisseur (`wave`, `orange_money`, `stripe`, `mls`, `twilio`, `whatsapp_cloud`…). Pour `whatsapp_cloud` : `credentials` = phone_number_id / access_token / waba_id ; `metadata` = webhook verify token / app secret |
| agency_id | FK agencies | oui | null | Agence propriétaire (null = intégration globale) (`cascadeOnDelete`) |
| credentials | text (cast `encrypted:array`) | | | Credentials chiffrés (API keys, secrets, tokens) ; masqués à la sérialisation |
| is_active | boolean | | true | Intégration activée |
| last_used_at | timestamp | oui | null | Dernière utilisation |
| last_health_check_at | timestamp | oui | null | Dernier test de connexion (`2026_05_07_000217`) |
| health_status | string | | 'unknown' | Résultat du dernier test : `unknown` tant qu'aucun n'a tourné, puis `healthy` ou `failed`, écrit par `IntegrationService::test()` (`2026_05_07_000217`) |
| webhook_token_hash | char(64) | oui | null | Empreinte sha256 du jeton de l'URL de webhook, unique (`integrations_webhook_token_hash_unique`) — **la colonne cherchée** quand un webhook de paiement arrive. Nulle hors intégration de paiement (TCK-293, ADR-0046, `2026_10_08_120000`) |
| webhook_token | text (cast `encrypted`) | oui | null | Le jeton en clair, chiffré par `APP_KEY` — relu pour construire l'URL de notification (`webhookUrl()`, sur `APP_URL`) : `notif_url` d'Orange Money, écran Wave. Masqué à la sérialisation (TCK-293) |
| metadata | jsonb | oui | null | Configuration complémentaire (webhooks, scopes…) |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes et index** (mesurés sur `2026_04_17_160028`, `2026_08_22_090000`, `2026_10_08_120000`, `2026_10_14_120100`) :
- `integrations_provider_agency_live_unique` — unique `(provider, agency_id)` en **`NULLS NOT
  DISTINCT`**, **partiel** `WHERE deleted_at IS NULL` : une seule intégration vivante par fournisseur
  et par agence, intégration de plateforme (`agency_id` nul) comprise ; une intégration supprimée ne
  bloque pas son remplaçant. Un doublon par l'API rend 422 sur `provider` (TCK-640,
  `2026_10_14_120100`, qui remplace `integrations_provider_agency_id_unique`).
- `integrations_webhook_token_hash_unique` — unique `(webhook_token_hash)`.
- Index `integrations_agency_id_created_at_index (agency_id, created_at)`.

**Cycle du jeton de webhook** (TCK-293, ADR-0046 §2, §7 — `Integration::booted()`) : une intégration de paiement (`PaymentProvider`) **naît avec son jeton** ; elle en reçoit un neuf si son fournisseur ou son agence change, par quelque chemin que ce soit — l'ancien jeton ne doit rien ouvrir chez le nouveau titulaire ; une intégration qui cesse d'être de paiement perd le sien. `rotateWebhookToken()` tire un jeton neuf (48 caractères, CSPRNG) et l'ancien cesse de résoudre dans la même écriture. Les intégrations de paiement existantes ont reçu leur jeton par `2026_10_08_120000` : sans lui, elles ne recevraient plus aucun webhook, l'ancienne route rendant 410.

**Relations :**
- `agency()` → belongsTo Agency

---

### 32. Task 🆕

**Table :** `tasks`
**Description :** Tâche ou rappel polymorphe attaché à une entité du CRM (Customer, Lease, Property, MaintenanceRequest…). Couvre le besoin minimal de suivi CRM (relance, rappel de paiement, action à faire).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| title | string | | | Titre court de la tâche |
| description | text | oui | null | Description libre |
| taskable_id | bigint | oui | null | ID polymorphique de l'entité liée |
| taskable_type | string | oui | null | Type polymorphique de l'entité liée |
| assigned_to_id | FK users | oui | null | Utilisateur assigné (`nullOnDelete`) |
| created_by_id | FK users | oui | null | Créateur de la tâche (`nullOnDelete`) |
| due_at | datetime | oui | null | Date d'échéance |
| completed_at | datetime | oui | null | Date de complétion |
| status | TaskStatus | | 'open' | Statut (`open`, `in_progress`, `done`, `cancelled`) |
| priority | TaskPriority | | 'medium' | Priorité (`low`, `medium`, `high`) |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Relations :**
- `taskable()` → morphTo (Customer, Lease, Property, MaintenanceRequest)
- `assignedTo()` → belongsTo User (via assigned_to_id)
- `createdBy()` → belongsTo User (via created_by_id)

---

### 33. CustomerNote 🆕

**Table :** `customer_notes`
**Description :** Note horodatée et signée par un agent sur un contact CRM. Constitue l'historique structuré des échanges (distinct de `Customer.metadata` qui reste une zone libre).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| customer_id | FK customers | | | Client concerné (`cascadeOnDelete`) |
| author_id | FK users | oui | null | Auteur de la note (`nullOnDelete`) |
| body | text | | | Contenu de la note |
| pinned | boolean | | false | Note épinglée en haut de la fiche |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Relations :**
- `customer()` → belongsTo Customer
- `author()` → belongsTo User (via author_id)

**Inverse :**
- `Customer.notes()` → hasMany CustomerNote

---

### 34. OwnerProfile 🆕

**Table :** `owner_profiles`
**Description :** Profil **propriétaire** d'un user chez une agence donnée. Porte les informations administratives nécessaires à un bailleur (RIB, pièce d'identité, revenus, garant). Un même user peut être owner chez plusieurs agences (un profil par agence).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| user_id | FK users | oui | null | Identité du propriétaire (`restrictOnDelete`). **Nul pendant le brouillon** : le profil naît `draft` à l'envoi d'une invitation, avant que le compte cible n'existe, et `user_id` se renseigne à l'acceptation (TCK-256, `2026_05_10_150000`) |
| agency_id | FK agencies | | | Agence chez laquelle ce profil existe (`restrictOnDelete`) |
| agency_role_id | FK agency_roles | | | Le rôle personnalisé de ce profil — **exactement un** (`restrictOnDelete`, FK `owner_profiles_agency_role_id_fk`). À la création, un profil qui n'en déclare pas reçoit le rôle système de son type dans son agence (`HasAgencyRole`) (TCK-279, `2026_08_16_120200` → `120400`) |
| status | OwnerProfileStatus | | 'active' | Statut du profil (draft, active, inactive, blocked). **`blocked` = adhésion suspendue par l'agence** (`TeamMemberSuspensionService`, capacité `team.suspend`, TCK-587, ADR-0031 §2 ; journal `team_member_suspended` / `team_member_reactivated`) : le bailleur garde la lecture et perd les écritures dans cette agence (`HasProfiles::isBlockedOwnerAt()`) ; la réactivation ne lève que ce statut |
| rib | text (cast `encrypted`) | oui | null | Relevé d'identité bancaire — **chiffré** (TCK-601, ADR-0044 §1, `2026_10_08_601100`) |
| tax_id | text (cast `encrypted`) | oui | null | Numéro fiscal / NINEA — chiffré (TCK-601) |
| id_document_type | IdType | oui | null | Type de pièce d'identité |
| id_document_number | text (cast `encrypted`) | oui | null | Numéro de pièce — chiffré (TCK-601) |
| monthly_income | text (cast `encrypted`) | oui | null | Revenus mensuels déclarés (XOF) — chiffré (TCK-956, ADR-0070, `2026_10_19_120000`) |
| works_approval_threshold | decimal(14,2) | oui | null | Plafond de travaux du bailleur pour cette agence : au-delà, l'approbation d'un devis — ou un coût réel déclaré — par l'équipe attend l'accord du bailleur. `null` = pas d'accord requis (état de toutes les lignes antérieures). Lu en un seul endroit, `OwnerApprovalThreshold` (TCK-592, ADR-0037, `2026_10_07_130100`) |
| employer | string | oui | null | Employeur |
| guarantor_user_id | FK users | oui | null | Garant (autre user — `nullOnDelete`) |
| metadata | jsonb | oui | null | Données flexibles |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Données sensibles** (TCK-601, ADR-0044 §1 ; TCK-956, ADR-0070) : `rib`, `tax_id`, `id_document_number` et `monthly_income` (`OwnerProfile::SENSITIVE`) sont chiffrés en base, en `text` — une valeur chiffrée ne tient pas dans un `varchar(255)` —, absents de toute sérialisation par défaut (`$hidden`), hors des sparse fieldsets, de la recherche et du journal d'activité. Ils ne sortent que par `OwnerProfileResource` (masqués ; le revenu par `monthly_income_masked`, `••••` ou `null`), `GET /api/owners/{id}/sensitive` (consultation journalisée ; le revenu en nombre) et l'export du droit d'accès.

**Contraintes et index** (mesurés sur `2026_05_02_000001` et suivantes) :
- `(user_id, agency_id)` unique — un user a au plus un profil propriétaire par agence. Les brouillons (`user_id` nul) n'y entrent pas en collision : PostgreSQL tient deux `NULL` pour distincts.
- Index : `(agency_id, status)`, `deleted_at`.

**Relations :**
- `user()` → belongsTo User
- `agency()` → belongsTo Agency
- `agencyRole()` → belongsTo AgencyRole (`HasAgencyRole`)
- `guarantor()` → belongsTo User (via guarantor_user_id)
- `invitations()` → morphMany Invitation

**Inverse :**
- `User.ownerProfiles()` → hasMany OwnerProfile (`HasProfiles`)

---

### 35. AgentProfile 🆕

**Table :** `agent_profiles`
**Description :** Profil **agent immobilier** d'un user chez une agence. Encapsule les informations de carrière (numéro de licence, taux de commission, spécialité). Un user peut être agent chez plusieurs agences (un profil par agence).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| user_id | FK users | oui | null | Identité de l'agent (`restrictOnDelete`). **Nul pendant le brouillon** : le profil naît `draft` à l'envoi d'une invitation, avant que le compte cible n'existe (TCK-258, `2026_05_10_160000`) |
| agency_id | FK agencies | | | Agence employeuse (`restrictOnDelete`) |
| agency_role_id | FK agency_roles | | | Le rôle personnalisé de ce profil — **exactement un** (`restrictOnDelete`, FK `agent_profiles_agency_role_id_fk`). Rôle système de son type par défaut à la création (`HasAgencyRole`) (TCK-279, `2026_08_16_120200` → `120400`) |
| status | AgentProfileStatus | | 'active' | Statut du profil (draft, active, inactive, suspended). **`suspended` = adhésion suspendue par l'agence** (`TeamMemberSuspensionService`, capacité `team.suspend`, TCK-587, ADR-0031 §2 ; journal `team_member_suspended` / `team_member_reactivated`, qui passe par `AgentInvitationService::suspend()`) ; la réactivation ne lève que ce statut |
| license_number | string | oui | null | Numéro de licence professionnelle |
| commission_rate | decimal(5,2) | oui | null | Taux de commission du négociateur (%) : sa part de la commission d'un bail qu'il négocie, plafonnée par les parts des collaborateurs (ADR-0049 « Ventilation » § 2) ; nul vaut 0. Écrit sur la fiche de membre sous `team.assign_role` (`PATCH /api/profiles/{agent_profile}/commission-rate`, TCK-2364) |
| specialty | string | oui | null | Spécialité (résidentiel, commercial, luxe, etc.) |
| hire_date | date | oui | null | Date d'embauche |
| active_until | date | oui | null | Date de fin de contrat (si applicable) |
| metadata | jsonb | oui | null | Données flexibles |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes et index** (mesurés sur `2026_05_02_000002` et suivantes) :
- `(user_id, agency_id)` unique — un user a au plus un profil agent par agence ; les brouillons (`user_id` nul) n'y entrent pas en collision.
- Index : `(agency_id, status)`, `deleted_at`.

**Relations :**
- `user()` → belongsTo User
- `agency()` → belongsTo Agency
- `agencyRole()` → belongsTo AgencyRole (`HasAgencyRole`)
- `invitations()` → morphMany Invitation

**Inverse :**
- `User.agentProfiles()` → hasMany AgentProfile (`HasProfiles`)

---

### 36. BrokerProfile ➖

> **Supprimé le 2026-10-07** — [ADR-0030](adr/0030-le-courtier-quitte-le-code-et-la-base.md), qui
> remplace [ADR-0027](adr/0027-le-courtier-sort-de-la-surface-commutable.md) ; TCK-586. La table
> `broker_profiles` est supprimée par `2026_10_07_090100_drop_broker_tables` ; aucun modèle courtier
> ne subsiste dans `app/Models/`. Le numéro est gardé pour ne pas renuméroter la suite. Le schéma
> d'origine se lit dans `2026_05_02_000003_create_broker_profiles_table` (et dans le `down()` de la
> suppression, qui recrée la table **vide**).

---

### 37. ServiceProviderProfile 🆕

**Table :** `service_provider_profiles`
**Description :** Profil **prestataire de services** (plombier, électricien, peintre, etc.). Un prestataire opère pour son propre compte et collabore avec plusieurs agences via la table pivot [ServiceProviderAgencyCollaboration](#39-serviceprovideragencycollaboration-). Au plus un ServiceProviderProfile par user.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| user_id | FK users | oui | null | Identité du prestataire (`restrictOnDelete`). **Nul pendant le brouillon** : le profil naît `draft` à l'envoi d'une invitation, avant que le compte cible n'existe, et `user_id` se renseigne à l'acceptation (TCK-260, `2026_05_10_170000`). **N'est plus unique** (voir Contraintes) |
| status | ServiceProviderProfileStatus | | 'active' | Cycle de vie du profil, indépendant des rattachements : `draft` (pré-créé à l'invitation), `active` (rattaché à au moins une agence active), `inactive` (toutes ses collaborations `paused`/`ended`), `suspended` (bloqué par un admin). **`inactive` et `suspended` sont réservés** : ils existent dans l'enum `ServiceProviderProfileStatus`, mais aucun chemin ne les pose — seuls `draft` (invitation) et `active` (fin d'onboarding) s'écrivent (décision du porteur du 2026-10-23, P115.04, comme les cas réservés de TCK-1307, P115.07). Indexé (TCK-260, TCK-262, `2026_05_10_170000`) |
| specialties | jsonb | oui | null | Liste de `MaintenanceCategory` (plumbing, electrical, etc.) |
| service_areas | jsonb | oui | null | Zones desservies (codes postaux, communes) |
| insurance_policy_id | string | oui | null | Référence police d'assurance |
| certifications | jsonb | oui | null | Liste de certifications (label + URL preuve) |
| hourly_rate_min | decimal(10,2) | oui | null | Tarif horaire minimum (XOF) |
| hourly_rate_max | decimal(10,2) | oui | null | Tarif horaire maximum (XOF) |
| active_until | date | oui | null | Validité administrative |
| metadata | jsonb | oui | null | Données flexibles |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes et index** (mesurés sur `2026_05_02_000004`, `2026_05_10_170000` et `2026_10_25_223720`) :
- **Un profil vivant par compte : index unique partiel `service_provider_profiles_user_live_unique` `(user_id) WHERE user_id IS NOT NULL AND deleted_at IS NULL`** (TCK-2372, P250.02). L'unicité `service_provider_profiles_user_id_unique` de la création avait été **retirée** par `2026_05_10_170000` (TCK-260), pour laisser coexister plusieurs brouillons, qui naissent sans compte : ils restent admis, comme un profil supprimé. Une invitation d'une autre agence **réutilise** le profil existant et crée une collaboration à l'acceptation (`InvitationService`, TCK-262), et `User.serviceProviderProfile()` est un `hasOne`. La migration échoue, en les nommant, s'il existe des doublons vivants : elle ne fusionne rien. L'unicité par agence est celle de la collaboration `(profil, agence)` (§39).
- Index : `status`, `deleted_at`.

**Relations :**
- `user()` → belongsTo User
- `agencyCollaborations()` → hasMany ServiceProviderAgencyCollaboration
- `agencies()` → belongsToMany Agency (via ServiceProviderAgencyCollaboration)
- `reviews()` → morphMany Review
- `invitations()` → morphMany Invitation

**Inverse :**
- `User.serviceProviderProfile()` → hasOne ServiceProviderProfile (`HasProfiles`)

---

### 38. BrokerAgencyCollaboration ➖

> **Supprimé le 2026-10-07** — [ADR-0030](adr/0030-le-courtier-quitte-le-code-et-la-base.md), TCK-586.
> La table `broker_agency_collaborations` est supprimée par `2026_10_07_090100_drop_broker_tables`
> (avant `broker_profiles`, dont elle portait la clé étrangère). Le numéro est gardé pour ne pas
> renuméroter la suite ; le schéma d'origine se lit dans
> `2026_05_02_000005_create_broker_agency_collaborations_table`.

---

### 39. ServiceProviderAgencyCollaboration 🆕

**Table :** `service_provider_agency_collaborations`
**Description :** Pivot **prestataire ↔ agence** : une ligne par période de collaboration d'un prestataire avec une agence.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| service_provider_profile_id | FK service_provider_profiles | | | Prestataire (`cascadeOnDelete`, FK `sp_agency_collab_spp_fk`) |
| agency_id | FK agencies | | | Agence partenaire (`cascadeOnDelete`) |
| agency_role_id | FK agency_roles | | | Le rôle d'agence du prestataire **dans cette agence** — porté par la collaboration, pas par le profil, qui sert N agences : « 1 collaboration = 1 rôle » (`restrictOnDelete`, FK `sp_agency_collab_agency_role_fk`). Rôle système par défaut à la création (`HasAgencyRole`) (TCK-315, ADR-0016, `2026_08_17_090000` → `090200`) |
| status | CollaborationStatus | | 'active' | Statut (active, paused, ended) — une fin de collaboration s'écrit `ended`, jamais par `delete()` (TCK-592) |
| started_at | date | | | Début de la collaboration |
| ended_at | date | oui | null | Fin de la collaboration |
| metadata | jsonb | oui | null | Données flexibles |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes et index** (mesurés sur `2026_05_02_000006`, `2026_08_17_090000`, `2026_10_07_120100`) :
- `sp_agency_collab_live_unique` — unique **partiel** `(service_provider_profile_id, agency_id) WHERE deleted_at IS NULL` : une seule collaboration **vivante** par couple. Il remplace l'unique total `sp_agency_collab_unique`, qui, sur une table en `SoftDeletes`, empêchait à jamais de recréer un couple supprimé en douceur (TCK-592, `2026_10_07_120100`).
- Index : `(agency_id, status)`, `deleted_at`.

**Relations :**
- `serviceProviderProfile()` → belongsTo ServiceProviderProfile
- `agency()` → belongsTo Agency
- `agencyRole()` → belongsTo AgencyRole (`HasAgencyRole`)

---

### 40. BankStatement 🆕

**Table :** `bank_statements`
**Description :** Relevé bancaire importé par une agence pour rapprocher ses paiements (§1.5 P2 « Rapprochement bancaire semi-automatique »). Un relevé est un fichier (CSV/OFX) téléversé une fois, parsé en lignes (`BankStatementLine`), puis progressivement réconcilié avec les paiements existants (`BookingPayment`, `LeasePayment`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| agency_id | FK agencies | | | Agence propriétaire (`cascadeOnDelete`) |
| uploaded_by | FK users | | | Utilisateur ayant téléversé le fichier (`restrictOnDelete`) |
| source_format | BankStatementSourceFormat enum | | | Format du fichier source (csv, ofx) |
| file_hash | string(64) | | | Hash SHA-256 du fichier — empêche les imports en doublon |
| bank_name | string | oui | null | Nom de la banque (libre, parsé si possible) |
| account_iban_masked | string | oui | null | IBAN masqué (4 derniers caractères visibles) |
| csv_mapping | jsonb | oui | null | Le mapping CSV **effectif**, figé à l'import (`CsvDriver::effectiveMapping` sur `agencies.bank_csv_mapping`) : modifier ensuite celui de l'agence ne ré-interprète aucun relevé passé (TCK-593, `2026_10_07_150300`) |
| period_start | date | oui | null | Début de la période couverte par le relevé |
| period_end | date | oui | null | Fin de la période couverte |
| lines_count | unsignedInteger | | 0 | Compteur cache des lignes parsées (cf. Règle 2) |
| skipped_lines_count | unsignedInteger | | 0 | Lignes sautées à la lecture — illisibles, ou à date ou montant vide — comptées et exposées au lieu de disparaître (TCK-593, `2026_10_07_150300`) |
| status | BankStatementStatus enum | | 'processing' | Cycle de vie (processing → ready_for_review → partially_reconciled → reconciled → archived), ou `failed` : l'analyse a échoué, ou aucune ligne d'un fichier non vide n'a pu être lue — un relevé ne reste plus `processing` à vie (TCK-593) |
| finalized_at | datetime | oui | null | Date à laquelle le relevé a été clôturé |
| finalized_by | FK users | oui | null | Utilisateur ayant clôturé le rapprochement (`nullOnDelete`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `(agency_id, file_hash)` unique — un même fichier ne peut être importé qu'une fois par agence

**Index :**
- `(agency_id, status)` — relevés ouverts par agence
- `(agency_id, created_at)` — tri chronologique par agence

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `statement` (single file, disk `local`) qui stocke le fichier source
- `Auditable` — journalisation des changements

**Relations :**
- `agency()` → belongsTo Agency
- `uploaded_by()` → belongsTo User (via `uploaded_by`)
- `finalized_by()` → belongsTo User (via `finalized_by`)
- `lines()` → hasMany BankStatementLine

**Accesseurs :**
- `reconciled_ratio` : tableau `{ confirmed, ignored, remaining, total }` calculé à partir des lignes (groupBy `match_status`)

**Scopes :**
- `forAgency($id)` — filtre par agence
- `open()` — relevés non clôturés (status ∉ {reconciled, archived})

---

### 41. BankStatementLine 🆕

**Table :** `bank_statement_lines`
**Description :** Ligne d'un relevé bancaire — une transaction unitaire à apparier (suggéré ou confirmé) avec un paiement existant (`BookingPayment` ou `LeasePayment`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| bank_statement_id | FK bank_statements | | | Relevé parent (`cascadeOnDelete`) |
| posted_at | date | | | Date d'écriture bancaire |
| amount | decimal(12,2) | | | Montant (toujours positif — le sens est porté par `direction`) |
| direction | BankStatementLineDirection enum | | | Sens du flux (credit, debit) |
| currency | char(3) | | | Code ISO devise (XOF, XAF, EUR, USD) |
| label | text | | | Libellé bancaire complet |
| reference | string | oui | null | Référence bancaire (transaction id) |
| counterparty | string | oui | null | Contrepartie identifiée (libre) |
| duplicate_of_line_id | FK bank_statement_lines | oui | null | Ligne qui reprend une transaction déjà importée pour l'agence dans un autre relevé (même référence, date, montant et sens) : pointe vers la première ligne qui l'a portée. Marquée, pas ignorée (décision du porteur) ; une ligne sans référence n'est jamais marquée (`ParseBankStatementJob`). FK auto-référente `bsl_duplicate_of_line_fk`, `nullOnDelete` : supprimer l'origine efface la marque (TCK-1919, `2026_10_23_223500`) |
| raw_payload | jsonb | | | Payload brut de la ligne tel qu'importée (CSV/OFX) — traçabilité totale |
| match_status | BankStatementLineMatchStatus enum | | 'unmatched' | État d'appariement (unmatched, suggested, confirmed, ignored) |
| matched_payment_type | string | oui | null | Type morph du paiement apparié (`BookingPayment` ou `LeasePayment`) |
| matched_payment_id | bigint | oui | null | ID du paiement apparié |
| match_confidence | unsignedTinyInteger | oui | null | Score de confiance 0–100 produit par l'algorithme de suggestion |
| confirmed_at | datetime | oui | null | Date de confirmation manuelle de l'appariement |
| confirmed_by | FK users | oui | null | Utilisateur ayant confirmé (`nullOnDelete`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(bank_statement_id, match_status)` — file de réconciliation par relevé
- `(matched_payment_type, matched_payment_id)` — recherche inverse depuis un paiement
- `(posted_at, amount)` — recherche d'appariement par date/montant
- `bsl_duplicate_of_line_idx (duplicate_of_line_id)` (TCK-1919)

Le virement de clôture de la plateforme (`PlatformPayout`, [§45](#45-platformpayout-)) se rapproche
aussi d'une ligne de crédit, mais ne passe pas par `matched_payment` : il porte sa propre colonne
`bank_statement_line_id` (TCK-1421).

**Traits :**
- `Auditable`

**Relations :**
- `statement()` → belongsTo BankStatement (via `bank_statement_id`)
- `matched_payment()` → morphTo standard (`matched_payment_type` / `matched_payment_id`) → BookingPayment | LeasePayment
- `confirmed_by()` → belongsTo User (via `confirmed_by`)

**Scopes :**
- `unmatched()`, `suggested()`, `confirmed()`, `ignored()` — filtre par état
- `readyToConfirm($minConfidence = 60)` — suggérées avec confiance suffisante

---

### 42. KycDossier 🆕

**Table :** `kyc_dossiers`
**Description :** Dossier de vérification documentaire (KYC) attaché de manière polymorphe à une entité vérifiable — `Agency` (RCCM, NINEA, pièce du dirigeant), ou un profil métier (OwnerProfile, AgentProfile, ServiceProviderProfile). Workflow standardisé : pending → submitted → verified / rejected, avec motif et acteur de la décision.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| subject_type | string | | | Type morph de l'entité vérifiée (Agency, OwnerProfile, AgentProfile, ...) |
| subject_id | bigint | | | ID morph |
| status | KycDossierStatus enum | | 'pending' | pending, submitted, verified, rejected |
| submitted_at | datetime | oui | null | Soumission par l'entité |
| reviewed_at | datetime | oui | null | Décision rendue |
| reviewed_by | FK users | oui | null | Super-admin (ou agency_admin pour les profils internes) ayant statué (`nullOnDelete`) |
| rejection_reason | text | oui | null | Motif si `status=rejected` |
| metadata | jsonb | oui | null | Champs libres dépendants du type (numéro RCCM, pays d'émission, etc.) ; `expiry_reminders` (jalons de relance déjà envoyés, J-30 / J-7) et `expired_at` (TCK-601) |
| expires_at | timestamp | oui | null | Échéance du dossier vérifié : la plus proche des échéances des pièces les plus récentes de chaque type (pièce du dirigeant). Posée par la vérification ; `kyc:expire-dossiers` remet le dossier à `pending` ce jour-là et retire `is_verified` à l'agence (TCK-601) |
| created_at / updated_at | datetime | | auto | |

**Index :**
- `(subject_type, subject_id)` — unique : un seul dossier actif par sujet
- `(status)` — file de modération
- `(status, expires_at)` — `kyc_dossiers_status_expires_idx`, la passe quotidienne d'expiration (TCK-601)

L'échéance d'une pièce est une propriété du média (`custom_properties.expires_at`, `YYYY-MM-DD`),
exigée pour `director_id`.

**Traits :**
- `LogsActivity` (spatie) — chaque transition de statut est journalisée
- `InteractsWithMedia` (spatie/medialibrary) — collection `documents` (RCCM, NINEA, pièce d'identité scannée…)

**Relations :**
- `subject()` → morphTo
- `reviewer()` → belongsTo User (via `reviewed_by`)

**Scopes :**
- `pending()`, `submitted()`, `verified()`, `rejected()`

---

### 43. Plan 🆕

**Table :** `plans`
**Description :** Catalogue des plans d'abonnement plateforme proposés aux agences (free trial, starter, pro, enterprise…). Référentiel maintenu par le super-admin.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| code | string | | | Slug unique (`free`, `starter`, `pro`, `enterprise`) |
| label | string | | | Libellé affiché |
| description | text | oui | null | |
| monthly_price_xof | decimal(12,2) | | 0 | Prix mensuel hors taxes en XOF |
| platform_fee_pct | decimal(5,2) | | 0 | Commission plateforme par défaut sur transactions (%) |
| trial_days | unsignedSmallInteger | | 0 | Période d'essai gratuite |
| limits | jsonb | oui | null | Quotas (`max_active_listings`, `max_agents`, `max_branches`…) |
| is_active | boolean | | true | Affichable dans le catalogue |
| sort_order | unsignedSmallInteger | | 0 | Ordre d'affichage |
| created_at / updated_at | datetime | | auto | |

**Index :**
- `code` unique
- `(is_active, sort_order)` — listing public catalogue

**Traits :**
- `LogsActivity`

**Relations :**
- `subscriptions()` → hasMany AgencySubscription

---

### 44. AgencySubscription 🆕

**Table :** `agency_subscriptions`
**Description :** Abonnement courant d'une agence à un Plan plateforme. Une agence a au plus une souscription active à un instant T ; l'historique est conservé via `ended_at`. Les overrides éventuels (commission négociée, quotas custom) écrasent les valeurs du plan.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `cascadeOnDelete` |
| plan_id | FK plans | | | `restrictOnDelete` (un plan référencé ne peut pas être supprimé) |
| status | AgencySubscriptionStatus enum | | 'trialing' | trialing, active, past_due, suspended, ended |
| trial_ends_at | datetime | oui | null | |
| current_period_start | datetime | | | |
| current_period_end | datetime | | | |
| ended_at | datetime | oui | null | Si non null, souscription archivée — une nouvelle peut être active |
| platform_fee_pct_override | decimal(5,2) | oui | null | Si non null, écrase `Plan.platform_fee_pct` |
| limits_override | jsonb | oui | null | Quotas négociés ; merge sur `Plan.limits` |
| created_at / updated_at | datetime | | auto | |

**Index :**
- `(agency_id, ended_at)` — recherche de la souscription active
- `(status)` — files de relance

**Traits :**
- `LogsActivity`

**Relations :**
- `agency()` → belongsTo Agency
- `plan()` → belongsTo Plan

**Scopes :**
- `active()` — `ended_at IS NULL AND status IN (trialing, active)`

---

### 45. PlatformPayout 🆕

**Table :** `platform_payouts`
**Description :** Reversement périodique de la plateforme vers une agence — le **net** dû à l'agence après commission plateforme retenue. Distinct du `Payout` métier (#28) qui matérialise le reversement agence → bailleur. Le virement de clôture, une fois `paid`, se rapproche d'un **crédit** du relevé de l'agence, comme un reversement de l'agence d'un débit (TCK-1421).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `cascadeOnDelete` |
| period_start | date | | | |
| period_end | date | | | |
| gross_amount | decimal(14,2) | | 0 | Total encaissé sur la période (pour info) |
| platform_fee_amount | decimal(14,2) | | 0 | Commission plateforme retenue |
| net_amount | decimal(14,2) | | 0 | Montant à verser à l'agence (`gross - fees`) |
| currency | char(3) | | 'XOF' | XOF, EUR, USD |
| status | PlatformPayoutStatus enum | | 'pending' | pending, approved, processing, paid, failed, cancelled |
| closed_by_id | FK users | oui | null | Auteur de la clôture de période — qui a créé le reversement (`nullOnDelete`, FK `platform_payouts_closed_by_fk`). Ne vivait jusque-là que dans `activity_log` (TCK-594, ADR-0039 §4, `2026_10_07_200600`) |
| approved_by | FK users | oui | null | Super-admin ayant approuvé (`nullOnDelete`) — **distinct de `closed_by_id`** et hors bénéficiaires (voir Séparation des gestes) |
| approved_at | timestamp | oui | null | Date de l'approbation (TCK-594, `2026_10_07_200600`) |
| paid_by_id | FK users | oui | null | Qui a exécuté le virement (`nullOnDelete`, FK `platform_payouts_paid_by_fk`) — **distinct de `approved_by`** (TCK-594, `2026_10_07_200600`) |
| processed_at | timestamp | oui | null | Date d'exécution du virement |
| bank_reconciled_at | datetime | oui | null | Date du rapprochement bancaire (TCK-1421, `2026_10_22_174000`) |
| bank_statement_line_id | FK bank_statement_lines | oui | null | Ligne de crédit rapprochée (`nullOnDelete`, FK `platform_payouts_bank_line_fk`) ; un reversement de la plateforme n'est rapproché qu'à une seule ligne (TCK-1421). Le modèle ne déclare pas de relation vers elle |
| payment_reference | string | oui | null | Référence du virement, écrite au paiement. Remplace le `metadata.bank_ref` facultatif d'avant (TCK-594, `2026_10_07_200600`) |
| failure_reason | text | oui | null | |
| metadata | jsonb | oui | null | Lot, breakdown ; `refunded_since_paid` : les lignes remboursées depuis le paiement du reversement (type, identifiant, référence, date, **sans montant**), écrites par le webhook de remboursement d'un reversement `paid` (TCK-2320, P39.07) |
| created_at / updated_at | datetime | | auto | |

**Séparation des gestes** (TCK-594, ADR-0039 §4 ; `features.md` §1.5) : clôture, approbation et paiement sont trois colonnes pour que la base permette de comparer les acteurs. `PlatformPayoutService` refuse qu'on approuve un reversement qu'on a clôturé, ou qu'on paie un reversement qu'on a approuvé (`SegregationOfDuties::assertDistinct`), et qu'un bénéficiaire — l'administrateur principal de l'agence payée ou un membre de son équipe — approuve ou paie.

**Contraintes et index** (mesurés sur `2026_05_07_000223` et `2026_10_22_174000`) :
- `platform_payouts_unique_open_period` — unique partiel `(agency_id, period_end) WHERE status <> 'cancelled'` : un reversement non annulé par agence et période — c'est ce qui rend la clôture de période idempotente en base (ré-exécution = 409).
- `platform_payouts_bank_line_unique` — unique partiel `(bank_statement_line_id) WHERE bank_statement_line_id IS NOT NULL` (TCK-1421).
- Index : `(agency_id, period_end)`, `(status)` — file d'approbation.

**Traits :**
- `Auditable`

**Relations :**
- `agency()` → belongsTo Agency
- `approver()` → belongsTo User (via `approved_by`)
- `closer()` → belongsTo User (via `closed_by_id`) (TCK-594)
- `payer()` → belongsTo User (via `paid_by_id`) (TCK-594)
- `bookingPayments()`, `leasePayments()` → hasMany — les paiements dont ce reversement a retenu la commission (`platform_payout_id`, `2026_05_07_000224`)

**Scopes :**
- `pending()`, `approved()`, `paid()`

---

### 46. Announcement 🆕

**Table :** `announcements`
**Description :** Annonce in-app diffusée par le super-admin à un segment d'utilisateurs (rôle, agence, custom). Affichée comme bandeau ou centre de notifications jusqu'à dismissal individuel ou expiration.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| title | jsonb | | | Titre par locale (`{fr, en, wo}`) |
| body | jsonb | | | Corps multilingue |
| severity | AnnouncementSeverity enum | | 'info' | info, success, warning, critical |
| segment | jsonb | | | `{roles?: [...], agency_ids?: [...], rollout_percentage?: int}` — l'absence de segment = tout le monde |
| starts_at | datetime | | | |
| ends_at | datetime | oui | null | Si null, jusqu'à désactivation explicite |
| is_active | boolean | | true | |
| created_by | FK users | oui | null | Super-admin auteur |
| created_at / updated_at | datetime | | auto | |

**Index :**
- `(is_active, starts_at, ends_at)` — fenêtre de diffusion

**Traits :**
- `LogsActivity`

**Relations :**
- `creator()` → belongsTo User (via `created_by`)
- `dismissals()` → hasMany AnnouncementDismissal

---

### 47. AnnouncementDismissal 🆕

**Table :** `announcement_dismissals`
**Description :** Marque qu'un utilisateur a dismissé une annonce — empêche sa réapparition.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| announcement_id | FK announcements | | | `cascadeOnDelete` |
| user_id | FK users | | | `cascadeOnDelete` |
| dismissed_at | datetime | | auto | |

**Index :**
- `(announcement_id, user_id)` unique

---

### 48. Invitation 🆕

**Table :** `invitations`
**Description :** Modèle générique d'invitation utilisé par tous les parcours d'onboarding par invitation (Owner, Agent, AgencyAdmin, ServiceProvider, super-admin coopté). Porte le token signé, l'expiry et l'état de l'invitation. Le profil cible (polymorphe) est créé en `draft` au moment de l'envoi et passe en `active` à l'acceptation.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| token | string(64) | | | Jeton aléatoire URL-safe (`Str::random(64)`, `InvitationService::generateUniqueToken()`), stocké **en clair**, unique — et non un condensat SHA-256 comme l'écrivait cette ligne |
| email | string | oui | null | Email du destinataire. **Nullable depuis TCK-589** (`2026_10_07_150300_add_phone_to_invitations_table`, ADR-0033) : une invitation peut ne viser qu'un numéro |
| phone | string(30) | oui | null | Numéro du destinataire (E.164) — le lien part par SMS quand l'e-mail manque, sous le drapeau `auth.phone_login.enabled` (TCK-589, ADR-0033) |
| invited_user_id | FK users | oui | null | User cible si déjà existant en base (sinon créé à l'acceptation) |
| invited_by | FK users | | | User qui a émis l'invitation |
| invitable_type | string | oui | null | Type morph du profil cible (ex. `OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`, `AgencyAdminProfile`), ou `Customer` pour le rôle `tenant` (P15.01, TCK-2351 : la fiche reçoit le compte à l'acceptation) |
| invitable_id | bigint | oui | null | ID du profil cible créé en `draft` |
| agency_id | FK agencies | oui | null | Agence d'accueil (null pour cooptation super-admin) |
| role | string | | | Rôle visé par l'invitation (ex. `owner`, `agent`, `agency_admin`, `service_provider`, `super_admin`, `tenant`) — **simple discriminant de parcours**, pas une permission : il choisit le type de profil à activer et les branches d'acceptation. Aucun rôle n'est « assigné » à partir de cette valeur. |
| status | InvitationStatus | | 'sent' | sent, accepted, expired, revoked |
| expires_at | datetime | | | Expiration du token (par défaut now+7j) |
| accepted_at | datetime | oui | null | |
| revoked_at | datetime | oui | null | |
| last_reminded_at | datetime | oui | null | Date du dernier **essai** de rappel J+2 |
| reminder_attempts | unsignedSmallInteger | | 0 | Essais du rappel automatique (`InvitationService::remindPending()`) : un SMS refusé par tous les fournisseurs se retente un jour plus tard, trois essais au plus (`MAX_REMINDER_ATTEMPTS`) ; un rappel posé épuise le compte. Défaut 0 sans réécriture : une invitation déjà rappelée reste tenue pour rappelée (TCK-2155, `2026_10_24_150000`) |
| metadata | jsonb | oui | null | Données additionnelles propres au parcours (ex. zones d'intervention pré-sélectionnées, premier lead pré-assigné) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `token` unique
- `(email, status)` pour rechercher les invitations en cours pour un email
- `(invitable_type, invitable_id)`
- `(status, expires_at)` pour le cron d'expiration
- `invitations_phone_status_idx` sur `(phone, status)` — le dédoublonnage par numéro
  (`InvitationService::liveSlotOccupant`) et la relance le lisent (`2026_10_07_150300`)
- `invitations_agency_id_created_at_index` sur `(agency_id, created_at)` (`2026_08_22_090000`)

**Contrainte :** `invitations_email_or_phone_check` — `CHECK (email IS NOT NULL OR phone IS NOT NULL)` :
une invitation a au moins un destinataire (`2026_10_07_150300`). Son `down()` échoue tant qu'une
invitation sans e-mail existe : le retour en arrière ne supprime pas d'invitations.

**Relations :**
- `invitedUser()` → belongsTo User (via `invited_user_id`)
- `inviter()` → belongsTo User (via `invited_by`)
- `agency()` → belongsTo Agency
- `invitable()` → morphTo (OwnerProfile / AgentProfile / etc.)

**Notes :**
- Conflit email : si l'email correspond à un User existant, l'acceptation passe par login + accept (pas par signup).
- Cron quotidien `invitations:expire` flippe `sent` → `expired` quand `expires_at < now`.
- À l'acceptation : transaction qui crée le User si besoin, flippe `Invitation.status = accepted`,
  flippe `<Profile>.status = active` et rattache le User au profil `draft` quand celui-ci avait été
  créé sans lui. **Aucun rôle n'est attaché** : depuis TCK-278, le profil *est* le rôle
  (cf. [Règle 5](#règle-5--profil--rôle)), et `InvitationService::finalizeAccept()` le dit dans son
  propre code. Une version antérieure de cette ligne annonçait « attache le rôle spatie scopé sur
  `agency_id` » — un mécanisme supprimé, sur lequel une garde CI casse.
- Rôle `agency_admin` (P242.01, TCK-2365) : la cible est un `AgentProfile` brouillon, comme pour
  l'agent ; l'acceptation l'active et crée l'`AgencyAdminProfile`. Un compte dont le profil d'agent
  de cette agence a été retiré : l'acceptation reprend la ligne retirée, au rôle système (P242.02),
  et l'invitation la pointe ; le brouillon est retiré. `invited_user_id` n'est rendu par l'API
  qu'une fois l'invitation acceptée (P242.03).
- Exception `super_admin` (TCK-264) : l'acceptation n'active rien. Elle pose
  `force_2fa_at_first_login = true` ; seul `/api/auth/super-admin/2fa/confirm`, après enrôlement
  d'un facteur TOTP, ouvre les surfaces super-admin.

---

### 49. AgencyUpgradeRequest 🆕

**Table :** `agency_upgrade_requests`
**Description :** Demande d'upgrade d'une agence `individual` vers `standard`, soumise par son `agency_admin` et reviewée par un super-admin. À l'approbation, `Agency.kind` bascule vers `standard` et les champs légaux (`rc`, `ninea`) sont copiés sur l'agence. Une seule demande `pending` à la fois par agence.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `cascadeOnDelete` |
| submitted_by | FK users | | | User (agency_admin) qui a soumis la demande (`cascadeOnDelete`) |
| rc | string | | | Numéro de Registre du Commerce |
| ninea | text (cast `encrypted`) | | | Numéro NINEA — **chiffré** (TCK-601, ADR-0044 §1, `2026_10_08_601200`) |
| rib_pro | text (cast `encrypted`) | | | RIB professionnel — **chiffré**, et **seule source** du RIB professionnel : il n'est plus recopié sur l'agence (TCK-601, `2026_10_08_601200`) |
| address_fiscale | string | | | Adresse fiscale |
| company_legal_name | string | | | Raison sociale juridique |
| planned_agents_count | integer | oui | null | Nombre estimé d'agents à inviter |
| status | AgencyUpgradeRequestStatus | | 'pending' | pending, approved, rejected, revoked |
| submitted_at | datetime | | auto | |
| reviewed_by | FK users | oui | null | Super-admin reviewer |
| reviewed_at | datetime | oui | null | |
| review_comment | text | oui | null | Commentaire (obligatoire si rejected) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes et index** (mesurés sur `2026_05_10_180000`) :
- `agency_upgrade_requests_one_pending_per_agency` — unique partiel `(agency_id) WHERE status = 'pending'` : une agence n'a jamais deux demandes `pending` simultanées, garanti en base (le contrôleur de soumission rend en amont un 422 propre).
- Index : `(agency_id, status)`, `(status, submitted_at)`.

**Données sensibles** (TCK-601, ADR-0044 §1) : `ninea` et `rib_pro` sont chiffrés, en `text`. La migration `2026_10_08_601200` a aussi **supprimé** la copie du RIB dans `agencies.metadata.legal_info.rib_pro` : elle n'avait aucun lecteur, et `AgencyResource` la rendait à tout membre de l'agence.

**Relations :**
- `agency()` → belongsTo Agency
- `submitter()` → belongsTo User (via `submitted_by`)
- `reviewer()` → belongsTo User (via `reviewed_by`)
- `documents()` → morphMany Document (statuts PDF, scan RC, scan NINEA)

**Notes :**
- À l'approbation (`AgencyKindFlipService`) : `Agency.kind` flippe vers `standard` ; `rc`, `ninea`, `company_legal_name` et `address_fiscale` amorcent les colonnes `agencies.rccm`, `ninea`, `legal_name` et `legal_address` **si elles sont vides** — la demande amorce, elle ne fait pas foi (TCK-594, ADR-0039 §7) ; `rib_pro` n'est pas recopié (TCK-601). Puis notification au submitter, débloquage des features restreintes (invitation collaborateurs internes, multi-admin, custom roles, assignation, reporting cross-équipe, customisation tags/enums).
- Pas de rétrogradation `standard` → `individual`.
- L'utilisateur peut révoquer sa demande tant qu'elle est `pending` (`revoked` final).

---

### 50. TenantOnboardingChecklist 🆕

**Table :** `tenant_onboarding_checklists`
**Description :** Suit la complétion de l'onboarding "Espace résident" déclenché à la signature d'un bail (`Lease.signed`). Pas un parcours d'inscription mais une transition d'état du Customer existant : welcome modale, état des lieux, premier paiement, accès documents. Crée à `Lease.status = active`, fermé quand tous les items requis sont `done` ou quand le bail est résilié.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| lease_id | FK leases | | | `cascadeOnDelete`, unique (1 checklist par bail) |
| user_id | FK users | | | Le résident (Customer) |
| welcome_seen_at | datetime | oui | null | Welcome modale "Espace résident" vue |
| inventory_completed_at | datetime | oui | null | État des lieux d'entrée signé (référence `Inventory` via `lease_id`) |
| first_payment_at | datetime | oui | null | Premier paiement enregistré : loyer ou caution versé par le locataire (`LeasePayment.payment_type` `rent` ou `deposit` — ni restitution de caution, ni charges, pénalité ou régularisation) ; un remboursement ne décoche pas la case (TCK-2368) |
| documents_acknowledged_at | datetime | oui | null | Bail + EDL accusés réception |
| reminders_sent | jsonb | | '[]' | Liste des rappels envoyés (ex. `[{type:'inventory_d7', sent_at:...}]`), et des réouvertures de l'EDL d'entrée (`{type:'inventory_reopened', sent_at:...}`, TCK-2368) |
| completed_at | datetime | oui | null | Tous les items requis cochés |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `lease_id` unique
- `user_id`
- `(completed_at)` pour KPI de complétion

**Relations :**
- `lease()` → belongsTo Lease
- `user()` → belongsTo User

**Notes :**
- Items requis pour `completed_at` : `inventory_completed_at` + `first_payment_at` (les deux autres sont informatifs).
- Cron horaire : si `inventory_completed_at` null à J+7 de la signature → notification rappel locataire + notification agent.
- N'est pas créé si l'agence n'a pas activé le workflow EDL (configurable via `Agency.settings.tenant_onboarding_enabled`).
- N'est pas créé pour un bail renouvelé (`renewed_from_lease_id` posé), qu'il naisse `active` ou soit signé plus tard : le locataire est déjà en place. Ni liste, ni rappel d'état des lieux, ni message de bienvenue (TCK-2368).
- Un EDL d'entrée qui sort de `signed` (contesté) décoche `inventory_completed_at`, rouvre la liste (`completed_at` à nul) et rejoue le rappel J+7 une fois (marque `inventory_reopened`), tant qu'aucun autre EDL d'entrée du bail n'est signé (TCK-2368).

---

### 51. PlatformProfile 🆕

**Table :** `platform_profiles`
**Description :** Profil polymorphe **plateforme-scoped** (agency_id = NULL) qui porte les rôles d'opération de la plateforme : `super_admin` (cross-tenant, accès complet), `support` (accès lecture + actions limitées d'assistance utilisateur), `viewer` (lecture seule pour audit/business intelligence). **Introduit en TCK-278** pour absorber les rôles plateforme historiquement portés par `User` via spatie. Un user a au plus **un** PlatformProfile.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | | | `cascadeOnDelete`, **unique** (1 profil plateforme par user) |
| level | PlatformProfileLevel | | 'viewer' | `super_admin` / `support` / `viewer` |
| granted_by_id | FK users | oui | null | User qui a octroyé le profil (audit) — `nullOnDelete` |
| granted_at | datetime | | auto | Date d'octroi |
| revoked_at | datetime | oui | null | Soft-revoke (le profil reste pour audit, mais n'est plus actif) |
| notes | text | oui | null | Justification interne (audit) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |
| deleted_at | datetime | oui | null | Soft delete |

**Index :**
- `user_id` unique
- `level`

**Relations :**
- `user()` → belongsTo User
- `granted_by()` → belongsTo User

**Scopes :**
- `active()` : `whereNull('revoked_at')`

**Règles métier :**
- Seul un `PlatformProfile.level = super_admin` actif peut créer / promouvoir / révoquer un autre `PlatformProfile`.
- La création du premier `super_admin` se fait via seeder/console (bootstrap).
- Révocation = `revoked_at = now()` + `tokens()->delete()` du user pour invalider les sessions actives.

**Notes :**
- Pas de `agency_id` (le profil est strictement plateforme).
- `level` est un enum séparé pour éviter d'introduire un type polymorphe par niveau (cf. justification dans la décision design TCK-278).
- Le check `$user->isSuperAdmin()` devient `$user->platformProfile?->level === PlatformProfileLevel::SuperAdmin && $user->platformProfile->isActive()`.

---

### 52. AgencyRole 🆕 (TCK-279)

**Table :** `agency_roles`
**Description :** **Rôles personnalisés** par agence — la place que tenait la table `roles` de spatie côté agence avant sa suppression en TCK-278. Chaque agence reçoit au seed des rôles **système** (`is_system=true`) — un par type de profil métier — et peut en créer/cloner d'autres (`is_system=false`). Un profil métier pointe **toujours** vers exactement un `AgencyRole` via `agency_role_id`.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `cascadeOnDelete` |
| name | string | | | Libellé affiché (« Agent », « Manager équipe Nord ») |
| base_profile_type | string | | | Nom court du profil cible : `agent` / `agency_admin` / `owner` / `service_provider` |
| description | text | oui | null | Description fonctionnelle |
| is_system | boolean | | false | `true` pour les rôles seedés par défaut, non éditables |
| is_clonable | boolean | | true | Permet à l'agence de cloner ce rôle |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Migrations :** `2026_08_16_120000_create_agency_roles_table` ; rôles système amorcés pour les
agences existantes par `2026_08_16_120300`, puis à chaque création d'agence par `AgencyObserver::created()`
(`AgencySystemRoleSeeder`) ; index partiel par `2026_08_22_100100`.

**Index :**
- `agency_roles_agency_base_type_idx` `(agency_id, base_profile_type)`
- `agency_roles_agency_is_system_idx` `(agency_id, is_system)`

**Contraintes :**
- `agency_roles_agency_name_unique` `(agency_id, name)` — pas de doublon de libellé dans une agence
- `agency_roles_one_system_role_per_base_type` — unique **partiel** `(agency_id, base_profile_type) WHERE is_system` : exactement un rôle système par type

**Relations :**
- `agency()` → belongsTo Agency
- `capabilities()` → hasMany AgencyRoleCapability (lignes du pivot `agency_role_capabilities` ; `capabilityEnums()` les rend en `Capability`)
- `agentProfiles()` → hasMany AgentProfile (via `agency_role_id`)
- `agencyAdminProfiles()` → hasMany [AgencyAdminProfile](#98-agencyadminprofile-)
- `ownerProfiles()` → hasMany OwnerProfile
- `serviceProviderCollaborations()` → hasMany ServiceProviderAgencyCollaboration — porteur du rôle `service_provider` (TCK-315, ADR-0016)

**Règles métier :**
- Suppression d'un `AgencyRole` utilisé par au moins un profil : **restrict** (FK) ; l'API répond 409 avec la liste des porteurs avant d'atteindre la FK. Forcer la réaffectation préalable (`PATCH /api/profiles/{profile}/agency-role`).
- Édition d'un rôle `is_system=true` : refusée. Pour personnaliser, l'UI propose un **clone** (`is_system=false`, `clone_from` à la création — copie, pas lien ; même `base_profile_type` exigé).
- L'édition d'un rôle non-système prend effet **immédiatement** pour tous les profils attachés : la matrice est mise en cache **par rôle** (`AgencyRoleCapabilityCache`, TTL 300 s), et invalidée de façon synchrone par les hooks `saved`/`deleted` d'`AgencyRole` et par la synchronisation des capacités.
- Une agence `individual` n'a pas de rôles personnalisés (`AgencyKindGuard::allowsCustomRoles()`).

**Notes :**
- Modèle additif uniquement : une `Capability` est présente ou absente, pas de deny override.
- L'`AgencyRole` n'a pas de `status` actif/inactif : un rôle qu'on veut désactiver doit être supprimé (après réaffectation) ou cloné dans un état restreint.

---

### 53. AgencyRoleCapability 🆕 (TCK-279)

**Table :** `agency_role_capabilities`
**Description :** Pivot M:N entre `agency_roles` et le catalogue de capacités (`Capability` enum PHP). Chaque ligne déclare qu'un rôle dispose d'une capacité atomique.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_role_id | FK agency_roles | | | `arc_agency_role_id_fk`, `cascadeOnDelete` |
| capability | string | | | Valeur de l'enum `Capability` (ex. `properties.publish`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Migration :** `2026_08_16_120100_create_agency_role_capabilities_table` (TCK-279).

**Index :**
- `arc_role_capability_unique` — unique `(agency_role_id, capability)`
- `arc_capability_idx` sur `capability` (pour requêtes inverses « quels rôles ont la capacité X ? »)

**Notes :**
- La valeur `capability` n'est pas une FK vers une table (le catalogue est code-defined). Une validation applicative refuse une valeur hors enum à l'écriture.
- Pas de timestamps métier nécessaires ; on garde `created_at` / `updated_at` pour audit.

---

### 54. WhatsappContact 🆕

**Table :** `whatsapp_contacts`
**Description :** Contact WhatsApp identifié par son numéro E.164. Porte le consentement (opt-in/opt-out) et la base de la **fenêtre de service 24h** de Meta (`last_inbound_at`). Conçue pour servir à la fois le **sortant** (user enregistré → `user_id` renseigné) et, plus tard, l'**inbound** mise-en-relation (locataire anonyme → `user_id` null). Voir `docs/backlog/tickets/TCK-282-whatsapp-outbound-channel.md` pour le volet inbound.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| phone | string | | | Numéro E.164 — **unique** |
| user_id | FK users | oui | null | User associé (null = contact anonyme inbound) (`nullOnDelete`) |
| display_name | string | oui | null | Nom WhatsApp du contact |
| opt_in_status | string | | 'pending' | `pending` / `opted_in` / `opted_out` (string + check applicatif, **pas d'`enum()` SQL** — [ADR-0007](adr/0007-pas-d-enum-sql.md)) |
| opt_in_source | string | oui | null | Origine du consentement (ex. `account_settings`, `inbound_reply`) |
| opt_in_at | datetime | oui | null | Horodatage du consentement |
| last_inbound_at | datetime | oui | null | Dernier message entrant — base de la fenêtre 24h |
| opted_out_at | datetime | oui | null | Horodatage de l'opt-out |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes :**
- Unique `phone`.
- Jamais d'envoi sortant à un contact `opt_in_status = opted_out`.
- Hors fenêtre 24h (`last_inbound_at` > 24h ou null) → template approuvé obligatoire (contrainte Meta).

**Relations :**
- `user()` → belongsTo User (via user_id)

---

### 55. NotificationTemplate — extension WhatsApp 🆕

**Table :** `notification_templates` (TCK-102, `2026_05_07_000215` ; colonnes Meta : `2026_06_17_110000`)
**Description :** Registre des gabarits de notification éditables, un par `(event, channel, locale)`. Les quatre colonnes `meta_*` portent, pour le canal `whatsapp`, le mapping vers les **gabarits approuvés par Meta** (envoi hors fenêtre 24h) : nom, catégorie et statut d'approbation. Le titre de section garde « extension WhatsApp » pour ne pas casser son ancre ; la section décrit la table entière.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| event | string | | | Événement notifié (un code de notification) |
| channel | string | | | Canal (`email`, `sms`, `whatsapp`…) |
| locale | string(5) | | | Langue (`fr`, `en`, `wo`) |
| subject | string | oui | null | Objet — nul pour les canaux qui n'en ont pas |
| body | text | | | Corps du gabarit |
| meta_template_name | string | oui | null | Nom du template tel qu'enregistré chez Meta (`2026_06_17_110000`) |
| meta_category | string | oui | null | `authentication` (OTP) / `utility` (transactionnel, rappels, relances) — **jamais `marketing`** |
| meta_status | string | oui | null | `pending` / `approved` / `rejected` (statut d'approbation Meta) |
| meta_variables | jsonb | oui | null | Mapping **ordonné** des variables du template (défaut `[]` côté model, **pas de DEFAULT JSON en migration**) |
| is_active | boolean | | true | Gabarit actif |
| updated_by_id | FK users | oui | null | Dernier éditeur (`nullOnDelete`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes et index** (mesurés sur `2026_05_07_000215`) :
- Unique composé `(event, channel, locale)`.
- Index `(event, channel, is_active)`.
- Hors fenêtre 24h + pas de template `meta_status = approved` pour `event + locale` → canal WhatsApp inéligible → bascule SMS (`TemplateResolver`).

**Données posées par migration :** `2026_10_07_100100` (TCK-588, ADR-0032) inscrit les gabarits WhatsApp des codes mobiles qui visent un contact sans compte, en `fr`, `en`, `wo`, avec `meta_status = pending` et `meta_category = utility` (`insertOrIgnore`). Le passage à `approved` est un acte d'exploitation — la soumission à Meta —, pas une migration : d'ici là, l'envoi bascule en SMS.

**Relations :**
- `updatedBy()` → belongsTo User (via updated_by_id)

---

## Modèles documentés a posteriori (TCK-310)

> ✅ **Ces seize modèles existent — ils ne sont pas à créer.** Ils vivaient en base et en code
> depuis des mois sans être mentionnés une seule fois dans ce document. Un lecteur qui cherchait
> `WizardDraft` ou `RoleDelegation` ici concluait de leur absence qu'ils restaient à concevoir :
> c'est exactement l'inverse de ce que cette page est censée servir.
>
> **Ils sont décrits d'après le code et les migrations, mesurés le 2026-08-16** — colonnes, types,
> défauts, nullabilité, index, contraintes, comportements FK et relations Eloquent réellement
> déclarées. Aucune colonne « souhaitable » n'y figure. Quand le code et son propre commentaire se
> contredisent, c'est le code qui est écrit ici, et la contradiction est signalée par un ⚠️.
>
> Conséquence de méthode : ces sections n'ont **pas** de rubrique « Règles métier » spéculative.
> Ce qui n'est pas dans le schéma ou dans une méthode du modèle n'est pas écrit.

---

### 56. AccountDeletionRequest ✅

**Table :** `account_deletion_requests`
**Description :** Demande de suppression de compte RGPD en attente (TCK-080). La ligne vit entre la
demande (`requested_at`, plus une échéance `scheduled_for` = `requested_at` + délai de grâce) et son
exécution (`executed_at` posé, anonymisation lancée). **L'annulation supprime la ligne** — il n'y a
pas d'état « annulé ». Le délai de grâce est de configuration, pas de schéma :
`config('auth.account_deletion.grace_days')`, alimenté par `ACCOUNT_DELETION_GRACE_DAYS` (défaut 30).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | | | **Unique** — au plus une demande en cours par user (`cascadeOnDelete`) |
| requested_at | timestamp | | | Date de la demande |
| scheduled_for | timestamp | | | Échéance d'exécution — **indexé** (balayage du job planifié) |
| reason | text | oui | null | Motif libre saisi par l'utilisateur |
| reason_code | string(64) | oui | null | Motif catégorisé |
| executed_at | timestamp | oui | null | Date d'exécution — `null` = demande encore en attente |
| reminder_sent_at | timestamp | oui | null | Date du rappel envoyé avant échéance |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `user_id` unique

**Index :**
- `scheduled_for`

**Traits :** `HasFactory`

**Relations :**
- `user()` → belongsTo User

**Méthodes :**
- `isPending()` → `executed_at === null`
- `daysRemaining()` → jours restants avant `scheduled_for`, plancher à 0

> ⚠️ Le docblock de la migration annonce que « la FK devient nullable » à l'exécution pour garder
> la ligne comme trace d'audit. **Elle ne l'est pas** : `user_id` est NOT NULL et `cascadeOnDelete`
> — la suppression du user emporte la demande. Mesuré sur la migration
> `2026_04_24_224304_create_account_deletion_requests_table.php`, qui porte le commentaire ET le
> code contraire.

---

### 57. DataExport ✅

**Table :** `data_exports`
**Description :** Export RGPD des données personnelles d'un utilisateur (portabilité). La ligne
porte le cycle de vie de la génération d'archive, son emplacement et sa péremption. Le fichier lui-même
est écrit sur le disque `local` et purgé par un job planifié à l'expiration.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | | | Utilisateur dont les données sont exportées (`cascadeOnDelete`) |
| requested_by | FK users | oui | null | Demandeur, s'il diffère du sujet (support, admin) (`nullOnDelete`) |
| reason | string | oui | null | Motif de la demande |
| status | DataExportStatus | | 'queued' | queued, processing, ready, expired, failed |
| archive_path | text | oui | null | Chemin de l'archive sur le disque `local` — **casté `encrypted`** |
| size_bytes | unsignedBigInteger | oui | null | Taille de l'archive |
| requested_at | timestamp | | | Date de la demande |
| ready_at | timestamp | oui | null | Date de disponibilité |
| expires_at | timestamp | oui | null | Date de péremption (purge de l'archive) |
| last_downloaded_at | timestamp | oui | null | Dernier téléchargement |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(user_id, requested_at)`
- `(status, expires_at)` — balayage de purge

**Traits :** `Auditable`

**Relations :**
- `user()` → belongsTo User (via `user_id`)
- `requester()` → belongsTo User (via `requested_by`)

---

### 58. FeatureFlag ✅

**Table :** `feature_flags`
**Description :** Drapeau de fonctionnalité piloté depuis le back-office plateforme. Le catalogue
des drapeaux connus est défini **en code** (`app/Domain/Features/Flag`) ; cette table porte leur
état et leur ciblage.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| key | string | | | Identifiant du drapeau — **unique** |
| label | string | | | Libellé affiché au back-office |
| description | text | oui | null | Description fonctionnelle |
| enabled | boolean | | false | État global du drapeau |
| segments_json | jsonb | oui | null | Ciblage (segments d'utilisateurs) — casté `array` |
| updated_by_id | FK users | oui | null | Dernier opérateur ayant modifié le drapeau (`nullOnDelete`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `key` unique

**Catalogue.** Un drapeau n'entre dans `Flag` qu'avec son lecteur (TCK-600, garde
`scripts/check-platform-catalogue-readers.mjs`) ; un drapeau sans ligne vaut **éteint**
(`FeatureFlagEvaluator`). Le catalogue compte aujourd'hui `media_watermark` (TCK-633 — filigrane
des photos pour toute la plateforme, jamais exposé au client : `Flag::clientVisible()`) et
`host_auto_space` (TCK-633 — « Publier » crée l'espace individuel sans question ; ligne posée
**allumée** par `2026_10_12_300000_enable_host_auto_space_flag`, en `insertOrIgnore` qui respecte
une ligne déjà réglée, et retirée par son `down()` seulement si aucun opérateur ne l'a touchée —
`updated_by_id` nul).

**Relations :**
- `updatedBy()` → belongsTo User (via `updated_by_id`)

---

### 59. AlertRule ✅

**Table :** `alert_rules`
**Description :** Règle d'alerte d'exploitation : un événement plateforme (`event`) déclenche une
notification vers des canaux et des destinataires configurés. Le catalogue des événements alertables
est défini en code (`app/Domain/Alerts/AlertableEvents`) ; cette table ne porte que le routage.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| event | string | | | Identifiant de l'événement surveillé |
| channels_json | jsonb | | | Canaux de diffusion — casté `array`, **NOT NULL sans DEFAULT**. ⚠ La raison écrite ici était « règle MySQL : pas de `DEFAULT` sur `JSON` » : elle est **périmée**, PostgreSQL accepte un `DEFAULT` sur `jsonb`. La colonne reste telle qu'elle est en base ; c'est la justification qui tombe, pas le schéma |
| recipients_json | jsonb | | | Destinataires — casté `array`, mêmes contraintes |
| is_active | boolean | | true | Règle active |
| last_triggered_at | timestamp | oui | null | Dernier déclenchement |
| failure_count | unsignedInteger | | 0 | Compteur d'échecs de diffusion |
| updated_by_id | FK users | oui | null | Dernier opérateur ayant modifié la règle (`nullOnDelete`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(event, is_active)`

**Relations :** aucune n'est déclarée sur le modèle. `updated_by_id` est une FK en base **sans
méthode de relation Eloquent** — contrairement à `FeatureFlag`, qui porte la même colonne et expose
`updatedBy()`.

---

### 60. MaintenanceWindow ✅

**Table :** `maintenance_windows`
**Description :** Fenêtre de maintenance planifiée, annoncée aux utilisateurs par une bannière puis,
selon le `mode`, dégradant ou coupant le service. Une fenêtre annulée n'est pas supprimée : elle est
horodatée (`cancelled_at`, `cancelled_by_id`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| starts_at | timestamp | | | Début de la fenêtre |
| ends_at | timestamp | | | Fin de la fenêtre |
| mode | string | | | `banner` / `read_only` / `down` — **string + contrôle applicatif**, pas d'`enum()` SQL ([ADR-0007](adr/0007-pas-d-enum-sql.md)) ni d'enum PHP ; les valeurs sont validées par `Rule::in()` dans `Api/Admin/MaintenanceController` |
| severity | string | | | `info` / `scheduled` / `interruption` — même mécanisme |
| messages | jsonb | | | Messages localisés — casté `array` ; le contrôleur exige `messages.fr` et accepte `messages.en` / `messages.wo` (≤ 500 caractères) |
| banner_lead_minutes | unsignedInteger | | 30 | Avance d'affichage de la bannière avant `starts_at` |
| created_by_id | FK users | oui | null | Opérateur ayant planifié (`nullOnDelete`) |
| cancelled_by_id | FK users | oui | null | Opérateur ayant annulé (`nullOnDelete`) |
| cancelled_at | timestamp | oui | null | Date d'annulation — `null` = fenêtre toujours planifiée |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(starts_at, ends_at, cancelled_at)` — recherche de la fenêtre courante

**Relations :**
- `createdBy()` → belongsTo User (via `created_by_id`)
- `cancelledBy()` → belongsTo User (via `cancelled_by_id`)

---

### 61. ScheduledTaskRun ✅

**Table :** `scheduled_task_runs`
**Description :** Trace d'exécution des tâches planifiées, exposée au tableau de bord d'exploitation.
Une ligne par tâche et par exécution enregistrée.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| task | string | | | Identifiant de la tâche — **indexé** |
| last_run_at | timestamp | | | Date de l'exécution |
| duration_ms | unsignedInteger | oui | null | Durée en millisecondes |
| status | string | | 'finished' | Issue de l'exécution |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `task`
- `scheduled_task_runs_task_last_run_idx (task, last_run_at DESC, id DESC)` — la dernière exécution
  de chaque tâche, que lit `ScheduledTaskInspector` sans tri (TCK-802, `2026_10_17_120000`)

**Relations :** aucune.

---

### 62. ReportExport ✅

**Table :** `report_exports`
**Description :** Export d'un rapport de pilotage plateforme (croissance, revenus, cohortes, tunnel)
au format CSV ou XLSX, généré en tâche de fond puis mis à disposition au téléchargement jusqu'à
péremption.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| requested_by | FK users | | | Demandeur (`cascadeOnDelete`) |
| report | string | | | Rapport demandé — `growth` / `revenue` / `cohorts` / `funnel` (contrôle applicatif) |
| format | string | | | `csv` / `xlsx` |
| parameters | jsonb | oui | null | Paramètres du rapport (période, filtres) — casté `array` |
| status | string | | 'queued' | `queued` / `processing` / `ready` / `failed` — **string simple, sans enum PHP**, contrairement à `DataExport.status` qui utilise `DataExportStatus` |
| archive_path | string | oui | null | Chemin du fichier sur le disque `local` — **casté `encrypted`** |
| row_count | unsignedBigInteger | oui | null | Nombre de lignes produites |
| size_bytes | unsignedBigInteger | oui | null | Taille du fichier |
| ready_at | timestamp | oui | null | Date de disponibilité |
| expires_at | timestamp | oui | null | Date de péremption |
| failure_reason | text | oui | null | Motif d'échec |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `requested_by`
- `status`

**Traits :** `Auditable`

**Relations :**
- `requester()` → belongsTo User (via `requested_by`)

> ⚠️ **`archive_path` est `string` ici et `text` dans `data_exports`, pour la même donnée chiffrée.**
> Un `cast` `encrypted` gonfle la valeur : mesuré, un chemin de 32 à 47 caractères en clair produit
> **256 caractères** chiffrés — au-delà du `VARCHAR(255)` que Laravel génère pour `string()`, sur
> PostgreSQL comme sur le moteur d'avant. ⚠ Et une longueur de `VARCHAR` est APPLIQUÉE : la
> dépasser lève `SQLSTATE[22001] value too long`, elle ne tronque pas. Les chemins réellement
> écrits aujourd'hui (`reports/{report}-{id}.csv`, ≤ 27 caractères)
> tiennent en 228 caractères, donc la colonne suffit — **par marge, pas par construction**. La
> divergence est documentée telle qu'elle est, pas corrigée : ce document décrit le schéma, il ne
> le décide pas.

---

### 63. IntegrationWebhookLog ✅

**Table :** `integration_webhook_logs`
**Description :** Journal des webhooks **entrants** (cf. [31. Integration](#31-integration-)), sur tous les canaux — paiement, SMS, WhatsApp. Une ligne par webhook, **écrite avant tout traitement** par `WebhookJournal`, puis annotée au fil du traitement (TCK-602, ADR-0051 §4). Le corps reçu est gardé tel quel mais **chiffré** (`body`), et ne sort par aucune sérialisation ni aucun `fields[]` : seul le rejeu le relit. Ce qui se lit à l'écran est `payload`, la **vue expurgée** (`WebhookPayloadRedactor`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| integration_id | FK integrations | oui | null | Intégration concernée — `null` si le webhook n'a pu être rattaché (`nullOnDelete`) ; la relation lit aussi une intégration supprimée (`withTrashed`) |
| agency_id | FK agencies | oui | null | Agence concernée (`nullOnDelete`, FK `iwl_agency_fk`) (TCK-602, `2026_10_08_160000`) |
| channel | string(20) | | 'payment' | Canal : `payment`, `sms`, `whatsapp` (`IntegrationWebhookLog::CHANNELS`) ; la rétention de purge se règle par canal (`webhooks:prune`, `config/webhooks.php`) (TCK-602) |
| route_name | string(60) | oui | null | Le **nom** de la route — jamais l'URL, qui porte des segments secrets ; le rejeu y lit quel gestionnaire rappeler (TCK-602) |
| provider | string | | | Fournisseur émetteur |
| direction | string | | 'incoming' | Sens du webhook |
| status | string | | 'received' | État de traitement : `received`, `processed`, `rejected`, `failed` |
| event_type | string | oui | null | Type d'événement annoncé par le fournisseur |
| http_method | string(10) | oui | null | Méthode HTTP reçue (TCK-602) |
| body | text (cast `encrypted`) | oui | null | Les octets reçus, **chiffrés**, rattachés à la ligne seulement **après authentification** ; nul si le corps dépassait la taille gardée. `text` et jamais `jsonb` : PostgreSQL normalise un `jsonb`, et un HMAC calculé sur les octets bruts ne se revérifierait plus (TCK-343). Masqué à la sérialisation (TCK-602) |
| body_sha256 | char(64) | oui | null | Empreinte des octets reçus ; masquée à la sérialisation et hors `fields[]` (TCK-602) |
| body_truncated | boolean | | false | Le corps dépassait la taille gardée : il n'est pas conservé, et la ligne ne se rejoue pas (TCK-602) |
| headers | text (cast `encrypted:array`) | oui | null | La liste blanche des en-têtes du canal, chiffrée ; masquée à la sérialisation (TCK-602) |
| payload | jsonb | | | **Vue expurgée** du corps — casté `array`, **NOT NULL sans DEFAULT** (la raison invoquée, « règle MySQL », est périmée — cf. `channels_json` [§59 AlertRule](#59-alertrule-)). Les lignes antérieures, qui gardaient le corps **en clair** dans `payload.truncated`, ont été réécrites `{"legacy": true}` par `2026_10_08_160000` |
| authenticated_at | timestamp | oui | null | Date à laquelle la signature ou le jeton du webhook a été vérifié — condition du rejeu (TCK-602) |
| http_status | smallint | oui | null | Code HTTP rendu au fournisseur (TCK-602) |
| error_code | string(120) | oui | null | Code d'erreur du traitement (TCK-602) |
| error_message | string(255) | oui | null | Message d'erreur du traitement (TCK-602) |
| external_id | string(191) | oui | null | Identifiant de transaction annoncé par le fournisseur ; index `iwl_external_id_idx` (TCK-602) |
| matched_count | integer | oui | null | Nombre de paiements appariés par le traitement — `0` sur une ligne `processed` = « non apparié » (`filter[unmatched]=1`) (TCK-602) |
| attempts | integer | | 0 | Nombre de rejeux (`WebhookReplayer`) (TCK-602) |
| replayed_at | timestamp | oui | null | Dernier rejeu (TCK-602, ADR-0051 §5) |
| replayed_by_id | FK users | oui | null | Auteur du dernier rejeu (`nullOnDelete`, FK `iwl_replayed_by_fk`) (TCK-602) |
| processed_at | timestamp | oui | null | Date de traitement — `null` = non traité |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Rejeu** (ADR-0051 §5, `isReplayable()`) : une ligne se rejoue si elle a été **authentifiée**, que son corps est gardé entier, et qu'elle a échoué (`failed`) ou n'a rien apparié (`processed` et `matched_count = 0`). Une ligne rejetée ne se rejoue jamais : ce serait un contournement de signature. Pour le fournisseur `whatsapp_cloud_radar` (le webhook du numéro du Radar, `IntegrationWebhookLog::BODY_DROPPED_AT_CLOSE`), `body` est vidé à la clôture, quelle que soit l'issue, et la ligne ne se rejoue jamais : Meta rejoue lui-même ce qu'il n'a pas vu accepté (TCK-2395, [ADR-0081](adr/0081-le-radar-prospecte-par-l-api-whatsapp-sur-son-propre-numero.md)).

**Index** (mesurés sur `2026_05_07_000218` et `2026_10_08_160000`) :
- `(integration_id, created_at)`
- `(provider, created_at)`
- `iwl_status_created_idx (status, created_at)`
- `iwl_channel_provider_created_idx (channel, provider, created_at)`
- `iwl_agency_created_idx (agency_id, created_at)`
- `iwl_external_id_idx (external_id)`

**Relations :**
- `integration()` → belongsTo Integration, `withTrashed`
- `agency()` → belongsTo Agency

---

### 64. KpiConfig ✅

**Table :** `kpi_configs`
**Description :** Personnalisation par agence des indicateurs affichés sur son tableau de bord
(TCK-032 P3). Une ligne = un KPI que l'agence veut suivre, avec son libellé, son format et son rang
d'affichage.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | Agence propriétaire (`cascadeOnDelete`) |
| metric | string | | | Clé de métrique — **liste blanche en code**, `KpiConfig::allowedMetrics()` (14 valeurs) |
| label | string | | | Libellé affiché sur la carte |
| format | string | | 'number' | `number` / `percent` / `currency` |
| sort_order | unsignedSmallInteger | | 0 | Rang d'affichage |
| is_enabled | boolean | | true | KPI affiché |
| settings | jsonb | oui | null | Réglages additionnels (objectif, seuil visuel…) — casté `array` |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Lecture** (TCK-2373) : `GET /api/dashboard/agency` sert sous `data.kpis` les lignes `is_enabled`
de l'agence, par `sort_order` puis `id`, chacune `{metric, label, format, value}` — `value` lue dans
le résumé par `KpiResolver::configuredTiles()`, `null` sans dénominateur ; un format `percent` porte
des points (0..100). Liste vide sans configuration : le tableau de bord garde ses tuiles par défaut.

**Contraintes d'unicité :**
- `(agency_id, metric)` — un KPI au plus une fois par agence

**Index :**
- `(agency_id, sort_order)`

**Relations :**
- `agency()` → belongsTo Agency

**Exposition API** (`HasQueryBuilder`) :
- `$requestFilterable` : `agency_id`, `metric`, `is_enabled`
- `$requestSortable` : `id`, `sort_order`, `created_at`
- `$requestLoadable` : `agency`
- `$queryFields` : `id`, `agency_id`, `metric`, `label`, `format`, `sort_order`, `is_enabled`, `created_at`, `updated_at`

**Liste blanche `allowedMetrics()`** — la colonne `metric` alimente des requêtes construites côté
service ; la liste blanche est ce qui l'en protège : `properties_total`, `properties_rented`,
`properties_available`, `leases_active`, `customers_count`, `members_count`, `bookings_pending`,
`maintenance_open`, `revenue_month`, `commission_month`, `overdue_count`, `overdue_amount`,
`unpaid_rate_percent`, `occupancy_rate_percent`.

---

### 65. ThresholdAlert ✅

**Table :** `threshold_alerts`
**Description :** Alerte de seuil par agence sur une métrique de tableau de bord (TCK-032 P3).
L'alerte se déclenche quand la valeur franchit `threshold` dans le sens de `operator`, sous réserve
du délai de refroidissement `cooldown_hours` depuis `last_triggered_at`.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | Agence propriétaire (`cascadeOnDelete`) |
| metric | string | | | Clé de métrique — liste blanche `ThresholdAlert::allowedMetrics()` (6 valeurs) |
| operator | string(3) | | | Comparateur — `>` / `<` / `>=` / `<=` (`allowedOperators()`) |
| threshold | decimal(14,4) | | | Seuil — casté `decimal:4` |
| severity | string | | 'warning' | `info` / `warning` / `critical` (`allowedSeverities()`) |
| is_enabled | boolean | | true | Alerte active |
| last_triggered_at | timestamp | oui | null | Dernier déclenchement — base du refroidissement |
| last_value | decimal(14,4) | oui | null | Dernière valeur observée — casté `decimal:4` |
| cooldown_hours | unsignedSmallInteger | | 24 | Délai minimal entre deux déclenchements |
| settings | jsonb | oui | null | Réglages additionnels — casté `array` |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(agency_id, is_enabled)`

**Relations :**
- `agency()` → belongsTo Agency

**Méthodes :**
- `shouldTrigger(float $value, ?DateTimeInterface $now = null): bool` — franchissement selon
  `operator` **et** respect du refroidissement (`true` d'office si `last_triggered_at` est `null`)

**Exposition API** (`HasQueryBuilder`) :
- `$requestFilterable` : `agency_id`, `metric`, `severity`, `is_enabled`
- `$requestSortable` : `id`, `metric`, `severity`, `created_at`
- `$requestLoadable` : `agency`
- `$queryFields` : `id`, `agency_id`, `metric`, `operator`, `threshold`, `severity`, `is_enabled`,
  `last_triggered_at`, `last_value`, `cooldown_hours`, `created_at`, `updated_at`

**Liste blanche `allowedMetrics()`** : `unpaid_rate_percent`, `occupancy_rate_percent`,
`overdue_count`, `overdue_amount`, `bookings_pending`, `maintenance_open`.

> ⚠️ Le docblock de la migration écrit que `operator` vaut « `>` ou `<` ». Le modèle en accepte
> **quatre** (`allowedOperators()` : `>`, `<`, `>=`, `<=`), et `shouldTrigger()` les évalue tous les
> quatre. C'est le modèle qui fait foi ; la colonne `string(3)` a la place pour les deux formes.

---

### 66. RoleDelegation ✅

**Table :** `role_delegations`
**Description :** Délégation **temporaire** d'un rôle à un utilisateur dans une agence, bornée dans
le temps (`starts_at` → `ends_at`) et révocable. Une délégation programmée devient active à son
échéance de début, expire à `ends_at`, ou est révoquée manuellement.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | | | Bénéficiaire de la délégation — pour une absence, le **remplaçant** (`cascadeOnDelete`) |
| delegator_id | FK users | | | Auteur de la délégation (`restrictOnDelete` — on ne perd pas la traçabilité) |
| agency_id | FK agencies | | | Agence de portée (`cascadeOnDelete`) |
| replaces_user_id | FK users | oui | null | Pour une **absence** : l'absent que `user_id` remplace ; `null` pour une délégation de rôle (`cascadeOnDelete`, FK `role_delegations_replaces_user_fk`) (TCK-591, ADR-0035, `2026_10_07_591400`) |
| role | string | | | Rôle délégué (ex. `agency_admin`) ; pour une absence, `absence_cover` (`RoleDelegation::ABSENCE_ROLE`), qui n'existe dans aucun catalogue et **n'accorde donc rien** |
| starts_at | dateTime | oui | null | Début — `null` = effet immédiat |
| ends_at | dateTime | | | Fin — **obligatoire**, une délégation est bornée par construction |
| status | RoleDelegationStatus | | 'scheduled' | scheduled, active, revoked, expired |
| reason | text | oui | null | Motif |
| user_native_roles_snapshot | jsonb | | | Instantané des **types de profils** que le bénéficiaire détenait déjà dans l'agence — casté `array`, **NOT NULL sans DEFAULT** (la raison invoquée, « règle MySQL », est périmée — cf. `channels_json` [§59 AlertRule](#59-alertrule-)) |
| activated_at | dateTime | oui | null | Date d'activation effective |
| expired_at | dateTime | oui | null | Date d'expiration constatée |
| revoked_at | dateTime | oui | null | Date de révocation |
| revoked_by | FK users | oui | null | Auteur de la révocation (`nullOnDelete`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(user_id, status)`
- `(agency_id, status)`
- `ends_at` — balayage d'expiration
- `(status, starts_at)` — balayage d'activation
- `role_delegations_agency_replaces_idx (agency_id, replaces_user_id)` (TCK-591)

**Absences** (TCK-591, ADR-0035) : une absence est une ligne de cette table qui **nomme l'absent** (`replaces_user_id`) et reprend le cycle de vie des délégations — statut, bornes, révocation, activation et expiration planifiées. Il n'y a **pas de table d'absences à part** : `AgentAvailability` est un service (`App\Services\Agency\AgentAvailability::substituteFor()`, qui rend le remplaçant de l'absence active, sans transitivité), pas un modèle ; les absences s'écrivent par `AgentAbsenceService`. **Toute lecture qui veut des délégations de rôle filtre `replaces_user_id IS NULL`** (scope `roleDelegations()`).

**Traits :** `Auditable`, `HasFactory`

**Relations :**
- `user()` → belongsTo User (via `user_id`)
- `delegator()` → belongsTo User (via `delegator_id`)
- `agency()` → belongsTo Agency
- `replaces()` → belongsTo User (via `replaces_user_id`) — l'absent (TCK-591)
- `revokedBy()` → belongsTo User (via `revoked_by`)

**Scopes :** `active()`, `scheduled()`, `readyToActivate()`, `readyToExpire()`, `forAgency($id)`, `absences()`, `roleDelegations()` (TCK-591)

**Méthodes :** `markActive()`, `markExpired()`, `markRevoked(User $by)`, `isAbsence()` (TCK-591)

> **Ce qu'une délégation accorde — TCK-395.** Une délégation active accorde la capacité `C` si, et
> seulement si, les deux conditions tiennent : (1) le **rôle système** du type délégué, dans cette
> agence, porte `C` — la délégation passe donc par le pivot `agency_role_capabilities` comme tout le
> reste depuis TCK-315 ; et (2) le **délégant détient `C` en propre**, évalué à la lecture et non
> figé à la création. `MembershipCapabilityResolver::delegationAllows()` porte la règle.
>
> Trois choses en découlent, et chacune corrige un défaut mesuré le 2026-08-27 :
>
> - **`role` accorde quelque chose pour chacune des trois valeurs de
>   `config('role_delegations.delegable_roles')`.** Auparavant les six sites d'appel du dépôt
>   n'interrogeaient que `'agency_admin'` : déléguer `agent` ou `owner` écrivait une ligne,
>   émettait trois événements, envoyait deux notifications, s'affichait « Active » — et n'accordait
>   rien nulle part.
> - **Un délégant ne peut plus accorder plus qu'il ne détient.** Depuis TCK-279 deux `agency_admin`
>   de la même agence peuvent porter des `AgencyRole` différents ; la délégation était le seul
>   chemin du dépôt où une capacité s'obtenait sans passer par le pivot.
> - **La délégation n'est pas transitive** : le délégant est interrogé sans consulter *ses* propres
>   délégations, si bien que deux délégations en chaîne ne fabriquent pas un droit que personne ne
>   détient en propre.
>
> Le geste lui-même est gardé par la capacité `team.delegate_role` (`RoleDelegationPolicy`), et non
> plus par la présence d'un `AgencyAdminProfile` — *une capacité se juge pour un couple
> (utilisateur, agence), pas sur la présence d'un profil.*

> ⚠️ **Le nom `user_native_roles_snapshot` est un vestige lexical de l'ère spatie.** Ce que le
> service y écrit (`RoleDelegationService`, TCK-278) est la liste des **types de profils
> polymorphes** déjà détenus dans l'agence, et le commentaire du code le précise :
> *« Audit-only ; ne change pas la résolution d'autorisation (toujours profile-based) ».* La colonne
> n'a jamais contenu de rôles spatie depuis le cutover, et rien ne la lit pour autoriser.

---

### 67. PropertyContactLead ✅

**Table :** `property_contact_leads`
**Description :** Demande de contact déposée depuis le site public par un visiteur éventuellement
**non authentifié** — sur un bien, ou sur un agent (TCK-441) —, ou **clic** WhatsApp / Appeler compté
sur une fiche. Depuis TCK-590, c'est la boîte de réception de l'agence (`GET /api/contact-leads`) :
une demande est routée vers un destinataire (`recipient_user_id`, le contact principal du bien — cf.
[§8](#8-propertycollaborator)), attribuée, marquée traitée, convertie en fiche client.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_id | FK properties | oui | null | Bien concerné (`cascadeOnDelete`) — `null` pour une demande adressée à un agent (`2026_08_27_120000`, TCK-441) |
| agency_id | FK agencies | oui | null | Agence dont la boîte reçoit la demande (`cascadeOnDelete`) — celle du bien, ou celle de l'agent ; `null` pour un bien sans agence, dont la boîte est celle du destinataire. Les pistes antérieures ont été rattrapées sur l'agence de leur bien (`2026_10_07_150000`) |
| recipient_user_id | FK users | oui | null | Destinataire (`nullOnDelete`) — le contact principal du bien à la création ; réécrit par l'attribution |
| channel | ContactLeadChannel (string(16)) | | 'form' | `form` (formulaire), `whatsapp`, `call` (clics comptés) — TCK-590 |
| source | string(40) | oui | null | Attribution de la visite (`[a-z0-9_.-]`) |
| medium | string(40) | oui | null | Attribution de la visite (`[a-z0-9_.-]`) |
| locale | string(5) | oui | null | Langue de l'écran du visiteur au dépôt |
| name | string | oui | null | Nom déclaré — présent pour un `form`, absent d'un clic |
| email | string | oui | null | Email déclaré |
| phone | string | oui | null | Téléphone déclaré, normalisé en E.164 (rattrapage `2026_10_07_150200`) |
| message | text | oui | null | Message — présent pour un `form`, absent d'un clic |
| ip | string(45) | oui | null | IP source (45 = longueur d'une IPv6 textuelle) — anti-abus seul, **jamais exposée par l'API** |
| user_agent | string | oui | null | User-agent source — anti-abus seul, jamais exposé |
| handled_at | timestamp | oui | null | Date de prise en charge — `null` = non traité |
| handled_by_id | FK users | oui | null | Qui l'a traitée (`nullOnDelete`, FK `pcl_handled_by_fk`) |
| customer_id | FK customers | oui | null | Fiche client issue de la conversion (`nullOnDelete`, FK `pcl_customer_fk`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Invariant applicatif (TCK-590), qui remplace les anciens `NOT NULL`** de `name`, `email`,
`message` (levés par `2026_10_07_150000`) : une demande `form` a un nom, un message, et un téléphone
**ou** un e-mail (`ContactLeadPublicRequest`) ; un clic `whatsapp` / `call` n'a aucune identité
(`ContactLeadService::recordClick()`). La boîte filtre `channel = form` par défaut : les clics y sont
comptés, jamais « à traiter ». Les deux `down()` concernés sont **destructeurs** : ils suppriment les
lignes sans bien, ou sans e-mail / message, avant de rétablir les `NOT NULL`.

**Index :**
- `(property_id, created_at)`
- `(recipient_user_id, handled_at)` — file « à traiter » par destinataire
- `pcl_agency_created_idx (agency_id, created_at)`
- `pcl_agency_handled_idx (agency_id, handled_at)` — file « à traiter » de l'agence
- `pcl_handled_by_idx (handled_by_id)`, `pcl_customer_idx (customer_id)`

**Relations :**
- `property()` → belongsTo Property
- `agency()` → belongsTo Agency
- `recipient()` → belongsTo User (via `recipient_user_id`)
- `handledBy()` → belongsTo User (via `handled_by_id`)
- `customer()` → belongsTo Customer

**Note :** les deux formulaires publics (`properties/{slug}/contact-lead`, `agents/{slug}/contact-lead`)
sont protégés par le limiteur nommé `public-contact-lead` (5 requêtes / 10 min), les clics
(`properties/{slug}/contact-click`) par `public-contact-click` (20 / 10 min), tous deux définis dans
`AppServiceProvider::bootRateLimiters()` — il n'y a **pas** de `throttle:api` global sur ce dépôt.

---

### 68. PropertyReport ✅

**Table :** `property_reports`
**Description :** Signalement d'une annonce par un visiteur ou un utilisateur connecté (contenu
trompeur, arnaque, doublon…). Le traitement est matérialisé par `resolved_at`, et le signalement
clos **garde la décision qui l'a clos, qui l'a prise et pour quel motif codé** (TCK-597, ADR-0043 §4,
§6, `2026_10_08_100200`). Il n'y a pas de colonne de statut : ouvert = `resolved_at` nul (scope `open()`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_id | FK properties | | | Bien signalé (`cascadeOnDelete`) |
| reporter_user_id | FK users | oui | null | Auteur si authentifié (`nullOnDelete`) |
| reporter_ip | string(45) | oui | null | **Plus écrite.** L'IP en clair des lignes antérieures a été remplacée par son empreinte puis **effacée** par `2026_10_08_100200` — le `down()` ne peut pas la rendre, c'est le but (TCK-597) |
| reporter_fingerprint | string(64) | oui | null | Empreinte de l'auteur anonyme (HMAC-SHA256 de l'IP, clé applicative — `VisitorFingerprint`) : sert au **dédoublonnage sur 24 h** — un même auteur (compte, ou empreinte s'il est anonyme) ne signale pas deux fois le même bien en 24 h (TCK-597, ADR-0043 §6) |
| reason | string | | | Motif du signalement, choisi par le signalant (`spam`, `misleading`, `fraud`, `inappropriate_content`, `other`) |
| details | text | oui | null | Précisions libres |
| resolved_at | timestamp | oui | null | Date de traitement — `null` = en attente |
| decision | string(20) | oui | null | Décision qui a clos le signalement : `hide`, `remove` ou `reject` (`UnifiedModerationService::DECISIONS`). Pour `hide` et `remove`, **tous** les signalements ouverts du bien sont clos avec la même décision (TCK-597) |
| resolved_by_id | FK users | oui | null | Modérateur qui a tranché (`nullOnDelete`, FK `property_reports_resolved_by_fk`) (TCK-597) |
| reason_code | string(40) | oui | null | Motif **codé** de la décision (`ModerationReasonCode`), traduit par le front ; le texte libre n'est requis que pour `other` (TCK-597, ADR-0043 §7) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(property_id, created_at)`
- `property_reports_fingerprint_idx (property_id, reporter_fingerprint, created_at)` — le dédoublonnage (TCK-597)

**Traits :** `HasFactory`

**Relations :**
- `property()` → belongsTo Property
- `reporter()` → belongsTo User (via `reporter_user_id`)
- `resolvedBy()` → belongsTo User (via `resolved_by_id`) (TCK-597)

**Note :** l'endpoint public est protégé par le limiteur nommé `public-report` (5 requêtes / heure).

---

### 69. NotificationDeliveryAttempt ✅

**Table :** `notification_delivery_attempts` *(déclarée explicitement par `$table` sur le modèle)*
**Description :** Une ligne par **tentative** d'acheminement SMS/WhatsApp, d'une notification ou
d'un envoi direct (TCK-110, TCK-799). Remplace la colonne JSON `app_notifications.delivery_attempts` : l'unicité
`(provider, provider_message_id)` rend la résolution d'un accusé de réception (DLR) en O(1) et
supprime l'ambiguïté de sous-chaîne qu'avait la recherche `LIKE` sur le JSON.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| app_notification_id | FK app_notifications | oui | null | Notification acheminée (`cascadeOnDelete`). **Nulle** pour un SMS envoyé hors notification — contact sans compte, code de signature de bail (TCK-799, `2026_10_17_160000` ; son `down()` supprime d'abord ces tentatives) |
| agency_id | FK agencies | oui | null | Agence de l'envoi, celle dont le canal a cherché l'intégration (`$context['agency_id']`, P203.01) ; `nullOnDelete`. Nulle pour un envoi de la plateforme, et sur les lignes d'avant `2026_10_25_120500`, qui ne se reconstituent pas (TCK-2326) |
| integration_id | FK integrations | oui | null | Intégration que le fournisseur a prise, de l'agence ou de la plateforme (`agency_id` nul) ; `nullOnDelete`. Nulle quand aucun fournisseur n'a été appelé (report de nuit, plafond Orange, contact inéligible à WhatsApp, chaîne épuisée), pour le pilote SMS `log`, et sur les lignes d'avant (TCK-2326) |
| attempt | unsignedSmallInteger | | | Rang de la tentative |
| provider | string | | | Identifiant du driver, tel que rendu par sa méthode `id()` : `orange`, `mtarget`, `lafricamobile`, `log` (SMS) ou `whatsapp_cloud` |
| provider_message_id | string | oui | null | Identifiant de message côté fournisseur |
| to | string | oui | null | Destinataire (numéro) |
| status | string | | | État de la tentative |
| failure_reason | string | oui | null | Motif d'échec renvoyé par le fournisseur |
| cost_estimate | decimal(10,4) | oui | null | Coût estimé — casté `float` |
| segments_count | unsignedSmallInteger | oui | null | Nombre de segments SMS |
| sent_at | dateTime | oui | null | Date d'émission |
| delivered_at | dateTime | oui | null | Date d'accusé de réception |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `(provider, provider_message_id)` — index nommé `ndo_provider_message_unique` (nom explicite : la
  concaténation automatique aurait dépassé les **63** caractères de PostgreSQL — qui ne refuse pas,
  mais **tronque** en silence, cf. la légende)

**Index :**
- `(app_notification_id, attempt)`
- `(agency_id, created_at)` (`2026_10_25_120500`, TCK-2326) — la frontière d'isolation : PostgreSQL
  n'indexe pas une clé étrangère, et les tentatives d'une agence se listent par date

**Relations :**
- `appNotification()` → belongsTo AppNotification
- `agency()` → belongsTo Agency (TCK-2326)
- `integration()` → belongsTo Integration (TCK-2326)

> ⚠️ La colonne `app_notifications.delivery_attempts` **existe toujours** en base et reste
> `$fillable` + castée `array` sur le modèle `AppNotification`. Elle n'est **plus écrite** :
> `SmsRouterDriver` insère dans cette table-ci. Une lecture de l'ancienne colonne renvoie donc les
> données figées d'avant TCK-110, pas l'état courant.

---

### 70. WizardDraft ✅

**Table :** `wizard_drafts`
**Description :** Brouillon reprenable d'un parcours multi-étapes (TCK-250) — onboarding hôte
particulier, KYC propriétaire, KYC agent, onboarding client. Sac JSON générique strictement scopé
par `(user_id, key)` ; **la forme de `data` appartient au parcours consommateur, pas à ce modèle.**

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | | | Propriétaire du brouillon (`cascadeOnDelete`) |
| key | string | | | Identifiant du parcours |
| step | unsignedSmallInteger | | 0 | Étape courante — casté `integer` |
| data | jsonb | oui | null | État du parcours — casté `array` |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `(user_id, key)` — un brouillon au plus par parcours et par utilisateur ; les brouillons ne sont
  jamais partagés entre utilisateurs

**Index :**
- `updated_at` — purge des brouillons dormants

**Traits :** `HasFactory`

**Relations :**
- `user()` → belongsTo User

**Contrainte métier (TCK-250) :** un brouillon ne doit **jamais** contenir de donnée sensible
(mot de passe, jeton).

---

### 71. WelcomeView ✅

**Table :** `welcome_views`
**Description :** Trace qu'une modale de bienvenue (`key`) a été vue par un utilisateur (TCK-251).
L'unicité `(user_id, key)` garantit qu'une modale se déclenche **au plus une fois** par utilisateur,
même sur des appels « vue » concurrents. Le jeu de clés valides appartient au **front** ; le backend
traite `key` comme un identifiant court opaque.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | | | Utilisateur (`cascadeOnDelete`) |
| key | string(64) | | | Identifiant de la modale (ex. `customer-welcome`, `host-welcome`) |
| seen_at | timestamp | | | Date de la première vue |

**Contraintes d'unicité :**
- `(user_id, key)`

**Traits :** `HasFactory`

**Relations :**
- `user()` → belongsTo User

> ⚠️ **Pas de `created_at` / `updated_at`** — `$timestamps = false` sur le modèle et aucune colonne
> de timestamps dans la migration. Seul `seen_at` a un sens ici. Ce n'est pas un oubli : avec
> [26. PropertyPriceHistory](#26-propertypricehistory-), ce sont les **deux seuls** modèles du dépôt
> à couper les timestamps (mesuré le 2026-08-16).

---

## Modèles ajoutés depuis TCK-310

> **Ces sections ne relèvent pas de l'en-tête précédent.** §72 à §97 décrivent des modèles posés
> **après** TCK-310, chacun par le ticket que cite sa fiche ; §98 et §99, des modèles antérieurs
> restés sans fiche jusqu'à la passe 011 de `/sync-specs`. Ils étaient rangés sous « Modèles
> documentés a posteriori » jusqu'au 2026-10-14 (passe 012, M48). La méthode reste celle de
> TCK-310 : une fiche décrit ce que ses migrations et son modèle déclarent, pas une intention.

---

### 72. CalendarFeed ✅

**Table :** `calendar_feeds`
**Description :** Lien d'abonnement iCalendar d'un utilisateur, en lecture seule (TCK-591,
[ADR-0034](adr/0034-l-agenda-sort-par-un-lien-secret-en-lecture-seule.md)). Le jeton n'est connu
que par son **empreinte** SHA-256 (`CalendarFeed::hashToken()`) : il est rendu une seule fois, à la
création ou à la rotation, et jamais stocké en clair. Le lien est révoqué par l'utilisateur, à la
rotation, et au retrait du membre de l'agence (`AgencyMemberRemovalService`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | | | Titulaire du lien (`calendar_feeds_user_fk`, `cascadeOnDelete`) |
| agency_id | FK agencies | ✓ | null | Agence où le titulaire est du personnel ; `null` pour un compte qui n'est personnel d'aucune agence (prestataire) (`calendar_feeds_agency_fk`, `cascadeOnDelete`) |
| token_hash | string(64) | | | Empreinte SHA-256 du jeton ; masquée à la sérialisation (`$hidden`) |
| revoked_at | timestamp | ✓ | null | Révocation ; un lien révoqué rend 404 |
| last_accessed_at | timestamp | ✓ | null | Dernière lecture du flux |
| created_at / updated_at | timestamp | | | |

**Contraintes d'unicité :**
- `token_hash` (`calendar_feeds_token_hash_unique`)

**Index :** `(user_id, agency_id)` (`calendar_feeds_user_agency_idx`)

**Relations :**
- `user()` → belongsTo User
- `agency()` → belongsTo Agency

**Scopes :** `active()` — `revoked_at IS NULL`

---

### 73. ModerationClaim 🆕

**Table :** `moderation_claims`
**Description :** Prise en charge d'un élément de la file de modération super-admin pour
10 minutes (`ModerationClaim::DURATION_MINUTES`, ADR-0043 §7). Tant qu'elle court, un autre
modérateur reçoit 409 en décidant ; expirée, elle ne protège plus rien et la prise suivante la
réécrit. Elle est supprimée avec la décision.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| item_key | string(64) | | | Identifiant de la file (`property:12`, `property_report:3`, `review:7`) |
| claimed_by_id | FK users | | | Modérateur (`cascadeOnDelete`, `moderation_claims_claimed_by_fk`) |
| claimed_at | timestamp | | | Début de la prise |
| expires_at | timestamp | | | Fin de la prise |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `item_key` (`moderation_claims_item_key_uniq`)

**Relations :**
- `claimedBy()` → belongsTo User (via `claimed_by_id`)

---

### 74. MediaFingerprint 🆕

**Table :** `media_fingerprints`
**Description :** Empreinte dHash 64 bits de la photo **originale** d'un bien (collection `photos`),
calculée par `ComputePhotoFingerprintJob` sur la file `media` (ADR-0054 §1-2). Sert à soupçonner
une annonce recopiée par un autre publieur.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| media_id | FK media | | | Photo (`cascadeOnDelete`), unique (`media_fingerprints_media_uniq`) |
| property_id | FK properties | | | Bien (`cascadeOnDelete`) |
| agency_id | FK agencies | oui | null | Agence du bien au calcul (`nullOnDelete`) |
| hash | bigint | | | Les 64 bits du dHash (signés) |
| band_0 … band_3 | integer | | | Les quatre tranches de 16 bits, chacune indexée |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :** `media_fingerprints_property_idx`, `media_fingerprints_band_{0..3}_idx`.

**Relations :** `media()` → belongsTo Media ; `property()` → belongsTo Property.

---

### 75. DuplicateSuspicion 🆕

**Table :** `duplicate_suspicions`
**Description :** Deux biens de publieurs différents soupçonnés d'être la même annonce (ADR-0054
§5), remis à la file de modération super-admin (`suspected_duplicate`, décisions `hide` | `reject`).
Aucune action automatique.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_id | FK properties | | | Bien soupçonné (`cascadeOnDelete`) |
| matched_property_id | FK properties | | | Bien qu'il recopierait (`cascadeOnDelete`) |
| signal | string(20) | | | `photo` \| `address` |
| distance | smallint | oui | null | Distance de Hamming (signal `photo`) |
| decision | string(20) | oui | null | `hide` \| `reject` |
| resolved_by_id | FK users | oui | null | Modérateur (`nullOnDelete`) |
| reason_code | string(40) | oui | null | `ModerationReasonCode` |
| resolved_at | timestamp | oui | null | `null` = ouverte |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :** la PAIRE, quel que soit l'ordre —
`duplicate_suspicions_pair_uniq (LEAST(property_id, matched_property_id), GREATEST(…))`.

**Relations :** `property()`, `matchedProperty()` → belongsTo Property ; `resolvedBy()` →
belongsTo User.

---

### 76. PayoutMethod 🆕

> Posée par TCK-594 (ADR-0039 §6), relue colonne à colonne contre `2026_10_07_200000` et
> `2026_10_08_100000` le 2026-10-14.

**Table :** `payout_methods`
**Description :** Destination de paiement d'un utilisateur (bailleur, prestataire) : numéro mobile
money ou compte bancaire. Un reversement Wave / Orange Money / Free Money / virement ne se marque
payé que vers une destination du bénéficiaire **vérifiée par l'agence qui paie** (§78).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | | | Titulaire (`cascadeOnDelete`, `payout_methods_user_fk`) |
| kind | string(30) | | | `PayoutMethodKind` : `wave`, `orange_money`, `free_money`, `bank_transfer` |
| account_identifier | text | | | Numéro ou IBAN — cast `encrypted`, `$hidden`, hors `$queryFields` et de la recherche |
| account_holder_name | text | oui | null | Nom du titulaire — cast `encrypted`, `$hidden` |
| masked_identifier | string(40) | | | Seule forme lue par l'agence (`•••• 1234`) — écrite par `PayoutMethod::mask()`, branché sur le masqueur commun `Masking::tail()` (TCK-601) : un identifiant de quatre caractères ou moins ne se montre pas en entier |
| is_default | boolean | | false | |
| deleted_at | timestamp | oui | null | Soft delete (un reversement passé garde sa destination) |
| created_at / updated_at | timestamp | | auto | |

**Index :** `payout_methods_user_idx (user_id)` ; **`payout_methods_user_default_unique`**, unique partiel `(user_id) WHERE is_default AND deleted_at IS NULL` (`2026_10_25_223721`, TCK-2372, P250.03) — une seule destination vivante par défaut par compte. Une destination supprimée garde son `is_default` et ne compte pas. `PayoutMethodService` retire le défaut des autres avant d'écrire la nouvelle, sous verrou de la ligne `users` du titulaire. La migration échoue, en les nommant, s'il existe des doublons : elle ne retire le défaut d'aucune destination.

Le modèle n'est pas `Auditable` : les identifiants ne passent jamais par `activity_log`. Ce que
l'approbateur d'un reversement a approuvé se garde par `fingerprint()` — HMAC de la nature et du
numéro normalisé sous la clé de l'application, jamais un hachage nu — dans `payouts.metadata`
(VERIF-594 M-4).

**Relations :** `user()` → belongsTo User ; `verifications()` → hasMany PayoutMethodVerification
(§78). Inverse : `Payout.payoutMethod()` (withTrashed). Les colonnes `verified_at` et
`verified_by_id` ont été retirées (VERIF-594 M-6) : une vérification globale valait pour toute
agence.

---

### 77. ServiceProviderBill 🆕

> Posée par TCK-594 (ADR-0039 §8), relue colonne à colonne contre `2026_10_07_200100` le
> 2026-10-14.

**Table :** `service_provider_bills`
**Description :** Facture d'intervention **reçue** d'un prestataire, créée quand une demande de
maintenance passe `completed` avec un prestataire assigné. Validée par l'agence, payée par un
`Payout` `payee_role = service_provider` ; refacturable au bailleur, elle s'impute sur son
reversement (`imputed_payout_id`).

Elle ne se valide, ne se paie et ne s'impute que pour une demande `completed` ou `closed`
(`ServiceProviderBill::BILLABLE_REQUEST_STATUSES`). Quand la demande quitte cet état (contestation)
ou est annulée, `ReopenedRequestBills` passe sa facture `pending_validation`, ou `validated` sans
reversement vivant et non imputée, à **`cancelled`** — seul écrivain de ce statut ; une facture payée,
imputée ou en cours de paiement reste, avec l'avis `service_provider_bill.kept_on_reopen` aux
détenteurs de `payouts.create` (TCK-2270, ADR-0039 § 8, amendement du 2026-10-25). La fin des
travaux suivante fait naître une facture neuve.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| maintenance_request_id | FK maintenance_requests | | | `cascadeOnDelete`, `sp_bills_request_fk` |
| agency_id | FK agencies | oui | null | `nullOnDelete`, `sp_bills_agency_fk` |
| property_id | FK properties | oui | null | `nullOnDelete`, `sp_bills_property_fk` |
| provider_id | FK users | | | Prestataire (`restrictOnDelete`, `sp_bills_provider_fk`) |
| reference_number | string | | | Unique (`sp_bills_reference_unique`) |
| provider_reference | string | oui | null | Référence de la facture du prestataire |
| amount | decimal(14,2) | | | Coût réel, à défaut devis approuvé |
| currency | string(3) | | 'XOF' | |
| exceeds_quote | boolean | | false | Coût réel > devis approuvé |
| status | string(30) | | 'pending_validation' | `ServiceProviderBillStatus` : `pending_validation`, `validated`, `rejected`, `paid`, `cancelled` |
| validated_by_id | FK users | oui | null | `nullOnDelete`, `sp_bills_validated_by_fk` |
| validated_at | timestamp | oui | null | |
| rejection_reason | text | oui | null | |
| rechargeable_to_landlord | boolean | | true | |
| imputed_payout_id | FK payouts | oui | null | Reversement bailleur qui la retient (`nullOnDelete`, `sp_bills_imputed_payout_fk`) |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** index unique partiel `sp_bills_one_open_per_request` sur `maintenance_request_id`
`WHERE status NOT IN ('rejected','cancelled')` — une seule facture ouverte par demande. C'est ce qui
permet à l'observateur de créer la facture par `insertOrIgnore`, sans exception attendue.

**Index :** `sp_bills_agency_status_idx (agency_id, status)`, `sp_bills_provider_idx (provider_id)`.

**Relations :** `maintenanceRequest()`, `agency()`, `property()`, `provider()`, `validator()`,
`imputedPayout()` → belongsTo ; `payouts()` → hasMany Payout (`service_provider_bill_id`).

---

### 78. PayoutMethodVerification 🆕

> Posée par TCK-594 (VERIF-594 M-6, ADR-0039 §6), relue colonne à colonne contre
> `2026_10_08_100000` le 2026-10-14.

**Table :** `payout_method_verifications`
**Description :** Une destination de paiement vérifiée **par une agence**. Elle ne vaut que pour
cette agence : un reversement d'une autre agence ne part pas vers elle. Une destination modifiée
perd **toutes** ses vérifications. Les vérifications globales d'avant (`payout_methods.verified_at`)
n'ont pas été migrées : elles sont invalidées, faute de savoir au nom de quelle agence le
vérificateur agissait.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `cascadeOnDelete`, `pm_verifications_agency_fk` |
| payout_method_id | FK payout_methods | | | `cascadeOnDelete`, `pm_verifications_method_fk`, indexé (`pm_verifications_method_idx`) |
| verified_by_id | FK users | oui | null | Membre de l'agence qui a vérifié (`nullOnDelete`, `pm_verifications_verifier_fk`) |
| verified_at | timestamp | | | Date du dernier geste de vérification |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `(agency_id, payout_method_id)` (`pm_verifications_agency_method_unique`) ;
une vérification rejouée met à jour la ligne (`upsert`).

**Relations :** `agency()`, `payoutMethod()`, `verifier()` (via `verified_by_id`) → belongsTo.

---

### 79. PrivacyRequest ✅

**Table :** `privacy_requests`
**Description :** Registre des demandes de droits (TCK-601,
[ADR-0044 §4](adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md)) :
accès, rectification, opposition, effacement, portabilité, suivies par le super-admin jusqu'à leur
échéance. Alimenté à la main (demande reçue par courriel ou courrier) et par l'application : un
`DataExport` demandé par son titulaire ouvre une `portability`, une `AccountDeletionRequest` une
`erasure` ; l'annulation de l'effacement passe l'entrée `withdrawn` sans l'effacer. Journal `Privacy`
en liste blanche (ni nom, ni contact, ni résumé). Preuve de réponse : média privé `proof`.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | ✓ | null | Demandeur s'il a un compte (`privacy_requests_user_fk`, `nullOnDelete`) |
| requester_name | string | | | Nom du demandeur |
| requester_contact | string | ✓ | null | Courriel, téléphone ou adresse |
| type | PrivacyRequestType (string 20) | | | access, rectification, opposition, erasure, portability |
| channel | PrivacyRequestChannel (string 20) | | | in_app, email, postal, phone, in_person |
| received_at | timestamp | | | Réception |
| due_at | timestamp | | | `received_at + config('privacy.rights_request_deadline_days')` (30 j, valeur de travail), dérivé à l'enregistrement |
| status | PrivacyRequestStatus (string 20) | | 'received' | received, in_progress, answered, rejected, withdrawn ; une demande close ne se rouvre pas |
| answered_at | timestamp | ✓ | null | Posé au passage `answered` |
| response_summary | text | ✓ | null | Résumé de la réponse |
| handled_by | FK users | ✓ | null | Dernier super-admin à l'avoir traitée (`privacy_requests_handled_by_fk`, `nullOnDelete`) |
| data_export_id | FK data_exports | ✓ | null | `privacy_requests_data_export_fk`, `nullOnDelete` |
| account_deletion_request_id | FK account_deletion_requests | ✓ | null | `privacy_requests_deletion_fk`, `nullOnDelete` |
| created_at / updated_at | timestamp | | | |

**Index :** `(status, due_at)` (`privacy_requests_status_due_idx`), `user_id` (`privacy_requests_user_idx`)

**Relations :** `user()`, `handler()` → belongsTo User

**Scopes :** `overdue()` — statut ouvert (`received`, `in_progress`) et `due_at` passé

---

### 80. PropertyUnavailability 🆕

**Table :** `property_unavailabilities`
**Description :** Une plage `[starts_on, ends_on)` où un bien n'est pas réservable (TCK-596,
[ADR-0041](adr/0041-indisponibilites-et-echange-ical.md)). `ends_on` est **exclusif**, comme le jour
de départ d'une réservation. Manuelle (posée par qui peut modifier le bien) ou importée d'un flux
iCal ; une plage importée ne se supprime pas à la main.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_id | FK properties | | | Bien (`cascadeOnDelete`) |
| starts_on | date | | | Première nuit bloquée |
| ends_on | date | | | Lendemain de la dernière nuit (exclusif) ; `CHECK ends_on > starts_on` |
| reason | string(255) | ✓ | | Motif, visible de l'hôte seul |
| source | string(20) | | `manual` | `manual` \| `ical` |
| calendar_feed_id | FK property_calendar_feeds | ✓ | | Flux d'origine (`cascadeOnDelete`) |
| external_uid | string(255) | ✓ | | `UID` de l'événement importé |
| conflict_booking_id | FK bookings | ✓ | | Réservation confirmée chevauchée (`nullOnDelete`) — jamais annulée par l'import |
| created_by_id | FK users | ✓ | | Auteur d'un blocage manuel |
| created_at / updated_at | timestamp | | | |

**Contraintes d'unicité :** `(calendar_feed_id, external_uid)`, partielle (flux non nul).
**Index :** `(property_id, starts_on, ends_on)`.

**Relations :** `property()`, `feed()`, `conflictBooking()` → belongsTo.

### 81. PropertyCalendarFeed 🆕

**Table :** `property_calendar_feeds`
**Description :** Un calendrier iCal externe importé pour un bien, synchronisé toutes les heures
derrière la garde SSRF `App\Support\Http\SafeOutboundUrl` (TCK-596, ADR-0041). Au plus 10 par bien.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_id | FK properties | | | Bien (`cascadeOnDelete`) |
| url | text | | | **Chiffrée** (cast `encrypted`), cachée de toute sérialisation |
| url_host | string(255) | | | Hôte de l'URL — seule partie rendue par l'API |
| label | string(120) | ✓ | | Nom donné par l'hôte |
| created_by_id | FK users | ✓ | | |
| last_synced_at | timestamp | ✓ | | Dernière tentative |
| last_status | string(20) | ✓ | | `pending` (première synchronisation en file) \| `ok` \| `failed` |
| last_error | string(60) | ✓ | | Motif codé (`private_address`, `too_large`, `http_error`…) |
| failing_since | timestamp | ✓ | | Premier échec de la série en cours |
| consecutive_failures | unsigned int | | 0 | Au 3ᵉ, le bailleur est prévenu une fois |
| created_at / updated_at | timestamp | | | |

**Relations :** `property()` → belongsTo ; `unavailabilities()` → hasMany PropertyUnavailability.

> Le jeton d'export du bien vit sur `properties.ical_export_token_hash` (SHA-256, unique, caché) :
> le jeton en clair n'est rendu qu'une fois, à la régénération.

---

### 82. LeaseSignature 🆕

**Table :** `lease_signatures`
**Description :** La preuve de consentement d'une partie à un bail (TCK-596, ADR-0042). Une signature
lie l'empreinte du contrat FIGÉ (`leases.contract_sha256`, PDF rangé dans la collection média privée
`signed_contract`) ; seules comptent celles dont l'empreinte est l'empreinte courante. La seconde
signature active le bail.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| lease_id | FK leases | | | Bail (`cascadeOnDelete`) |
| role | string(20) | | | `tenant` \| `landlord` |
| method | string(20) | | | `otp` (code à usage unique) \| `paper` (contrat numérisé, voie `activate`) |
| user_id | FK users | ✓ | | Signataire (`otp`) — `nullOnDelete` |
| on_behalf_of_user_id | FK users | ✓ | | Bailleur pour le compte duquel le personnel de l'agence a signé |
| recorded_by_id | FK users | ✓ | | Auteur de l'enregistrement (`paper`) |
| document_sha256 | string(64) | | | Empreinte du contrat signé |
| signed_at | timestamp | | | |
| ip_address | string(45) | ✓ | | **Caché**, jamais rendu par l'API |
| user_agent | string(512) | ✓ | | **Caché**, jamais rendu par l'API |
| otp_channel | string(10) | ✓ | | `sms` \| `mail` |
| otp_destination | string(120) | ✓ | | Destination **masquée** du code |
| created_at / updated_at | timestamp | | | |

**Unicité :** `(lease_id, role, document_sha256)`.
**Relations :** `lease()` → belongsTo ; `signer()` → belongsTo User (`user_id`) ; `onBehalfOf()` →
belongsTo User.

> Les colonnes que ce ticket ajoute à `leases` (`contract_sha256`, `signature_requested_at`,
> `early_termination_penalty_months`, `rent_review_max_pct`) sont décrites en [§14](#14-lease-).
> Une colonne du contrat modifiée pendant `pending_signature` (hors
> `Lease::CONTRACT_NEUTRAL_COLUMNS`), ou un garant attaché/détaché, remet `contract_sha256` à `null`.

---

### 83. ImpersonationSession 🆕

**Table :** `impersonation_sessions`
**Description :** Une session d'impersonation (TCK-600,
[ADR-0055](adr/0055-impersonation-en-lecture-seule-sans-jeton-dans-la-page.md)) : un opérateur `super_admin`
lit, **en lecture seule**, ce que voit un compte, pendant 15 minutes non prolongeables
(`ImpersonationSession::TTL_MINUTES`), avec un motif. La session porte le jeton Sanctum dédié
(`name = impersonation`, capacité unique `impersonation:read`) ; `AccessTokenGate` ne l'accepte
que tant que la session est ouverte, non échue, et que l'opérateur est toujours un `super_admin`
actif. Fermée par `ImpersonationService::stop()` — idempotent, sous verrou — qui supprime le jeton
et notifie la cible (`impersonation.ended`) une seule fois.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| impersonator_id | FK users | | | L'opérateur (`imp_sessions_impersonator_fk`, `cascadeOnDelete`) |
| target_user_id | FK users | | | Le compte lu (`imp_sessions_target_fk`, `cascadeOnDelete`) |
| personal_access_token_id | FK personal_access_tokens | ✓ | null | Le jeton dédié (`imp_sessions_token_fk`, `nullOnDelete` : `stop` supprime le jeton, la ligne reste) |
| reason | text | | | Motif saisi (10..1000), repris dans l'activité de début |
| started_at | timestamp | | | |
| expires_at | timestamp | | | `started_at + 15 min` |
| ended_at | timestamp | ✓ | null | Fermeture ; `null` = session non fermée |
| end_reason | string(20) / `ImpersonationEndReason` | ✓ | null | `stopped` / `expired` / `operator_revoked` / `target_blocked` |
| created_at / updated_at | timestamp | | | |

**Contraintes d'unicité :** `personal_access_token_id` (`imp_sessions_token_uniq`)

**Index :** `(impersonator_id, ended_at)` (`imp_sessions_open_idx`), `(ended_at, expires_at)`
(`imp_sessions_expiry_idx`), `target_user_id` (`imp_sessions_target_idx`)

**Relations :**
- `impersonator()` → belongsTo User
- `target()` → belongsTo User
- `token()` → belongsTo `Laravel\Sanctum\PersonalAccessToken`

**Scopes :** `open()` — `ended_at IS NULL AND expires_at > now()`

**Attribution :** `activity_log.impersonator_id` (FK `users`, `activity_log_impersonator_fk`,
`nullOnDelete`, index `activity_log_impersonator_idx`) est posé par `App\Models\Activity::creating` (TCK-601) sur toute
activité écrite pendant une requête authentifiée par le jeton d'une session ouverte.

---

### 84. LeasePaymentLink 🆕

> Posée par TCK-602 (ADR-0051 §1), relue colonne à colonne contre `2026_10_08_170000` le
> 2026-10-14.

**Table :** `lease_payment_links`
**Description :** Lien de paiement `/pay/{jeton}` d'une échéance de loyer, pour un locataire sans
compte. Un seul lien actif par échéance ; le jeton se cherche par son empreinte et se relit chiffré.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| lease_payment_id | FK lease_payments | | | `cascadeOnDelete` (`lpl_lease_payment_fk`) |
| token_hash | char(64) | | | sha256 du jeton — unique (`lpl_token_hash_unique`) |
| token | text | | | Jeton (32 octets base64url), casté `encrypted`, `$hidden` |
| expires_at | timestamp | | | max(aujourd'hui, échéance) + 60 j ; ramené à `paid_at` + 30 j une fois payée (calculé, non écrit) |
| revoked_at | timestamp | oui | null | Révoqué (régénération, révocation) |
| last_accessed_at | timestamp | oui | null | Dernière lecture publique |
| access_count | unsignedInteger | | 0 | Lectures publiques |
| created_by_id | FK users | oui | null | `nullOnDelete` (`lpl_created_by_fk`) |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** index unique partiel `lpl_one_active_per_payment_unique` sur `lease_payment_id`
`WHERE revoked_at IS NULL` — un seul lien actif par échéance. Index `lpl_lease_payment_idx`.

**Relations :** `leasePayment()` → belongsTo LeasePayment (`withTrashed`) ; `creator()` → belongsTo User.

---

### 85. CommissionEntry 🆕

> Posée par TCK-595 (ADR-0049 §3), relue colonne à colonne contre `2026_10_08_150100` le
> 2026-10-14. Le négociateur que le grand livre rémunère est `leases.agent_id`, ajouté par le même
> ticket (ADR-0049 §1, `2026_10_08_150000`) et décrit en [§14 Lease](#14-lease-).

**Table :** `commission_entries`
**Description :** Grand livre des commissions d'agence : la part d'un bénéficiaire (négociateur du
bail ou collaborateur `agent` du bien) sur `leases.commission_amount`, figée à l'activation du bail
(`LeaseActivated` → `CommissionLedgerService::generateFor`). Jamais recalculée depuis un état courant.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `cascadeOnDelete` (`commission_entries_agency_fk`) |
| lease_id | FK leases | | | `cascadeOnDelete` (`commission_entries_lease_fk`) |
| beneficiary_id | FK users | | | `cascadeOnDelete` (`commission_entries_beneficiary_fk`) |
| origin | string(20) | | | `CommissionOrigin` : `negotiator`, `collaborator` |
| base_amount | decimal(14,2) | | | `commission_amount` du bail à l'activation |
| share_percent | decimal(5,2) | | | Part servie |
| amount | decimal(14,2) | | | Arrondi au centime inférieur (Σ ≤ base) |
| currency | string(3) | | XOF | |
| status | string(20) | | due | `CommissionEntryStatus` : `due`, `paid`, `cancelled` |
| earned_at | timestamp | | | `signed_at` du bail |
| paid_at / paid_by_id | timestamp / FK users | oui | null | Marquage versé (`payouts.approve`) ; FK `nullOnDelete` (`commission_entries_paid_by_fk`) |
| cancelled_at / cancelled_by_id | timestamp / FK users | oui | null | Annulation (`payouts.approve`) ; FK `nullOnDelete` (`commission_entries_cancelled_by_fk`) |
| metadata | jsonb | oui | null | Détail des parts du négociateur également collaborateur |
| created_at / updated_at | timestamp | | auto | |

Unicité `commission_entries_lease_benef_uq (lease_id, beneficiary_id)` ; index
`commission_entries_agency_benef_idx (agency_id, beneficiary_id, earned_at)` et
`commission_entries_beneficiary_idx (beneficiary_id)`.

**Lecture** (`CommissionEntry::visibleTo()`, relevé `GET /api/commissions` et export) : le
personnel de l'agence active ne lit que ses propres lignes, sauf sous `AgencyPolicy::viewReports`,
qui ouvre toute l'agence ; le super-admin lit tout ; hors personnel, rien.

**Relations :** `agency()`, `lease()`, `beneficiary()` → belongsTo. Inverse :
`Lease.commissionEntries()`.

---

### 86. PlatformMetricDaily 🆕

> Posée par TCK-595 (ADR-0057), relue colonne à colonne contre `2026_10_08_150200` le 2026-10-14.

**Table :** `platform_metrics_daily`
**Description :** Instantané quotidien des métriques de la console plateforme, écrit à 00:30 pour la
veille (`SnapshotPlatformMetricsJob`) ou rejoué par `metrics:snapshot --date=`. La tendance à 30 jours
de `GET /api/admin/system/metrics` se lit dans la ligne de J-30, et nulle part ailleurs.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| date | date | | | Unique (`platform_metrics_daily_date_uq`) |
| gmv_amount / platform_fees_amount | decimal(16,2) | | 0 | Flux du jour (`paid_at`), rattrapables |
| collected_total_amount | decimal(16,2) | | 0 | *Encaissé* cumulé à la fin du jour, rattrapable |
| mrr_amount / mrr_trialing_amount | decimal(16,2) | oui | null | Stock, hors essais / essais seuls ; jamais rattrapé |
| active_subscriptions | integer | oui | null | Abonnements actifs — stock ; jamais rattrapé |
| agencies_total, agencies_active, agencies_verified, agencies_suspended | integer | oui | null | Agences par statut courant — stocks ; jamais rattrapés |
| users_total, users_active | integer | oui | null | Utilisateurs — stocks ; jamais rattrapés |
| properties_published, properties_pending_review | integer | oui | null | Biens publiés / en attente de modération — stocks ; jamais rattrapés. **« Publiés » se compte par `Property::public()`**, le prédicat du catalogue de TCK-1115 (décision du porteur du 2026-10-23, P167.07) : la série **rompt à la livraison de TCK-2087** (`a065a7fe1` : `PlatformMetricsSnapshotter` compte `Property::query()->public()->count()`), les lignes antérieures comptant `status = published` seul |
| leases_active | integer | oui | null | Baux actifs — stock ; jamais rattrapé |
| stocks_captured_at | timestamp | oui | null | Instant de mesure des stocks, `null` sur une ligne rattrapée |
| created_at / updated_at | timestamp | | auto | |

**Relations :** aucune.

---

### 87. AlertSubscriber 🆕

**Table :** `alert_subscribers`
**Description :** Le destinataire d'une alerte de recherche **sans compte** (TCK-599,
[ADR-0050 §4](adr/0050-alertes-de-recherche-un-seul-moteur-et-des-abonnes-sans-compte.md)). Une ligne par demande,
porteuse d'une `SavedSearch` ; rien ne part avant la confirmation (lien e-mail ou code WhatsApp), une
demande non confirmée est purgée à 48 h (`search-alerts:purge-unconfirmed`), la désinscription efface
toutes les lignes du même contact. Aucune réponse de l'API ne dit si un contact est connu.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| channel | string(16) | | | `email`, `whatsapp` (ce dernier derrière `SEARCH_ALERTS_WHATSAPP_ENABLED`) |
| contact | text | | | Adresse ou numéro E.164 normalisé, **chiffré** (cast `encrypted`) |
| contact_hash | string(64) | | | HMAC (`app.key`) de `canal\|contact normalisé` — recherche, rattachement, désinscription |
| mailbox_hash | string(64) | | | HMAC de la BOÎTE (`awa+x@` → `awa@`) — plafonds et limiteur par contact (verif-599 m1) ; posée à la création |
| locale | string(8) | | 'fr' | `fr`, `en`, `wo` |
| confirmation_token_hash | string(64) | ✓ | null | sha256 du lien de confirmation (e-mail), unique ; effacé à la confirmation (usage unique) |
| confirmation_sent_at | timestamp | ✓ | null | Envoi de la confirmation — au plus 2 par contact sur 24 h |
| confirmed_at | timestamp | ✓ | null | Confirmation |
| unsubscribe_token | text | | | Jeton de désinscription, chiffré (rejoué dans chaque envoi) |
| unsubscribe_token_hash | string(64) | | | sha256 du jeton, unique — la recherche se fait par lui |
| consent_at / consent_source / consent_version | timestamp / string(40) / string(40) | | | Preuve du consentement (`public_search_alert`, `search-alert-2026-10-08`) |
| created_at / updated_at | timestamp | | | |

**Index :** `(contact_hash, confirmed_at)` (`alert_subscribers_contact_idx`), `created_at` (`alert_subscribers_created_idx`), `(mailbox_hash, confirmation_sent_at)` (`alert_subscribers_mailbox_idx`)

**Relations :** `savedSearches()` → hasMany SavedSearch

**Rattachement :** `POST /api/saved-searches/claim` déplace vers le compte les recherches des abonnés
**confirmés** dont le contact est l'e-mail ou le téléphone **vérifié** du compte, puis supprime les abonnés.

---

### 88. PropertyContact 🆕

**Table :** `property_contacts` (migration `2026_10_12_300200`)
**Description :** Un numéro à appeler **sur place** (gardien, voisin), titré, joignable mais **non
vérifié** — trois au plus par bien (TCK-633, lot C). Jamais dans `PropertyResource` : il ne sort au
public que par l'endpoint de contact limité `GET /public/properties/{slug}/contact`. Le plafond de 3
est une règle applicative (`ReplacePropertyContactsRequest`, verrou sur la ligne du bien), pas une
contrainte de base. Un contact sur place dont le numéro répète un numéro déjà servi pour le bien (principal ou second du
contact principal) n'est pas servi une seconde fois (`PropertyContactNumbers`, TCK-2389) : c'est le cas
d'un bien publié par le Radar, dont l'annonceur active ensuite son compte.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_id | unsignedBigInteger, FK properties | | | `property_contacts_property_fk`, `cascadeOnDelete` |
| label | string(60) | oui | null | Libellé libre (« Gardien »…) |
| phone | string(30) | | | Numéro, non vérifié |
| has_whatsapp | boolean | | false | |
| position | unsignedSmallInteger | | 0 | Ordre d'affichage |
| created_at / updated_at | timestamp | | auto | |

**Index :** `property_contacts_property_position_idx (property_id, position)` — il indexe aussi la FK,
dont il a la colonne de tête (piège n°8).

**Relations :** `property()` → belongsTo Property. Inverse : `Property::contacts()` (`orderBy('position')`).

---

### 89. GeoRegion 🆕

**Table :** `geo_regions` (migration `2026_10_12_400000`)
**Description :** Les 14 régions du Sénégal, tête du référentiel Région → Ville → Quartier
([ADR-0062 §1](adr/0062-referentiel-geographique-region-ville-quartier.md)). Le référentiel vit en
base mais **aucune migration ne le charge** : les lignes viennent d'un jeu de données versionné
(`database/data/geo/regions/*.json`), chargé par `geo:sync-referential` au déploiement et par
`GeoReferentialSeeder` en développement (mise à jour par slug, jamais de suppression d'un lieu
référencé). Données OpenStreetMap sous ODbL : mention due là où le référentiel est servi (ADR-0062 §3).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| code | string(8) | | | Unique `geo_regions_code_unique` |
| slug | string(80) | | | Unique `geo_regions_slug_unique` |
| name | string(120) | | | |
| latitude / longitude | decimal(10,7) | oui | null | Centre |
| created_at / updated_at | timestamp | | auto | |

**Relations :** `cities()` → hasMany GeoCity.

---

### 90. GeoCity 🆕

**Table :** `geo_cities` (migration `2026_10_12_400000`)
**Description :** La **ville telle que les annonces la nomment** ([ADR-0062 §2](adr/0062-referentiel-geographique-region-ville-quartier.md)) :
la commune, sauf dans l'agglomération dakaroise où c'est le département (Dakar, Pikine, Guédiawaye,
Keur Massar), ses communes d'arrondissement devenant des quartiers.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| geo_region_id | FK geo_regions | | | `geo_cities_region_fk`, **`restrictOnDelete`** |
| slug | string(120) | | | |
| name | string(120) | | | |
| former_names | jsonb (cast `array`) | oui | null | Anciens noms de la ville, ajoutés quand le rechargement du jeu de données la renomme (`GeoReferentialLoader::ville()`) ; lus par `VilleDuFiltre` : une recherche ou une alerte rangée sous l'ancien nom désigne toujours la ville. Aucune reprise (TCK-1169, `2026_10_21_224500`) |
| latitude / longitude | decimal(10,7) | oui | null | Centre |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `geo_cities_region_slug_unique (geo_region_id, slug)` ; unique
`geo_cities_region_name_ci_unique (geo_region_id, LOWER(name COLLATE "und-x-icu"))` — casse repliée
par ICU, expression exacte de `CaseInsensitive::sql()` ([ADR-0025](adr/0025-repli-de-casse-par-collation-icu.md)) ;
index `geo_cities_name_ci_idx (LOWER(name COLLATE "und-x-icu"))` — une ville se cherche par son nom
dans tout le pays (rattachement des adresses existantes).

**Relations :** `region()` → belongsTo GeoRegion (`geo_region_id`) ; `neighborhoods()` → hasMany
GeoNeighborhood. Inverse : `Address::geoCity()`.

---

### 91. GeoNeighborhood 🆕

**Table :** `geo_neighborhoods` (migration `2026_10_12_400000`)
**Description :** Un quartier, venu du jeu de données (`origin = dataset`, `approved` d'office) ou
**proposé par une saisie** (`origin = user`, `pending` jusqu'à la modération) —
[ADR-0062 §5](adr/0062-referentiel-geographique-region-ville-quartier.md). Une proposition sert
aussitôt l'adresse qui l'a faite, n'est visible que de son auteur (`scopeVisiblesPour`), et n'est
proposée aux autres qu'après validation. Une fusion **ne supprime rien** : la source garde son nom et
pointe sa cible, si bien que le même nom retapé retombe sur la cible (`canonique()`, 5 sauts au plus).
Un rejet n'efface pas l'adresse : elle garde son texte et perd son identifiant.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| geo_city_id | FK geo_cities | | | `geo_neighborhoods_city_fk`, **`restrictOnDelete`** |
| slug | string(140) | | | `slugLibre()` : `nom`, `nom-2`… dans la ville |
| name | string(120) | | | `NOM_MAX = 120` : au-delà, une saisie ne devient pas une proposition |
| latitude / longitude | decimal(10,7) | oui | null | Centre |
| status | string(16) | | 'approved' | `ReferentialStatus` : `approved`, `pending`, `rejected` (ADR-0007 : pas d'`enum()` SQL) |
| origin | string(16) | | 'dataset' | `GeoNeighborhoodOrigin` : `dataset`, `user` |
| osm_ref | string(32) | oui | null | Référence OpenStreetMap |
| created_by_id | FK users | oui | null | Auteur de la proposition — `geo_neighborhoods_created_by_fk`, `nullOnDelete` |
| merged_into_id | FK geo_neighborhoods | oui | null | Cible de la fusion — `geo_neighborhoods_merged_into_fk`, `nullOnDelete` |
| renamed_at | timestamp | oui | null | Posé par un renommage en modération : le rechargement du jeu de données ne réécrit plus ce nom |
| former_names | jsonb (cast `array`) | oui | null | Anciens noms du quartier, ajoutés par un renommage en modération (`GeoNeighborhoodModeration::renommer()`) ou par le rechargement du jeu de données (`GeoReferentialLoader`) ; lus par `QuartierDuFiltre::idsDuReferentiel()` : une recherche, une alerte ou le rapprochement CRM sous l'ancien nom désigne toujours le quartier. Aucune reprise (TCK-1080, `2026_10_20_220000`) |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `geo_neighborhoods_city_slug_unique (geo_city_id, slug)` ; unique **partiel**
`geo_neighborhoods_city_name_ci_unique (geo_city_id, LOWER(name COLLATE "und-x-icu")) WHERE status <>
'rejected' AND merged_into_id IS NULL` — un quartier refusé ou fusionné ne réserve plus son nom ;
index `geo_neighborhoods_status_city_idx (status, geo_city_id)`, `geo_neighborhoods_created_by_idx`,
`geo_neighborhoods_merged_into_idx` (piège n°8).

**Relations :** `city()` → belongsTo GeoCity ; `createdBy()` → belongsTo User ; `mergedInto()` →
belongsTo GeoNeighborhood ; `addresses()` → hasMany Address (`geo_neighborhood_id`).

---

### 92. BoostProduct 🆕

**Table :** `boost_products` (migration `2026_10_12_500100` ; `500400` pose le catalogue initial et convertit les `featured` hérités en Vedettes offertes de 30 jours — un bien sans espace perd sa mise en avant)
**Description :** Une offre du catalogue de boosts, réglée dans le super-admin
([ADR-0061 §5](adr/0061-credits-d-espace-et-boost-des-annonces.md)) : Remontée 5 · Vedette 7 / 15 /
30 jours : 20 / 35 / 60 · Badge 7 jours : 10 (ADR-0061 §6). **Le prix et la durée se figent dans le boost
acheté** : modifier le catalogue ne touche pas un boost existant. Le front possède les libellés : une
offre se nomme par son genre, sa durée et sa variante.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| kind | string(20) | | | `BoostKind` : `bump`, `featured`, `badge` |
| variant | string(20) | oui | null | `BoostBadge` (`urgent`, `price_drop`) pour un Badge, sinon `null` |
| duration_days | unsignedSmallInteger | | 0 | 0 pour une Remontée (ponctuelle) |
| price_credits | unsignedInteger | | | CHECK `boost_products_price_check (price_credits >= 0)` |
| is_active | boolean | | true | |
| sort_order | unsignedSmallInteger | | 0 | |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `boost_products_offer_unique (kind, variant, duration_days)` **`NULLS NOT
DISTINCT`** — sans lui, deux Remontées à variante nulle passeraient l'unicité.

**Relations :** aucune déclarée. Inverse : `PropertyBoost::product()`.

---

### 93. PropertyBoost 🆕

**Table :** `property_boosts` (migration `2026_10_12_500100`, CHECK ajouté par `500500` ; `500400` y a inséré une Vedette **offerte** de 30 jours — prix 0, aucun mouvement de crédits, `offer_reason` « ADR-0061 : mise en avant antérieure convertie en Vedette offerte » — pour chaque bien `featured` d'un espace sans Vedette vivante ; un bien sans espace perd sa mise en avant)
**Description :** Un boost acheté ou offert sur un bien ([ADR-0061 §5, §8](adr/0061-credits-d-espace-et-boost-des-annonces.md)).
Écrit par `App\Services\Boost\*` seul. Règles : une Remontée au plus par bien et par délai réglé,
jamais remboursée ; une Vedette ne se cumule pas — en racheter une **prolonge** la fin (prix et durée
cumulés sur la ligne, et une [tranche](#100-propertyboosttranche-) de plus) ; un Badge actif par bien, un nouveau remplace l'ancien sans remboursement. Le boost **suit
la vie du bien** : bien hors surface publique → `paused` avec ses secondes restantes, puis reprise ;
bien loué, vendu ou supprimé par l'annonceur → `refunded` au prorata des jours pleins restants,
**tranche par tranche** pour une Vedette prolongée (TCK-942) ;
retiré par la modération → `ended` sans remboursement. Une mise en avant gratuite du super-admin est
une **Vedette offerte** (`offered`, prix 0, aucun mouvement de crédit).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_id | FK properties | | | `property_boosts_property_fk`, `cascadeOnDelete` |
| agency_id | FK agencies | | | L'espace payeur — `property_boosts_agency_fk`, `cascadeOnDelete` |
| boost_product_id | FK boost_products | oui | null | `property_boosts_product_fk`, `nullOnDelete` |
| kind | string(20) | | | `BoostKind` |
| variant | string(20) | oui | null | `BoostBadge` |
| price_credits | unsignedInteger | | | **Figé** à l'achat (cumulé par une prolongation ; le prix de chaque achat ou offre est dans ses [tranches](#100-propertyboosttranche-)) |
| duration_days | unsignedSmallInteger | | | **Figée** à l'achat |
| starts_at | timestamp | | | |
| ends_at | timestamp | oui | null | `null` pendant une pause (la durée est alors dans `remaining_seconds`). Une Remontée, instantanée, naît **close** : `ends_at = ended_at = starts_at`, statut `ended`, `duration_days = 0` |
| status | string(20) | | | `BoostStatus` : `active`, `paused`, `ended`, `cancelled`, `refunded` ; `BoostStatus::live()` = `active` + `paused` |
| remaining_seconds | unsignedInteger | oui | null | Durée restante gelée à la pause |
| paused_at / ended_at | timestamp | oui | null | |
| offered | boolean | | false | Vedette offerte par le super-admin |
| offer_reason | text | oui | null | |
| purchased_by_id | FK users | oui | null | Auteur de l'achat ou de l'offre — `nullOnDelete` |
| cancel_reason | text | oui | null | |
| cancelled_by_id | FK users | oui | null | `nullOnDelete` |
| refunded_credits | unsignedInteger | oui | null | Ce qui a **réellement** été rendu (une part dont le lot d'origine a expiré ne l'est pas, ADR-0061 §4) |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** CHECK `property_boosts_credits_check (price_credits >= 0 AND (refunded_credits IS
NULL OR refunded_credits >= 0))` — `unsignedInteger` n'est qu'un `integer` signé sous PostgreSQL.
Index `property_boosts_property_kind_status_idx (property_id, kind, status)`,
`property_boosts_status_ends_at_idx (status, ends_at)` (échéances de `boosts:tick`),
`property_boosts_agency_idx` ; et, une par clé `nullOnDelete` (migration `2026_10_14_100100`,
TCK-639 — piège PostgreSQL n°8), `property_boosts_product_idx (boost_product_id)`,
`property_boosts_purchased_by_idx (purchased_by_id)`, `property_boosts_cancelled_by_idx
(cancelled_by_id)`.

**Relations :** `property()` → belongsTo Property (`withTrashed`) ; `agency()` → belongsTo Agency ;
`product()` → belongsTo BoostProduct ; `dailyStats()` → hasMany PropertyBoostDailyStat ;
`tranches()` → hasMany [PropertyBoostTranche](#100-propertyboosttranche-), par `position` (TCK-942).
Inverse : `Property::boosts()`.

---

### 94. PropertyBoostDailyStat 🆕

**Table :** `property_boost_daily_stats` (migration `2026_10_12_500100`)
**Description :** Impressions et clics d'un boost, par jour UTC ([ADR-0061 §10](adr/0061-credits-d-espace-et-boost-des-annonces.md)) :
le compteur vit en cache et `boosts:tick` le vide ici. Un clic est une vue de fiche arrivée par un
lien d'emplacement (`src=sponsored`). Le super-admin y lit le taux de clic des emplacements.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_boost_id | FK property_boosts | | | `property_boost_daily_stats_boost_fk`, `cascadeOnDelete` |
| date | date | | | |
| impressions | unsignedInteger | | 0 | |
| clicks | unsignedInteger | | 0 | |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `property_boost_daily_stats_boost_date_unique (property_boost_id, date)`.

**Relations :** aucune déclarée. Inverse : `PropertyBoost::dailyStats()`.

---

### 95. CreditLot 🆕

**Table :** `credit_lots` (migration `2026_10_12_500200`)
**Description :** Un lot daté de crédits d'un espace ([ADR-0061 §1, §2, §4](adr/0061-credits-d-espace-et-boost-des-annonces.md)).
Écrit par `App\Services\Credits\CreditLedger` seul. **Invariant** : montant initial + somme des
mouvements négatifs du lot = montant restant ; le solde de l'espace est la somme des restants des
lots non expirés. Ordre de consommation (`scopeInConsumptionOrder`) : expiration la plus proche
d'abord, sans expiration en dernier, puis ancienneté — une dépense sur plusieurs lots écrit un
mouvement par lot. Les crédits offerts (`welcome`, `admin_grant`) expirent ; un lot `refund` hérite
de l'expiration de **son** lot d'origine ; un lot `purchase` (phase 2) n'expire jamais. Les crédits
sont des **entiers** : ils ne passent pas par la règle ×100 des montants.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `credit_lots_agency_fk`, `cascadeOnDelete` |
| origin | string(20) | | | `CreditLotOrigin` : `welcome`, `admin_grant`, `refund`, `purchase` |
| initial_amount | unsignedInteger | | | |
| remaining_amount | unsignedInteger | | | |
| expires_at | timestamp | oui | null | `null` = n'expire pas |
| granted_by_id | FK users | oui | null | Octroi manuel — `credit_lots_granted_by_fk`, `nullOnDelete` |
| reason | text | oui | null | Motif d'un octroi manuel |
| expiry_notice_sent_at | timestamp | oui | null | Préavis d'expiration envoyé — **une fois** |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** CHECK `credit_lots_amounts_check (initial_amount > 0 AND remaining_amount >= 0 AND
remaining_amount <= initial_amount)` ; index `credit_lots_agency_expires_idx (agency_id, expires_at)`,
`credit_lots_granted_by_idx (granted_by_id)` (migration `2026_10_14_100100`, TCK-639 : la clé
`nullOnDelete` vers `users`).

**Relations :** `agency()` → belongsTo Agency ; `grantedBy()` → belongsTo User ; `movements()` →
hasMany CreditMovement. Scopes `spendable()` (restant > 0, non expiré), `inConsumptionOrder()`.
Inverse : `Agency::creditLots()`.

---

### 96. CreditMovement 🆕

**Table :** `credit_movements` (migration `2026_10_12_500200`)
**Description :** Chaque mouvement de crédits, signé, rattaché à son lot et, s'il y a lieu, au boost
([ADR-0061 §2](adr/0061-credits-d-espace-et-boost-des-annonces.md)). **Insertion seule, tenue par un
trigger et non par une convention** : une erreur se corrige par un mouvement de sens contraire. Le
modèle double la garde (`updating` / `deleting` lèvent `LogicException`) et n'a pas d'`updated_at`
(`UPDATED_AT = null`, `getDates()` filtré) — seul modèle du dépôt dans ce cas.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `credit_movements_agency_fk`, `cascadeOnDelete` |
| credit_lot_id | FK credit_lots | | | `credit_movements_lot_fk`, `cascadeOnDelete` |
| type | string(20) | | | `CreditMovementType` : `grant`, `spend`, `refund`, `expire`, `admin_debit` |
| amount | integer | | | **Signé** ; CHECK `credit_movements_amount_check (amount <> 0)` |
| property_boost_id | FK property_boosts | oui | null | `credit_movements_boost_fk`, `nullOnDelete` |
| actor_id | FK users | oui | null | `credit_movements_actor_fk`, `nullOnDelete` |
| reason | text | oui | null | |
| created_at | timestamp | | `CURRENT_TIMESTAMP` | Pas d'`updated_at` |

**Trigger `credit_movements_append_only_trg`** (`BEFORE UPDATE OR DELETE`, fonction
`credit_movements_append_only()`, posée par `500200` et durcie par `2026_10_14_100000`, TCK-639) :
tout UPDATE ou DELETE direct lève `P0001`. Le trigger n'admet que deux écritures, **toutes deux à
`pg_trigger_depth() > 1`**, c'est-à-dire émises depuis un autre trigger — ce qu'est l'action
référentielle d'une clé étrangère (le trigger d'intégrité de la table parente est à la profondeur 1,
l'écriture qu'il émet déclenche celui-ci à la profondeur 2 ou plus) :

- un `DELETE` — la suppression **en cascade** d'une agence ou d'un lot ;
- un `UPDATE` qui ne change **que** `property_boost_id` et/ou `actor_id`, et seulement pour les
  mettre à `NULL` — l'`ON DELETE SET NULL` d'un boost ou d'un utilisateur supprimés (directement, ou
  plus bas : un bien supprimé emporte son boost, qui détache le mouvement à la profondeur 3).

Un `UPDATE credit_movements SET actor_id = NULL` émis directement (profondeur 1) lève donc, comme
toute autre modification ; jusqu'à `100000`, la mise à `NULL` passait **sans condition de
profondeur**. Limite assumée : la profondeur dit « émis par un trigger », pas « émis par une clé
étrangère » — aucun autre trigger du dépôt n'écrit cette table. ⚠ `User`, `Agency` et `Property`
sont en suppression douce : l'effacement d'un compte est une anonymisation, qui ne déclenche aucune
de ces actions ; seule la suppression réelle d'une ligne parente les exerce. `TRUNCATE` ne déclenche
pas les triggers de ligne : seul le harnais de test l'emploie.

**Index :** `credit_movements_agency_id_idx (agency_id, id)`, `credit_movements_lot_idx`,
`credit_movements_boost_idx`, `credit_movements_actor_idx (actor_id)` (migration `2026_10_14_100100`,
TCK-639 : la clé `nullOnDelete` vers `users`).

**Relations :** `lot()` → belongsTo CreditLot ; `boost()` → belongsTo PropertyBoost ; `actor()` →
belongsTo User. Inverse : `CreditLot::movements()`.

---

### 97. CreditWelcomeGrant 🆕

**Table :** `credit_welcome_grants` (migration `2026_10_12_500200`, unicité d'espace ajoutée par `500500`)
**Description :** Le registre « une offre de bienvenue par espace et par numéro vérifié »
([ADR-0061 §3](adr/0061-credits-d-espace-et-boost-des-annonces.md)). Versée au titulaire de l'espace
au moment où l'espace naît si son numéro est déjà vérifié, sinon au moment où il le devient. Retient
l'**empreinte HMAC** du numéro (`App\Support\PhoneFingerprint`), qui survit à l'anonymisation d'un
compte supprimé : un numéro ne fait pas gagner deux espaces, et changer de numéro ne re-crédite pas
l'espace. Les deux unicités se tiennent par `insertOrIgnore`, jamais par une exception attrapée
(piège n°1). Montant et validité sont des réglages lus à l'octroi (`credits.welcome_amount` 500,
`credits.welcome_validity_days` 180).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| phone_hash | string(64) | | | Unique `credit_welcome_grants_phone_hash_unique` |
| agency_id | FK agencies | oui | null | Unique `credit_welcome_grants_agency_unique` (plusieurs `NULL` admis) — `credit_welcome_grants_agency_fk`, `nullOnDelete` |
| user_id | FK users | oui | null | `credit_welcome_grants_user_fk`, `nullOnDelete` |
| credit_lot_id | FK credit_lots | oui | null | Le lot `welcome` versé — `credit_welcome_grants_lot_fk`, `nullOnDelete` |
| granted_at | timestamp | | | |
| created_at / updated_at | timestamp | | auto | |

**Index :** outre les deux uniques, `credit_welcome_grants_user_idx (user_id)` et
`credit_welcome_grants_lot_idx (credit_lot_id)` (migration `2026_10_14_100100`, TCK-639) — une par
clé `nullOnDelete` ; `agency_id` est servie par son index unique.

**Relations :** aucune déclarée.

---

### 98. AgencyAdminProfile ✅

**Table :** `agency_admin_profiles` (migration `2026_05_10_170000_create_agency_admin_profiles_table`,
TCK-271 ; `agency_role_id` ajouté par `2026_08_16_120200`, rendu NOT NULL par `2026_08_16_120400`,
TCK-279)
**Modèle :** `App\Models\Profiles\AgencyAdminProfile` — `Auditable` (liste blanche `status`,
`agency_role_id`, TCK-601), `HasAgencyRole`, `SoftDeletes`.
**Description :** Profil **administrateur d'agence** d'un user dans une agence donnée — le profil
actif que `ResolveActiveProfile` épingle pour le contexte « admin d'agence ». Volontairement maigre :
il ne porte que le lien à l'agence, un statut et un rôle ; aucune donnée KYC ni financière. Créé par
l'assistant d'hôte individuel (`HostIndividualOnboardingService`, avec un `OwnerProfile` frère), à la
création d'une agence (`AgencyController`), par le provisionnement plateforme
(`AgencyProvisioningService`) et par la gestion des rôles de l'équipe (`AgencyMemberRoleController`).
Écrit avant cette section : présent depuis le 2026-05-10, il n'avait pas de fiche ici (passes 011-012
de `/sync-specs`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | oui | null | Titulaire (`restrictOnDelete`). **Nullable**, par parité avec les profils propriétaire et agent — laissé ouvert pour une invitation de co-administrateur ; plusieurs lignes sans titulaire coexistent par agence (deux `NULL` ne se comparent pas) |
| agency_id | FK agencies | | | Agence administrée (`restrictOnDelete`) |
| agency_role_id | FK agency_roles | | | Rôle d'agence porté par le profil — **NOT NULL** ([Règle 6](#règle-6--1-profil--1-rôle-personnalisé)), FK `agency_admin_profiles_agency_role_fk`, `restrictOnDelete`. Un profil créé sans rôle reçoit le rôle système `agency_admin` de son agence (`HasAgencyRole::bootHasAgencyRole`) |
| status | string — `AgencyAdminProfileStatus` | | 'active' | `active`, `suspended`, `archived`. **`suspended` = adhésion suspendue par l'agence**, pas par la plateforme (`TeamMemberSuspensionService`, capacité `team.suspend`, TCK-587, ADR-0031 §2 ; journal `team_member_suspended` / `team_member_reactivated`) ; seul un admin actif de l'agence suspend un admin, et l'administrateur principal (`agencies.primary_admin_id`) ne se suspend pas (`team.suspension_primary_admin`, 422). **`archived` : aucun code ne le pose** au 2026-10-19 |
| metadata | jsonb | oui | null | |
| deleted_at | timestamp | oui | null | Soft delete |
| created_at / updated_at | timestamp | | auto | |

**Contraintes et index :**
- `(user_id, agency_id)` unique — un user a au plus un profil d'admin par agence
- index `(agency_id, status)` et index `deleted_at`

**Relations :**
- `user()` → belongsTo User
- `agency()` → belongsTo Agency
- `agencyRole()` → belongsTo [AgencyRole](#52-agencyrole--tck-279) (trait `HasAgencyRole`)

**Inverse :**
- `User::agencyAdminProfiles()` → hasMany AgencyAdminProfile (trait `HasProfiles`)
- `AgencyRole::agencyAdminProfiles()` → hasMany AgencyAdminProfile

---

### 99. NotificationPreference ✅

**Table :** `notification_preferences` (migration `2026_04_23_090000_create_notification_preferences_table`, TCK-070)
**Modèle :** `App\Models\NotificationPreference` (`AbstractModel`) — lu par
`App\Services\Notifications\PreferenceResolver`, seul point de décision « envoie-t-on cette
notification sur ce canal ? ».
**Description :** Un interrupteur par triplet *(utilisateur, type d'événement, canal)*. **L'absence de
ligne vaut le défaut** du résolveur (`PreferenceResolver::defaultFor()`) : une installation neuve est
en *opt-out*, pas en *opt-in*. Le résolveur pose aussi des règles qu'aucune ligne ne lève : `inapp`
toujours actif, événements critiques forcés sur `inapp` et `email`, SMS et WhatsApp conditionnés à un
numéro vérifié. Depuis TCK-588, la matrice ne propose que les cases qu'un émetteur sert
(`PreferenceResolver::channelsFor()`) ; une case qu'aucun émetteur ne sert est verrouillée
`channel_unavailable`. Remplace l'[EF3](#ef3--modèle-notificationpreference-préférences-fines) ;
coexiste avec les colonnes globales de `users` (`notifications_*_enabled`, `email_frequency`, §1).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| user_id | FK users | | | `cascadeOnDelete` |
| event_type | string(64) | | | Type d'événement — liste canonique `PreferenceResolver::EVENTS` |
| channel | string(16) | | | Canal — chaîne libre, **sans cast d'enum**, prise dans `PreferenceResolver::CHANNELS` (`inapp`, `email`, `push`, `sms`, `whatsapp`). `updateMany()` n'écrit **jamais** de ligne `inapp` (canal verrouillé) : les valeurs persistées sont `email`, `push`, `sms`, `whatsapp` |
| enabled | boolean | | true | |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `(user_id, event_type, channel)`.

**Relations :** `user()` → belongsTo User ; inverse `User.notificationPreferences()` → hasMany.

> ⚠️ **Écart de vocabulaire, non tranché ici.** Le canal in-app s'écrit `inapp` dans cette table
> (commentaire de la migration, constantes de `PreferenceResolver`) et `app` dans l'enum
> `NotificationChannel` (`app`, `email`, `sms`, `push`, `whatsapp`). Sans effet aujourd'hui : la
> colonne n'est pas castée et aucune ligne `inapp` n'est persistée. Il en aurait un dès qu'un code
> comparerait les deux vocabulaires. Relevé par la passe 011 de `/sync-specs`, à trancher par ticket.

---

### 100. PropertyBoostTranche 🆕

**Table :** `property_boost_tranches` (migration `2026_10_18_210000`, TCK-942)
**Modèle :** `App\Models\PropertyBoostTranche` (`AbstractModel`) — écrit par
`App\Services\Boost\BoostPurchaseService` seul, lu par `BoostLifecycle::refundableCredits()`.
**Description :** Un achat ou une offre d'une Vedette, avec son prix figé et sa durée
([ADR-0061, amendement du 2026-10-18](adr/0061-credits-d-espace-et-boost-des-annonces.md#amendement-du-2026-10-18--le-remboursement-dune-vedette-prolongée-p2405)).
Une Vedette en naît avec une tranche ; une prolongation en ajoute une au rang suivant, et la ligne
[PropertyBoost](#93-propertyboost-) garde le cumul. **Au remboursement, les jours pleins restants
sont pris en partant du dernier rang**, chacun au prix de sa tranche (`prix × jours rendus / durée`,
arrondi à l'entier inférieur) : une tranche offerte ne rend rien. **Reprise** : un boost sans
tranche — Badge, Vedette prolongée avant TCK-942, Vedette convertie par `LegacyFeaturedConversion` —
est sa propre tranche unique, au prix et à la durée de sa ligne ; s'il est prolongé, cette tranche de
reprise est écrite d'abord, et la somme des tranches reste celle de la ligne. Aucune tranche n'est
écrite pour une Remontée ni un Badge, qui ne se prolongent pas.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_boost_id | FK property_boosts | | | `property_boost_tranches_boost_fk`, `cascadeOnDelete` |
| position | unsignedSmallInteger | | | Rang dans l'ordre d'achat, à partir de 1 |
| price_credits | unsignedInteger | | | Prix **figé** de cet achat ; 0 pour une offre |
| duration_days | unsignedSmallInteger | | | Durée de cet achat ou de cette offre |
| offered | boolean | | false | Offerte par le super-admin |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `property_boost_tranches_boost_position_unique (property_boost_id,
position)`, qui sert aussi d'index à la clé étrangère ; CHECK `property_boost_tranches_values_check
(position >= 1 AND price_credits >= 0 AND duration_days > 0)`.

**Relations :** `boost()` → belongsTo PropertyBoost. Inverse : `PropertyBoost::tranches()`.

---

### 101. OwnerStatementSnapshot 🆕

**Table :** `owner_statement_snapshots` (migration `2026_10_25_100000`, TCK-2321)
**Modèle :** aucun — la table se lit et s'écrit par `App\Services\Payout\OwnerStatementSnapshots`
sur le constructeur de requêtes, comme `payout_clawbacks` ([§107](#107-payoutclawback-)). Écrite par
`payouts:send-owner-statements` seul, lue par `OwnerStatementController` (JSON, PDF, CSV).
**Description :** Le relevé de gérance mensuel d'un bailleur dans une agence, **tel qu'il a été
envoyé** : la commande l'écrit quand elle envoie l'avis du mois, et le premier reste
([ADR-0039, amendement du 2026-10-25](adr/0039-les-sorties-d-argent.md#amendement-du-2026-10-25--le-relevé-envoyé-est-conservé)).
Un mois qui a un instantané est servi depuis lui, et ce qui a été écrit depuis se montre en
rectificatif (le calcul du jour, l'écart des totaux, les lignes apparues ou disparues). Sans
instantané — mois envoyé avant cette table, pas encore envoyé, attestation annuelle — le relevé est
le calcul du jour. **Reprise** : aucune ; aucun instantané n'est écrit après coup.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `cascadeOnDelete` |
| landlord_id | FK users | | | Le bailleur, `cascadeOnDelete` ; index `owner_statement_snapshots_landlord_idx` |
| period | string(7) | | | `YYYY-MM` : seul le relevé mensuel est envoyé |
| payload | jsonb | | | Le relevé calculé à l'envoi (`OwnerStatementService::statement`), **sans le nom du bailleur** : l'identité se lit au jour |
| sent_at | timestamp | | | L'envoi de l'avis |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `owner_statement_snapshots_period_unique (agency_id, landlord_id, period)` :
un relevé envoyé par mois, une relance n'écrit rien (`insertOrIgnore`).

---

### 102. AiRoleAssignment 🆕

**Table :** `ai_role_assignments` (migration `2026_10_27_100000`, TCK-2383)
**Modèle :** `App\Models\AiRoleAssignment` (`AbstractModel`) — `role` casté en `AiModelRole`, `chain` en `array`.
**Description :** La chaîne de modèles d'un rôle (`AiModelRole`), réglée depuis la console IA. Sans
ligne, la chaîne vient de `config/ai.php`
([ADR-0076 §2](adr/0076-le-socle-ia.md)).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| role | string(20) | | | `extraction`, `redaction`, `raisonnement`, `vision`, `embedding` — **unique** |
| chain | jsonb | | | Liste ordonnée de `{provider, model, max_tokens}` ; ordre de bascule |
| updated_by_id | FK users | oui | null | Dernier opérateur (`nullOnDelete`) |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique sur `role` (une chaîne par rôle).

### 103. AiUsageSetting 🆕

**Table :** `ai_usage_settings` (migration `2026_10_27_100010`, TCK-2383)
**Modèle :** `App\Models\AiUsageSetting` (`AbstractModel`) — `enabled` en `boolean`, `daily_budget_xof`
en `decimal:2` ; `forcedLink()` rend le maillon imposé quand fournisseur et modèle sont tous deux posés.
**Description :** Réglages d'un usage du socle IA depuis la console : coupe-circuit, modèle forcé,
plafond journalier ([ADR-0076 §4, §5](adr/0076-le-socle-ia.md)). Une table et non un drapeau : le
catalogue `Flag` est fermé, et une clé hors catalogue y vaut faux.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| usage_key | string(80) | | | Clé de l'usage (`AiUsageRegistry`) — **unique** |
| enabled | boolean | | true | Faux : la passerelle refuse (`kill_switch`) |
| forced_provider | string(40) | oui | null | Fournisseur imposé à la place de la chaîne du rôle |
| forced_model | string(80) | oui | null | Modèle imposé ; tarifé (`config('ai.pricing')`) |
| daily_budget_xof | decimal(14,2) | oui | null | Plafond du jour ; null : celui que l'usage déclare |
| updated_by_id | FK users | oui | null | `nullOnDelete` |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique sur `usage_key`.

**Les autres plafonds ne sont pas en base.** Le plafond **global journalier** et le plafond **par
agence** vivent en configuration (`ai.budgets.daily_global_xof`, lu de `AI_DAILY_BUDGET_XOF`, 5 000
XOF par défaut ; `ai.budgets.daily_per_agency_xof`, nul — aucun plafond — au 2026-10-27) et ne se
règlent pas depuis la console, qui affiche le global sans le modifier. `AiBudget` les juge, avec le
plafond de l'usage, sur la somme de `ai_calls.cost_estimate` du jour civil, hors `is_evaluation`.

### 104. AiCall 🆕

**Table :** `ai_calls` (migration `2026_10_27_100020`, TCK-2383)
**Modèle :** `App\Models\AiCall` (`AbstractModel`, `UPDATED_AT = null`) — écrit par `AiGateway` seul ;
`role`, `outcome` et `refusal_reason` castés en enums (`AiModelRole`, `AiCallOutcome`,
`AiRefusalReason`), `cost_estimate` en `decimal:2`, `is_evaluation` en `boolean` ; `stop_reason` reste
une chaîne, sans cast.
**Description :** Journal de chaque passage par `AiGateway` : réussite, cache, bascule, erreur ou
refus ([ADR-0076 §5](adr/0076-le-socle-ia.md)). Aucun contenu envoyé ni reçu n'y est conservé.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| usage_key | string(80) | | | Usage appelant |
| role | string(20) | oui | null | Rôle de l'usage |
| provider / model | string(40) / string(80) | oui | null | Maillon joué (null sur un refus) |
| prompt_version | unsignedSmallInteger | oui | null | Version du prompt chargé |
| input_tokens / output_tokens | unsignedInteger | | 0 | Tokens comptés par le fournisseur |
| cache_read_tokens / cache_write_tokens | unsignedInteger | | 0 | Sous-ensembles de l'entrée |
| cost_estimate | decimal(14,2) | oui | null | Coût en XOF ; null quand le modèle n'a pas de tarif (`warning = model_unpriced`) |
| duration_ms | unsignedInteger | oui | null | Durée de l'appel |
| outcome | string(20) | | | `success`, `cache_hit`, `failed_over`, `error`, `refused`. `failed_over` : maillon en échec basculable, **dernier compris**, ou réponse tronquée ou filtrée — payée (jetons et coût journalisés, donc comptés au budget), hors cache, et la passerelle passe au maillon suivant (TCK-2399). `error` : erreur qui interrompt la chaîne, ou rôle sans chaîne |
| stop_reason | string(20) | oui | null | Raison de fin de la réponse (`FinishReason` du SDK : `stop`, `length`, `content_filter`, `tool_calls`, `error`, `cancelled`, `unknown`, `continue`) ; nulle pour un refus, un cache ou une exception (TCK-2399, `2026_10_27_100050`) |
| refusal_reason | string(30) | oui | null | `forbidden`, `kill_switch`, `budget`, `sensitive_data`, `data_class` |
| error_code | string(80) | oui | null | Code `ai.*` de l'erreur, que le front traduit (`AiErrorCode::fromThrowable`, TCK-2399), jamais un nom de classe ni un message — le nom de la classe reste au journal Laravel. Valeurs : `ai.provider_timeout`, `ai.provider_rate_limited`, `ai.provider_credits`, `ai.provider_unavailable`, `ai.provider_auth`, `ai.request_rejected`, `ai.response_invalid`, `ai.unexpected` ; le code propre d'`AiUnavailable` ou d'`AiRefused` (`ai.refused.<motif>`) ; et ceux de la passerelle : `ai.response_truncated` (`length`), `ai.response_filtered` (`content_filter`), `ai.role_unassigned` (ligne `error` sans maillon) |
| warning | string(40) | oui | null | `model_unpriced` |
| is_evaluation | boolean | | false | Appel de `ai:eval` : hors budget, hors tableau de bord |
| agency_id | FK agencies | oui | null | Agence pour laquelle l'appel agit ; null pour un usage de plateforme (`nullOnDelete`) |
| actor_id | FK users | oui | null | Appelant (`nullOnDelete`) |
| subject_type / subject_id | nullableMorphs | oui | null | Objet concerné ; index `ai_calls_subject_idx` |
| created_at | timestamp | oui | null | Pas d'`updated_at` : une ligne ne change pas |

**Index :** `ai_calls_usage_created_idx (usage_key, created_at)`, `ai_calls_agency_created_idx
(agency_id, created_at)`, `ai_calls_created_idx (created_at)`.

### 105. AiSuggestion 🆕

**Table :** `ai_suggestions` (migration `2026_10_27_100030`, TCK-2384)
**Modèle :** `App\Models\AiSuggestion` (`AbstractModel`) — `proposal`, `final_value` et
`correction_diff` en `array`, `confidence` en `decimal:3`, `decision` en `AiSuggestionDecision`,
`decided_at` en `datetime`.
**Description :** Une proposition de l'IA et la décision humaine qui la suit
([ADR-0076 §7](adr/0076-le-socle-ia.md)). Le taux d'acceptation par usage mesure la qualité en
production ; les corrections deviennent des cas d'évaluation (`ai:export-eval-cases`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| usage_key | string(80) | | | Usage qui a proposé |
| ai_call_id | FK ai_calls | oui | null | Appel d'origine (`nullOnDelete`) |
| subject_type / subject_id | nullableMorphs | oui | null | Objet que la proposition modifierait ; index `ai_suggestions_subject_idx` |
| proposal | jsonb | | | Sortie de l'IA |
| confidence | decimal(4,3) | oui | null | Confiance déclarée |
| input_snapshot | text | oui | null | Contenu soumis à l'IA ; anonymisé à l'export des cas d'évaluation (`EvalCaseExporter`). Effacé, avec `final_value` et `correction_diff` (`proposal` remis à `[]`), quand le Radar purge son sujet (annonce, message, réponse : `RadarPurger`) ; la ligne reste, le taux d'acceptation ne bouge pas (TCK-2391) |
| decision | string(20) | | pending | `pending`, `accepted`, `edited`, `rejected` ; prise une fois |
| decided_by_id | FK users | oui | null | `nullOnDelete` |
| decided_at | timestamp | oui | null | |
| final_value | jsonb | oui | null | Valeur retenue |
| correction_diff | jsonb | oui | null | `{champ: {from, to}}` entre proposition et valeur retenue |
| created_at / updated_at | timestamp | | auto | |

**Index :** `ai_suggestions_usage_decision_idx (usage_key, decision)` — le taux d'acceptation par usage.

### 106. AiEvaluationRun 🆕

**Table :** `ai_evaluation_runs` (migration `2026_10_27_100040`, TCK-2385)
**Modèle :** `App\Models\AiEvaluationRun` (`AbstractModel`) — `role` en `AiModelRole`, `status` en
`AiEvaluationStatus`, `candidate` et `report` en `array`, `below_baseline` en `boolean`, `started_at`
et `finished_at` en `datetime`. Écrite par `App\Jobs\Ai\RunAiEvaluation` ; lue par la console IA
(`AiEvaluationController`) et par `latestFor(role, maillon)`, la dernière évaluation **terminée** d'un
maillon.
**Description :** L'évaluation d'un modèle candidat pour un rôle, lancée depuis la console avant de
l'affecter ([ADR-0076 §8](adr/0076-le-socle-ia.md)). Son verdict commande le cliquet de l'affectation.

**Cycle de vie :** `queued` → `running` (départ atomique du job, `started_at` posé) → `done` ou
`failed`. Toute écriture d'état est conditionnelle à l'état attendu : un état terminal n'est jamais
réécrit. Une évaluation **orpheline** (worker mort) se lit `failed` avec
`error_code = ai.eval.job_lost` : `isStale()` la détecte (`running` depuis plus de
`STALE_AFTER_SECONDS` = délai du job + 300 s ; `queued` depuis plus de `QUEUED_STALE_AFTER_SECONDS` =
86 400 s) et `markLostIfStale()` l'écrit, par une mise à jour conditionnelle à l'état lu, à la
lecture (`show`) et avant de refuser un doublon (409 `ai.eval.already_running`). Un job tué ou
relivré échoue par `failed()` : `ai.eval.job_failed` quand aucune exception n'est connue, sinon le
code `ai.*` de l'exception (`AiErrorCode`, TCK-2399).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| role | string(20) | | | Rôle évalué |
| candidate | jsonb | | | `{provider, model, max_tokens}` |
| status | string(20) | | queued | `queued`, `running`, `done`, `failed` |
| report | jsonb | oui | null | `{usages: {<clé>: rapport + baseline + verdict + below_baseline}}` ; `verdict` : `ai.eval.failures`, `ai.eval.baseline_stale`, `ai.eval.below_baseline`, ou null quand l'usage passe |
| below_baseline | boolean | oui | null | Vrai si un usage du rôle a un verdict (sous sa référence, appels en échec, ou référence périmée) |
| error_code | string(80) | oui | null | Sur `failed` : `ai.eval.job_lost`, `ai.eval.job_failed`, ou le code `ai.*` de l'erreur (`AiErrorCode`, comme `ai_calls.error_code`, TCK-2399) |
| requested_by_id | FK users | oui | null | `nullOnDelete` |
| started_at | timestamp | oui | null | Départ du job ; sert à `isStale()` |
| finished_at | timestamp | oui | null | |
| created_at / updated_at | timestamp | | auto | |

**Index :** `ai_eval_runs_role_status_idx (role, status)`.

### 107. PayoutClawback 🆕

**Tables :** `payout_clawbacks` et `payout_clawback_imputations` (migration `2026_10_24_050000`,
TCK-2151, [ADR-0039, amendement du 2026-10-24](adr/0039-les-sorties-d-argent.md), point 2)
**Modèle :** aucun — les deux tables se lisent et s'écrivent par `App\Services\Payout\PayoutClawbacks`
sur le constructeur de requêtes, comme [§101](#101-ownerstatementsnapshot-).
**Description :** La **reprise au bailleur**. Un remboursement d'une pièce portée par un reversement
au bailleur `completed` crée une reprise au **net de commission** (`R − arrondi(R × taux / 100)`, au
taux de la copie du pivot, [§28](#28-payout-)), datée du remboursement (`recordRefund`, appelé par le
geste déclaré et par le webhook, quel que soit l'encaisseur). Elle s'impute au **reversement suivant
du même bailleur dans la même agence**, à sa création (`PayoutService::createLocked`), de la plus
ancienne à la plus récente et jusqu'au net avant reprise ; le **reliquat** passe au suivant. Un
reversement `cancelled` ou `failed` rend ses imputations (`release()`). Pas de reprise pour une pièce
jamais reversée, pour un reversement pas encore `completed`, ni pour un pivot sans copie (antérieur à
TCK-2017). **Reprise de données** : aucune.

`payout_clawbacks` :

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `cascadeOnDelete` |
| landlord_id | FK users | | | Le bailleur qui doit la reprise, `cascadeOnDelete` |
| refunded_payment_type / refunded_payment_id | nullableMorphs | oui | null | La pièce remboursée ; index `payout_clawbacks_refunded_payment_idx` |
| part | string(20) | | 'payment' | Part reprise ; seule valeur écrite au 2026-10-27 : `payment` |
| source_payout_id | FK payouts | | | Le reversement `completed` qui avait porté la pièce, `cascadeOnDelete` ; index `payout_clawbacks_source_payout_idx` |
| refund_amount | decimal(14,2) | | | Base : la part neuve du remboursement, plafonnée à ce que le reversement a pris de la pièce moins les reprises précédentes |
| commission_rate | decimal(5,2) | | | Taux de la copie du pivot |
| commission_amount | decimal(14,2) | | | Commission rendue par l'agence |
| amount | decimal(14,2) | | | La reprise, nette de commission |
| currency | string(3) | | | |
| refunded_at | timestamp | | | Instant du remboursement : la date de la reprise au relevé (`datedIn()`) |
| settled_amount | decimal(14,2) | oui | null | Reste dû figé au solde à la main |
| settled_at | timestamp | oui | null | Solde à la main ; non nulle, la reprise n'est plus imputée (`outstanding()`) |
| settled_by_id | FK users | oui | null | `nullOnDelete` |
| settlement_note | text | oui | null | Référence du règlement reçu hors reversement, ou motif |
| created_at / updated_at | timestamp | | auto | |

⚠ **Le solde à la main est décidé (ADR-0039, point 2.9), pas livré** : au 2026-10-27, aucun code
n'écrit `settled_amount`, `settled_at`, `settled_by_id` ni `settlement_note`, et aucune route ne les
expose. `outstanding()` les lit déjà.

**Index :** `payout_clawbacks_agency_landlord_idx (agency_id, landlord_id)`,
`payout_clawbacks_source_payout_idx (source_payout_id)`, `payout_clawbacks_refunded_payment_idx`.

`payout_clawback_imputations` — une reprise se reporte sur plusieurs reversements :

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| payout_id | FK payouts | | | Reversement qui impute, `cascadeOnDelete` |
| payout_clawback_id | FK payout_clawbacks | | | `cascadeOnDelete` ; index `payout_clawback_imputations_clawback_idx` |
| amount | decimal(14,2) | | | Part de la reprise imputée à ce reversement |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `payout_clawback_imputations_pair_unique (payout_id, payout_clawback_id)`.
Le **reste dû** d'une reprise vaut `amount − imputations des reversements qui gardent leurs pièces −
settled_amount`.

### 108. RadarAdvertiser 🆕

**Table :** `radar_advertisers` (migration `2026_10_27_200000`, TCK-2386 ; `2026_10_28_100000`, TCK-2388 ;
`2026_10_30_100000`, TCK-2394)
**Modèle :** `App\Models\RadarAdvertiser` (`AbstractModel`) — `nature` casté en `RadarAdvertiserNature`,
`nature_signals` en `array`, `do_not_contact_at`, `claimed_at` et `claim_expires_at` en `datetime` ;
`activation_reminded_at` et `mandate_at` en `datetime`, `activation_reminder_count` en `integer`,
`activation_baseline` en `array` (TCK-2394) ;
`hasMany listings`, `outreaches`, `consents`, `belongsTo user`, `claimer` (colonne `claimed_by_id`).
Tri `sort=listings_count` (TCK-2393, `App\Sorts\RadarAdvertiserListingsSort`) : le nombre d'annonces vivantes (ni
`purged`, ni `duplicate_of_listing_id`), en sous-requête corrélée — le volume du classement de l'observatoire.
**Description :** L'annonceur d'une ou plusieurs annonces collectées, identifié par son numéro de
téléphone ([ADR-0077 §1, §7, §9](adr/0077-le-radar.md)). Sa nature présumée et ses indices restent
ici, jamais dans les profils. Après un STOP, `phone_hmac` — l'empreinte à clé du numéro
(`App\Support\RadarPhone::hmac`) — reste : sans elle le Radar le retrouverait sur une prochaine
annonce et le recontacterait. La clé de l'empreinte ne tourne qu'en gardant l'ancienne dans
`RADAR_PHONE_HMAC_PREVIOUS_KEYS` : le numéro d'un refus étant purgé, son empreinte ne se recalcule pas
(TCK-2414, [ADR-0082](adr/0082-l-empreinte-des-refus-du-radar-a-sa-propre-cle.md)).

**Révocation et purge (TCK-2391, ADR-0077 §8, §9).** La révocation (`App\Services\Radar\AdvertiserRevocation::apply()`,
partagée par le STOP d'un message et par le geste de l'opérateur, `POST /api/admin/radar/advertisers/{id}/revoke`)
pose `do_not_contact_at` (la première date reste), ferme les annonces ouvertes, révoque les accords valides, retire
du public les biens publiés par le Radar et met la purge en file après le commit (`PurgeRadarAdvertiser`). Elle
laisse le compte lié (`user_id`). Un annonceur sans annonce restante (`RadarPurger`) perd `phone`, `display_name` et
ses indices (`nature` remise à `unknown`, `nature_signals` à `[]`) ; sa ligne est supprimée s'il n'a ni refus, ni
message, ni accord, ni compte lié. Un annonceur purgé sans refus qui revient récupère son numéro
(`RadarAdvertiserDirectory::restorePhone()`) ; celui qui a dit STOP, jamais.

**Nature (TCK-2388, décision 3 du porteur, 2026-10-28).** À la validation d'une annonce
(`RadarListingReview::review()`), si l'opérateur a corrigé `extracted.advertiser_nature` (marque
`corrected`), la valeur devient `radar_advertisers.nature` : la dernière relecture humaine l'emporte.
Les indices de l'IA (`nature_signals`) restent.

**Relance d'activation et mandat (TCK-2394, [ADR-0079](adr/0079-la-publication-sous-mandat-takussan.md)).**
Écrits par `forceFill` dans `RadarActivationReminders::markSent()` et `RadarPublisher::publishUnderMandate()`
seuls. Un bien publié sous mandat porte `metadata.radar_mandate = true` et naît dans l'espace désigné par le
réglage `radar.mandate_agency_id`, auteur son administrateur principal.

**Compte délié (TCK-2413).** `AdvertiserAccountRelease` (`POST /api/admin/radar/advertisers/{id}/release-account`,
`super_admin`) remet `user_id` à null quand le compte lié est supprimé, sous le verrou de l'annonceur, et
journalise `radar_account_released` (`previous_user_id`, motif facultatif). Refusé (409) sur un annonceur révoqué
(`radar.advertiser.do_not_contact`) ou sans compte supprimé (`radar.advertiser.account_not_deleted`). La liste
`filter[queue]=left_to_operator` rend les annonceurs non révoqués (`do_not_contact_at` nul) dont une annonce
`consented` porte une raison laissée par la publication de la réclamation, avec `left_purge_at`, l'échéance de purge de la première d'entre elles (calculée,
pas une colonne).

**Prise en charge (TCK-2388, ADR-0077 §11, modèle d'[ADR-0043 §7](adr/0043-avis-cible-eligibilite-moderation-et-verrou-plateforme.md)).**
Trois colonnes sur la ligne : elle est le point de sérialisation de tout geste de démarchage, sans table
de plus. Écrites par `forceFill` dans `AdvertiserClaim` seul : hors de `$fillable`, hors de
`$queryFields` (la ressource rend un objet `claim` calculé).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| phone | string(20) | oui | null | Numéro E.164 (`+221…`) ; **unique** ; null quand l'annonceur n'a plus d'annonce (purge, TCK-2391) ; l'HMAC reste. Rendu si l'annonceur revient sans refus |
| phone_hmac | string(64) | | | HMAC-SHA256 du numéro E.164 sous `RADAR_PHONE_HMAC_KEY` (vide : clé dérivée d'`APP_KEY`) ; **unique** ; seule trace d'un refus. Reconnue aussi sous les anciennes clés (`RADAR_PHONE_HMAC_PREVIOUS_KEYS`, repli `APP_PREVIOUS_KEYS`) et réécrite sous la clé courante quand le numéro revient ou par `radar:rehash-phones` (TCK-2414) |
| display_name | string(120) | oui | null | Nom lu dans l'annonce |
| nature | string(30) | | unknown | `probable_owner`, `probable_intermediary`, `agency`, `unknown` |
| nature_signals | jsonb | | `[]` | Indices de la nature |
| do_not_contact_at | timestamp | oui | null | « Ne plus contacter » : définitif |
| user_id | FK users | oui | null | Compte lié une fois réclamé ou publié (`nullOnDelete`) ; indexée. Remis à null quand un `super_admin` délie un compte supprimé (TCK-2413) |
| claimed_by_id | FK users | oui | null | TCK-2388 : l'opérateur qui tient la prise en charge (`nullOnDelete`, `radar_advertisers_claimed_by_fk`) ; indexée |
| claimed_at | timestamp | oui | null | TCK-2388 : début de la prise en charge |
| claim_expires_at | timestamp | oui | null | TCK-2388 : fin de la prise en charge — 10 minutes, renouvelées par chaque écriture (`AdvertiserClaim::DURATION_MINUTES`) ; passée, la prise en charge est libre |
| activation_reminded_at | timestamp | oui | null | TCK-2394 : dernière relance d'activation marquée envoyée ; début de la période suivante |
| activation_reminder_count | smallint | | 0 | TCK-2394 : relances d'activation envoyées |
| activation_baseline | jsonb | oui | null | TCK-2394 : `{bien: views_count}` au dernier envoi — les vues de la période suivante la dépassent |
| mandate_at | timestamp | oui | null | TCK-2394 (ADR-0079) : première publication sous mandat ; la première date reste |
| mandate_by_id | FK users | oui | null | TCK-2394 : l'opérateur de la première publication sous mandat (`nullOnDelete`, `radar_advertisers_mandate_by_fk`, index `radar_advertisers_mandate_by_idx`) |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** uniques `radar_advertisers_phone_unique (phone)` et `radar_advertisers_phone_hmac_unique (phone_hmac)`.

### 109. RadarListing 🆕

**Table :** `radar_listings` (migration `2026_10_27_200100`, TCK-2386 ; `2026_10_27_210000` et
`2026_10_27_210100`, TCK-2387 ; `2026_10_30_392200`, TCK-2392 ; `2026_10_30_393000`, TCK-2393 ;
`2026_10_30_394320`, TCK-2432)
**Modèle :** `App\Models\RadarListing` (`AbstractModel`, `HasMedia`) — `stage` casté en `RadarListingStage`,
`extracted`, `photo_urls`, `matches`, `source_photo_hashes` et `photo_preparation` en `array`, `extracted_at` et `purge_at` en
`datetime` ; `merged_at` et `merge_checked_at` en `datetime`, `discovered_by_run_id` en `integer` (TCK-2392) ;
`source_gone_at` en `datetime`, `source_gone_run_id` en `integer` (TCK-2393) ; `availability_asked_at`,
`availability_answered_at` et `withdrawal_proposed_at` en `datetime`, `availability_answered_by_id` en `integer`
(TCK-2432) ; `belongsTo advertiser`, `capturer` (colonne `captured_by`), `property`, `duplicateOfListing`
(colonne `duplicate_of_listing_id`), `duplicateOfProperty` (colonne `duplicate_of_property_id`), `discoveredBy`
(colonne `discovered_by_run_id`) ; `hasMany snapshots`, `duplicates` (colonne `duplicate_of_listing_id`) (TCK-2392).
`purge_at` est posé à la création : collecte + 90 jours (`config('radar.purge_after_days')`).
`photoFingerprintStatus()` rend `{status: none|pending|done, total, done}` (total borné par
`config('radar.photos.max_per_listing')`). `photoPreparationStatus()` rend la même forme pour la réserve
de photos (TCK-2389).
**Description :** Une annonce collectée hors du catalogue ([ADR-0077 §1, §9](adr/0077-le-radar.md)).
Elle ne devient un bien que sur l'accord prouvé de son annonceur : `properties` ne reçoit aucune
colonne, c'est `property_id` qui pointe vers le bien publié. Avant l'accord confirmé, aucune photo
n'est conservée : seules les URL source sont gardées. Les captures d'écran vivent dans la collection
média `radar_captures`, et la **réserve de photos** préparée pour la publication (téléchargées après
l'accord confirmé, ou déposées par l'opérateur, TCK-2389) dans `radar_photos` ; les deux sur le disque
**privé** par défaut (ADR-0029). La publication copie `radar_photos` dans la collection `photos` du
bien ; la réserve d'une annonce jamais publiée est purgée avec elle (`RadarPurger`, TCK-2391). Une annonce
publiée (`published` ou `property_id` posé) n'est purgée qu'avec la dernière preuve qui la couvre, drapeau
`radar.purge_published_material` allumé (éteint par défaut, TCK-2406). Les photos copiées par la publication
(propriété `publication_copy` du média) se rangent sous `publications/{id}/` (`RadarCopyPathGenerator`, inscrit pour
`Property` dans `media-library.custom_path_generators`) ; ce préfixe est porteur : `RadarOrphanFiles` y balaie les
copies sans ligne `media` de plus d'une heure (TCK-2406). Toute purge supprime les instantanés de l'annonce
(`radar_listing_snapshots`) et vide `discovered_by_run_id` (TCK-2392, [ADR-0080 § 4](adr/0080-la-collecte-automatique-du-radar.md)).

**Disparition de la source (TCK-2393, [ADR-0083](adr/0083-l-observatoire-du-marche.md)).** `radar:observe-sources`
(`RadarSourceWatch`, toutes les 15 minutes) pose `source_gone_at` quand `radar.observe.confirm_runs` (2) passages
`finished` à `reached_end` de son site ont commencé après sa dernière présence (`max(last_seen_at)` de ses
instantanés), daté du passage qui confirme ; une annonce sans instantané, ou que la collecte ne suit plus (purgée,
`do_not_contact`, annonceur STOP), n'est jamais jugée. Une disparition rattachée à un bien (`property_id`, celui de
`duplicate_of_listing_id`, ou `duplicate_of_property_id`) écrit l'activité `radar_source_listing_gone` (journal
`Radar`, alertable) une fois par disparition ; son sujet est l'annonce collectée et le bien est dans
`properties.property_id` — aucune agence ne la lit.

**Question au titulaire (TCK-2432, ADR-0083 amendé).** Quand la disparition emporte la dernière source en ligne d'un
bien que le Radar a publié, encore en vitrine, `RadarAvailabilityCheck::ask()` pose `availability_asked_at` (une fois
par disparition) et notifie le titulaire (`property.source_listing_gone`) ; elle pose la colonne **sans notifier**
quand une question est déjà ouverte sur le bien (pour une autre de ses sources : la réponse vaudra pour les deux) ou
que le bien n'a pas de titulaire ; la réponse
(`POST /api/properties/{property}/availability-check`) écrit `availability_answer` et l'activité
`radar_availability_answered`. Sans réponse après `radar.observe.owner_answer_days` (7) jours,
`withdrawal_proposed_at` est posé et l'événement alertable `radar_withdrawal_proposed` part ; il se pose aussi **sans
proposition** quand le bien a été supprimé ou n'est plus en vitrine, pour que la question ne soit plus relue. Le retour de l'annonce
remet les cinq colonnes à null, avec `source_gone_at`.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| radar_advertiser_id | FK radar_advertisers | oui | null | `nullOnDelete` ; indexée |
| source_kind | string(20) | | | `url`, `text`, `captures` (`RadarSourceKind`) |
| source_site | string(30) | | | `coinafrique`, `expat_dakar`, `facebook`, `whatsapp`, `other` (`RadarSourceSite::fromHost`) |
| source_url | text | oui | null | URL collectée |
| raw_text | text | oui | null | Texte brut ; effacé à `purge_at` (collecte + 90 jours) ou dès un STOP, tant que l'annonce n'est pas publiée (`RadarPurger`, TCK-2391) |
| photo_urls | jsonb | | `[]` | URL source des photos ; téléchargées seulement après l'accord confirmé, dans `radar_photos` (TCK-2389) |
| content_fingerprint | string(64) | | | Empreinte du contenu ; **unique** : une annonce n'entre qu'une fois |
| extracted | jsonb | oui | null | Sortie normalisée de l'extraction : un champ = `{value, confidence, evidence, flags}`, plus `phones`, `phones_flags`, `nature_signals` et `phones_dropped` (les numéros écartés, gardés à part ; effacés avec `extracted` par la purge, TCK-2391). Une valeur corrigée par l'opérateur porte la marque `corrected` |
| matches | jsonb | | `[]` | Rapprochements avec le catalogue |
| stage | string(30) | | | `captured`, `extracted`, `reviewed`, `contacted`, `consented`, `published`, `extraction_failed`, `duplicate`, `discarded`, `refused`, `do_not_contact`, `purged` ; indexée. `purged` : écrit par `RadarPurger` (TCK-2391) — `raw_text`, `source_url`, `extracted` et `photo_preparation` à null, `photo_urls` à `[]`, médias supprimés ; restent le site d'origine, les dates, `content_fingerprint`, `source_photo_hashes` et `matches` ; aussi, drapeau `radar.purge_published_material` allumé, une annonce publiée dont la dernière preuve est effacée et le bien hors ligne (`property_id` conservé, TCK-2406). `discarded` : écartée par l'opérateur (TCK-2387), distincte de `refused` (issue d'un démarchage) |
| stage_reason | string(60) | oui | null | Code du motif de l'état, jamais de prose ; pour `discarded`, `radar.discard.<motif>` (`RadarDiscardReason` : `not_real_estate`, `out_of_scope`, `no_longer_available`, `unusable_source`, `other`) ; pour une fusion automatique (`duplicate`), `radar.merge.auto` (TCK-2392) ; sur une annonce `consented`, la raison laissée par la publication de la réclamation (`PublishClaimedRadarListings` : `radar.publish.no_photo`, `radar.publish.missing_field`, le code d'un refus, `radar.claim.publish_failed`…), écrite par une mise à jour conditionnelle `stage = consented` (TCK-2413) |
| extraction_attempts | smallint | | 0 | Passages de l'extraction |
| extracted_at | timestamp | oui | null | |
| property_id | FK properties | oui | null | Bien publié (`nullOnDelete`) ; indexée |
| captured_by | FK users | oui | null | Opérateur qui a saisi l'annonce (`nullOnDelete`) ; indexée |
| purge_at | timestamp | oui | null | Collecte + 90 jours ; indexée |
| source_photo_hashes | jsonb | oui | null | TCK-2387 (ADR-0054) : l'empreinte dHash des photos source, calculées à la volée, jamais conservées. `null` : jamais calculé ; `[]` : calculé, aucune photo. Un élément par URL tentée : `{url, hash: int\|null, b0, b1, b2, b3}` ou `{url, hash: null, error}`. Index GIN `jsonb_path_ops` (recherche par bande) |
| photo_preparation | jsonb | oui | null | TCK-2389 : la réserve de photos téléchargée après l'accord confirmé. `null` : jamais préparée ; `[]` : préparée, aucune URL. Un élément par URL tentée, dans l'ordre de `photo_urls` : `{url, media_id}` ou `{url, media_id: null, error}` |
| duplicate_of_listing_id | FK radar_listings | oui | null | TCK-2387 : l'annonce dont celle-ci est le doublon (`nullOnDelete`) ; indexée |
| duplicate_of_property_id | FK properties | oui | null | TCK-2387 : le bien du catalogue dont celle-ci est le doublon (`nullOnDelete`) ; indexée |
| discovered_by_run_id | FK radar_crawl_runs | oui | null | TCK-2392 : le passage de collecte qui a trouvé l'annonce (`nullOnDelete`, `radar_listings_run_fk`) ; null pour une saisie d'opérateur, et vidée par la purge ; index `radar_listings_run_idx` |
| merged_at | timestamp | oui | null | TCK-2392 : l'instant d'une fusion **automatique** (`stage = duplicate`, `stage_reason = radar.merge.auto`) ; null pour un doublon posé à la main. `POST /api/admin/radar/listings/{id}/unmerge` ne sépare que celles-là |
| merge_checked_at | timestamp | oui | null | TCK-2392 : la fusion automatique a jugé l'annonce ; jamais rejugée, même séparée |
| similarity_text | text | oui | null | TCK-2392 : le texte que compare le signal `text` — description extraite (≥ 60 caractères), sinon texte brut ; replié, **sans aucun chiffre**, 1 000 caractères au plus, null sous 60. Recalculé à chaque changement de `extracted` ou `raw_text` : la purge le vide ; `radar:backfill-similarity` le calcule pour les annonces antérieures. Index GIN `radar_listings_similarity_trgm` (`gin_trgm_ops`, extension `pg_trgm`, créée par la migration) |
| source_gone_at | timestamp | oui | null | TCK-2393 : la fin du passage qui a confirmé la disparition de la source (ci-dessus) ; remise à null quand un passage postérieur la revoit ; anonyme ; index `radar_listings_source_gone_at_idx` |
| source_gone_run_id | FK radar_crawl_runs | oui | null | TCK-2393 : ce passage (`nullOnDelete`, `radar_listings_gone_run_fk`) ; index `radar_listings_gone_run_idx` |
| availability_asked_at | timestamp | oui | null | TCK-2432 : la question au titulaire est posée pour la disparition en cours ; index `radar_listings_avail_asked_at_idx` |
| availability_answer | string(16) | oui | null | TCK-2432 : `rented`, `sold`, `available` (`RadarAvailabilityCheck::ANSWERS`) |
| availability_answered_at | timestamp | oui | null | TCK-2432 |
| availability_answered_by_id | FK users | oui | null | TCK-2432 : qui a répondu (`nullOnDelete`, `radar_listings_avail_answered_by_fk`) ; index `radar_listings_avail_answered_by_idx` |
| withdrawal_proposed_at | timestamp | oui | null | TCK-2432 : la proposition de retrait faite à l'équipe |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `radar_listings_fingerprint_unique (content_fingerprint)` ; CHECK
`radar_listings_dup_one_chk` : `duplicate_of_listing_id` et `duplicate_of_property_id` ne sont jamais posées ensemble.

### 110. RadarOutreach 🆕

**Tables :** `radar_outreaches` (migration `2026_10_28_100100`, TCK-2388 ; `2026_10_30_120500`, TCK-2395) et sa
table de liaison `radar_outreach_listing` (`2026_10_28_100200`)
**Modèle :** `App\Models\RadarOutreach` (`AbstractModel`) — `channel` casté en `RadarOutreachChannel`,
`outcome` en `RadarOutreachOutcome`, `sent_at` et `outcome_at` en `datetime`, `follow_up_rank` en `integer` ;
`belongsTo advertiser`, `followUpOf` (colonne `follow_up_of_id`), `creator` (`created_by_id`), `sender`
(`sent_by_id`), `outcomeBy` (`outcome_by_id`) ; `belongsToMany listings` (table `radar_outreach_listing`, sans horodatage) ; `hasMany consents` ;
`hasOne followUp` (sur `follow_up_of_id`). `isSent()` ; `latestReply()` rend la dernière `RadarConsent`.
**Description :** Un message de démarchage à un annonceur ([ADR-0077 §3, §4](adr/0077-le-radar.md)) : le texte
**exact** du lien `wa.me` (`message`, la concaténation des segments de `ConsentMessageComposer`, rien d'autre
ne l'écrit), la version des clauses qu'il a employée, son envoi, son issue et sa chaîne de relances. Un message
couvre une ou plusieurs annonces ; un accord confirmé les couvre toutes. Une relance est un nouveau message sur
les mêmes annonces (`follow_up_of_id`, `follow_up_rank`) : la chaîne est une liste, jamais un arbre.

**Envoi par l'API (TCK-2395, [ADR-0081](adr/0081-le-radar-prospecte-par-l-api-whatsapp-sur-son-propre-numero.md)).**
`POST /api/admin/radar/outreaches/{id}/send` (`RadarWhatsappOutreach`) envoie le gabarit approuvé depuis le numéro
du Radar (`config/radar_whatsapp.php`), sous les verrous de `markSent`, et écrit `channel = whatsapp_cloud`,
`provider_message_id` et `provider_status`. Un refus franc de Meta n'écrit rien (502 `radar.whatsapp.send_failed`) ;
un délai, un 5xx ou une écriture défaite après l'envoi marquent le message envoyé, `ambiguous`, pour ne jamais
écrire deux fois. Les accusés du webhook (`RadarWhatsappReceipts`, TCK-2427) font avancer `provider_status` des seuls
messages `whatsapp_cloud` envoyés, appariés par `provider_message_id` ; ils ne touchent ni `sent_at`, ni l'issue.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| radar_advertiser_id | FK radar_advertisers | | | `restrictOnDelete` : une preuve d'accord ne disparaît pas avec son annonceur ; indexée |
| channel | string(30) | | whatsapp_manual | `whatsapp_manual`, `whatsapp_cloud` (envoyé par l'API, TCK-2395) (`RadarOutreachChannel`) |
| locale | string(5) | | | Langue du message : `fr` ou `en` (pas de `wo`, décision 5) |
| clauses_version | string(30) | | | Version des clauses employée (`accord.v1`, `accord.v2` depuis TCK-2390 : la ligne du lien de réclamation ; `accord.v3`, courante depuis TCK-2395 : l'ouverture « Takussan — » du gabarit Meta) : chaque message garde la sienne |
| salutation | text | | | La partie écrite par l'IA, retouchable ; ramenée à une ligne |
| summary | text | | | Idem pour le résumé des annonces |
| message | text | | | Le texte EXACT du paramètre `text` du lien `wa.me` |
| follow_up_of_id | FK radar_outreaches | oui | null | Le message dont celui-ci est la relance (`nullOnDelete`) ; **unique** |
| follow_up_rank | smallint | | 0 | 0 : message initial ; 1, 2… : la relance (bornée par `config('radar.follow_ups.max')`) |
| created_by_id | FK users | oui | null | Opérateur qui a préparé le message (`nullOnDelete`) ; indexée |
| sent_at | timestamp | oui | null | Posé à la confirmation d'envoi ; null : préparé, jamais envoyé |
| sent_by_id | FK users | oui | null | Opérateur qui a confirmé l'envoi (`nullOnDelete`) ; indexée |
| outcome | string(20) | oui | null | `consented`, `refused`, `stop`, `question`, `no_answer` (`RadarOutreachOutcome::isFinal()` : vrai pour les trois premiers) |
| outcome_at | timestamp | oui | null | |
| outcome_by_id | FK users | oui | null | Opérateur qui a tranché l'issue (`nullOnDelete`) ; indexée. Nul aussi pour un STOP reçu par l'API, appliqué sans auteur (TCK-2395) |
| provider_message_id | string(120) | oui | null | TCK-2395 : identifiant du message chez Meta (`wamid`) ; unique partiel. Un envoi `ambiguous` sans identifiant n'en reçoit jamais par ses accusés : un accusé d'identifiant inconnu est ignoré (TCK-2427) |
| provider_status | string(20) | oui | null | TCK-2395 : `accepted` (Meta a rendu un identifiant) ou `ambiguous` (délai, 5xx, ou écriture défaite après l'envoi : marqué envoyé pour ne jamais écrire deux fois) ; puis, par les accusés du webhook, `sent`, `delivered`, `read` ou `failed`, sans jamais reculer (`failed` ne suit ni `delivered` ni `read`) (TCK-2427) |
| created_at / updated_at | timestamp | | auto | |

**`radar_outreach_listing`** (sans `id` ni horodatage) : clé primaire composite
`radar_outreach_listing_pk (radar_outreach_id, radar_listing_id)` ; `radar_outreach_id` FK
`radar_outreaches` en `cascadeOnDelete` (un message préparé puis remplacé s'efface avec ses lignes) ;
`radar_listing_id` FK `radar_listings` en `restrictOnDelete` (une annonce ne s'efface jamais : la purge vide
ses champs, TCK-2391), indexée.

**Contraintes :** unique `radar_outreaches_follow_up_unique (follow_up_of_id)` : une relance au plus par
message. Unique partiel `radar_outreaches_provider_message_unique (provider_message_id) WHERE provider_message_id IS
NOT NULL` (TCK-2395). Index partiel `radar_outreaches_awaiting_idx (sent_at) WHERE outcome IS NULL AND sent_at IS NOT NULL` :
la file « à relancer ».

### 111. RadarConsent 🆕

**Table :** `radar_consents` (migration `2026_10_28_100300`, TCK-2388 ; `2026_10_29_200000`, TCK-2391 ;
`2026_10_30_120500`, TCK-2395)
**Modèle :** `App\Models\RadarConsent` (`AbstractModel`, `HasMedia`) — `proof` casté en `RadarConsentProof`,
`verification_status` en `RadarVerificationStatus`, `capture_hashes` et `ai_verdict` en `array`,
`confirmed_at`, `revoked_at`, `offline_since` et `purged_at` en `datetime` ; `belongsTo outreach`, `advertiser`, `depositor`
(`deposited_by_id`), `confirmer` (`confirmed_by_id`). `scopeValid()` : `confirmed_at` non nul et `revoked_at`
nul. `confirmed_by_id` et `confirmed_at` hors de `$fillable` : posés par `forceFill`, par le seul `RadarConsentWorkflow::recordOutcome()`. Collection média `radar_consent_captures`, sur le disque **privé** par défaut (ADR-0029).
**Description :** Une réponse d'annonceur déposée sur un message ([ADR-0077 §3](adr/0077-le-radar.md)) : la
preuve (captures d'écran et leurs SHA-256), sa transcription, le verdict de l'IA et la confirmation humaine.
**Un verdict de l'IA n'ouvre rien** : un accord n'est valide qu'une fois confirmé par une personne
(`confirmed_by_id` et `confirmed_at`, posés ensemble par `RadarConsentWorkflow::recordOutcome()` et par lui
seul) et tant qu'il n'est pas révoqué. `valid()` est LA définition ; `RadarConsentCoverage` la lit.

**Rétention (TCK-2391, `privacy.ts` § 6).** Un accord confirmé est conservé tant qu'une annonce qu'il couvre est en
ligne (publiée sur un bien public) ou attend sa publication (`consented`), puis trois ans
(`radar.consent_retention_years`) à compter du dernier retrait. Une réponse non confirmée est effacée avec l'annonce.
`offline_since` et `purged_at` hors de `$fillable` : posés par `RadarPurger` seul.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| radar_outreach_id | FK radar_outreaches | | | `restrictOnDelete` ; indexée |
| radar_advertiser_id | FK radar_advertisers | | | `restrictOnDelete` ; dénormalisé : « les accords de l'annonceur » (fiche, TCK-2389) sans passer par les messages ; indexée |
| proof | string(30) | | | `screenshot`, `provider_message` (TCK-2395), `otp` (TCK-2390) (`RadarConsentProof`) |
| capture_hashes | jsonb | | `[]` | SHA-256 des originaux des captures (aussi en propriété du média) |
| provider_message_id | string(120) | oui | null | Identifiant du message reçu par l'API du fournisseur (TCK-2395) ; unique partiel |
| transcript | text | oui | null | Transcription de la réponse par l'IA ; pour une réponse reçue par l'API, le texte reçu (`Annonceur : …`), ou `Annonceur : [type]` pour un vocal ou une image (TCK-2395) |
| ai_verdict | jsonb | oui | null | Verdict de la vérification (numéro, clauses, classement de la réponse), relu par `RadarConsentVerdict` |
| verification_status | string(20) | | pending | `pending`, `done`, `failed` (`RadarVerificationStatus`) |
| verification_reason | string(60) | oui | null | Code du motif d'un échec de vérification, jamais de prose ; `radar.verification.purged` quand la purge efface une réponse encore `pending` (TCK-2391) ; `radar.verification.no_text` pour une réponse reçue par l'API sans texte (TCK-2395) |
| deposited_by_id | FK users | oui | null | Opérateur qui a déposé la réponse (`nullOnDelete`) ; indexée |
| confirmed_by_id | FK users | oui | null | Opérateur qui a confirmé l'accord (`nullOnDelete`) ; indexée |
| confirmed_at | timestamp | oui | null | Posé avec `confirmed_by_id` ; null : l'accord n'est pas valide |
| confirmation_reason | text | oui | null | Motif écrit exigé pour confirmer contre un verdict discordant ou absent |
| revoked_at | timestamp | oui | null | Révocation : l'accord cesse d'être valide |
| offline_since | timestamp | oui | null | TCK-2391 : depuis quand plus aucune annonce couverte n'est en ligne (`consented`, ou publiée sur un bien public). Posée par `radar:purge` à la date où il observe le retrait ; remise à null si un bien revient en ligne. Les trois ans courent donc du dernier retrait, à un jour près |
| purged_at | timestamp | oui | null | TCK-2391 : la réponse est effacée (transcription, verdict, captures) ; la ligne garde `capture_hashes`, le statut et les dates |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** plusieurs réponses peuvent être déposées sur un même message ; unique partiel
`radar_consents_provider_message_unique (provider_message_id) WHERE provider_message_id IS NOT NULL` : un message
reçu par l'API ne devient qu'une réponse (TCK-2395). Quatre index, un par clé étrangère.

### 112. RadarCrawlSource 🆕

**Table :** `radar_crawl_sources` (migration `2026_10_30_392000`, TCK-2392)
**Modèle :** `App\Models\RadarCrawlSource` (`AbstractModel`) — `site` casté en `RadarSourceSite`, `enabled` en
`boolean`, `frequency_minutes` et `max_pages` en `integer`, `enabled_at` en `datetime` ; `belongsTo operator`
(colonne `operator_id`).
**Description :** Un site collecté automatiquement ([ADR-0080](adr/0080-la-collecte-automatique-du-radar.md)) : une
ligne par adaptateur de `config('radar.crawl.sites')`, créée **éteinte** à la première lecture
(`RadarCrawlSources`, `insertOrIgnore`) — un site de plus (TCK-2424) n'exige aucune migration. Le `super_admin`
l'allume (`PATCH /api/admin/radar/crawl/sources/{site}`, `platform.radar.publish`) et en devient l'opérateur :
l'extraction des annonces trouvées est jugée en son nom. Éteindre ne défait rien : les annonces trouvées restent.
Une source allumée sans opérateur est signalée à l'écran, jamais éteinte d'office.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| site | string(30) | | | `expat_dakar`, `coinafrique` (`RadarSourceSite`) |
| enabled | boolean | | false | Allumée ; aucun passage planifié ne part d'une source éteinte |
| frequency_minutes | integer | | 360 | Délai entre deux débuts de passage ; 60 à 10 080 (`radar.crawl.min_frequency_minutes`, `max_frequency_minutes`) |
| max_pages | smallint | | 5 | Pages de liste lues au plus par passage ; 1 à 20 (`radar.crawl.max_pages_limit`) |
| operator_id | FK users | oui | null | Celui qui l'a allumée (`nullOnDelete`, `radar_crawl_sources_operator_fk`) ; sans lui, aucun passage planifié ne part ; index `radar_crawl_sources_operator_idx` |
| enabled_at | timestamp | oui | null | Dernier allumage |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** unique `radar_crawl_sources_site_unique (site)`.

### 113. RadarCrawlRun 🆕

**Table :** `radar_crawl_runs` (migration `2026_10_30_392000`, TCK-2392)
**Modèle :** `App\Models\RadarCrawlRun` (`AbstractModel`) — `site` casté en `RadarSourceSite`, `trigger` en
`RadarCrawlTrigger`, `status` en `RadarCrawlStatus`, `started_at` et `finished_at` en `datetime`, compteurs en
`integer`, `reached_end` en `boolean` ; `belongsTo operator`, `hasMany listings` (colonne `discovered_by_run_id` de
`radar_listings`).
**Description :** Un passage de collecte sur un site. `radar:crawl` (toutes les 15 minutes) met en file celui de
chaque source allumée, pourvue d'un opérateur et due ; un `super_admin` peut en lancer un à la main, même sur une
source éteinte, en son nom (`POST /api/admin/radar/crawl/sources/{site}/run`, 409 `radar.crawl.active` si un passage
est déjà actif). Le job `CrawlRadarSource` tourne sur la **file longue** ([ADR-0078](adr/0078-une-connexion-de-file-pour-les-jobs-longs.md)).
Il lit les pages par `UrlFetcher` (SSRF, `robots.txt`, créneau par domaine, attente du créneau au plus
`radar.crawl.busy_waits` fois), crée une annonce par URL inconnue (`RadarListingIntake`, au nom de l'opérateur) et ne
relance jamais une annonce connue. Il n'observe ni ne compte une annonce purgée, `do_not_contact`, ou d'un annonceur
qui a dit STOP (`RadarSnapshots::silenced()`). Une page suivante déjà lue par le passage l'arrête (`radar.crawl.loop`).
Un passage actif depuis plus de `radar.crawl.stale_after_minutes` (60), comptées depuis son démarrage (`started_at`, à
défaut sa mise en file), est clos `failed` / `radar.crawl.lost` ; la fin d'un passage ne réécrit qu'un passage encore
`running`. Lecture : `GET /api/admin/radar/crawl/runs` (`platform.radar.operate`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| site | string(30) | | | `RadarSourceSite` |
| trigger | string(20) | | | `schedule`, `manual` (`RadarCrawlTrigger`) |
| status | string(20) | | | `queued`, `running`, `finished`, `failed` (`RadarCrawlStatus`) |
| operator_id | FK users | oui | null | Au nom de qui (`nullOnDelete`, `radar_crawl_runs_operator_fk`) ; index `radar_crawl_runs_operator_idx` |
| started_at | timestamp | oui | null | Passage de `queued` à `running` |
| finished_at | timestamp | oui | null | |
| pages_read | integer | | 0 | Pages de liste lues |
| cards_seen | integer | | 0 | Cartes d'annonce vues |
| listings_created | integer | | 0 | Annonces neuves saisies |
| listings_known | integer | | 0 | Cartes d'une annonce déjà connue |
| snapshots_opened | integer | | 0 | Instantanés ouverts (annonce neuve, prix ou titre changé) |
| reached_end | boolean | | false | La dernière page de la liste a été lue (arrêt `radar.crawl.end`, statut `finished`) — sans elle, une annonce non revue n'a pas forcément disparu (TCK-2393) |
| stop_reason | string(60) | oui | null | `radar.crawl.end`, `radar.crawl.max_pages`, `radar.crawl.no_cards`, `radar.crawl.domain_busy`, `radar.crawl.time_budget`, `radar.crawl.no_operator`, `radar.crawl.error`, `radar.crawl.lost`, `radar.crawl.loop`, ou un refus de lecture `radar.fetch.*` |
| created_at / updated_at | timestamp | | auto | `created_at` : la mise en file, d'où se compte la fréquence |

**Contraintes :** index unique partiel `radar_crawl_runs_one_active_unique (site) WHERE status IN ('queued', 'running')`
— un seul passage actif par site, inséré par `INSERT … ON CONFLICT DO NOTHING`. Index
`radar_crawl_runs_site_created_idx (site, created_at)`.

### 114. RadarListingSnapshot 🆕

**Table :** `radar_listing_snapshots` (migration `2026_10_30_392100`, TCK-2392)
**Modèle :** `App\Models\RadarListingSnapshot` (`AbstractModel`) — `price` et `surface_m2` castés en `decimal:2`,
`bedrooms`, `geo_neighborhood_id` et `observations` en `integer`, `first_seen_at` et `last_seen_at` en `datetime` ;
`belongsTo listing` (colonne `radar_listing_id`), `run` (colonne `crawl_run_id`).
**Description :** Un état observé d'une annonce collectée, et sa plage de présence — la matière de l'observatoire
(TCK-2393). Un passage qui revoit l'annonce **prolonge** le dernier instantané (`last_seen_at`, `observations`) et
comble ses colonnes vides par les valeurs extraites ; un **prix ou un titre changé** en ouvre un nouveau
(`RadarSnapshots`, qui relit l'annonce sous son verrou et n'écrit rien pour une annonce que la collecte tait). Le titre
n'est gardé qu'en empreinte. **Supprimé à toute purge de l'annonce** (STOP, révocation, `do_not_contact` ou 90 jours,
[ADR-0080 § 4](adr/0080-la-collecte-automatique-du-radar.md)) ; un historique au-delà de la rétention passera par des
compteurs anonymes agrégés (TCK-2434). Une annonce supprimée emporte ses instantanés (`cascadeOnDelete`).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| radar_listing_id | FK radar_listings | | | `cascadeOnDelete` (`radar_snapshots_listing_fk`) |
| crawl_run_id | FK radar_crawl_runs | oui | null | Le passage qui l'a ouvert (`nullOnDelete`, `radar_snapshots_run_fk`) ; index `radar_snapshots_run_idx` |
| price | decimal(15,2) | oui | null | Prix affiché, en XOF |
| rent_period | string(20) | oui | null | Période d'un loyer |
| contract | string(10) | oui | null | `rent`, `sale` |
| property_type | string(40) | oui | null | `PropertyType` |
| surface_m2 | decimal(10,2) | oui | null | |
| bedrooms | smallint | oui | null | |
| neighborhood_label | string(160) | oui | null | Le lieu tel que la liste l'affiche |
| geo_neighborhood_id | FK geo_neighborhoods | oui | null | Le quartier du référentiel rapproché par l'extraction (`nullOnDelete`, `radar_snapshots_neighborhood_fk`) ; index `radar_snapshots_neighborhood_idx` |
| city | string(120) | oui | null | |
| title_fingerprint | string(64) | oui | null | SHA-256 du titre replié — jamais le titre |
| first_seen_at | timestamp | | | Premier passage qui a vu cet état |
| last_seen_at | timestamp | | | Dernier passage qui l'a vu ; index `radar_snapshots_last_seen_idx`. Toujours ≥ `started_at` de ce passage. Une absence n'est une disparition qu'après `radar.observe.confirm_runs` passages complets (`reached_end`) du site (TCK-2393) |
| observations | integer | | 1 | Passages qui l'ont vu |
| created_at / updated_at | timestamp | | auto | |

**Contraintes :** index `radar_snapshots_listing_seen_idx (radar_listing_id, first_seen_at)`.

### 115. RadarNatureCount 🆕

**Table :** `radar_nature_counts` (migration `2026_10_30_431000`, TCK-2431)
**Modèle :** `App\Models\RadarNatureCount` (`AbstractModel`, sans `created_at` ni `updated_at`) — `day` casté en
`date`, `nature` en `RadarAdvertiserNature`, `advertisers` et `listings` en `integer`.
**Description :** Le compteur anonyme quotidien des annonceurs du Radar par nature présumée
([ADR-0083, amendement du 2026-10-30](adr/0083-l-observatoire-du-marche.md)). La purge remet la nature d'un annonceur
sans annonce restante à `unknown` : sans ce compteur, la part d'intermédiaires ne porterait que sur les 90 derniers
jours. `RadarNatureCounter::record()` écrit une ligne par nature (toutes, zéro compris) pour le jour de Dakar, sur la
définition de la section vivante `natures` (`RadarNatureCounter::live()`, partagée avec `RadarObservatory`) :
annonceurs porteurs d'au moins une annonce non purgée et non doublon, et ces annonces. Écrit **avant la purge** :
`radar:count-natures` à 04:13 (Dakar), `radar:purge` à 04:15, et la purge planifiée le pose elle-même en premier si le
passage a manqué, dans sa propre transaction — une panne du compteur est signalée (`report()`) et ne fait jamais tomber
la purge. `insertOrIgnore` sur (jour, nature) : une écriture rejouée garde le premier compte. **Jamais purgée.**

**Éteint par défaut** (`radar.nature_counts.enabled`, `RADAR_NATURE_COUNTS=false`) : ni la commande ni la purge
n'écrivent rien, et l'observatoire le dit (`enabled`). Une ligne seule ne nomme personne, mais **la différence entre
deux jours** rend la nature présumée d'un annonceur qui a dit STOP (`do_not_contact_at` donne le jour) ; un seuil k ne
la ferme pas. L'allumage attend l'avis juridique de [TCK-2434](backlog/tickets/TCK-2434-radar-compteurs-anonymes-de-marche.md)
et son remède (grain plus gros, arrondi ou bruit).

**Lecture :** section `nature_history` de `GET /api/admin/radar/observatory` (`fields[radar_observatory]`), bornée par
`filter[since]` et `filter[until]` (jours inclus ; `until` ne borne que cette section, une période à l'envers est
refusée en 422). Par nature, la somme des annonceurs comptés chaque jour — des **annonceurs-jours** : sans identifiant,
un annonceur présent dix jours compte dix fois — et celle des annonces, avec `days`, `first_day` et `last_day`.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| day | date | | | Le jour du compte (Africa/Dakar), jamais un instant plus fin |
| nature | string(30) | | | `probable_owner`, `probable_intermediary`, `agency`, `unknown` (`RadarAdvertiserNature`) |
| advertisers | integer (non signé) | | | Annonceurs de cette nature porteurs ce jour-là d'au moins une annonce non purgée et non doublon |
| listings | integer (non signé) | | | Ces annonces |

**Contraintes :** unique `radar_nature_counts_day_nature_unique (day, nature)`. Aucun identifiant d'annonceur ou
d'annonce, aucun lieu, prix, site ni horodatation de ligne : une colonne de plus se décide avec TCK-2434.

---

## Enums

### Enums existants (à renommer / ajuster)

| Actuel | Nouveau nom | Valeurs |
|--------|-------------|---------|
| ~~ProprietyStatus~~ | **PropertyStatus** | available, sold, rented, under_maintenance, unavailable, pending, **draft, published, archived, pending_review, rejected** (cycle de publication et de modération ; `scopePublic()` exclut notamment `draft`, `archived`) |
| ~~ProprietyVisibility~~ | **PropertyVisibility** | public, private |
| BookingStatus | BookingStatus | pending, confirmed, rejected, cancelled, completed, **expired** |
| UserStatus | UserStatus | active, inactive, blocked, deleted |
| UserRole | UserRole | customer, agency_admin, super_admin, agent, owner, service_provider — **@deprecated TCK-278** (le rôle est désormais dérivé du profil ; voir [Règle 5](#règle-5--profil--rôle)). Les cas existent encore : l'enum ne survit que comme vocabulaire du contrat `PUT /api/users/{user}/role` (`UserRoleController`, qui le traduit en profils) et n'exprime aucune autorisation. Ce PUT et `PUT /api/agencies/{agency}/members/{user}/role` n'en acceptent que `agency_admin`, `agent` et `owner`, par une liste partagée : tout autre rôle rend 422 (TCK-2372, P249.01) |
| CustomerStatus | CustomerStatus | active, inactive, blocked, deleted |

> **`UserType` — déprécié (TCK-138 → TCK-142).** L'enum `UserType` est conservé en lecture pendant la phase de migration mais **disparaît** au cutover (TCK-142, suppression de `users.type` + des deux fichiers `app/Models/Enums/UserType.php` et `app/Models/Bases/Enums/UserType.php`). La nature métier d'un user est désormais portée par ses **profils polymorphes** (OwnerProfile / AgentProfile / AgencyAdminProfile / ServiceProviderProfile / PlatformProfile) ; les permissions par l'enum `Capability`, résolue par `MembershipCapabilityResolver` pour un couple *(utilisateur, agence)* et lue via `canActAt()`. Aucun nouveau code ne doit lire `users.type`.

### Nouveaux enums

> **La source fait foi : `takussan-api/app/Models/Enums/*.php`.** Ce tableau a été relevé contre elle
> le 2026-10-14 (passe 012 de `/sync-specs`, M36) : il n'avait été tenu que pour les enums neufs —
> des enums du code y manquaient depuis des mois (ajoutés, marqués « relevé 2026-10-14 ») et
> une ligne sur six environ portait des valeurs périmées (corrigées en gras). **Aucune garde ne le
> compare au code** : avant de s'y fier pour une valeur, relire le fichier ; pour l'inventaire,
> `ls takussan-api/app/Models/Enums/`. La colonne « Utilisé par » nomme le cast
> (`grep -rn "=> <Enum>::class" takussan-api/app/Models`) ou, à défaut, le lecteur.

| Nom | Valeurs | Utilisé par |
|-----|---------|-------------|
| ~~**UserType**~~ | ~~owner, agent, broker, admin, service_provider~~ | ~~User.type~~ — **@deprecated TCK-138, supprimé en TCK-142** (remplacé par les profils polymorphes) |
| **OwnerProfileStatus** 🆕 | **draft**, active, inactive, blocked | OwnerProfile.status — `draft` : profil pré-créé à l'envoi d'une invitation (TCK-249) |
| **AgentProfileStatus** 🆕 | **draft**, active, inactive, suspended | AgentProfile.status — `draft` : profil pré-créé à l'envoi d'une invitation (TCK-249) |
| **AgencyAdminProfileStatus** ✅ (TCK-271) | active, suspended, archived | [AgencyAdminProfile.status](#98-agencyadminprofile-) |
| **CollaborationStatus** 🆕 | active, paused, ended | ServiceProviderAgencyCollaboration.status (`BrokerAgencyCollaboration` supprimé, ADR-0030) |
| **KycDossierStatus** 🆕 | pending, submitted, verified, rejected | KycDossier.status |
| **AgencySubscriptionStatus** 🆕 | trialing, active, past_due, suspended, ended | AgencySubscription.status |
| **PlatformPayoutStatus** 🆕 | pending, approved, processing, paid, failed, cancelled | PlatformPayout.status |
| **AnnouncementSeverity** 🆕 | info, success, warning, critical | Announcement.severity |
| **Currency** | XOF, XAF, EUR, USD | Agency, Property, Booking, BookingPayment, Lease, LeasePayment |
| **PropertyType** | land, house, apartment, villa, studio, room, office, shop, warehouse, factory, farm, hotel, resort, garage, parking, other | Property.type |
| **ContractType** | sale, rent | Property.contract_type |
| **TitleType** | bail, titre_foncier, deliberation, autre | Property.title_type |
| **PropertyCondition** 🆕 | off_plan, new, renovated, good, to_renovate | Property.condition (TCK-508) |
| **LeaseType** | residential_rent, commercial_rent, seasonal_rent, sale | Lease.type |
| **LeaseStatus** | draft, pending_signature, active, expired, **terminating**, terminated, renewed | Lease.status — `terminating` : départ anticipé demandé, préavis en cours (TCK-090) |
| **PaymentStatus** | pending, paid, late, partially_paid, failed, refunded, **cancelled** | LeasePayment.status, BookingPayment.status — `cancelled` : échéance qu'un renouvellement a remplacée (`LeaseRenewalService`), jamais posée par un client. `lease_payments` n'écrit plus `failed` depuis TCK-593 (`2026_10_07_150100_reopen_failed_lease_payments`) |
| **PaymentMethod** | cash, bank_transfer, mobile_money, **wave, orange_money, free_money**, check, card | LeasePayment, BookingPayment |
| **PaymentFrequency** | monthly, quarterly, yearly | Lease.payment_frequency |
| **LeasePaymentType** | rent, charges, deposit, **deposit_refund**, regularization, penalty | LeasePayment.payment_type |
| **BookingPaymentType** | deposit, advance, fee | BookingPayment.payment_type |
| **CancellationBy** | owner, customer, agent, system | Booking.cancellation_by |
| **IdType** | id_card, passport, driving_license | Customer.id_type |
| **CollaboratorRole** | manager, co_owner, agent, viewer | PropertyCollaborator.role |
| **TagType** | amenity, feature, label, crm | Tag.type |
| **RelationshipType** | owner_tenant, agent_client — `broker_client` retiré par TCK-586 (ADR-0030) | UserCustomerRelationship.relationship_type |
| **RelationshipStatus** | active, ended, suspended | UserCustomerRelationship.status |
| **NotificationType** | booking, payment, lease, maintenance, visit, message, system, **bank_statement_imported, bank_statement_finalized, role_delegated, role_delegation_expired, role_delegation_revoked** | AppNotification.type |
| **NotificationChannel** | app, email, sms, push, **whatsapp** | AppNotification.delivery_channel — *pas* `notification_preferences.channel`, qui écrit `inapp` (voir §99) |
| **EmailFrequency** ✅ (TCK-103) | instant, daily, weekly, off | [User.email_frequency](#1-user) |
| **AgencyStatus** | active, inactive, suspended | Agency.status |
| **VisitType** | in_person, virtual, **self_guided**, **hybrid** | PropertyVisit.type |
| **VisitStatus** | scheduled, confirmed, completed, cancelled, no_show | PropertyVisit.status |
| **ConversationType** | direct, group, booking, lease, property, **support** | Conversation.type — *aligné sur `app/Models/Enums/ConversationType.php`, mesuré le 2026-08-16 (R7 de la passe 009)* |
| **ConversationStatus** | active, archived, closed | Conversation.status |
| **MessageType** | text, image, document, system, **audio** | Message.type — `audio` : note vocale, fichier dans la collection privée `attachments` (TCK-592, ADR-0038) |
| **MaintenanceCategory** | plumbing, electrical, structural, appliance, painting, cleaning, pest_control, locksmith, other | MaintenanceRequest.category |
| **MaintenancePriority** | low, **normal**, high, urgent | MaintenanceRequest.priority — `medium` renommé `normal`, données et défaut (`2026_04_26_013446`) |
| **MaintenanceStatus** | open, acknowledged, **quote_requested, quote_submitted, awaiting_owner, approved, rejected**, assigned, in_progress, completed, closed, cancelled | MaintenanceRequest.status — circuit du devis (TCK-592, ADR-0037) |
| **DocumentType** | id_card, passport, lease_contract, receipt, invoice, insurance, inventory_report, photo, **rib, ninea**, other | Document.type — `rib`, `ninea` : pièces KYC du propriétaire (TCK-257) |
| **InventoryType** | move_in, move_out | Inventory.type |
| **InventoryStatus** | draft, pending_signature, signed, disputed | Inventory.status |
| **InventoryCondition** | excellent, good, fair, poor | Inventory.general_condition |
| **InvoiceStatus** | draft, sent, paid, overdue, cancelled, void | Invoice.status |
| **PriceChangeReason** | market_adjustment, negotiation, renovation, urgent_sale, seasonal, correction | PropertyPriceHistory.reason |
| **PayoutStatus** | **awaiting_approval**, pending, scheduled, processing, completed, failed, cancelled | Payout.status — `awaiting_approval` : le net atteint le seuil d'approbation de l'agence (TCK-594, ADR-0039 §4) |
| **CustomerPipelineStage** | lead, prospect, qualified, negotiating, converted, lost | Customer.pipeline_stage 🆕 |
| **TaskStatus** | open, in_progress, done, cancelled | Task.status 🆕 |
| **TaskPriority** | low, medium, high | Task.priority 🆕 |
| **SettingScope** | global, agency | Setting.scope 🆕 |
| **BankStatementSourceFormat** 🆕 | csv, ofx | BankStatement.source_format |
| **BankStatementStatus** 🆕 | processing, ready_for_review, partially_reconciled, reconciled, archived, **failed** | BankStatement.status — `failed` : analyse en échec, ou aucune ligne lisible dans un fichier non vide (TCK-593) |
| **BankStatementLineDirection** 🆕 | credit, debit | BankStatementLine.direction |
| **BankStatementLineMatchStatus** 🆕 | unmatched, suggested, confirmed, ignored | BankStatementLine.match_status |
| **AgencyKind** 🆕 | standard, individual | Agency.kind |
| **InvitationStatus** 🆕 | sent, accepted, expired, revoked | Invitation.status |
| **AgencyUpgradeRequestStatus** 🆕 | pending, approved, rejected, revoked | AgencyUpgradeRequest.status |
| **PlatformProfileLevel** 🆕 (TCK-278) | super_admin, support, viewer | PlatformProfile.level |
| **AgencyRoleBaseType** 🆕 (TCK-279) | agent, agency_admin, owner, service_provider | AgencyRole.base_profile_type |
| **Capability** 🆕 (TCK-278) | catalogue code-defined, groupé par domaine (`<domaine>.<verbe>`) — le nombre de cas se lit à la source (`grep -c '^\s*case ' app/Models/Enums/Capability.php`) ; extrait ci-dessous | `MembershipCapabilityResolver`, `AgencyRoleCapability.capability` |
| **DataExportStatus** ✅ (TCK-310) | queued, processing, ready, expired, failed | [DataExport.status](#57-dataexport-) |
| **RoleDelegationStatus** ✅ (TCK-310) | scheduled, active, revoked, expired | [RoleDelegation.status](#66-roledelegation-) |
| **ReferentialStatus** 🆕 (TCK-633) | approved, pending, rejected | [GeoNeighborhood.status](#91-geoneighborhood-), [Tag.status](#10-tag) — `pending` n'est visible que de son auteur, `rejected` de personne |
| **GeoNeighborhoodOrigin** 🆕 (TCK-633) | dataset, user | [GeoNeighborhood.origin](#91-geoneighborhood-) |
| **BoostKind** 🆕 (TCK-633) | bump, featured, badge | [BoostProduct.kind](#92-boostproduct-), [PropertyBoost.kind](#93-propertyboost-) |
| **BoostBadge** 🆕 (TCK-633) | urgent, price_drop | BoostProduct.variant, PropertyBoost.variant, [Property.badge](#3-property) |
| **BoostStatus** 🆕 (TCK-633) | active, paused, ended, cancelled, refunded — `live()` = active, paused | [PropertyBoost.status](#93-propertyboost-) |
| **CreditLotOrigin** 🆕 (TCK-633) | welcome, admin_grant, refund, purchase (phase 2) | [CreditLot.origin](#95-creditlot-) |
| **CreditMovementType** 🆕 (TCK-633) | grant, spend, refund, expire, admin_debit | [CreditMovement.type](#96-creditmovement-) |
| **RentPeriod** (relevé 2026-10-14) | daily, weekly, monthly, yearly | [Property.rent_period](#3-property) |
| **ReviewStatus** (relevé 2026-10-14) | pending, approved, rejected, reported | [Review.status](#11-review) (`2026_04_22_000001`) |
| **InventoryElementState** (relevé 2026-10-14) | bon, usé, endommagé, manquant | `Inventory.rooms[].elements[].state` (jsonb, validé par `InventoryStoreRequest` / `InventoryUpdateRequest`, sans cast) — valeurs en français, vocabulaire montré au locataire ; voir [§24](#24-inventory-) |
| **ParticipantRole** (relevé 2026-10-14) | admin, member | [ConversationParticipant.role](#19-conversationparticipant-) (TCK-029, TCK-085) |
| **CustomerNoteKind** (relevé 2026-10-14) | conversion, loss | [CustomerNote.kind](#33-customernote-) (TCK-591) |
| **ServiceProviderProfileStatus** (relevé 2026-10-14) | draft, active, inactive, suspended | [ServiceProviderProfile.status](#37-serviceproviderprofile-) (TCK-260) |
| **PayeeRole** (relevé 2026-10-14) | landlord, tenant, service_provider | [Payout.payee_role](#28-payout-) (TCK-594, ADR-0039 §2) |
| **InvoiceKind** (relevé 2026-10-14) | invoice, credit_note | [Invoice.kind](#25-invoice-) (TCK-594, ADR-0039 §7) |
| **PayoutMethodKind** (relevé 2026-10-14) | wave, orange_money, free_money, bank_transfer | [PayoutMethod.kind](#76-payoutmethod-) (TCK-594, ADR-0039 §6) |
| **ServiceProviderBillStatus** (relevé 2026-10-14) | pending_validation, validated, rejected, paid, cancelled | [ServiceProviderBill.status](#77-serviceproviderbill-) (TCK-594, ADR-0039 §8) |
| **PaymentProvider** (relevé 2026-10-14) | wave, orange_money, lemon_squeezy | Pas de cast : `Integration::isPaymentIntegration()` (`tryFrom` sur `integrations.provider`), `InitiatePaymentRequest` et les demandes de paiement en ligne |
| **CommissionEntryStatus** (relevé 2026-10-14) | due, paid, cancelled | [CommissionEntry.status](#85-commissionentry-) (TCK-595, ADR-0049 §3) |
| **CommissionOrigin** (relevé 2026-10-14) | negotiator, collaborator | [CommissionEntry.origin](#85-commissionentry-) (TCK-595, ADR-0049 §3) |
| **ContactLeadChannel** (relevé 2026-10-14) | form, whatsapp, call | [PropertyContactLead.channel](#67-propertycontactlead-) (TCK-590) |
| **ModerationReasonCode** (relevé 2026-10-14) | fraud, spam, misleading, offensive, personal_data, duplicate, conflict_of_interest, off_topic, other | Pas de cast : code du motif d'une décision de modération (`reason_code`, validé par `DecideModerationQueueRequest`, `ModerateReviewRequest`), traduit par le front ; texte libre exigé pour `other` seulement (TCK-597, ADR-0043 §7) |
| **ImpersonationEndReason** (relevé 2026-10-14) | stopped, expired, operator_revoked, target_blocked | [ImpersonationSession.end_reason](#83-impersonationsession-) (TCK-600, ADR-0055 §4) |
| **PlatformAbility** (relevé 2026-10-14) | gestes de la console plateforme, `platform.<domaine>.<verbe>` — distincts de `Capability`, sans agence ; la liste se lit dans le fichier | Pas de cast : middleware `platform-can:<valeur>` (`EnsurePlatformAbility`), `User::hasPlatformAbility()` (TCK-600, ADR-0047) |
| **PrivacyRequestType** (relevé 2026-10-14) | access, rectification, opposition, erasure, portability | [PrivacyRequest.type](#79-privacyrequest-) (TCK-601, ADR-0044 §4) |
| **PrivacyRequestChannel** (relevé 2026-10-14) | in_app, email, postal, phone, in_person | [PrivacyRequest.channel](#79-privacyrequest-) (TCK-601, ADR-0044 §4) |
| **PrivacyRequestStatus** (relevé 2026-10-14) | received, in_progress, answered, rejected, withdrawn | [PrivacyRequest.status](#79-privacyrequest-) (TCK-601, ADR-0044 §4) |
| **ScheduledTaskRunStatus** (relevé 2026-10-14) | finished, failed, skipped, running | [ScheduledTaskRun.status](#61-scheduledtaskrun-) (TCK-383) |
| **WatermarkPosition** (relevé 2026-10-14) | bottom_right, bottom_left, bottom_center | Pas de cast : réglage d'agence `settings.watermark_position` (`AgencyUpdateRequest`), lu par `AgencyWatermarkContext` (TCK-319) |
| **RadarOutreachOutcome** 🆕 (TCK-2388) | consented, refused, stop, question, no_answer — `isFinal()` vrai pour les trois premiers | [RadarOutreach.outcome](#110-radaroutreach-) |
| **RadarConsentProof** 🆕 (TCK-2388) | screenshot, provider_message (TCK-2395), otp (TCK-2390) | [RadarConsent.proof](#111-radarconsent-) |
| **RadarOutreachChannel** 🆕 (TCK-2388) | whatsapp_manual, whatsapp_cloud (TCK-2395) | [RadarOutreach.channel](#110-radaroutreach-) |
| **RadarVerificationStatus** 🆕 (TCK-2388) | pending, done, failed | [RadarConsent.verification_status](#111-radarconsent-) |
| **RadarCrawlStatus** 🆕 (TCK-2392) | queued, running, finished, failed — `activeValues()` : les deux premiers | [RadarCrawlRun.status](#113-radarcrawlrun-) |
| **RadarCrawlTrigger** 🆕 (TCK-2392) | schedule, manual | [RadarCrawlRun.trigger](#113-radarcrawlrun-) |

#### Catalogue `Capability` (TCK-278 → TCK-279)

Énumération PHP, code-defined, immuable hors livraison. Groupée par domaine pour pouvoir afficher l'éditeur de rôle en sections (UI TCK-279).

> **Extrait, pas référence.** Relevé le 2026-10-14 contre `app/Models/Enums/Capability.php`, il était
> exhaustif ce jour-là — il ne l'était plus depuis TCK-595 (`reports.view_agency` manquait, comme les
> trois `leases.*` du dépôt de garantie et de la révision de loyer). Aucune garde ne le compare au
> code : **la source fait foi**, et le catalogue servi au front se lit sur `GET /api/capabilities`.

| Groupe | Valeurs |
|---|---|
| `agency.*` | `agency.update`, `agency.update_kyc`, `agency.update_billing`, `agency.upgrade_request` |
| `team.*` | `team.invite`, `team.assign_role`, `team.remove`, `team.suspend`, `team.delegate_role` (TCK-395) |
| `properties.*` | `properties.create`, `properties.update_any`, `properties.update_own`, `properties.delete`, `properties.publish`, `properties.moderate` |
| `bookings.*` | `bookings.validate`, `bookings.cancel`, `bookings.refund` |
| `leases.*` | `leases.create`, `leases.sign`, `leases.terminate`, `leases.renew`, `leases.refund_deposit`, `leases.rent_review`, `leases.rent_review_force` |
| `payments.*` | `payments.record`, `payments.refund`, `payments.export`, `payments.reconcile` (TCK-2260, ADR-0003 amendé le 2026-10-24 — le rapprochement bancaire ; admin d'agence par défaut, agent système non) |
| `invoices.*` | `invoices.create`, `invoices.write_off`, `invoices.send` |
| `payouts.*` | `payouts.create`, `payouts.approve` |
| `crm.*` | `crm.view_all`, `crm.export`, `crm.assign` |
| `maintenance.*` | `maintenance.assign`, `maintenance.close` |
| `messaging.*` | `messaging.broadcast`, `messaging.archive` |
| `reports.*` | `reports.view_global`, `reports.view_agency` (TCK-595, ADR-0049 §4 — chiffres consolidés d'**une** agence, assignable à un rôle d'agence), `reports.export` |
| `roles.*` | `roles.create_custom`, `roles.edit_custom`, `roles.delete_custom` |
| `boost.*` | `boost.spend` (TCK-633, ADR-0061 §1 — dépenser les crédits de l'espace ; admin d'espace oui, agent système non) |

Chaque entrée est de la forme `<domain>.<verb>` ; les verbes sont normalisés (`create`, `update_any`, `update_own`, `delete`, `view`, `export`, `assign`, `approve`, etc.).

---

## Résumé des changements

> ⚠ **Journal, pas état.** Cette section raconte la réécriture initiale du document (2026-04) puis
> quelques livraisons ; elle ne décrit pas le schéma courant — **les sections font foi**, et
> l'historique complet est celui de git (`git log -p -- docs/models-spec.md`). Ses comptes écrits à
> la main (« enrichis (8) », « Nouveaux modèles (22) », « Nouveaux enums (46) », « +13 colonnes »…)
> ont été **retirés** le 2026-10-14 (passe 012 de `/sync-specs`, M40) : aucun ne tenait. Les
> affirmations que le code dément ont été corrigées en place et marquées ⚠.

### Modèles inchangés

Aucun : tous les modèles ont été enrichis ou remplacés.

### Modèles existants enrichis

- **User** : +colonnes (bio, phone_verified_at, preferred_language, last_login_at, timezone, two_factor_*, notifications_*_enabled, **facebook_id**, **apple_id**), -colonnes (model morphs, avatar_url → medialibrary), `type` → UserType enum (puis colonne supprimée par TCK-142), +relations (leases, appNotifications, writtenReviews, receivedReviews, documents)
- **Agency** : +colonnes (commission_rate, founded_at, is_verified, verified_at, primary_admin_id, properties_count, active_leases_count, average_rating), -colonne (logo_path → medialibrary), +trait `InteractsWithMedia`, +relations (addresses, reviews, leases, primaryAdmin) — ⚠ ni `address()` (c'est `addresses()`, morphMany) ni `documents()` n'existent ; les colonnes ajoutées depuis sont en [§2](#2-agency)
- **Property** : +colonnes (currency, bedrooms, bathrooms, furnished, floor_number, total_floors, year_built, parking_spaces, featured, views_count, reference_number, favorites_count, visits_count, reviews_count, average_rating, available_from, published_at), colonnes renommées, `type`/`contract_type`/`title_type`/`currency` → enums — ⚠ ni `inventories()` ni `conversations()` n'existent sur le modèle ; voir [§3](#3-property)
- **Address** : +colonne (neighborhood) — ⚠ les colonnes `address`, `state`, `district`, `building` que §4 décrivait n'ont jamais existé (`2026_04_17_160003`) ; [§4](#4-address) est réécrite sur la table
- **Booking** : `user_id` → `created_by_id`, `user()` → `createdBy()`, `cancellation_by` → CancellationBy enum, ➖ `deposit_paid` ; BookingStatus +valeur `rejected` + `expired` — ⚠ `customer_id` est resté **nullable** (`2026_04_17_160010`), aucun accesseur ne remplace `deposit_paid`, et ni `documents()` ni `invoices()` n'existent sur le modèle ; voir [§5](#5-booking)
- **BookingPayment** : +colonnes (refund_amount, refund_reason), `currency` → Currency enum, +trait `HasPaymentAttributes` — ⚠ aucune relation `invoice()` ; voir [§6](#6-bookingpayment)
- **LeasePayment** : `payment_type` → `LeasePaymentType` enum (+valeur `deposit_refund`), `currency` → Currency enum, `due_date` → nullable, +trait `HasPaymentAttributes` — ⚠ aucune relation `invoice()` ; voir [§15](#15-leasepayment-)
- **Customer** : +colonnes (id_type → IdType enum, id_number, occupation, emergency_contact_name, emergency_contact_phone, **pipeline_stage**), +relations (visits, notes) ; plus tard `agency_id` et les critères de recherche (TCK-591, `2026_10_07_591200`) — voir [§7](#7-customer)
- **Review** : `model_id`/`model_type` → `reviewable_id`/`reviewable_type`, relation `model()` → `reviewable()`, +colonnes **reply_content / replied_by_id / replied_at** + relation `repliedBy()` ; l'auteur est `author_id` dès la création de la table ; plus tard `status` (`2026_04_22_000001`), `agency_id` et `context_*` (`2026_10_08_100000`) — voir [§11](#11-review)
- **Lease** : +colonne **renewed_from_lease_id** + relations `renewedFrom()` / `renewals()`
- **PropertyCollaborator** : +colonne **commission_share** (decimal 5,2)

### Modèles enrichis (anciennement "inchangés")

- **PropertyCollaborator** : `role` → CollaboratorRole enum
- **UserCustomerRelationship** : `relationship_type` → RelationshipType enum, `status` → RelationshipStatus enum
- **Tag** : `type` → TagType enum

### Modèles remplacés / renommés

- **Notification** → **AppNotification** (table `notifications` → `app_notifications`, `reference_id/type` → `referenceable_id/type`, `type` → NotificationType enum, `delivery_channel` → NotificationChannel enum)
- **ActivityLog** → remplacé par **spatie/laravel-activitylog**

### Nouveaux modèles ajustés par rapport à la spec initiale

- **Conversation** : +colonnes `maintenance_request_id` FK, `last_message_id`, `last_message_preview` ; `type` → `ConversationType` enum
- **PropertyVisit** : +colonne `cancellation_reason`, `type` → VisitType élargi (self_guided, hybrid) — ⚠ la « contrainte CHECK » annoncée ici n'existe dans aucune migration ; la règle est applicative, voir [§17](#17-propertyvisit-)
- **Property** : `amenities` JSON ➖ remplacée par Tags de type `amenity` (migration P3.10), +relation `priceHistory()` — ⚠ aucune relation `invoices()` sur le modèle
- **Lease** : `terminated_by` → `terminated_by_id`, `payment_frequency` → `PaymentFrequency` enum, `currency` → Currency enum, ➖ colonnes `guarantor_name/phone/id_number` (remplacées par FK `guarantor_id` vers modèle `Guarantor`, puis par le pivot `lease_guarantor`), +relations `guarantor()`, `payouts()`, `invoices()`
- **MaintenanceRequest** : ⚠ la relation `requesterCustomer()` annoncée ici n'existe pas sur le modèle (relevé 2026-10-14) ; voir [§21](#21-maintenancerequest-)
- **Document** : `documentable` morphTo générique — ⚠ les inverses `documents()` sont déclarés par User, Customer, Property, Lease, Guarantor, MaintenanceRequest et AgencyUpgradeRequest, **pas** par Agency ni Booking

### Nouveaux modèles antérieurs à TCK-310

- **Lease** — Contrats / Baux
- **LeasePayment** — Paiements récurrents
- **Favorite** — Favoris
- **PropertyVisit** — Visites
- **Conversation** — Fils de discussion
- **ConversationParticipant** — Participants
- **Message** — Messages
- **MaintenanceRequest** — Demandes de maintenance
- **Document** — Pièces justificatives
- **SavedSearch** — Recherches sauvegardées
- **Inventory** — États des lieux
- **Invoice** — Factures
- **PropertyPriceHistory** — Historique des prix
- **Guarantor** — Garants de baux
- **Payout** — Reversements aux bailleurs
- **DocumentShareLink** — Liens de partage sécurisés 🆕
- **Setting** — Paramètres clé/valeur scopés 🆕
- **Integration** — Intégrations tierces (API keys) 🆕
- **Task** — Tâches/rappels polymorphes (CRM) 🆕
- **CustomerNote** — Notes CRM horodatées 🆕
- **BankStatement** — Relevés bancaires (rapprochement) 🆕
- **BankStatementLine** — Lignes d'un relevé bancaire 🆕

### Modèles documentés a posteriori ✅ — TCK-310

**Ils ne sont pas nouveaux : ils existaient déjà et ce document les ignorait.** Détail complet en
[Modèles documentés a posteriori](#modèles-documentés-a-posteriori-tck-310). Les modèles posés
depuis sont rangés à part : [Modèles ajoutés depuis TCK-310](#modèles-ajoutés-depuis-tck-310).

- **AccountDeletionRequest** — demandes de suppression RGPD
- **DataExport** — exports RGPD de données personnelles
- **FeatureFlag** — drapeaux de fonctionnalité
- **AlertRule** — règles d'alerte d'exploitation
- **MaintenanceWindow** — fenêtres de maintenance planifiées
- **ScheduledTaskRun** — traces d'exécution des tâches planifiées
- **ReportExport** — exports de rapports de pilotage
- **IntegrationWebhookLog** — journal des webhooks d'intégration
- **KpiConfig** — KPI de tableau de bord par agence
- **ThresholdAlert** — alertes de seuil par agence
- **RoleDelegation** — délégations de rôle temporaires
- **PropertyContactLead** — demandes de contact depuis une fiche publique
- **PropertyReport** — signalements d'annonce
- **NotificationDeliveryAttempt** — tentatives d'acheminement SMS/WhatsApp
- **WizardDraft** — brouillons de parcours multi-étapes
- **WelcomeView** — modales de bienvenue déjà vues

### TCK-633 — retours du porteur (2026-10-12) 🆕

- **Nouveaux modèles :** PropertyContact (lot C) ; GeoRegion, GeoCity, GeoNeighborhood
  (ADR-0062) ; BoostProduct, PropertyBoost, PropertyBoostDailyStat, CreditLot, CreditMovement,
  CreditWelcomeGrant (ADR-0061).
- **User** : +colonnes (phone_whatsapp, secondary_phone, secondary_phone_verified_at,
  secondary_phone_whatsapp, terms_accepted_at, terms_version), +index unique partiel.
- **Property** : +colonnes (ranked_at, sponsored_until, badge, badge_until) ; `featured` devient
  dérivé ; +relations contacts, boosts, tagsVisibles.
- **Address** : +FK (geo_city_id, geo_neighborhood_id) ; canonisation à chaque écriture.
- **Tag** : +colonnes (status, created_by_id) ; les données `feature` fondues dans `amenity` (le cas
  subsiste dans l'enum) ; pivot `taggables` +attached_by_id.
- **Agency** : aucune colonne ; +relation creditLots, +observateur des boosts.
- **Nouveaux enums :** ReferentialStatus, GeoNeighborhoodOrigin, BoostKind, BoostBadge,
  BoostStatus, CreditLotOrigin, CreditMovementType ; +capacité `boost.spend`.

### Enums renommés

- ProprietyStatus → **PropertyStatus**
- ProprietyVisibility → **PropertyVisibility**

### Nouveaux enums antérieurs à TCK-633

> Ceux de TCK-633 sont dans le bloc ci-dessus ; ceux que le tableau [Enums](#enums-1) n'avait jamais
> reçus y ont été ajoutés le 2026-10-14 (marqués « relevé 2026-10-14 »). L'inventaire se lit dans
> `takussan-api/app/Models/Enums/`, pas ici.

- **Scalaires métier :** UserType, Currency, CancellationBy, IdType, CollaboratorRole, TagType, RelationshipType, RelationshipStatus
- **Agence / Propriété :** AgencyStatus, PropertyType, ContractType, TitleType, PropertyCondition 🆕 (TCK-508)
- **Bail / Paiement :** LeaseType, LeaseStatus, PaymentFrequency, PaymentStatus, PaymentMethod, LeasePaymentType (+`deposit_refund`), BookingPaymentType
- **Factures / Prix / Reversements :** InvoiceStatus, PriceChangeReason, PayoutStatus 🆕
- **Visites :** VisitType, VisitStatus
- **Conversations / Messages :** ConversationType, ConversationStatus, MessageType
- **Notifications :** NotificationType, NotificationChannel
- **Maintenance :** MaintenanceCategory, MaintenancePriority, MaintenanceStatus
- **Documents / Inventaires :** DocumentType, InventoryType, InventoryStatus, InventoryCondition
- **CRM / Plateforme :** CustomerPipelineStage 🆕, TaskStatus 🆕, TaskPriority 🆕, SettingScope 🆕
- **Comptabilité bancaire 🆕 :** BankStatementSourceFormat, BankStatementStatus, BankStatementLineDirection, BankStatementLineMatchStatus
- **Documentés a posteriori ✅ (TCK-310) :** DataExportStatus, RoleDelegationStatus — les deux seuls
  enums PHP que portaient les seize modèles de TCK-310 **le 2026-08-16** ; les autres colonnes de
  statut de ces modèles étaient des `string` contrôlées applicativement. Depuis,
  `ScheduledTaskRun.status` (ScheduledTaskRunStatus, TCK-383) et `PropertyContactLead.channel`
  (ContactLeadChannel, TCK-590) sont castés à leur tour.

---

## Index recommandés

> Index critiques des requêtes les plus fréquentes. **Tous existent** : relevés le 2026-10-14 contre
> la base de développement migrée (`pg_indexes`) et leurs migrations. La liste complète d'une table se
> lit en base, pas ici : `select indexname, indexdef from pg_indexes where tablename = '<table>'`.

| Table | Colonnes indexées | Justification |
|-------|-------------------|---------------|
| properties | `status`, `contract_type` | Filtres de base sur toutes les listes |
| properties | `user_id`, `agency_id` | Récupération du portefeuille (deux index simples) |
| properties | `visibility`, `published_at` | Scope `public()` (le scope `published()` n'existe pas) |
| properties | `featured`, `published_at` | Page d'accueil — biens mis en avant |
| leases | `status`, `property_id` | Suivi des baux actifs |
| lease_payments | `due_date`, `status` | Rappels et paiements en retard |
| lease_payments | `lease_id`, `period_start` | Échéancier d'un bail |
| bookings | `property_id`, `status` | Disponibilité d'un bien |
| property_visits | `property_id`, `scheduled_at` | Calendrier des visites |
| property_visits | `scheduled_at`, `status` | Dashboard agent |
| conversations | `property_id`, `lease_id`, `maintenance_request_id` | Fil de discussion lié |
| app_notifications | `user_id`, `is_read` | Compteur non-lus |
| favorites | `user_id` | Liste "mes favoris" |
| messages | `conversation_id`, `created_at` | Pagination du fil de discussion |
| reviews | `reviewable_type`, `reviewable_id`, `is_approved` | Avis publics d'une entité |
| conversation_participants | `user_id`, `conversation_id` | Liste des conversations d'un utilisateur |
| invoices | `customer_id`, `status` | Factures d'un client |
| invoices | `invoiceable_type`, `invoiceable_id` | Facture liée à une entité |
| property_price_histories | `property_id`, `changed_at` | Historique des prix d'un bien |
| guarantors | `(last_name, first_name)` | Recherche de garant existant |
| payouts | `landlord_id`, `status` | Suivi des reversements d'un bailleur |
| payouts | `lease_id`, `period_start` | Historique des reversements d'un bail |
| payouts | `status`, `scheduled_at` | File des reversements à traiter |
| document_share_links | `token_hash` | Résolution du lien public (unique `dsl_token_hash_unique` — `token` est chiffré et n'est plus cherché, `2026_10_08_180000`) |
| document_share_links | `document_id`, `expires_at` | Liste des liens actifs d'un document |
| tasks | `assigned_to_id`, `due_at` | Tâches à échéance d'un utilisateur |
| tasks | `taskable_type`, `taskable_id` | Tâches liées à une entité |
| customer_notes | `customer_id`, `created_at` | Historique des notes d'un client (index ascendant ; PostgreSQL le parcourt aussi à rebours) |
| settings | `(key, scope, scope_id)` | Résolution unique d'un paramètre (`NULLS NOT DISTINCT`) |
| integrations | `(provider, agency_id)` | Intégration unique par fournisseur / agence (`NULLS NOT DISTINCT`, lignes vivantes) |
| bank_statements | `(agency_id, status)` | Relevés ouverts par agence 🆕 |
| bank_statements | `(agency_id, created_at)` | Tri chronologique par agence 🆕 |
| bank_statement_lines | `(bank_statement_id, match_status)` | File de réconciliation par relevé 🆕 |
| bank_statement_lines | `(matched_payment_type, matched_payment_id)` | Recherche inverse depuis un paiement 🆕 |
| bank_statement_lines | `(posted_at, amount)` | Recherche d'appariement par date / montant 🆕 |

> ✅ **Les tables documentées a posteriori (TCK-310) et celles des modèles ajoutés depuis (§72 et
> suivants) ne sont pas reprises ici, délibérément.** Leurs index sont **mesurés dans les
> migrations** et écrits section par section — comme ceux des sections que la passe 012 de
> `/sync-specs` a relues colonne à colonne. Les recopier ici créerait un second endroit à tenir à
> jour, donc un second endroit à faire mentir.

---

## Règles d'invariance

> Ces règles doivent être respectées à tout moment dans l'application. Elles sont implémentées via des Observers Laravel.

### Règle 1 — User ↔ Customer

Tout User ayant un rôle de locataire actif doit avoir un `Customer` associé (`Customer.user_id` rempli).

- Un User peut exister sans Customer (propriétaire, agent, admin, service_provider).
- Dès qu'un User devient locataire (signature d'un Lease en tant que `tenant`), un Customer doit être créé ou associé.
- **Agence de la fiche d'un candidat** (P15.01, TCK-2350, 2026-10-25) : la candidature, l'offre d'achat ou la réservation d'un compte sur un bien d'agence lui donne une fiche de **l'agence du bien** (`CustomerService::findOrCreateFromUser`) — reprise si le compte en a déjà une dans cette agence, rattachée si l'agence a une fiche sans compte au téléphone ou à l'e-mail **vérifié** du compte, créée sinon. La fiche du compte dans une autre agence n'est ni reprise ni déplacée. Un compte porte donc une fiche par agence. Un bien sans agence garde l'agence du compte.
- **Fiche saisie sans compte** (P15.01, TCK-2351, 2026-10-25) : le personnel de l'agence de la fiche invite son client à créer son compte (`POST /api/customers/{id}/invite`, rôle d'invitation `tenant`) ; le lien part à l'e-mail de la fiche, ou à son numéro si le lien par SMS est ouvert, et l'acceptation pose `customers.user_id` (`CustomerService::linkUser`). Hors de l'appariement vérifié de la candidature (ci-dessus), aucun `user_id` n'est posé autrement sur une fiche saisie par l'agence.
- **Implémentation :** `CustomerService::findOrCreateFromUser` (candidature, offre d'achat, réservation) et `CustomerService::linkUser` (invitation `tenant` acceptée, `InvitationService`). Ni `UserObserver` ni `LeaseService` ne créent de fiche (relevé 2026-10-27).
- **Conséquence :** `MaintenanceRequest.requester_id` pointe vers User ; le Customer du demandeur se lit par `customers.user_id` **dans l'agence du bien** (`Customer::where('user_id', …)`), un compte ayant une fiche par agence — `User::customer()` a été retirée (TCK-2372, voir [§1](#1-user)), et `User::customers()` désigne les fiches que le compte a **saisies** (`added_by_id`), pas les siennes. Aucune relation `requesterCustomer()` sur le modèle.

### Règle 2 — Compteurs cache

Les colonnes `*_count` et `average_rating` ne doivent **jamais** être mises à jour via `save()` sur le modèle parent. Utiliser exclusivement :
- `DB::increment('table', 'column')` pour les compteurs simples
- Jobs planifiés (`RecalculatePropertyRatingsJob`, etc.) pour `average_rating`
- Observers pour synchronisation événementielle (ex: `FavoriteObserver::created()` → incrémente `properties.favorites_count`)

### Règle 3 — Morph `referenceable` dans AppNotification

Le lien d'une `AppNotification` vers son entité est un **morph manuel** (`referenceable_id`/`referenceable_type`), sans `morphTo` Eloquent. Le motif qui tient encore : un **contrôle fin des types reconnus**. Il vit à deux endroits (relevé du 2026-10-19) :

- `NotificationTarget::fromReferenceable()` — **le seul lecteur** : il déduit la cible d'une ligne sans `target` et reconnaît l'alias court **ou** le nom de classe (`booking`, `lease`, `lease_payment`, `maintenance`, `property_visit`, `property`, `kyc_dossier`, et les classes `BankStatement` et `RoleDelegation`). Un type inconnu ne produit aucune cible.
- `AppNotification::reference()`, qui ne connaissait que cinq alias et n'avait aucun appelant, est retirée (TCK-1045, P11.11, 2026-10-20). Les deux formes de `referenceable_type` restent écrites : l'unifier, ou cesser d'écrire le lien, n'a pas été décidé.

> ℹ️ Cette règle invoquait aussi « éviter la création des tables `model_has_...` de spatie ». Ce
> motif est **caduc depuis TCK-278** : le paquet est désinstallé et ces tables n'existent plus. Il
> est retiré ici plutôt que conservé, parce qu'une justification périmée se relit comme une
> justification vivante.

### Règle 5 — Profil = rôle

> 🆕 TCK-278 (refonte RBAC). Le User ne porte plus de rôle ; toute autorisation passe par le profil.

Loi architecturale : **le rôle d'un humain dans un contexte est l'existence d'un profil polymorphe actif dans ce contexte.** Le User est une identité authentifiée pure (email, mot de passe, 2FA, OAuth, status). Il n'a plus de table `model_has_roles` ni d'array `$user->roles[]`.

- **Inventaire des profils porteurs de rôle** :
  - `AgentProfile` ↔ rôle `agent`, scope `agency`
  - [`AgencyAdminProfile`](#98-agencyadminprofile-) ↔ rôle `agency_admin`, scope `agency`
  - `OwnerProfile` ↔ rôle `owner`, scope `agency`
  - `ServiceProviderProfile` + `ServiceProviderAgencyCollaboration` ↔ rôle `service_provider`, scope `agency` via la collaboration
  - ~~`BrokerProfile` + `BrokerAgencyCollaboration` ↔ rôle `broker`~~ — le rôle a quitté la surface
    le 2026-08-31 ([ADR-0027](adr/0027-le-courtier-sort-de-la-surface-commutable.md), TCK-495), puis
    les deux modèles et leurs tables ont quitté le code et la base le 2026-10-07
    ([ADR-0030](adr/0030-le-courtier-quitte-le-code-et-la-base.md), qui remplace ADR-0027 ; TCK-586).
  - `PlatformProfile` ↔ rôles plateforme (`super_admin` / `support` / `viewer`), scope `null` (cross-tenant)
- **Rôles dérivés non-profil-isés** : `customer` et `tenant`. **Ils sont émis depuis TCK-492**
  (2026-08-31) — `customer` est le PLANCHER de toute identité authentifiée, `tenant` se déduit d'un
  bail `active` ou `terminating`. La « profile-isation reportée à un ticket dédié » que cette ligne
  annonçait n'a jamais eu lieu et n'aura pas lieu : une ligne de profil survivrait au bail, et il
  faudrait alors la retirer — c'est-à-dire réimplémenter la dérivation, en pire.
- **Résolution d'une capacité** : un `MembershipCapabilityResolver` (service applicatif) mappe `(Capability, ProfileType) → bool` en phase 1 (table de vérité code-defined), et consulte le pivot `agency_role_capabilities` en phase 2 (TCK-279). Le site d'appel reste `$user->canActAt(Capability::PropertiesPublish, $agency)`.
- **Suppression d'un profil** = révocation immédiate du rôle correspondant. Aucun héritage résiduel, aucun cache de rôle sur User.
- **Invariant base de données** : il est **interdit** d'écrire dans `model_has_roles` / `model_has_permissions` après le cutover TCK-278. Ces tables sont supprimées par la migration de refonte.

### Règle 6 — 1 profil = 1 rôle personnalisé

> **En vigueur depuis le 2026-08-16** (TCK-279, `done`) et étendue au prestataire le 2026-08-17
> (TCK-315, [ADR-0016](adr/0016-role-agence-du-prestataire-porte-par-la-collaboration.md)). Cette section
> a été marquée « ⏳ NON IMPLÉMENTÉE » jusqu'au 2026-10-14 — deux mois après que les migrations
> l'eurent rendue vraie (passes 011-012 de `/sync-specs`). Mesure :
> `2026_08_16_120000` et `120100` créent `agency_roles` et `agency_role_capabilities` ; `120200`
> ajoute `agency_role_id`, `120300` amorce les rôles système, `120400` le rend NOT NULL sur
> `agent_profiles`, `agency_admin_profiles`, `owner_profiles` ; `2026_08_17_090000` à `090200` font
> de même sur `service_provider_agency_collaborations` ; `2026_08_22_100100` pose l'unicité partielle
> des rôles système.
>
> `MembershipCapabilityResolver` (signature gelée par [ADR-0003](adr/0003-capacites-enum-code-defined.md)
> pour que cette règle la remplace sans toucher un site d'appel) consulte désormais le pivot via le
> pointeur du profil ; aucun chemin d'autorisation ne le court-circuite. Le catalogue des capacités
> reste l'enum `Capability`, **définie en code** — son nombre de cas se lit à la source, jamais ici :
> `grep -c '^\s*case ' takussan-api/app/Models/Enums/Capability.php`.

Chaque porteur de rôle d'agence — `AgentProfile`, [AgencyAdminProfile](#98-agencyadminprofile-),
`OwnerProfile` et, pour le prestataire, la **collaboration** `ServiceProviderAgencyCollaboration`
(le profil prestataire est user-scopé, sans `agency_id` : ADR-0016) — pointe vers **exactement un**
`AgencyRole` via `agency_role_id NOT NULL`. Pas de M:N, pas de repli nullable : la capacité d'un
porteur s'obtient en lisant un seul rôle (trait `HasAgencyRole`). Entre profils d'un même user dans
une même agence, les capacités s'additionnent (OU).

- **Rôles système** : à la création d'une agence, `AgencyObserver::created()` amorce un `AgencyRole` `is_system=true` par `base_profile_type` (`AgencySystemRoleSeeder`). Tout porteur créé sans rôle reçoit le rôle système de son type (`HasAgencyRole::bootHasAgencyRole`).
- **Personnalisation** : l'admin d'agence **clone** un rôle (`clone_from`, `is_system=false`), édite ses capacités (`PUT /api/agencies/{agency}/roles/{role}/capabilities`), puis réaffecte les profils via `PATCH /api/profiles/{profile}/agency-role`. Écran : `/app/agency/roles` (ADR-0064). Réservé aux agences `standard` (`AgencyKindGuard::allowsCustomRoles()`).
- **Cumul de capacités** : pour qu'un user cumule deux rôles dans une même agence (« Agent + Validateur »), créer un `AgencyRole` qui bundle les deux. Pas de second profil de même type (unicité `(user_id, agency_id)` de chaque table de profil).
- **Cross-agence** : un user avec des profils dans plusieurs agences a un `AgencyRole` distinct par agence — celui du profil actif.
- **Suppression d'un AgencyRole utilisé** : refusée (FK `restrictOnDelete`, précédée d'un 409 de l'API). La transition passe par la réaffectation explicite, puis la suppression.
- **Plateforme** : `PlatformProfile` n'a pas de `agency_role_id` (les capacités plateforme dérivent de `level`, pas d'agence à scoper).

### Règle 4 — Active profile context

> 🆕 TCK-138 → TCK-141. Préalable à la suppression de `users.agency_id` (TCK-142).

Toute requête authentifiée résout un **profil actif** parmi les profils du user, et c'est ce profil — pas le user — qui détermine le scope d'autorisation.

- **Résolution** par le middleware `ResolveActiveProfile` (registered after `auth`), dans cet ordre :
  1. Header `X-Profile-Id` ou query `?profile_id=…` si fourni → vérifier `user_id` matche, sinon **403**
  2. Cookie httpOnly `active_profile_id` posé par `PATCH /api/me/active-profile`
  3. Auto-bascule si l'utilisateur n'a qu'un seul profil
  4. **Aucun profil** : autorisé pour les admins purs (rôles globaux non scopés) — `team_id = null`
- **Effet sur le RBAC (post-TCK-278)** : plus de `setPermissionsTeamId()` — l'autorisation passe par le profil actif (cf. [Règle 5](#règle-5--profil--rôle)). Le middleware expose `request()->activeProfile()` ; les Policies appellent `$user->canActAt(Capability::xxx, $profile->agency)` ou consultent directement `$profile->agencyRole`.
- **Exposition runtime** : `request()->activeProfile()` et `auth()->user()->activeProfile()` (helpers fournis en TCK-141). Tout site applicatif consultant l'agence du user **doit** lire `request()->activeProfile()->agency_id` plutôt que `users.agency_id` (qui disparaît en TCK-142).
- **Endpoints** :
  - `GET /api/me/profiles` — liste des profils du user authentifié (avec agence et statut)
  - `PATCH /api/me/active-profile` — sélectionne le profil actif et persiste le cookie

---

## Contraintes d'unicité

> **Extrait, pas inventaire — la source fait foi : les migrations.** La liste exhaustive se lit en
> base : `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' and
> indexdef like 'CREATE UNIQUE%' order by 1` (et `pg_constraint where contype = 'c'` pour les
> CHECK). Chaque ligne ci-dessous a été relevée le 2026-10-14 contre la base de développement migrée
> et contre sa migration (passe 012 de `/sync-specs`, M38) ; la section du modèle porte le détail.
>
> ⚠ **Un `NULL` n'entre en conflit avec rien** (PostgreSQL tient les `NULL` pour distincts, sauf
> `NULLS NOT DISTINCT`). Une unicité composée dont une colonne est nullable ne protège donc pas les
> lignes où elle est nulle : c'est dit ligne par ligne dans la colonne « Condition ».

| Table | Colonnes | Type | Condition |
|-------|----------|------|-----------|
| users | forme canonique de `phone` (`users_phone_verified_unique`) | unique partiel | `phone_verified_at IS NOT NULL AND deleted_at IS NULL` (TCK-589, ADR-0033) — un numéro non vérifié n'est pas unique. Les doublons antérieurs ont été résolus par `2026_10_07_150190` : le plus récemment vérifié garde la vérification. Voir [§1](#1-user) |
| users | `LOWER(username)`, `LOWER(email)` (ICU) | unique | toujours (`NULL` admis plusieurs fois) — ADR-0025. *La CHECK `(username IS NOT NULL OR email IS NOT NULL)` que cette table annonçait n'existe dans aucune migration ; elle contredirait un compte ouvert par téléphone seul* |
| agencies | `license_number` | unique | si non null |
| agencies | `slug` | unique | toujours |
| tags | `name` | unique | toujours — à l'octet ; l'unique d'origine n'a jamais été retiré |
| tags | `LOWER(name COLLATE "und-x-icu")` (`tags_name_lower_unique`) | unique sur expression | toujours — casse repliée par ICU, accents distincts (ADR-0025) ; voir [§10](#10-tag) |
| tags | `slug` | unique | toujours |
| taggables | `(tag_id, taggable_id, taggable_type)` | clé primaire composite (`taggables_pkey` en base : PostgreSQL ignore le nom `taggables_primary` que la migration demande) | toujours |
| properties | `reference_number` | unique | si non null |
| properties | `slug` | unique | toujours (fabriqué par `Str::slug()` : aucune variante de casse possible) |
| properties | `ical_export_token_hash` (`properties_ical_token_hash_unique`) | unique | si non null (TCK-596) |
| leases | `reference_number` | unique | toujours |
| lease_guarantor | `(lease_id, guarantor_id)` (`lease_guarantor_unique`) | unique composé | toujours |
| bookings | `reference_number` | unique | si non null |
| lease_payments | `bank_statement_line_id` (`lease_payments_bank_line_unique`) | unique partiel | `bank_statement_line_id IS NOT NULL` — *`lease_payments.reference_number`, que cette table disait unique, ne l'est pas (`2026_04_17_160013` : `nullable()` sans `unique()`)* |
| booking_payments | `bank_statement_line_id` (`booking_payments_bank_line_unique`) | unique partiel | `bank_statement_line_id IS NOT NULL` |
| payouts | `reference_number` | unique | toujours |
| payouts | `bank_statement_line_id` (`payouts_bank_line_unique`) | unique partiel | `bank_statement_line_id IS NOT NULL` (`2026_10_07_150200`) |
| payout_lease_payment | `lease_payment_id` (`payout_lp_lease_payment_unique`) | unique | toujours — une échéance n'est retenue que par un reversement (`2026_10_07_200400`) |
| payout_booking_payment | `booking_payment_id` (`payout_bp_booking_payment_unique`) | unique | toujours (`2026_10_07_200400`) |
| payout_clawback_imputations | `(payout_id, payout_clawback_id)` (`payout_clawback_imputations_pair_unique`) | unique composé | toujours (`2026_10_24_050000`, TCK-2151) — voir [§107](#107-payoutclawback-) |
| invoices | `(agency_id, reference_number)` (`invoices_agency_reference_unique`) | unique composé | si `agency_id` non null — l'unique global `invoices_reference_number_unique` a été retiré par `2026_10_07_200700` |
| invoices | `reference_number` (`invoices_reference_no_agency_unique`) | unique partiel | `agency_id IS NULL` |
| invoices | `(agency_id, kind, sequence_year, sequence_number)` (`invoices_agency_kind_seq_unique`) | unique composé | si `agency_id`, `sequence_year` et `sequence_number` non nuls (`2026_10_07_200700`) |
| invoices | `bank_statement_line_id` (`invoices_bank_line_unique`) | unique partiel | `bank_statement_line_id IS NOT NULL` (`2026_04_28_000005`) |
| reviews | `(author_id, reviewable_type, reviewable_id, context_type, context_id)` (`reviews_author_subject_context_uniq`) | unique partiel | `context_id IS NOT NULL` — un avis par auteur, sujet noté et preuve ; remplace `reviews_author_context_uniq` (`2026_10_24_040000`, TCK-2062) ; voir [§11](#11-review) |
| saved_searches | `(user_id, name)` | unique composé | si `user_id` non null — une recherche d'abonné sans compte (`alert_subscriber_id`) n'est pas couverte |
| favorites | `(user_id, property_id)` | unique composé | toujours |
| property_collaborators | `(property_id, user_id)` | unique composé | toujours |
| property_collaborators | `property_id` (`property_collaborators_one_primary_per_property`) | unique partiel | `WHERE is_primary` — un seul agent principal par bien 🆕 (TCK-504, ADR-0053) |
| property_collaborators | CHECK `property_collaborators_primary_is_agent (NOT is_primary OR role = 'agent')` | contrainte DB | toujours 🆕 (TCK-504) |
| conversation_participants | `(conversation_id, user_id)` | unique composé | toujours |
| document_share_links | `token_hash` (`dsl_token_hash_unique`) | unique | toujours — l'unique sur `token` a été retiré par `2026_10_08_180000` (`token` est désormais chiffré) |
| settings | `(key, scope, scope_id)` | unique composé, `NULLS NOT DISTINCT` | toujours — une clé `global` (`scope_id` nul) est protégée comme une clé d'agence (TCK-640) |
| integrations | `(provider, agency_id)` (`integrations_provider_agency_live_unique`) | unique partiel, `NULLS NOT DISTINCT` | `deleted_at IS NULL` — l'intégration de plateforme (`agency_id` nul) comprise (TCK-640) |
| integrations | `webhook_token_hash` (`integrations_webhook_token_hash_unique`) | unique | si non null (`2026_10_08_120000`) |
| owner_profiles | `(user_id, agency_id)` | unique composé | si `user_id` non null (brouillon d'invitation sans titulaire : plusieurs admis) |
| agent_profiles | `(user_id, agency_id)` | unique composé | si `user_id` non null (idem) |
| agency_admin_profiles | `(user_id, agency_id)` | unique composé | toujours (`user_id` nullable : plusieurs lignes sans titulaire admises) — [§98](#98-agencyadminprofile-) |
| service_provider_agency_collaborations | `(service_provider_profile_id, agency_id)` (`sp_agency_collab_live_unique`) | unique partiel | `deleted_at IS NULL` (`2026_10_07_120100`) |
| service_provider_profiles | `user_id` (`service_provider_profiles_user_live_unique`) | unique partiel | `user_id IS NOT NULL AND deleted_at IS NULL` (`2026_10_25_223720`, TCK-2372) — un profil de prestataire vivant par compte ; l'unicité de la création, retirée par `2026_05_10_170000` (TCK-260), ne laissait que la garde applicative, voir [§37](#37-serviceproviderprofile-) |
| payout_methods | `user_id` (`payout_methods_user_default_unique`) | unique partiel | `is_default AND deleted_at IS NULL` (`2026_10_25_223721`, TCK-2372) — une destination vivante par défaut par compte, voir [§76](#76-payoutmethod-) |
| platform_payouts | `(agency_id, period_end)` (`platform_payouts_unique_open_period`) | unique partiel | `status <> 'cancelled'` (`2026_05_07_000223`) |
| platform_payouts | `bank_statement_line_id` (`platform_payouts_bank_line_unique`) | unique partiel | `bank_statement_line_id IS NOT NULL` (`2026_10_22_174000`, TCK-1421) — voir [§45](#45-platformpayout-) |
| agency_upgrade_requests | `agency_id` (`agency_upgrade_requests_one_pending_per_agency`) | unique partiel | `status = 'pending'` (`2026_05_10_180000`) |
| notification_templates | `(event, channel, locale)` | unique composé | toujours (`2026_05_07_000215`) |
| bank_statements | `(agency_id, file_hash)` | unique composé | toujours 🆕 |
| notification_preferences | `(user_id, event_type, channel)` | unique composé | toujours — [§99](#99-notificationpreference-) |
| invitations | `token` | unique | toujours — [§48](#48-invitation-) ; l'invitation a au moins un destinataire (`invitations_email_or_phone_check`) |
| users | `secondary_phone` | unique partiel | `secondary_phone_verified_at IS NOT NULL AND deleted_at IS NULL` 🆕 (TCK-633) |
| geo_regions | `code` ; `slug` | unique | toujours 🆕 (TCK-633) |
| geo_cities | `(geo_region_id, slug)` ; `(geo_region_id, LOWER(name COLLATE "und-x-icu"))` | unique composé | toujours 🆕 (TCK-633) |
| geo_neighborhoods | `(geo_city_id, slug)` | unique composé | toujours 🆕 (TCK-633) |
| geo_neighborhoods | `(geo_city_id, LOWER(name COLLATE "und-x-icu"))` | unique partiel | `status <> 'rejected' AND merged_into_id IS NULL` 🆕 (TCK-633) |
| boost_products | `(kind, variant, duration_days)` | unique composé | `NULLS NOT DISTINCT` 🆕 (TCK-633) |
| property_boost_daily_stats | `(property_boost_id, date)` | unique composé | toujours 🆕 (TCK-633) |
| property_boost_tranches | `(property_boost_id, position)` | unique composé | toujours 🆕 (TCK-942) |
| credit_welcome_grants | `phone_hash` ; `agency_id` | unique | toujours (`agency_id` : plusieurs `NULL` admis) 🆕 (TCK-633) |

---

## Comportements FK (onDelete)

> Règle à appliquer systématiquement dans toutes les migrations. Documenter le choix pour chaque FK.
>
> **Exemples, pas inventaire.** Chaque exemple a été relevé le 2026-10-14 contre la base de
> développement migrée et sa migration (passe 012 de `/sync-specs`). Le comportement réel de toutes
> les FK se lit en base : `select conrelid::regclass, conname, confdeltype from pg_constraint where
> contype = 'f'` (`c` cascade, `n` set null, `r` restrict, `a` no action).

| Type de relation | Comportement | Exemples |
|-----------------|-------------|---------|
| Table enfant "de vie" — ne peut pas exister sans le parent | `cascadeOnDelete()` | messages → conversation, lease_payments → lease, booking_payments → booking, conversation_participants → conversation, inventories → lease, favorites → property/user, property_price_histories → property, document_share_links → document, customer_notes → customer, integrations → agency, app_notifications → user, role_delegations.replaces_user_id → user (l'absence suit l'absent, `2026_10_07_591400`) |
| FK vers User/Customer "acteur historique" — les logs/actions restent même si l'utilisateur est supprimé | `nullOnDelete()` | property_visits.visitor_id, leases.terminated_by_id, guarantors.added_by_id, payouts.issued_by_id, payouts.approved_by_id, payouts.processed_by_id, platform_payouts.closed_by_id, platform_payouts.paid_by_id, property_price_histories.changed_by_id, reviews.replied_by_id, property_reports.resolved_by_id, integration_webhook_logs.replayed_by_id, document_share_links.created_by_id, customer_notes.author_id, tasks.assigned_to_id, tasks.created_by_id, settings.updated_by_id, activity_log.impersonator_id — *`activity_log.causer_id` n'a **aucune** FK (`nullableMorphs` de spatie) : la ligne survit, `causer_id` pointe alors vers un utilisateur disparu* |
| FK métier critique — suppression bloquée si des données dépendent | `restrictOnDelete()` | leases.property_id, leases.tenant_id, leases.landlord_id, lease_payments.payer_id, bookings.property_id, inventories.tenant_id, payouts.landlord_id, invoices.customer_id, `agency_role_id` des porteurs de rôle (agent_profiles, agency_admin_profiles, owner_profiles, service_provider_agency_collaborations — Règle 6), geo_cities.geo_region_id, geo_neighborhoods.geo_city_id (une région ou une ville référencée ne se supprime pas, `2026_10_12_400000`) |
| FK optionnelle — perd son lien si le parent est supprimé | `nullOnDelete()` | properties.agency_id, leases.agency_id, leases.agent_id, leases.guarantor_id, leases.renewed_from_lease_id, properties.parent_id, bookings.customer_id, reviews.agency_id, payouts.agency_id, payouts.lease_id, payouts.booking_id, payouts.payout_method_id, payouts.service_provider_bill_id, invoices.credited_invoice_id, addresses.geo_city_id, addresses.geo_neighborhood_id (`2026_10_12_400100`) |

---

## Évolutions futures

> Fonctionnalités et modèles évalués et **volontairement reportés** à cette itération. Chaque entrée indique son statut et son déclencheur d'implémentation.

### EF1 — Modèle `Receipt` séparé

**Statut :** reporté.

Le champ `receipt_number` de `BookingPayment` et les quittances PDF rendues à la demande (`PaymentReceiptPdf` par `DocumentPdfService`, TCK-172) couvrent le besoin actuel. Un modèle `Receipt` distinct n'apporte pas de valeur supplémentaire pour le MVP. *(Relevé 2026-10-14 : `lease_payments` n'a pas de colonne `receipt_number`, et le PDF n'est pas stocké par medialibrary — cette entrée disait l'inverse.)*

**Déclencheur :** apparition d'un workflow de récépissé distinct du paiement (ex: récépissé de dépôt de dossier sans paiement immédiat).

### EF2 — Modèle `Commission`

**Statut :** ✅ **réalisé autrement** — par [§85 CommissionEntry](#85-commissionentry-), le grand
livre des commissions d'agence (TCK-595, [ADR-0049](adr/0049-attribution-des-transactions-et-grand-livre-des-commissions.md),
`2026_10_08_150100`). Cette entrée l'a dit « reporté » jusqu'au 2026-10-14.

Les colonnes `commission_amount` et `commission_rate` de `Lease` subsistent : elles portent la
commission du bail ; `commission_entries` en ventile la part de chaque bénéficiaire (négociateur
`leases.agent_id`, collaborateurs `agent` du bien — `CommissionOrigin`), figée à l'activation du bail,
avec son statut `due` / `paid` / `cancelled` (`CommissionEntryStatus`).

Des trois déclencheurs prévus, le premier (ventiler entre plusieurs bénéficiaires) est servi ; le
deuxième ne l'est pas : une entrée se paie **en une fois** (`paid_at`, `paid_by_id`), sans
versement échelonné.

### EF3 — Modèle `NotificationPreference` (préférences fines)

**Statut :** ✅ **réalisé** — par TCK-070 (`2026_04_23_090000_create_notification_preferences_table`),
matrice restreinte aux cases servies par TCK-588. Décrit en [§99 NotificationPreference](#99-notificationpreference-).
Cette entrée l'a dit « reporté », avec un « schéma probable », jusqu'au 2026-10-14 — six mois après
la migration.

Le schéma réel diffère du schéma qu'elle prévoyait : la colonne s'appelle `event_type` (string(64),
liste `PreferenceResolver::EVENTS`), pas `notification_type` (`NotificationType`) ; `channel` est une
chaîne libre au vocabulaire de `PreferenceResolver` (`inapp`…), pas l'enum `NotificationChannel`
(`app`…). Les trois booléens `notifications_*_enabled` de `User` subsistent à côté.

### EF4 — Fusion `BookingPayment` / `LeasePayment`

**Statut :** **refusé.**

Les workflows sont réellement distincts (ponctuel vs récurrent avec échéancier). Fusionner imposerait ~8 colonnes nullable selon le cas, complexifierait les validations et les index. La factorisation se fait via le trait `HasPaymentAttributes` (colonnes et casts partagés).

### EF5 — Table `message_reads` (lecture fine des messages)

**Statut :** **refusé pour l'instant.**

Le système actuel (`conversation_participant.last_read_at` comparé à `message.created_at`) est suffisant pour les conversations à 2 participants.

**Déclencheur :** apparition de conversations à > 5 participants (canaux support multi-agents, groupes d'équipe agence). Schéma probable : `message_reads(message_id, user_id, read_at)`.

⚠ **Le déclencheur est atteint dans le code** (relevé 2026-10-14) : un groupe compte de 3 à 20
participants actifs — son créateur et 2 à 19 invités (`CreateGroupConversationRequest`), plafond tenu
à l'ajout (`AddParticipantsRequest`). Le refus tient toujours (aucune table `message_reads`) ; il est
à réexaminer par ticket.

### EF6 — spatie/laravel-activitylog : migration des données

**Statut :** sans objet — la table `activity_logs` n'a jamais existé dans ce dépôt (aucune migration ne l'a créée ; relevé de la passe 013 de `/sync-specs`, confirmé le 2026-10-19). Il n'y a rien à migrer.

### EF7 — Multi-branches agence (`Agency.parent_agency_id`)

**Statut :** reporté.

Le modèle `Agency` reste à un seul niveau pour le MVP. L'ajout d'une FK réflexive `parent_agency_id` (+ relations `parent()` / `branches()`) permettrait de gérer des sous-agences / franchises.

**Déclencheur :** première demande d'un client franchise ou d'un groupe immobilier avec plusieurs antennes juridiquement distinctes mais partageant un backoffice.

### EF8 — Modèle `AgentAvailability`

**Statut :** ❌ **écarté** par [ADR-0035](adr/0035-l-absence-est-une-delegation-qui-n-accorde-rien.md)
(TCK-591). Cette entrée l'a dit « reporté », avec un « schéma probable », jusqu'au 2026-10-14.

Une absence n'est pas une table à part : c'est une ligne de `role_delegations` qui nomme l'absent
(`replaces_user_id`, `2026_10_07_591400`) avec le rôle `absence_cover`, qui **n'accorde aucun
droit** — voir [§66 RoleDelegation](#66-roledelegation-). Le nom `AgentAvailability` existe, mais
comme **service** (`App\Services\Agency\AgentAvailability`, `substituteFor()`) qui lit ces lignes
pour dire à qui router le travail de l'absent ; ce n'est pas un modèle.

### EF9 — Modèle `ExchangeRate`

**Statut :** reporté.

L'enum `Currency` existe déjà (XOF, XAF, EUR, USD) mais la conversion effective entre devises n'est pas implémentée. Un modèle `ExchangeRate` (base_currency, target_currency, rate, valid_from, valid_to, source) permettrait de stocker les taux historisés.

**Déclencheur :** première transaction devant être réglée dans une devise différente de celle du bail / de l'annonce (ex: bail en XOF payé en EUR).
