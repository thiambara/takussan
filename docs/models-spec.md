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

| Modèle | Collections | Description |
|--------|-------------|-------------|
| User | `avatar` | Photo de profil |
| Agency | `logo` | Logo de l'agence |
| Property | `photos`, `plans`, `videos`, `virtual_tours` | Photos, plans/schémas, vidéos, visites virtuelles 360° |
| Guarantor | `id_documents` | CNI, attestations de revenus, fiches de paie |
| Customer | `photo`, `id_documents` | Photo du contact, pièces d'identité |
| Message | `attachments` | Pièces jointes aux messages |
| MaintenanceRequest | `photos`, `completion_photos` | Photos du problème, photos après intervention |
| Document | `file` | Le fichier du document lui-même |
| Inventory | `photos` | Photos de l'état des lieux |

### ~~`spatie/laravel-permission`~~ — **DÉSINSTALLÉ** (TCK-278)

> 🚫 **Ce paquet n'est plus installé.** Il est absent de `composer.json` et de
> `composer.lock`, et une garde CI (`api-ci.yml`) casse sur tout import de son namespace.
> Il reste listé ici, barré, parce qu'il l'a été longtemps et que son absence est une
> information — pas parce qu'il fait partie de la pile. Décision : [ADR-0002](adr/0002-role-est-un-profil-polymorphe.md).

> ⚠️ **Refonte architecturale TCK-278 → TCK-279.** Le trait `HasRoles` est **retiré du modèle `User`**. Le « rôle » d'un humain dans le système n'est plus un attribut auth-level mais une **propriété dérivée du profil polymorphe** dont il dispose dans un contexte donné (agence ou plateforme). Voir [Règle 5 — Profil = rôle](#règle-5--profil--rôle).

**Phase 1 (TCK-278) — Suppression de spatie sur User.**
- `User` ne porte plus de rôle direct. Les checks `$user->hasRole('agent')` sont remplacés par `$user->isAgentAt($agency)` / `$user->hasProfileAt($agency, AgentProfile::class)` / `$user->canActAt(Capability::xxx, $agency)`.
- Les rôles « plateforme » (`super_admin`, `support`, `viewer`) deviennent un nouveau modèle polymorphe : [PlatformProfile](#51-platformprofile-).
- Les rôles « customer » et « tenant » ne deviennent pas des profils en phase 1 : ils sont **dérivés** de la présence d'une `Booking` / `Lease` actif dans l'agence (helpers `isCustomerOf($agency)` / `isTenantOf($agency)`). Profile-isation reportée si TCK-020 / TCK-090 en font émerger le besoin.
- L'enum `Capability` (code-defined) catalogue toutes les capacités atomiques de l'application (≈ 30–50 entrées groupées par domaine). Un résolveur `MembershipCapabilityResolver` mappe `(Capability, ProfileType) → bool`.
- Les tables spatie (`roles`, `permissions`, `model_has_roles`, `model_has_permissions`, `role_has_permissions`) **disparaissent**.

**Phase 2 (TCK-279, `todo` — rien n'en est livré) — rôles personnalisés par agence.**

> ⚠️ Cette phase était décrite comme une « **réintroduction du trait `HasRoles` + `HasPermissions`
> sur les Profils** ». C'est impossible en l'état et il faut le dire ici plutôt que de le laisser
> découvrir à l'implémentation : les deux traits appartiennent à `spatie/laravel-permission`, qui
> n'est plus installé et sur lequel une garde CI casse. Ce que la phase 2 décrit réellement est un
> mécanisme **maison** — `AgencyRole` + `agency_role_capabilities` — dont ni les tables ni le code
> n'existent aujourd'hui.

- Les profils polymorphes (`AgentProfile`, `AgencyAdminProfile`, `OwnerProfile`, `ServiceProviderProfile`, `BrokerProfile`) porteraient un rôle d'agence, **sans trait spatie** : le pointeur `agency_role_id` suffit.
- La table [AgencyRole](#52-agencyrole--tck-279) tient le rôle côté agence (`name`, `base_profile_type`, `is_system`) — la place que tenait la table `roles` avant TCK-278.
- *(Cible, non implémentée)* Un profil pointera vers exactement un `AgencyRole` (`agency_role_id` NOT NULL) — voir [Règle 6](#règle-6--1-profil--1-rôle-personnalisé--non-implémentée), qui dit explicitement ce qui n'existe pas encore.
- Permissions atomiques (catalogue `Capability`) attachées à un `AgencyRole` via le pivot `agency_role_capabilities`.
- `MembershipCapabilityResolver` consulte le pivot ; les sites d'appel `$user->canActAt(...)` restent inchangés.

**Rôles métier actuels** (= types de profils en phase 1+) : owner, agent, agency_admin, broker, service_provider, *(customer/tenant dérivés)*.

### `spatie/laravel-activitylog`

Remplace le modèle custom `ActivityLog`. Gère automatiquement le journal d'audit via le trait `LogsActivity` sur chaque modèle concerné.
Les tables `activity_log` et la configuration du package (`config/activitylog.php`) remplacent entièrement le modèle custom.
Voir la section [13. ActivityLog](#13-activitylog) pour les détails de migration.

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
36. [BrokerProfile](#36-brokerprofile-) 🆕
37. [ServiceProviderProfile](#37-serviceproviderprofile-) 🆕
38. [BrokerAgencyCollaboration](#38-brokeragencycollaboration-) 🆕
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
**Description :** **Identité authentifiée pure.** Le User porte uniquement ce qui caractérise un humain (email, mot de passe, contacts, 2FA, OAuth, préférences). Sa **nature métier** (propriétaire, agent, admin agence, courtier, prestataire, opérateur plateforme) est portée par des **profils polymorphes** dédiés liés au user et scopés par agence — ou par la plateforme pour `PlatformProfile`. Un même humain peut cumuler plusieurs profils chez plusieurs agences via une seule identité.

> **Évolution TCK-138 → TCK-142.** Les colonnes `type` (enum `UserType`) et `agency_id` sont **dépréciées** ; elles disparaissent de `users` au cutover (TCK-142). Toute logique d'autorisation/scoping est rebasée sur le **profil actif** de la requête (voir [Active profile context](#active-profile-context)).

> **Évolution TCK-278 (refonte RBAC).** Le User **ne porte plus de rôle direct** (`HasRoles` retiré). Le rôle est la conséquence de l'existence d'un profil dans un scope. Voir [Règle 5 — Profil = rôle](#règle-5--profil--rôle). Les rôles plateforme (super_admin, support, viewer) sont portés par [PlatformProfile](#51-platformprofile-).

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| username | string | oui | null | Nom d'utilisateur unique | |
| email | string | oui | null | Adresse email unique | |
| password | string | | | Mot de passe hashé | |
| ~~type~~ | — | — | — | ~~Supprimée — la nature métier est portée par les profils polymorphes (cutover TCK-142)~~ | ➖ |
| status | UserStatus | oui | 'active' | Statut du compte | |
| first_name | string | oui | null | Prénom | |
| last_name | string | oui | null | Nom de famille | |
| phone | string | oui | null | Numéro de téléphone principal | |
| email_verified_at | datetime | oui | null | Date de vérification email | |
| phone_verified_at | datetime | oui | null | Date de vérification téléphone | ➕ |
| ~~avatar_url~~ | — | — | — | ~~Remplacé par media collection `avatar` (spatie/medialibrary)~~ | ➖ |
| bio | text | oui | null | Biographie / présentation | ➕ |
| preferred_language | string(5) | oui | 'fr' | Langue préférée (fr, en, wo) | ➕ |
| last_login_at | datetime | oui | null | Dernière connexion | ➕ |
| ~~agency_id~~ | — | — | — | ~~Supprimée — l'attache à une agence est portée par le profil actif (cutover TCK-142)~~ | ➖ |
| added_by_id | FK users | oui | null | Créateur du compte (si ajouté par un admin/agent) | |
| google_id | string | oui | null | Identifiant OAuth Google | |
| facebook_id | string | oui | null | Identifiant OAuth Facebook | ➕ |
| apple_id | string | oui | null | Identifiant OAuth Apple | ➕ |
| remember_token | string | oui | null | Token de session persistante | |
| timezone | string | | 'Africa/Dakar' | Fuseau horaire préféré | ➕ |
| two_factor_enabled | boolean | | false | Authentification à deux facteurs activée | ➕ |
| two_factor_secret | text (encrypted) | oui | null | Secret TOTP (chiffré) | ➕ |
| two_factor_recovery_codes | text (encrypted) | oui | null | Codes de récupération 2FA (chiffrés) | ➕ |
| notifications_email_enabled | boolean | | true | Alertes par email activées | ➕ |
| notifications_push_enabled | boolean | | true | Alertes push activées | ➕ |
| notifications_sms_enabled | boolean | | false | Alertes SMS activées | ➕ |
| metadata | json | oui | null | Données supplémentaires flexibles | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | Date de création | |
| updated_at | datetime | | auto | Date de modification | |

**Colonnes supprimées :**
- ➖ `model_id` + `model_type` (nullableMorphs 'model') — non utilisés, redondants avec les profils et la relation `customer()`
- ➖ `avatar_url` — remplacé par media collection `avatar` via spatie/medialibrary
- ➖ `type` (enum `UserType`) — la nature métier est portée par les profils polymorphes ; cutover effectif en TCK-142
- ➖ `agency_id` — l'attache à une agence est portée par chaque profil ; cutover effectif en TCK-142

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `avatar`
- ~~`HasRoles` (spatie/laravel-permission)~~ — **retiré en TCK-278.** Le rôle est dérivé des profils ; voir [Règle 5](#règle-5--profil--rôle).
- `HasApiTokens` (laravel/sanctum) — authentification API
- `HasProfiles` (custom, TCK-140 / enrichi TCK-278) — expose `ownerProfiles()`, `agentProfiles()`, `agencyAdminProfiles()`, `brokerProfile()`, `serviceProviderProfile()`, `platformProfile()`, `profiles()`, `activeProfile()`, `hasProfileAt()`, `isAgentAt()`, `isAgencyAdminAt()`, `isOwnerAt()`, `isSuperAdmin()`, `canActAt(Capability, Agency)` etc.

**Accesseurs :**
- `full_name` : concaténation de `first_name` + `last_name`

**Relations :**
- `added_by()` → belongsTo User
- `owner_profiles()` → hasMany OwnerProfile 🆕
- `agent_profiles()` → hasMany AgentProfile 🆕
- `agency_admin_profiles()` → hasMany AgencyAdminProfile 🆕 (TCK-271)
- `broker_profile()` → hasOne BrokerProfile 🆕
- `service_provider_profile()` → hasOne ServiceProviderProfile 🆕
- `platform_profile()` → hasOne PlatformProfile 🆕 (TCK-278)
- `profiles()` → collection unifiée des profils du user (Eloquent `Collection` retournée par accesseur, pas une relation Eloquent native) 🆕
- `properties()` → hasMany Property
- `bookings()` → hasMany Booking
- `booking_payments()` → hasMany BookingPayment
- `customers()` → hasMany Customer (via added_by_id)
- `customer()` → hasOne Customer (via user_id)
- `customer_relationships()` → hasMany UserCustomerRelationship
- `related_customers()` → belongsToMany Customer (pivot)
- `addresses()` → morphMany Address
- `leases()` → hasMany Lease (via landlord_id — en tant que bailleur) 🆕
- `favorites()` → hasMany Favorite 🆕
- `conversations()` → belongsToMany Conversation (via ConversationParticipant) 🆕
- `saved_searches()` → hasMany SavedSearch 🆕
- `app_notifications()` → hasMany AppNotification (table `app_notifications`) 🆕
- `written_reviews()` → hasMany Review (avis rédigés par cet utilisateur) 🆕
- `received_reviews()` → morphMany Review (avis reçus sur cet utilisateur, via `reviewable`) 🆕
- `documents()` → morphMany Document (pièces d'identité, RIB, etc.) 🆕

---

### 2. Agency

**Table :** `agencies`
**Description :** Agence immobilière enregistrée sur la plateforme, regroupant des agents et gérant un portefeuille de biens.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| name | string | | | Raison sociale | |
| slug | string | | | Identifiant URL unique | |
| kind | AgencyKind | | 'standard' | Type d'agence — `standard` (multi-membres, pleine capacité) ou `individual` (host solo auto-créé via CTA "Publier") | ➕ |
| license_number | string | oui | null | Numéro de licence professionnelle | |
| email | string | oui | null | Email de contact | |
| phone | string | oui | null | Téléphone principal | |
| website | string | oui | null | Site web | |
| ~~logo_path~~ | — | — | — | ~~Remplacé par media collection `logo` (spatie/medialibrary)~~ | ➖ |
| description | text | oui | null | Présentation de l'agence | |
| status | AgencyStatus | | 'active' | Statut (active, inactive, suspended) | |
| commission_rate | decimal(5,2) | oui | null | Taux de commission par défaut (%) | ➕ |
| founded_at | date | oui | null | Date de création de l'agence | ➕ |
| is_verified | boolean | | false | Agence vérifiée par l'admin Takussan | ➕ |
| verified_at | datetime | oui | null | Date de vérification | ➕ |
| primary_admin_id | FK users | oui | null | Responsable principal de l'agence | ➕ |
| properties_count | integer | | 0 | Compteur biens (cache — mettre à jour via Observer ou job) | ➕ |
| active_leases_count | integer | | 0 | Compteur baux actifs (cache) | ➕ |
| average_rating | decimal(2,1) | oui | null | Note moyenne (cache) | ➕ |
| settings | json | oui | null | Paramètres internes (préférences, config) | |
| metadata | json | oui | null | Données supplémentaires flexibles | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Colonnes supprimées :**
- ➖ `logo_path` — remplacé par media collection `logo` via spatie/medialibrary

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `logo`

**Relations :**
- `users()` → hasMany User (agents de l'agence)
- `properties()` → hasMany Property
- `address()` → morphOne Address 🆕
- `reviews()` → morphMany Review 🆕
- `leases()` → hasMany Lease (via agency_id) 🆕
- `primaryAdmin()` → belongsTo User (via primary_admin_id) 🆕
- `documents()` → morphMany Document (licence, statuts, K-bis équivalent) 🆕

---

### 3. Property

**Table :** `properties`
**Description :** Bien immobilier mis en vente ou en location. Entité centrale de la plateforme autour de laquelle gravitent les réservations, baux, visites et paiements.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| parent_id | FK properties | oui | null | Bien parent (ex: immeuble contenant des appartements) | |
| user_id | FK users | | | Propriétaire du bien | |
| agency_id | FK agencies | oui | null | Agence gestionnaire | |
| title | string | | | Titre de l'annonce | |
| description | text | oui | null | Description détaillée | |
| reference_number | string | oui | null | Référence unique du bien (ex: TK-2025-001) | ➕ |
| type | PropertyType | | | Type de bien (voir enum PropertyType) | ✏️ |
| status | PropertyStatus | | 'available' | Statut du bien | |
| visibility | PropertyVisibility | | 'private' | Visibilité de l'annonce | |
| contract_type | ContractType | | | Type de contrat proposé (sale, rent) | ✏️ |
| price | decimal(14,2) | oui | null | Prix de vente ou loyer mensuel | |
| currency | Currency | | 'XOF' | Devise (XOF, XAF, EUR, USD) | ✏️ |
| area | integer | oui | null | Superficie en m² | |
| bedrooms | integer | oui | null | Nombre de chambres | ➕ |
| bathrooms | integer | oui | null | Nombre de salles de bain | ➕ |
| furnished | boolean | | false | Meublé ou non | ➕ |
| floor_number | integer | oui | null | Étage du bien (pour appartement/bureau) | ➕ |
| total_floors | integer | oui | null | Nombre total d'étages du bâtiment | ➕ |
| year_built | integer | oui | null | Année de construction | ➕ |
| parking_spaces | integer | oui | null | Nombre de places de parking | ➕ |
| lot_position | string | oui | null | Position du lot (angle, mitoyen) | ✏️ ancien `position` |
| level | integer | oui | null | Niveau dans la hiérarchie (immeuble → étage) | |
| title_type | TitleType | oui | null | Type de titre foncier (bail, titre_foncier, deliberation, autre) | ✏️ |
| admin_monitored | boolean | | false | Avec suivi administratif | ✏️ ancien `with_administrative_monitoring` |
| ~~amenities~~ | — | — | — | ~~Remplacé par Tags de type `amenity` (migration P3.10 — données seedées en Tags via TagSeeder)~~ | ➖ |
| featured | boolean | | false | Annonce mise en avant / sponsorisée | ➕ |
| views_count | integer | | 0 | Nombre de vues de l'annonce (cache — incrémenter via `DB::increment()` ou job asynchrone, pas via `save()`) | ➕ |
| favorites_count | integer | | 0 | Nombre de fois ajouté en favoris (cache) | ➕ |
| visits_count | integer | | 0 | Nombre de visites planifiées (cache) | ➕ |
| reviews_count | integer | | 0 | Nombre d'avis approuvés (cache) | ➕ |
| average_rating | decimal(2,1) | oui | null | Note moyenne des avis (cache) | ➕ |
| available_from | date | oui | null | Date de disponibilité | ➕ |
| published_at | datetime | oui | null | Date de publication de l'annonce | ➕ |
| metadata | json | oui | null | Attributs supplémentaires spécifiques au type | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collections `photos`, `plans`
- `Searchable` (laravel/scout) — indexation pour la recherche

**Colonnes renommées :**
- ✏️ `position` → `lot_position` (plus explicite sur ce que ça représente)
- ✏️ `with_administrative_monitoring` → `admin_monitored` (plus concis)
- ✏️ `servicing` → `amenities` — puis ➖ supprimée : migration P3.10 unifie sur Tags (type `amenity`)

**Scopes :**
- `available()` → status = available
- `rent()` → contract_type = rent
- `sale()` → contract_type = sale
- `featured()` → featured = true 🆕
- `published()` → visibility = public AND published_at != null 🆕

**Relations :**
- `user()` → belongsTo User (propriétaire)
- `agency()` → belongsTo Agency
- `parent()` → belongsTo Property
- `children()` → hasMany Property
- `address()` → morphOne Address
- `bookings()` → hasMany Booking
- `collaborators()` → hasMany PropertyCollaborator
- `collaborating_users()` → belongsToMany User (pivot)
- `tags()` → morphToMany Tag
- `reviews()` → morphMany Review
- `leases()` → hasMany Lease 🆕
- `visits()` → hasMany PropertyVisit 🆕
- `favorites()` → hasMany Favorite 🆕
- `maintenance_requests()` → hasMany MaintenanceRequest 🆕
- `documents()` → morphMany Document 🆕
- `inventories()` → hasMany Inventory 🆕
- `conversations()` → hasMany Conversation 🆕
- `price_histories()` → hasMany PropertyPriceHistory (historique des variations de prix) 🆕
- `invoices()` → morphMany Invoice (via `invoiceable`) 🆕

---

### 4. Address

**Table :** `addresses`
**Description :** Adresse physique avec coordonnées GPS, rattachable à tout modèle via relation polymorphique (bien, utilisateur, agence).

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| addressable_id | bigint | | | FK polymorphique (ID) | |
| addressable_type | string | | | FK polymorphique (type) | |
| address | string | oui | null | Adresse complète formatée | |
| country | string | oui | null | Pays | |
| state | string | oui | null | Région / État | |
| city | string | oui | null | Ville | |
| district | string | oui | null | Commune / Département | |
| neighborhood | string | oui | null | Quartier (ex: Almadies, Plateau, Mermoz) | ➕ |
| street | string | oui | null | Rue | |
| postal_code | string | oui | null | Code postal | |
| building | string | oui | null | Bâtiment / Résidence | |
| latitude | decimal(10,8) | oui | null | Latitude GPS | |
| longitude | decimal(11,8) | oui | null | Longitude GPS | |
| metadata | json | oui | null | Données complémentaires | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Relations :**
- `addressable()` → morphTo (Property, User, Agency, Customer, Guarantor)

---

### 5. Booking

**Table :** `bookings`
**Description :** Réservation d'un bien immobilier par un client. Étape préalable à la signature d'un bail, permettant de bloquer un bien et de recueillir un acompte.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| property_id | FK properties | | | Bien réservé | |
| customer_id | FK customers | | | Client concerné (NOT NULL — une réservation sans client n'a pas de sens) | ✏️ NOT NULL |
| created_by_id | FK users | | | Utilisateur ayant créé la réservation | ✏️ ancien `user_id` |
| reference_number | string | oui | null | Numéro de référence unique | |
| status | BookingStatus | | 'pending' | Statut de la réservation | |
| booking_date | datetime | | now | Date de création de la réservation | |
| start_date | datetime | oui | null | Date de début souhaitée | |
| end_date | datetime | oui | null | Date de fin souhaitée | |
| expiration_date | datetime | oui | null | Date d'expiration de l'offre | |
| confirmation_date | datetime | oui | null | Date de confirmation | |
| rejection_date | datetime | oui | null | Date de rejet | |
| cancellation_date | datetime | oui | null | Date d'annulation | |
| completion_date | datetime | oui | null | Date de finalisation | |
| price_at_booking | decimal(14,2) | oui | null | Prix du bien au moment de la réservation | |
| total_amount | decimal(14,2) | oui | null | Montant total de la réservation | |
| deposit_amount | decimal(14,2) | oui | null | Montant de l'acompte demandé | |
| ~~deposit_paid~~ | — | — | — | ~~Remplacé par Accessor `deposit_paid` (calcul dynamique depuis `booking_payments`)~~ | ➖ |
| deposit_date | datetime | oui | null | Date de paiement de l'acompte | |
| notes | text | oui | null | Notes internes | |
| reason_for_rejection | text | oui | null | Motif de rejet | |
| reason_for_cancellation | text | oui | null | Motif d'annulation | |
| cancellation_by | CancellationBy | oui | null | Qui a annulé (owner, customer, agent, system) | ✏️ |
| metadata | json | oui | null | | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**⚠️ Bug corrigé :** `customer_id` existait dans `$fillable` du modèle mais manquait dans la migration. Ajouté et passé en NOT NULL.

**Colonnes renommées :**
- ✏️ `user_id` → `created_by_id` (lève l'ambiguïté avec le customer)

**Colonnes supprimées :**
- ➖ `deposit_paid` — source de désynchronisation avec `booking_payments`. Remplacé par un Accessor PHP qui calcule dynamiquement l'état de l'acompte en vérifiant l'existence d'un `BookingPayment` confirmé de type `deposit`.

**Accesseurs :**
- `deposit_paid` (bool) : `true` si au moins un `BookingPayment` avec `payment_type = deposit` et `status = paid` existe pour cette réservation. Implémenté via `Attribute::make(get: fn () => $this->booking_payments()->where('payment_type', BookingPaymentType::DEPOSIT)->where('status', PaymentStatus::PAID)->exists())`.

**Relations :**
- `property()` → belongsTo Property
- `customer()` → belongsTo Customer
- `creator()` → belongsTo User (via created_by_id) ✏️ ancien `user()`
- `booking_payments()` → hasMany BookingPayment
- `lease()` → hasOne Lease (le bail issu de cette réservation) 🆕
- `documents()` → morphMany Document (promesse de vente, offre signée) 🆕
- `invoices()` → morphMany Invoice 🆕

---

### 6. BookingPayment

**Table :** `booking_payments`
**Description :** Paiement ponctuel lié à une réservation : acompte, avance sur caution ou frais de dossier.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| booking_id | FK bookings | | | Réservation concernée | |
| user_id | FK users | | | Utilisateur ayant enregistré le paiement | |
| amount | decimal(14,2) | | | Montant payé | |
| currency | Currency | | 'XOF' | Devise (XOF, XAF, EUR, USD) | ✏️ |
| payment_method | PaymentMethod | | | Moyen de paiement (cash, bank_transfer, mobile_money, card) | |
| payment_type | BookingPaymentType | | | Nature du paiement (deposit, advance, fee) | |
| transaction_id | string | oui | null | ID transaction externe (passerelle) | |
| status | PaymentStatus | | 'pending' | Statut du paiement | |
| payment_date | datetime | oui | null | Date effective du paiement | |
| confirmed_date | datetime | oui | null | Date de confirmation | |
| receipt_number | string | oui | null | Numéro de reçu | |
| refund_amount | decimal(14,2) | oui | null | Montant remboursé (si applicable) | ➕ |
| refund_reason | text | oui | null | Motif du remboursement | ➕ |
| notes | text | oui | null | Notes | |
| metadata | json | oui | null | Données passerelle / complémentaires | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Traits :**
- `HasPaymentAttributes` (`App\Models\Concerns`) — casts et scopes partagés avec LeasePayment (amount, currency, payment_method, status, transaction_id, receipt_number) ➕

**Relations :**
- `booking()` → belongsTo Booking
- `user()` → belongsTo User
- `invoice()` → morphOne Invoice (via `invoiceable`) 🆕

---

### 7. Customer

**Table :** `customers`
**Description :** Personne physique suivie par un agent ou un propriétaire. Peut être un prospect, un locataire ou un acheteur potentiel. Peut être liée à un compte utilisateur ou exister de manière autonome (gestion CRM).

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| first_name | string | | | Prénom | |
| last_name | string | | | Nom de famille | |
| email | string | oui | null | Email (unique) | |
| phone | string | oui | null | Téléphone (unique) | |
| birth_date | date | oui | null | Date de naissance | |
| status | CustomerStatus | | 'active' | Statut administratif du contact | |
| pipeline_stage | CustomerPipelineStage | oui | 'lead' | Étape CRM (lead, prospect, qualified, negotiating, converted, lost) — distinct du statut administratif | ➕ |
| id_type | IdType | oui | null | Type de pièce d'identité (id_card, passport, driving_license) — `id_card` couvre la CNI et toute carte nationale | ✏️ |
| id_number | string | oui | null | Numéro de pièce d'identité | ➕ |
| occupation | string | oui | null | Profession / activité | ➕ |
| emergency_contact_name | string | oui | null | Nom du contact d'urgence | ➕ |
| emergency_contact_phone | string | oui | null | Téléphone du contact d'urgence | ➕ |
| added_by_id | FK users | oui | null | Agent / propriétaire ayant ajouté ce contact | |
| user_id | FK users | oui | null | Compte utilisateur lié (si le client est inscrit) | |
| metadata | json | oui | null | | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collections `photo`, `id_documents`

**Accesseurs :**
- `full_name` : concaténation de `first_name` + `last_name`

**Relations :**
- `added_by()` → belongsTo User
- `user()` → belongsTo User
- `bookings()` → hasMany Booking
- `addresses()` → morphMany Address
- `tags()` → morphToMany Tag
- `user_customer_relationships()` → hasMany UserCustomerRelationship
- `related_users()` → belongsToMany User (pivot)
- `leases()` → hasMany Lease (en tant que locataire) 🆕
- `visits()` → hasMany PropertyVisit (via customer_id) 🆕
- `documents()` → morphMany Document 🆕
- `invoices()` → hasMany Invoice (factures reçues en tant que destinataire) 🆕

---

### 8. PropertyCollaborator

**Table :** `property_collaborators`
**Description :** Utilisateur invité à collaborer sur la gestion d'un bien. Permet la co-gestion entre propriétaires, agents et gestionnaires avec des rôles et permissions spécifiques.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| property_id | FK properties | | | Bien concerné | |
| user_id | FK users | | | Utilisateur invité | |
| role | CollaboratorRole | | | Rôle attribué (manager, co_owner, agent, viewer) | ✏️ |
| commission_share | decimal(5,2) | oui | null | Part de commission allouée à ce collaborateur (%) — la somme par property doit être ≤ 100 | ➕ |
| permissions | json | | | Permissions spécifiques accordées | |
| notes | text | oui | null | Notes sur la collaboration | |
| invited_by | FK users | oui | null | Utilisateur ayant envoyé l'invitation | |
| invitation_accepted | boolean | | false | Invitation acceptée | |
| invitation_date | datetime | | now | Date d'envoi de l'invitation | |
| accepted_date | datetime | oui | null | Date d'acceptation | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Relations :**
- `property()` → belongsTo Property
- `user()` → belongsTo User
- `inviter()` → belongsTo User (via invited_by)

---

### 9. UserCustomerRelationship

**Table :** `user_customer_relationships`
**Description :** Lien formel entre un utilisateur (propriétaire, agent) et un customer (locataire, acheteur). Permet de tracer qui gère qui, avec quel type de relation et sur quelle période.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| user_id | FK users | | | Utilisateur (propriétaire/agent) | |
| customer_id | FK customers | | | Client concerné | |
| relationship_type | RelationshipType | | | Type de relation (owner_tenant, agent_client, broker_client) | ✏️ |
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
| name | string(100) | | | Nom du tag (unique) | |
| slug | string(100) | | | Slug URL (unique) | |
| description | text | oui | null | Description | |
| type | TagType | oui | null | Catégorie du tag (amenity, feature, label, crm) | ✏️ |
| color | string(20) | oui | null | Couleur d'affichage (hex) | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Relations :**
- `properties()` → morphedByMany Property
- `customers()` → morphedByMany Customer

---

### 11. Review

**Table :** `reviews`
**Description :** Avis laissé par un utilisateur sur un bien, une agence ou un autre utilisateur. Soumis à modération avant publication.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| reviewable_id | bigint | | | FK polymorphique (ID) | ✏️ ancien `model_id` |
| reviewable_type | string | | | FK polymorphique (type) | ✏️ ancien `model_type` |
| user_id | FK users | | | Auteur de l'avis | |
| rating | decimal(2,1) | | | Note (1.0 à 5.0) | |
| title | string | oui | null | Titre de l'avis | |
| content | text | oui | null | Contenu de l'avis | |
| is_approved | boolean | | false | Approuvé par un modérateur | |
| approved_by | FK users | oui | null | Modérateur | |
| approved_at | datetime | oui | null | Date d'approbation | |
| reported_count | integer | | 0 | Nombre de signalements | |
| reply_content | text | oui | null | Réponse publique du propriétaire/agence à l'avis | ➕ |
| replied_by_id | FK users | oui | null | Auteur de la réponse (`nullOnDelete`) | ➕ |
| replied_at | datetime | oui | null | Date de publication de la réponse | ➕ |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Colonnes renommées :**
- ✏️ `model_id` → `reviewable_id` / `model_type` → `reviewable_type` (convention standard Laravel pour les morphs)

**Relations :**
- `reviewable()` → morphTo (Property, Agency, User)
- `user()` → belongsTo User
- `approver()` → belongsTo User (via approved_by)
- `repliedBy()` → belongsTo User (via replied_by_id) 🆕

---

### 12. AppNotification ✏️

**Table :** `app_notifications` ✏️ ancien `notifications` (approche hybride : table applicative propre, distincte de la table `notifications` de Laravel)
**Description :** Notification in-app envoyée à un utilisateur suite à un événement (nouvelle réservation, paiement reçu, rappel de loyer, demande de maintenance, etc.). Le modèle s'appelle `AppNotification` pour éviter toute confusion avec `Illuminate\Notifications\Notification`.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| user_id | FK users | | | Destinataire | |
| type | NotificationType | | | Type de notification (booking, payment, lease, maintenance, visit, message, system) | ✏️ |
| title | string | | | Titre | |
| content | text | | | Contenu | |
| referenceable_id | bigint | oui | null | ID de l'entité liée (morphs manuel) | ✏️ ancien `reference_id` |
| referenceable_type | string | oui | null | Type de l'entité liée (morphs manuel) | ✏️ ancien `reference_type` |
| is_read | boolean | | false | Lue oui/non | |
| read_at | datetime | oui | null | Date de lecture | |
| is_actioned | boolean | | false | Action effectuée (clic sur le lien) | |
| actioned_at | datetime | oui | null | Date de l'action | |
| delivered | boolean | | false | Notification délivrée | |
| delivery_channel | NotificationChannel | | 'app' | Canal (app, email, sms, push) | ✏️ |
| delivered_at | datetime | oui | null | Date de délivrance | |
| metadata | json | oui | null | Données supplémentaires (passerelle, contexte) | |
| deleted_at | datetime | oui | null | Soft delete | |
| created_at | datetime | | auto | | |
| updated_at | datetime | | auto | | |

**Colonnes renommées :**
- ✏️ `reference_id` → `referenceable_id` / `reference_type` → `referenceable_type` (convention standard Laravel pour les morphs)
- ✏️ `type` et `delivery_channel` passent de `string` à enum typé

**Note :** La relation `referenceable()` est intentionnellement manuelle (morph non standard) — voir [Règle 3](#règle-3--morph-referenceable-dans-appnotification) pour le motif. Le canal `app_database` est enregistré dans `AppServiceProvider` via `ChannelManager::extend()`.

**Scopes :**
- `unread()` → `where('is_read', false)`
- `ofType(NotificationType $type)` → `where('type', $type)`
- `forUser(User $user)` → `where('user_id', $user->id)`

**Méthodes :**
- `markAsRead()` : set `is_read = true`, `read_at = now()`, save
- `markAsActioned()` : set `is_actioned = true`, `actioned_at = now()`, save

**Relations :**
- `user()` → belongsTo User
- `referenceable()` → morphTo (résolu via `referenceable_id` + `referenceable_type` — Booking, Lease, LeasePayment, MaintenanceRequest)

---

### 13. ActivityLog ➖ (remplacé par spatie/laravel-activitylog)

> **⚠️ Ce modèle custom est remplacé par le package `spatie/laravel-activitylog`.**
> Les tables `activity_log` (et `activity_log_changes` selon la configuration) et le trait `LogsActivity` remplacent entièrement ce modèle custom.
> La migration de données existantes depuis `activity_logs` vers `activity_log` est à réaliser si des données de production existent.

**Configuration spatie/laravel-activitylog :**
- Ajouter le trait `LogsActivity` sur chaque modèle devant être tracé
- Configurer `config/activitylog.php` pour définir le driver de log (eloquent) et les options
- Le `causer` correspond à l'utilisateur authentifié (`Auth::user()`)
- Le `subject` est le modèle tracé (équivalent de `loggable`)

**Mapping ancien modèle → package :**

| Ancien champ | Équivalent spatie |
|---|---|
| `user_id` | `causer_id` / `causer_type` (morphTo) |
| `loggable_id` / `loggable_type` | `subject_id` / `subject_type` (morphTo) |
| `action` | `event` (created, updated, deleted, custom) |
| `description` | `description` |
| `changes` | `properties` (json : `old`, `attributes`) |
| `ip_address` | à stocker dans `properties` via `tapActivity()` |
| `user_agent` | à stocker dans `properties` via `tapActivity()` |

---

## Nouveaux modèles

---

### 14. Lease 🆕

**Table :** `leases`
**Description :** Contrat formalisant un accord de location ou de vente entre un propriétaire (bailleur) et un client (locataire/acheteur). Centralise les conditions financières, la durée, et les informations du garant.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| property_id | FK properties | | | Bien concerné |
| landlord_id | FK users | | | Propriétaire / bailleur |
| tenant_id | FK customers | | | Locataire / acheteur |
| agency_id | FK agencies | oui | null | Agence intermédiaire |
| booking_id | FK bookings | oui | null | Réservation d'origine (si applicable) |
| renewed_from_lease_id | FK leases | oui | null | Bail parent — rempli si ce bail est un renouvellement ou avenant (`nullOnDelete`) |
| reference_number | string | | | Numéro de contrat unique |
| type | LeaseType | | | Type de contrat (residential_rent, commercial_rent, seasonal_rent, sale) |
| status | LeaseStatus | | 'draft' | Statut du contrat |
| start_date | date | | | Date de début du contrat |
| end_date | date | oui | null | Date de fin (null si durée indéterminée) |
| renewal_date | date | oui | null | Date de renouvellement prévue |
| monthly_rent | decimal(14,2) | oui | null | Loyer mensuel (pour les locations) |
| sale_price | decimal(14,2) | oui | null | Prix de vente (pour les ventes) |
| currency | Currency | | 'XOF' | Devise (XOF, XAF, EUR, USD) |
| deposit_amount | decimal(14,2) | oui | null | Montant de la caution |
| commission_amount | decimal(14,2) | oui | null | Commission agence/courtier |
| commission_rate | decimal(5,2) | oui | null | Taux de commission (%) |
| payment_frequency | PaymentFrequency | | 'monthly' | Fréquence de paiement (monthly, quarterly, yearly) |
| payment_day | integer | oui | null | Jour du mois pour le paiement (1-28) |
| terms | text | oui | null | Conditions générales du contrat |
| special_conditions | text | oui | null | Conditions particulières |
| guarantor_id | FK guarantors | oui | null | Garant rattaché au bail (voir modèle [Guarantor](#27-guarantor-)) ✏️ |
| signed_at | datetime | oui | null | Date de signature |
| terminated_at | datetime | oui | null | Date de résiliation anticipée |
| termination_reason | text | oui | null | Motif de résiliation |
| terminated_by_id | FK users | oui | null | Qui a résilié |
| metadata | json | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Colonnes supprimées :**
- ➖ `guarantor_name`, `guarantor_phone`, `guarantor_id_number` — remplacées par une FK `guarantor_id` vers le modèle [Guarantor](#27-guarantor-) (permet d'y attacher des documents justificatifs via medialibrary et de réutiliser un même garant sur plusieurs baux).

**Relations :**
- `property()` → belongsTo Property
- `landlord()` → belongsTo User
- `tenant()` → belongsTo Customer
- `guarantor()` → belongsTo Guarantor 🆕
- `agency()` → belongsTo Agency
- `booking()` → belongsTo Booking
- `terminated_by_user()` → belongsTo User (via terminated_by_id)
- `renewedFrom()` → belongsTo Lease (via renewed_from_lease_id) 🆕
- `renewals()` → hasMany Lease (via renewed_from_lease_id) 🆕
- `payments()` → hasMany LeasePayment
- `payouts()` → hasMany Payout 🆕
- `maintenance_requests()` → hasMany MaintenanceRequest
- `inventories()` → hasMany Inventory
- `documents()` → morphMany Document
- `conversations()` → hasMany Conversation
- `invoices()` → morphMany Invoice 🆕

---

### 15. LeasePayment 🆕

**Table :** `lease_payments`
**Description :** Paiement récurrent lié à un bail : loyer, charges, régularisation ou pénalité de retard. Chaque entrée correspond à une échéance ou à un versement effectif.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| lease_id | FK leases | | | Bail concerné |
| payer_id | FK customers | | | Client payeur |
| collector_id | FK users | oui | null | Utilisateur ayant collecté le paiement |
| reference_number | string | oui | null | Numéro de reçu / référence |
| amount | decimal(14,2) | | | Montant dû ou payé |
| currency | Currency | | 'XOF' | Devise (XOF, XAF, EUR, USD) |
| payment_method | PaymentMethod | oui | null | Moyen de paiement (cash, bank_transfer, mobile_money, check, card) |
| payment_type | LeasePaymentType | | | Nature (rent, charges, deposit, deposit_refund, regularization, penalty) |
| period_start | date | | | Début de la période couverte |
| period_end | date | | | Fin de la période couverte |
| due_date | date | oui | null | Date d'échéance (nullable : un paiement hors échéancier n'en a pas) |
| paid_at | datetime | oui | null | Date de paiement effectif |
| status | PaymentStatus | | 'pending' | Statut du paiement |
| late_fee | decimal(14,2) | oui | null | Pénalité de retard appliquée |
| transaction_id | string | oui | null | ID transaction externe (mobile money, banque) |
| notes | text | oui | null | Notes |
| metadata | json | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Traits :**
- `HasPaymentAttributes` (`App\Models\Concerns`) — casts et scopes partagés avec BookingPayment (amount, currency, payment_method, status, transaction_id) ➕

**Relations :**
- `lease()` → belongsTo Lease
- `payer()` → belongsTo Customer
- `collector()` → belongsTo User
- `invoice()` → morphOne Invoice (via `invoiceable`) 🆕

---

### 16. Favorite 🆕

**Table :** `favorites`
**Description :** Bien immobilier ajouté aux favoris par un utilisateur pour consultation ultérieure.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| user_id | FK users | | | Utilisateur |
| property_id | FK properties | | | Bien sauvegardé |
| notes | text | oui | null | Note personnelle de l'utilisateur |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contrainte :** unique(user_id, property_id)

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
| property_id | FK properties | | | Bien à visiter |
| visitor_id | FK users | oui | null | Visiteur inscrit |
| customer_id | FK customers | oui | null | Customer (géré par un agent) |
| agent_id | FK users | oui | null | Agent accompagnateur |
| visitor_name | string | oui | null | Nom du visiteur (si non inscrit) |
| visitor_phone | string | oui | null | Téléphone du visiteur (si non inscrit) |
| visitor_email | string | oui | null | Email du visiteur (si non inscrit) |
| type | VisitType | | 'in_person' | Type de visite (in_person, virtual, self_guided, hybrid) |
| status | VisitStatus | | 'scheduled' | Statut de la visite |
| scheduled_at | datetime | | | Date et heure prévues |
| duration_minutes | integer | oui | null | Durée estimée |
| completed_at | datetime | oui | null | Date de réalisation effective |
| cancelled_at | datetime | oui | null | Date d'annulation |
| cancellation_reason | text | oui | null | Motif d'annulation |
| feedback | text | oui | null | Retour du visiteur après la visite |
| rating | decimal(2,1) | oui | null | Note donnée au bien (1.0 à 5.0) |
| notes | text | oui | null | Notes internes de l'agent |
| metadata | json | oui | null | |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contrainte d'intégrité :**
```sql
CHECK (visitor_id IS NOT NULL OR customer_id IS NOT NULL OR visitor_name IS NOT NULL)
```
Un visiteur doit être identifié : soit un User inscrit, soit un Customer géré par un agent, soit un visiteur anonyme (nom renseigné).

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
| property_id | FK properties | oui | null | Bien lié à la discussion |
| lease_id | FK leases | oui | null | Bail lié à la discussion |
| maintenance_request_id | FK maintenance_requests | oui | null | Demande de maintenance liée (remplace le morphOne côté MaintenanceRequest) |
| type | ConversationType | | 'direct' | Type (direct, group, support) |
| status | ConversationStatus | | 'active' | Statut (active, archived, closed) |
| created_by | FK users | | | Initiateur de la conversation |
| last_message_id | FK messages | oui | null | Dernier message envoyé (cache, mis à jour via MessageObserver::created()) |
| last_message_preview | string(255) | oui | null | Extrait texte du dernier message (cache, affichage liste sans JOIN) |
| last_message_at | datetime | oui | null | Horodatage du dernier message (cache) |
| metadata | json | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Relations :**
- `property()` → belongsTo Property
- `lease()` → belongsTo Lease
- `maintenance_request()` → belongsTo MaintenanceRequest
- `creator()` → belongsTo User
- `participants()` → hasMany ConversationParticipant
- `users()` → belongsToMany User (via ConversationParticipant)
- `messages()` → hasMany Message
- `last_message()` → belongsTo Message (via last_message_id) 🆕

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
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contrainte :** unique(conversation_id, user_id)

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
| conversation_id | FK conversations | | | Conversation parente |
| sender_id | FK users | | | Expéditeur |
| content | text | | | Contenu du message |
| type | MessageType | | 'text' | Type (text, image, document, system) |
| metadata | json | oui | null | Métadonnées (URL image, nom fichier, etc.) |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `attachments` (images, documents joints au message)

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
| property_id | FK properties | | | Bien concerné |
| lease_id | FK leases | oui | null | Bail en cours (si applicable) |
| requester_id | FK users | | | Demandeur (locataire) |
| assigned_to | FK users | oui | null | Prestataire assigné |
| title | string | | | Titre court du problème |
| description | text | | | Description détaillée |
| category | MaintenanceCategory | | | Catégorie (plumbing, electrical, structural, appliance, painting, cleaning, pest_control, locksmith, other) |
| priority | MaintenancePriority | | 'medium' | Priorité (low, medium, high, urgent) |
| status | MaintenanceStatus | | 'open' | Statut de la demande |
| estimated_cost | decimal(14,2) | oui | null | Coût estimé |
| actual_cost | decimal(14,2) | oui | null | Coût réel |
| scheduled_at | datetime | oui | null | Date d'intervention planifiée |
| started_at | datetime | oui | null | Date de début d'intervention |
| completed_at | datetime | oui | null | Date de fin d'intervention |
| resolution_notes | text | oui | null | Notes de résolution |
| metadata | json | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collections `photos` (photos du problème), `completion_photos` (photos après intervention)

**Note :** `requester_id` pointe vers un User (la personne connectée). Pour récupérer le Customer associé au demandeur, utiliser `requesterCustomer()` — retourne le Customer lié via `User.customer()` (relation hasOne via `user_id`).

**Relations :**
- `property()` → belongsTo Property
- `lease()` → belongsTo Lease
- `requester()` → belongsTo User
- `requesterCustomer()` → hasOneThrough Customer, User (retourne le Customer du demandeur) 🆕
- `assigned_user()` → belongsTo User (via assigned_to)
- `documents()` → morphMany Document
- `conversation()` → hasOne Conversation (via `maintenance_request_id`)

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
| metadata | json | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `file` (le fichier du document : PDF, image, scan, etc.)

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
| user_id | FK users | | | Utilisateur |
| name | string | | | Nom donné à la recherche (ex: "3 pièces Dakar < 200k") |
| criteria | json | | | Critères de recherche (type, prix min/max, surface, localisation, etc.) |
| notification_frequency | string | | 'daily' | Fréquence d'alerte (instant, daily, weekly, none) |
| is_active | boolean | | true | Alerte active |
| last_notified_at | datetime | oui | null | Dernière notification envoyée |
| results_count | integer | | 0 | Nombre de résultats actuels (cache — mettre à jour via job planifié, pas à la volée) |
| metadata | json | oui | null | |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Relations :**
- `user()` → belongsTo User

---

### 24. Inventory 🆕

**Table :** `inventories`
**Description :** État des lieux réalisé à l'entrée ou à la sortie d'un locataire. Documente la condition du bien pièce par pièce et recueille les signatures des parties.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| lease_id | FK leases | | | Bail concerné |
| property_id | FK properties | | | Bien inspecté |
| type | InventoryType | | | Type (move_in, move_out) |
| conducted_by | FK users | | | Personne ayant réalisé l'état des lieux |
| tenant_id | FK customers | | | Locataire présent |
| conducted_at | datetime | | | Date de réalisation |
| status | InventoryStatus | | 'draft' | Statut (draft, pending_signature, signed, disputed) |
| general_condition | InventoryCondition | | | État général (excellent, good, fair, poor) |
| rooms | json | | | Détail pièce par pièce (nom, état, commentaires, photos) |
| notes | text | oui | null | Observations générales |
| tenant_signed | boolean | | false | Locataire a signé |
| tenant_signed_at | datetime | oui | null | Date de signature locataire |
| owner_signed | boolean | | false | Propriétaire a signé |
| owner_signed_at | datetime | oui | null | Date de signature propriétaire |
| metadata | json | oui | null | |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `photos` (photos de l'état des lieux par pièce)

**Relations :**
- `lease()` → belongsTo Lease
- `property()` → belongsTo Property
- `conductor()` → belongsTo User (via conducted_by)
- `tenant()` → belongsTo Customer
- `documents()` → morphMany Document (PV signé, annexes)

---

### 25. Invoice 🆕

**Table :** `invoices`
**Description :** Facture générée pour une réservation ou un paiement de bail. Sert à la comptabilité, à l'archivage légal et à la génération de PDF via medialibrary. La relation `invoiceable` est polymorphique : une facture peut être émise pour un `Booking`, un `Lease`, un `LeasePayment` ou un `BookingPayment`.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| invoiceable_id | bigint | oui | null | FK polymorphique (ID de l'entité facturée) |
| invoiceable_type | string | oui | null | FK polymorphique (type de l'entité facturée) |
| customer_id | FK customers | | | Destinataire de la facture (Customer — locataire ou acheteur) |
| issued_by_id | FK users | oui | null | Utilisateur émetteur de la facture |
| agency_id | FK agencies | oui | null | Agence émettrice |
| reference_number | string | | | Numéro de facture (unique) |
| status | InvoiceStatus | | 'draft' | Statut (draft, sent, paid, overdue, cancelled, void) |
| issue_date | date | | | Date d'émission |
| due_date | date | oui | null | Date d'échéance de paiement |
| subtotal | decimal(14,2) | | | Montant hors taxes |
| tax_rate | decimal(5,2) | oui | null | Taux de taxe appliqué (%) |
| tax_amount | decimal(14,2) | oui | null | Montant de la taxe |
| total_amount | decimal(14,2) | | | Montant total TTC |
| currency | Currency | | 'XOF' | Devise |
| notes | text | oui | null | Libellé ou notes complémentaires |
| metadata | json | oui | null | Données complémentaires |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contrainte :** `reference_number` unique.

**Relations :**
- `invoiceable()` → morphTo (Booking, Lease, LeasePayment, BookingPayment)
- `customer()` → belongsTo Customer (destinataire)
- `issuedBy()` → belongsTo User (via issued_by_id)
- `agency()` → belongsTo Agency
- `documents()` → morphMany Document (PDF généré, pièces jointes)

**Inverse sur les modèles liés :**
- `Booking.invoices()` → morphMany Invoice
- `Lease.invoices()` → morphMany Invoice
- `LeasePayment.invoice()` → morphOne Invoice
- `BookingPayment.invoice()` → morphOne Invoice (déjà ajouté dans les sections respectives)

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
| id_number | string | oui | null | Numéro de pièce d'identité |
| occupation | string | oui | null | Profession / activité |
| employer | string | oui | null | Nom de l'employeur |
| monthly_income | decimal(14,2) | oui | null | Revenu mensuel déclaré |
| relationship_to_tenant | string | oui | null | Lien avec le locataire (parent, conjoint, employeur, autre) |
| added_by_id | FK users | oui | null | Utilisateur ayant saisi le garant (`nullOnDelete`) |
| notes | text | oui | null | Notes internes |
| metadata | json | oui | null | Données complémentaires |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `id_documents` (CNI, attestations de revenus, fiches de paie)

**Accesseurs :**
- `full_name` : concaténation de `first_name` + `last_name`

**Relations :**
- `leases()` → hasMany Lease (un même garant peut couvrir plusieurs baux)
- `added_by()` → belongsTo User
- `addresses()` → morphMany Address
- `documents()` → morphMany Document

---

### 28. Payout 🆕

**Table :** `payouts`
**Description :** Reversement de fonds collectés par l'agence vers un bailleur (propriétaire) après déduction de la commission agence. Assure la traçabilité comptable des flux sortants associés à un bail ou à une réservation. Un `Payout` agrège typiquement un ou plusieurs `LeasePayment` / `BookingPayment` d'une période donnée.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| lease_id | FK leases | oui | null | Bail concerné (si reversement locatif) |
| booking_id | FK bookings | oui | null | Réservation concernée (si reversement sur acompte) |
| agency_id | FK agencies | oui | null | Agence émettrice du reversement |
| landlord_id | FK users | | | Propriétaire bénéficiaire du reversement |
| issued_by_id | FK users | oui | null | Utilisateur ayant initié le reversement (`nullOnDelete`) |
| reference_number | string | | | Numéro de bordereau (unique) |
| status | PayoutStatus | | 'pending' | Statut du reversement |
| period_start | date | oui | null | Début de la période couverte |
| period_end | date | oui | null | Fin de la période couverte |
| gross_amount | decimal(14,2) | | | Montant brut collecté |
| commission_amount | decimal(14,2) | | 0 | Commission agence retenue |
| fees_amount | decimal(14,2) | oui | null | Frais annexes retenus (transfert, fiscalité) |
| net_amount | decimal(14,2) | | | Montant net reversé |
| currency | Currency | | 'XOF' | Devise |
| payment_method | PaymentMethod | oui | null | Moyen de reversement (bank_transfer, mobile_money, cash, check) |
| transaction_id | string | oui | null | ID transaction externe (banque / mobile money) |
| scheduled_at | datetime | oui | null | Date planifiée du reversement |
| processed_at | datetime | oui | null | Date effective du reversement |
| failed_reason | text | oui | null | Motif d'échec (si `status = failed`) |
| notes | text | oui | null | Notes internes |
| metadata | json | oui | null | Données passerelle / complémentaires |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes :**
- `reference_number` unique.
- CHECK : `lease_id IS NOT NULL OR booking_id IS NOT NULL` (un reversement doit être rattaché à au moins un flux d'origine).

**Relations :**
- `lease()` → belongsTo Lease
- `booking()` → belongsTo Booking
- `agency()` → belongsTo Agency
- `landlord()` → belongsTo User (via landlord_id)
- `issuedBy()` → belongsTo User (via issued_by_id)
- `lease_payments()` → belongsToMany LeasePayment (pivot `payout_lease_payment` — agrégation des paiements couverts)
- `booking_payments()` → belongsToMany BookingPayment (pivot `payout_booking_payment`)
- `documents()` → morphMany Document (bordereau PDF, justificatif bancaire)

**Inverse sur les modèles liés :**
- `Lease.payouts()` → hasMany Payout
- `Booking.payouts()` → hasMany Payout
- `User.payouts()` → hasMany Payout (via landlord_id — reversements reçus en tant que bailleur)

---

### 29. DocumentShareLink 🆕

**Table :** `document_share_links`
**Description :** Lien de partage sécurisé et temporaire pour un `Document`. Permet d'envoyer une URL signée, éventuellement protégée par mot de passe et limitée en nombre de téléchargements, à un destinataire externe sans compte utilisateur.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| document_id | FK documents | | | Document partagé (`cascadeOnDelete`) |
| token | string | | | Token unique (URL-safe, ~40 caractères) |
| expires_at | datetime | oui | null | Date d'expiration du lien (null = pas d'expiration) |
| password_hash | string | oui | null | Hash du mot de passe d'accès (optionnel) |
| max_downloads | integer | oui | null | Nombre maximum de téléchargements autorisés |
| downloads_count | integer | | 0 | Nombre de téléchargements effectués |
| created_by_id | FK users | oui | null | Utilisateur ayant généré le lien (`nullOnDelete`) |
| revoked_at | datetime | oui | null | Date de révocation manuelle |
| last_accessed_at | datetime | oui | null | Dernière consultation |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes :**
- `token` unique.

**Relations :**
- `document()` → belongsTo Document
- `createdBy()` → belongsTo User (via created_by_id)

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
| value | json | | | Valeur (typage libre via JSON) |
| scope | SettingScope | | 'global' | Portée (`global`, `agency`) |
| scope_id | bigint | oui | null | FK vers l'entité de scope (ex: `agencies.id` si `scope = agency`) |
| updated_by_id | FK users | oui | null | Dernier utilisateur ayant modifié (`nullOnDelete`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes :**
- Unique composé `(key, scope, scope_id)`.

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
| credentials | text (encrypted) | | | Credentials chiffrés (API keys, secrets, tokens) |
| is_active | boolean | | true | Intégration activée |
| last_used_at | datetime | oui | null | Dernière utilisation |
| metadata | json | oui | null | Configuration complémentaire (webhooks, scopes…) |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes :**
- Unique composé `(provider, agency_id)`.

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
| user_id | FK users | | | Identité du propriétaire (`restrictOnDelete`) |
| agency_id | FK agencies | | | Agence chez laquelle ce profil existe (`restrictOnDelete`) |
| status | OwnerProfileStatus | | 'active' | Statut du profil (active, inactive, blocked) |
| rib | string | oui | null | Relevé d'identité bancaire (chiffré recommandé) |
| tax_id | string | oui | null | Numéro fiscal / NINEA |
| id_document_type | IdType | oui | null | Type de pièce d'identité |
| id_document_number | string | oui | null | Numéro de pièce |
| monthly_income | decimal(12,2) | oui | null | Revenus mensuels déclarés (XOF) |
| employer | string | oui | null | Employeur |
| guarantor_user_id | FK users | oui | null | Garant (autre user — `nullOnDelete`) |
| metadata | json | oui | null | Données flexibles |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `(user_id, agency_id)` unique — un user a au plus un profil propriétaire par agence

**Relations :**
- `user()` → belongsTo User
- `agency()` → belongsTo Agency
- `guarantor()` → belongsTo User (via guarantor_user_id)

**Inverse :**
- `User.owner_profiles()` → hasMany OwnerProfile

---

### 35. AgentProfile 🆕

**Table :** `agent_profiles`
**Description :** Profil **agent immobilier** d'un user chez une agence. Encapsule les informations de carrière (numéro de licence, taux de commission, spécialité). Un user peut être agent chez plusieurs agences (un profil par agence).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| user_id | FK users | | | Identité de l'agent (`restrictOnDelete`) |
| agency_id | FK agencies | | | Agence employeuse (`restrictOnDelete`) |
| status | AgentProfileStatus | | 'active' | Statut du profil (active, inactive, suspended) |
| license_number | string | oui | null | Numéro de licence professionnelle |
| commission_rate | decimal(5,2) | oui | null | Taux de commission (%) |
| specialty | string | oui | null | Spécialité (résidentiel, commercial, luxe, etc.) |
| hire_date | date | oui | null | Date d'embauche |
| active_until | date | oui | null | Date de fin de contrat (si applicable) |
| metadata | json | oui | null | Données flexibles |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `(user_id, agency_id)` unique — un user a au plus un profil agent par agence

**Relations :**
- `user()` → belongsTo User
- `agency()` → belongsTo Agency

**Inverse :**
- `User.agent_profiles()` → hasMany AgentProfile

---

### 36. BrokerProfile 🆕

**Table :** `broker_profiles`
**Description :** Profil **courtier indépendant**. Contrairement aux profils owner/agent, un courtier n'est **pas attaché à une seule agence** : il opère pour son propre compte et collabore ponctuellement avec plusieurs agences via la table pivot [BrokerAgencyCollaboration](#38-brokeragencycollaboration-). Au plus un BrokerProfile par user.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| user_id | FK users | | | Identité du courtier (`restrictOnDelete`) |
| license_number | string | | | Numéro de licence courtier (unique) |
| insurance_policy_id | string | oui | null | Référence police d'assurance RC pro |
| regulator_registration | string | oui | null | Numéro d'enregistrement régulateur |
| active_until | date | oui | null | Validité de la licence |
| metadata | json | oui | null | Données flexibles |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `user_id` unique — un user a au plus un profil courtier
- `license_number` unique — pas de doublon entre courtiers

**Relations :**
- `user()` → belongsTo User
- `agency_collaborations()` → hasMany BrokerAgencyCollaboration
- `agencies()` → belongsToMany Agency (via BrokerAgencyCollaboration)

**Inverse :**
- `User.broker_profile()` → hasOne BrokerProfile

---

### 37. ServiceProviderProfile 🆕

**Table :** `service_provider_profiles`
**Description :** Profil **prestataire de services** (plombier, électricien, peintre, etc.). Comme le courtier, un prestataire opère pour son propre compte et collabore avec plusieurs agences via la table pivot [ServiceProviderAgencyCollaboration](#39-serviceprovideragencycollaboration-). Au plus un ServiceProviderProfile par user.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| user_id | FK users | | | Identité du prestataire (`restrictOnDelete`) |
| specialties | json | oui | null | Liste de `MaintenanceCategory` (plumbing, electrical, etc.) |
| service_areas | json | oui | null | Zones desservies (codes postaux, communes) |
| insurance_policy_id | string | oui | null | Référence police d'assurance |
| certifications | json | oui | null | Liste de certifications (label + URL preuve) |
| hourly_rate_min | decimal(10,2) | oui | null | Tarif horaire minimum (XOF) |
| hourly_rate_max | decimal(10,2) | oui | null | Tarif horaire maximum (XOF) |
| active_until | date | oui | null | Validité administrative |
| metadata | json | oui | null | Données flexibles |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `user_id` unique — un user a au plus un profil prestataire

**Relations :**
- `user()` → belongsTo User
- `agency_collaborations()` → hasMany ServiceProviderAgencyCollaboration
- `agencies()` → belongsToMany Agency (via ServiceProviderAgencyCollaboration)

**Inverse :**
- `User.service_provider_profile()` → hasOne ServiceProviderProfile

---

### 38. BrokerAgencyCollaboration 🆕

**Table :** `broker_agency_collaborations`
**Description :** Pivot **courtier ↔ agence** matérialisant les agences avec lesquelles un courtier collabore. Chaque ligne représente une période de collaboration historisée (started_at / ended_at).

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| broker_profile_id | FK broker_profiles | | | Courtier concerné (`cascadeOnDelete`) |
| agency_id | FK agencies | | | Agence partenaire (`cascadeOnDelete`) |
| status | CollaborationStatus | | 'active' | Statut (active, paused, ended) |
| started_at | date | | | Début de la collaboration |
| ended_at | date | oui | null | Fin de la collaboration |
| metadata | json | oui | null | Données flexibles (taux, conditions) |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `(broker_profile_id, agency_id)` unique — une seule ligne active par couple (les anciennes collaborations sont soft-deleted)

**Relations :**
- `broker_profile()` → belongsTo BrokerProfile
- `agency()` → belongsTo Agency

---

### 39. ServiceProviderAgencyCollaboration 🆕

**Table :** `service_provider_agency_collaborations`
**Description :** Pivot **prestataire ↔ agence** sur le même modèle que `BrokerAgencyCollaboration`.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | Identifiant unique |
| service_provider_profile_id | FK service_provider_profiles | | | Prestataire (`cascadeOnDelete`) |
| agency_id | FK agencies | | | Agence partenaire (`cascadeOnDelete`) |
| status | CollaborationStatus | | 'active' | Statut (active, paused, ended) |
| started_at | date | | | Début de la collaboration |
| ended_at | date | oui | null | Fin de la collaboration |
| metadata | json | oui | null | Données flexibles |
| deleted_at | datetime | oui | null | Soft delete |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `(service_provider_profile_id, agency_id)` unique

**Relations :**
- `service_provider_profile()` → belongsTo ServiceProviderProfile
- `agency()` → belongsTo Agency

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
| period_start | date | oui | null | Début de la période couverte par le relevé |
| period_end | date | oui | null | Fin de la période couverte |
| lines_count | unsignedInteger | | 0 | Compteur cache des lignes parsées (cf. Règle 2) |
| status | BankStatementStatus enum | | 'processing' | Cycle de vie (processing → ready_for_review → partially_reconciled → reconciled → archived) |
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
| raw_payload | json | | | Payload brut de la ligne tel qu'importée (CSV/OFX) — traçabilité totale |
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
**Description :** Dossier de vérification documentaire (KYC) attaché de manière polymorphe à une entité vérifiable — `Agency` (RCCM, NINEA, pièce du dirigeant), ou un profil métier (OwnerProfile, AgentProfile, BrokerProfile, ServiceProviderProfile). Workflow standardisé : pending → submitted → verified / rejected, avec motif et acteur de la décision.

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
| metadata | json | oui | null | Champs libres dépendants du type (numéro RCCM, pays d'émission, etc.) |
| created_at / updated_at | datetime | | auto | |

**Index :**
- `(subject_type, subject_id)` — unique : un seul dossier actif par sujet
- `(status)` — file de modération

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
| limits | json | oui | null | Quotas (`max_active_listings`, `max_agents`, `max_branches`…) |
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
| limits_override | json | oui | null | Quotas négociés ; merge sur `Plan.limits` |
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
**Description :** Reversement périodique de la plateforme vers une agence — le **net** dû à l'agence après commission plateforme retenue. Distinct du `Payout` métier (#28) qui matérialise le reversement agence → bailleur.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| agency_id | FK agencies | | | `cascadeOnDelete` |
| period_start | date | | | |
| period_end | date | | | |
| gross_amount | decimal(14,2) | | | Total encaissé sur la période (pour info) |
| platform_fee_amount | decimal(14,2) | | | Commission plateforme retenue |
| net_amount | decimal(14,2) | | | Montant à verser à l'agence (`gross - fees`) |
| currency | char(3) | | | XOF, EUR, USD |
| status | PlatformPayoutStatus enum | | 'pending' | pending, approved, processing, paid, failed, cancelled |
| approved_by | FK users | oui | null | Super-admin ayant approuvé |
| processed_at | datetime | oui | null | Date d'exécution du virement |
| failure_reason | text | oui | null | |
| metadata | json | oui | null | Référence virement bancaire, lot, breakdown |
| created_at / updated_at | datetime | | auto | |

**Index :**
- `(agency_id, period_end)` — un payout par agence/période
- `(status)` — file d'approbation

**Traits :**
- `LogsActivity`

**Relations :**
- `agency()` → belongsTo Agency
- `approver()` → belongsTo User (via `approved_by`)

**Scopes :**
- `pending()`, `approved()`, `paid()`

---

### 46. Announcement 🆕

**Table :** `announcements`
**Description :** Annonce in-app diffusée par le super-admin à un segment d'utilisateurs (rôle, agence, custom). Affichée comme bandeau ou centre de notifications jusqu'à dismissal individuel ou expiration.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| title | json | | | Titre par locale (`{fr, en, wo}`) |
| body | json | | | Corps multilingue |
| severity | AnnouncementSeverity enum | | 'info' | info, success, warning, critical |
| segment | json | | | `{roles?: [...], agency_ids?: [...], rollout_percentage?: int}` — l'absence de segment = tout le monde |
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
| token | string(64) | | | Token signé URL-safe (SHA-256), unique |
| email | string | | | Email du destinataire |
| invited_user_id | FK users | oui | null | User cible si déjà existant en base (sinon créé à l'acceptation) |
| invited_by | FK users | | | User qui a émis l'invitation |
| invitable_type | string | oui | null | Type morph du profil cible (ex. `OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`, `AgencyAdminProfile`) |
| invitable_id | bigint | oui | null | ID du profil cible créé en `draft` |
| agency_id | FK agencies | oui | null | Agence d'accueil (null pour cooptation super-admin) |
| role | string | | | Rôle visé par l'invitation (ex. `owner`, `agent`, `agency_admin`, `service_provider`, `super_admin`) — **simple discriminant de parcours**, pas une permission : il choisit le type de profil à activer et les branches d'acceptation. Aucun rôle n'est « assigné » à partir de cette valeur. |
| status | InvitationStatus | | 'sent' | sent, accepted, expired, revoked |
| expires_at | datetime | | | Expiration du token (par défaut now+7j) |
| accepted_at | datetime | oui | null | |
| revoked_at | datetime | oui | null | |
| last_reminded_at | datetime | oui | null | Date du dernier rappel J+2 envoyé |
| metadata | json | oui | null | Données additionnelles propres au parcours (ex. zones d'intervention pré-sélectionnées, premier lead pré-assigné) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `token` unique
- `(email, status)` pour rechercher les invitations en cours pour un email
- `(invitable_type, invitable_id)`
- `(status, expires_at)` pour le cron d'expiration

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
| submitted_by | FK users | | | User (agency_admin) qui a soumis la demande |
| rc | string | | | Numéro de Registre du Commerce |
| ninea | string | | | Numéro NINEA |
| rib_pro | string | | | RIB professionnel |
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

**Index :**
- `(agency_id, status)` — pour empêcher plusieurs demandes `pending` simultanées (unique partiel sur `pending`)
- `(status, submitted_at)`

**Relations :**
- `agency()` → belongsTo Agency
- `submitter()` → belongsTo User (via `submitted_by`)
- `reviewer()` → belongsTo User (via `reviewed_by`)
- `documents()` → morphMany Document (statuts PDF, scan RC, scan NINEA)

**Notes :**
- À l'approbation : `Agency.kind` flippe vers `standard`, les champs `rc`, `ninea` populés sur l'agence si vides, notification au submitter, débloquage des features restreintes (invitation collaborateurs internes, multi-admin, custom roles, assignation, reporting cross-équipe, customisation tags/enums).
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
| first_payment_at | datetime | oui | null | Premier paiement enregistré (acompte ou 1er loyer, voir `LeasePayment`) |
| documents_acknowledged_at | datetime | oui | null | Bail + EDL accusés réception |
| reminders_sent | json | | '[]' | Liste des rappels envoyés (ex. `[{type:'inventory', sent_at:...}]`) |
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

**Index :**
- `(agency_id, base_profile_type)`
- `(agency_id, is_system)`

**Contraintes :**
- Unique `(agency_id, name)` — pas de doublon de libellé dans une agence
- Unique `(agency_id, base_profile_type, is_system=true)` — exactement un rôle système par type

**Relations :**
- `agency()` → belongsTo Agency
- `capabilities()` → belongsToMany Capability (pivot `agency_role_capabilities`)
- `agent_profiles()` → hasMany AgentProfile (via `agency_role_id`)
- `agency_admin_profiles()` → hasMany AgencyAdminProfile
- `owner_profiles()` → hasMany OwnerProfile

**Règles métier :**
- Suppression d'un `AgencyRole` utilisé par au moins un profil : **restrict** (FK). Forcer la réaffectation préalable.
- Édition d'un rôle `is_system=true` : refusée. Pour personnaliser, l'UI propose un **clone** (`is_system=false`).
- L'édition d'un rôle non-système prend effet **immédiatement** pour tous les profils attachés (pas de cache).

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
| agency_role_id | FK agency_roles | | | `cascadeOnDelete` |
| capability | string | | | Valeur de l'enum `Capability` (ex. `properties.publish`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- Unique `(agency_role_id, capability)`
- `capability` (pour requêtes inverses « quels rôles ont la capacité X ? »)

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
| opt_in_status | string | | 'pending' | `pending` / `opted_in` / `opted_out` (string + check applicatif, **pas d'enum() MySQL**) |
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

**Table :** `notification_templates` (table existante — TCK-102)
**Description :** Le registre de templates de notification (`event`, `channel`, `locale`, `subject`, `body`) est étendu avec les colonnes nécessaires au mapping vers les **templates approuvés par Meta** pour le canal `whatsapp` (envoi hors fenêtre 24h). Une ligne `channel = 'whatsapp'` porte le nom du template Meta et sa catégorie/statut d'approbation.

| Colonne ajoutée | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| meta_template_name | string | oui | null | Nom du template tel qu'enregistré chez Meta |
| meta_category | string | oui | null | `authentication` (OTP) / `utility` (transactionnel, rappels, relances) — **jamais `marketing`** |
| meta_status | string | oui | null | `pending` / `approved` / `rejected` (statut d'approbation Meta) |
| meta_variables | json | oui | null | Mapping **ordonné** des variables du template (défaut `[]` côté model, **pas de DEFAULT JSON en migration**) |

**Contraintes :**
- Hors fenêtre 24h + pas de template `meta_status = approved` pour `event + locale` → canal WhatsApp inéligible → bascule SMS.

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
| segments_json | json | oui | null | Ciblage (segments d'utilisateurs) — casté `array` |
| updated_by_id | FK users | oui | null | Dernier opérateur ayant modifié le drapeau (`nullOnDelete`) |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Contraintes d'unicité :**
- `key` unique

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
| channels_json | json | | | Canaux de diffusion — casté `array`, **NOT NULL sans DEFAULT** (règle MySQL : pas de `DEFAULT` sur `JSON`) |
| recipients_json | json | | | Destinataires — casté `array`, mêmes contraintes |
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
| mode | string | | | `banner` / `read_only` / `down` — **string + contrôle applicatif**, pas d'`enum()` MySQL ni d'enum PHP ; les valeurs sont validées par `Rule::in()` dans `Api/Admin/MaintenanceController` |
| severity | string | | | `info` / `scheduled` / `interruption` — même mécanisme |
| messages | json | | | Messages localisés — casté `array` ; le contrôleur exige `messages.fr` et accepte `messages.en` / `messages.wo` (≤ 500 caractères) |
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
| parameters | json | oui | null | Paramètres du rapport (période, filtres) — casté `array` |
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
> **256 caractères** chiffrés — au-delà du `VARCHAR(255)` que Laravel génère pour `string()` sur
> MySQL. Les chemins réellement écrits aujourd'hui (`reports/{report}-{id}.csv`, ≤ 27 caractères)
> tiennent en 228 caractères, donc la colonne suffit — **par marge, pas par construction**. La
> divergence est documentée telle qu'elle est, pas corrigée : ce document décrit le schéma, il ne
> le décide pas.

---

### 63. IntegrationWebhookLog ✅

**Table :** `integration_webhook_logs`
**Description :** Journal des webhooks échangés avec un fournisseur d'intégration
(cf. [31. Integration](#31-integration-)). Une ligne par webhook reçu ou émis, payload brut conservé
pour rejeu et diagnostic.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| integration_id | FK integrations | oui | null | Intégration concernée — `null` si le webhook n'a pu être rattaché (`nullOnDelete`) |
| provider | string | | | Fournisseur émetteur/destinataire |
| direction | string | | 'incoming' | Sens du webhook |
| status | string | | 'received' | État de traitement |
| event_type | string | oui | null | Type d'événement annoncé par le fournisseur |
| payload | json | | | Payload brut — casté `array`, **NOT NULL sans DEFAULT** (règle MySQL) |
| processed_at | timestamp | oui | null | Date de traitement — `null` = non traité |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(integration_id, created_at)`
- `(provider, created_at)`

**Relations :**
- `integration()` → belongsTo Integration

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
| settings | json | oui | null | Réglages additionnels (objectif, seuil visuel…) — casté `array` |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

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
| settings | json | oui | null | Réglages additionnels — casté `array` |
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
| user_id | FK users | | | Bénéficiaire de la délégation (`cascadeOnDelete`) |
| delegator_id | FK users | | | Auteur de la délégation (`restrictOnDelete` — on ne perd pas la traçabilité) |
| agency_id | FK agencies | | | Agence de portée (`cascadeOnDelete`) |
| role | string | | | Rôle délégué (ex. `agency_admin`) |
| starts_at | dateTime | oui | null | Début — `null` = effet immédiat |
| ends_at | dateTime | | | Fin — **obligatoire**, une délégation est bornée par construction |
| status | RoleDelegationStatus | | 'scheduled' | scheduled, active, revoked, expired |
| reason | text | oui | null | Motif |
| user_native_roles_snapshot | json | | | Instantané des **types de profils** que le bénéficiaire détenait déjà dans l'agence — casté `array`, **NOT NULL sans DEFAULT** (règle MySQL) |
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

**Traits :** `Auditable`, `HasFactory`

**Relations :**
- `user()` → belongsTo User (via `user_id`)
- `delegator()` → belongsTo User (via `delegator_id`)
- `agency()` → belongsTo Agency
- `revokedBy()` → belongsTo User (via `revoked_by`)

**Scopes :** `active()`, `scheduled()`, `readyToActivate()`, `readyToExpire()`, `forAgency($id)`

**Méthodes :** `markActive()`, `markExpired()`, `markRevoked(User $by)`

> ⚠️ **Le nom `user_native_roles_snapshot` est un vestige lexical de l'ère spatie.** Ce que le
> service y écrit (`RoleDelegationService`, TCK-278) est la liste des **types de profils
> polymorphes** déjà détenus dans l'agence, et le commentaire du code le précise :
> *« Audit-only ; ne change pas la résolution d'autorisation (toujours profile-based) ».* La colonne
> n'a jamais contenu de rôles spatie depuis le cutover, et rien ne la lit pour autoriser.

---

### 67. PropertyContactLead ✅

**Table :** `property_contact_leads`
**Description :** Demande de contact déposée depuis la fiche publique d'un bien, par un visiteur
éventuellement **non authentifié**. Elle est routée vers un destinataire (`recipient_user_id`) et
marquée traitée par `handled_at`.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_id | FK properties | | | Bien concerné (`cascadeOnDelete`) |
| recipient_user_id | FK users | oui | null | Destinataire du lead (`nullOnDelete`) |
| name | string | | | Nom déclaré par le visiteur |
| email | string | | | Email déclaré |
| phone | string | oui | null | Téléphone déclaré |
| message | text | | | Message |
| ip | string(45) | oui | null | IP source (45 = longueur d'une IPv6 textuelle) |
| user_agent | string | oui | null | User-agent source |
| handled_at | timestamp | oui | null | Date de prise en charge — `null` = non traité |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(property_id, created_at)`
- `(recipient_user_id, handled_at)` — file « à traiter » par destinataire

**Relations :**
- `property()` → belongsTo Property
- `recipient()` → belongsTo User (via `recipient_user_id`)

**Note :** l'endpoint public est protégé par le limiteur nommé `public-contact-lead`
(5 requêtes / 10 min), défini dans `AppServiceProvider::bootRateLimiters()` — il n'y a **pas** de
`throttle:api` global sur ce dépôt.

---

### 68. PropertyReport ✅

**Table :** `property_reports`
**Description :** Signalement d'une annonce par un visiteur ou un utilisateur connecté (contenu
trompeur, arnaque, doublon…). Le traitement est matérialisé par `resolved_at` ; il n'y a pas de
statut ni de décision stockée.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| property_id | FK properties | | | Bien signalé (`cascadeOnDelete`) |
| reporter_user_id | FK users | oui | null | Auteur si authentifié (`nullOnDelete`) |
| reporter_ip | string(45) | oui | null | IP de l'auteur anonyme |
| reason | string | | | Motif du signalement |
| details | text | oui | null | Précisions libres |
| resolved_at | timestamp | oui | null | Date de traitement — `null` = en attente |
| created_at | datetime | | auto | |
| updated_at | datetime | | auto | |

**Index :**
- `(property_id, created_at)`

**Traits :** `HasFactory`

**Relations :**
- `property()` → belongsTo Property
- `reporter()` → belongsTo User (via `reporter_user_id`)

**Note :** l'endpoint public est protégé par le limiteur nommé `public-report` (5 requêtes / heure).

---

### 69. NotificationDeliveryAttempt ✅

**Table :** `notification_delivery_attempts` *(déclarée explicitement par `$table` sur le modèle)*
**Description :** Une ligne par **tentative** d'acheminement SMS/WhatsApp d'une notification
(TCK-110). Remplace la colonne JSON `app_notifications.delivery_attempts` : l'unicité
`(provider, provider_message_id)` rend la résolution d'un accusé de réception (DLR) en O(1) et
supprime l'ambiguïté de sous-chaîne qu'avait la recherche `LIKE` sur le JSON.

| Colonne | Type | Nullable | Défaut | Description |
|---------|------|----------|--------|-------------|
| id | bigint PK | | auto | |
| app_notification_id | FK app_notifications | | | Notification acheminée (`cascadeOnDelete`) |
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
  concaténation automatique aurait dépassé les 64 caractères de MySQL)

**Index :**
- `(app_notification_id, attempt)`

**Relations :**
- `appNotification()` → belongsTo AppNotification

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
| data | json | oui | null | État du parcours — casté `array` |
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

## Enums

### Enums existants (à renommer / ajuster)

| Actuel | Nouveau nom | Valeurs |
|--------|-------------|---------|
| ~~ProprietyStatus~~ | **PropertyStatus** | available, sold, rented, under_maintenance, unavailable, pending |
| ~~ProprietyVisibility~~ | **PropertyVisibility** | public, private |
| BookingStatus | BookingStatus | pending, confirmed, rejected, cancelled, completed, **expired** |
| UserStatus | UserStatus | active, inactive, blocked, deleted |
| UserRole | UserRole | ~~customer, agency_admin, super_admin, agent, owner, service_provider~~ — **@deprecated TCK-278** (le rôle est désormais dérivé du profil ; voir [Règle 5](#règle-5--profil--rôle)) |
| CustomerStatus | CustomerStatus | active, inactive, blocked, deleted |

> **`UserType` — déprécié (TCK-138 → TCK-142).** L'enum `UserType` est conservé en lecture pendant la phase de migration mais **disparaît** au cutover (TCK-142, suppression de `users.type` + des deux fichiers `app/Models/Enums/UserType.php` et `app/Models/Bases/Enums/UserType.php`). La nature métier d'un user est désormais portée par ses **profils polymorphes** (OwnerProfile / AgentProfile / BrokerProfile / ServiceProviderProfile) ; les permissions par l'enum `Capability`, résolue par `MembershipCapabilityResolver` pour un couple *(utilisateur, agence)* et lue via `canActAt()`. Aucun nouveau code ne doit lire `users.type`.

### Nouveaux enums

| Nom | Valeurs | Utilisé par |
|-----|---------|-------------|
| ~~**UserType**~~ | ~~owner, agent, broker, admin, service_provider~~ | ~~User.type~~ — **@deprecated TCK-138, supprimé en TCK-142** (remplacé par les profils polymorphes) |
| **OwnerProfileStatus** 🆕 | active, inactive, blocked | OwnerProfile.status |
| **AgentProfileStatus** 🆕 | active, inactive, suspended | AgentProfile.status |
| **CollaborationStatus** 🆕 | active, paused, ended | BrokerAgencyCollaboration.status, ServiceProviderAgencyCollaboration.status |
| **KycDossierStatus** 🆕 | pending, submitted, verified, rejected | KycDossier.status |
| **AgencySubscriptionStatus** 🆕 | trialing, active, past_due, suspended, ended | AgencySubscription.status |
| **PlatformPayoutStatus** 🆕 | pending, approved, processing, paid, failed, cancelled | PlatformPayout.status |
| **AnnouncementSeverity** 🆕 | info, success, warning, critical | Announcement.severity |
| **Currency** | XOF, XAF, EUR, USD | Property, Booking, BookingPayment, Lease, LeasePayment |
| **PropertyType** | land, house, apartment, villa, studio, room, office, shop, warehouse, factory, farm, hotel, resort, garage, parking, other | Property.type |
| **ContractType** | sale, rent | Property.contract_type |
| **TitleType** | bail, titre_foncier, deliberation, autre | Property.title_type |
| **LeaseType** | residential_rent, commercial_rent, seasonal_rent, sale | Lease.type |
| **LeaseStatus** | draft, pending_signature, active, expired, terminated, renewed | Lease.status |
| **PaymentStatus** | pending, paid, late, partially_paid, failed, refunded | LeasePayment.status, BookingPayment.status |
| **PaymentMethod** | cash, bank_transfer, mobile_money, check, card | LeasePayment, BookingPayment |
| **PaymentFrequency** | monthly, quarterly, yearly | Lease.payment_frequency |
| **LeasePaymentType** | rent, charges, deposit, **deposit_refund**, regularization, penalty | LeasePayment.payment_type |
| **BookingPaymentType** | deposit, advance, fee | BookingPayment.payment_type |
| **CancellationBy** | owner, customer, agent, system | Booking.cancellation_by |
| **IdType** | id_card, passport, driving_license | Customer.id_type |
| **CollaboratorRole** | manager, co_owner, agent, viewer | PropertyCollaborator.role |
| **TagType** | amenity, feature, label, crm | Tag.type |
| **RelationshipType** | owner_tenant, agent_client, broker_client | UserCustomerRelationship.relationship_type |
| **RelationshipStatus** | active, ended, suspended | UserCustomerRelationship.status |
| **NotificationType** | booking, payment, lease, maintenance, visit, message, system | AppNotification.type |
| **NotificationChannel** | app, email, sms, push, **whatsapp** | AppNotification.delivery_channel |
| **AgencyStatus** | active, inactive, suspended | Agency.status |
| **VisitType** | in_person, virtual, **self_guided**, **hybrid** | PropertyVisit.type |
| **VisitStatus** | scheduled, confirmed, completed, cancelled, no_show | PropertyVisit.status |
| **ConversationType** | direct, group, booking, lease, property, **support** | Conversation.type — *aligné sur `app/Models/Enums/ConversationType.php`, mesuré le 2026-08-16 (R7 de la passe 009)* |
| **ConversationStatus** | active, archived, closed | Conversation.status |
| **MessageType** | text, image, document, system | Message.type |
| **MaintenanceCategory** | plumbing, electrical, structural, appliance, painting, cleaning, pest_control, locksmith, other | MaintenanceRequest.category |
| **MaintenancePriority** | low, medium, high, urgent | MaintenanceRequest.priority |
| **MaintenanceStatus** | open, acknowledged, assigned, in_progress, completed, closed, cancelled | MaintenanceRequest.status |
| **DocumentType** | id_card, passport, lease_contract, receipt, invoice, insurance, inventory_report, photo, other | Document.type |
| **InventoryType** | move_in, move_out | Inventory.type |
| **InventoryStatus** | draft, pending_signature, signed, disputed | Inventory.status |
| **InventoryCondition** | excellent, good, fair, poor | Inventory.general_condition |
| **InvoiceStatus** | draft, sent, paid, overdue, cancelled, void | Invoice.status |
| **PriceChangeReason** | market_adjustment, negotiation, renovation, urgent_sale, seasonal, correction | PropertyPriceHistory.reason |
| **PayoutStatus** | pending, scheduled, processing, completed, failed, cancelled | Payout.status |
| **CustomerPipelineStage** | lead, prospect, qualified, negotiating, converted, lost | Customer.pipeline_stage 🆕 |
| **TaskStatus** | open, in_progress, done, cancelled | Task.status 🆕 |
| **TaskPriority** | low, medium, high | Task.priority 🆕 |
| **SettingScope** | global, agency | Setting.scope 🆕 |
| **BankStatementSourceFormat** 🆕 | csv, ofx | BankStatement.source_format |
| **BankStatementStatus** 🆕 | processing, ready_for_review, partially_reconciled, reconciled, archived | BankStatement.status |
| **BankStatementLineDirection** 🆕 | credit, debit | BankStatementLine.direction |
| **BankStatementLineMatchStatus** 🆕 | unmatched, suggested, confirmed, ignored | BankStatementLine.match_status |
| **AgencyKind** 🆕 | standard, individual | Agency.kind |
| **InvitationStatus** 🆕 | sent, accepted, expired, revoked | Invitation.status |
| **AgencyUpgradeRequestStatus** 🆕 | pending, approved, rejected, revoked | AgencyUpgradeRequest.status |
| **PlatformProfileLevel** 🆕 (TCK-278) | super_admin, support, viewer | PlatformProfile.level |
| **AgencyRoleBaseType** 🆕 (TCK-279) | agent, agency_admin, owner, service_provider | AgencyRole.base_profile_type |
| **Capability** 🆕 (TCK-278) | catalogue code-defined ≈ 30–50 entrées groupées par domaine — voir « Catalogue Capability » ci-dessous | `MembershipCapabilityResolver`, `AgencyRoleCapability.capability` |
| **DataExportStatus** ✅ (TCK-310) | queued, processing, ready, expired, failed | [DataExport.status](#57-dataexport-) |
| **RoleDelegationStatus** ✅ (TCK-310) | scheduled, active, revoked, expired | [RoleDelegation.status](#66-roledelegation-) |

#### Catalogue `Capability` (TCK-278 → TCK-279)

Énumération PHP, code-defined, immuable hors livraison. Groupée par domaine pour pouvoir afficher l'éditeur de rôle en sections (UI TCK-279). Liste indicative (non exhaustive — le catalogue grandit au fil des Policies) :

| Groupe | Valeurs |
|---|---|
| `agency.*` | `agency.update`, `agency.update_kyc`, `agency.update_billing`, `agency.upgrade_request` |
| `team.*` | `team.invite`, `team.assign_role`, `team.remove`, `team.suspend` |
| `properties.*` | `properties.create`, `properties.update_any`, `properties.update_own`, `properties.delete`, `properties.publish`, `properties.moderate` |
| `bookings.*` | `bookings.validate`, `bookings.cancel`, `bookings.refund` |
| `leases.*` | `leases.create`, `leases.sign`, `leases.terminate`, `leases.renew` |
| `payments.*` | `payments.record`, `payments.refund`, `payments.export` |
| `invoices.*` | `invoices.create`, `invoices.write_off`, `invoices.send` |
| `payouts.*` | `payouts.create`, `payouts.approve` |
| `crm.*` | `crm.view_all`, `crm.export`, `crm.assign` |
| `maintenance.*` | `maintenance.assign`, `maintenance.close` |
| `messaging.*` | `messaging.broadcast`, `messaging.archive` |
| `reports.*` | `reports.view_global`, `reports.export` |
| `roles.*` | `roles.create_custom`, `roles.edit_custom`, `roles.delete_custom` |

Chaque entrée est de la forme `<domain>.<verb>` ; les verbes sont normalisés (`create`, `update_any`, `update_own`, `delete`, `view`, `export`, `assign`, `approve`, etc.).

---

## Résumé des changements

### Modèles inchangés (0)

Tous les modèles ont été enrichis ou remplacés. Aucun modèle n'est resté strictement inchangé.

### Modèles existants enrichis (8)

- **User** : +13 colonnes (bio, phone_verified_at, preferred_language, last_login_at, timezone, two_factor_*, notifications_*_enabled, **facebook_id**, **apple_id**), -3 colonnes (model morphs, avatar_url → medialibrary), `type` → UserType enum, +relations (leases, app_notifications, written_reviews, received_reviews, documents)
- **Agency** : +8 colonnes (commission_rate, founded_at, is_verified, verified_at, primary_admin_id, properties_count, active_leases_count, average_rating), -1 colonne (logo_path → medialibrary), +trait `InteractsWithMedia`, +relations (address, reviews, leases, primaryAdmin, documents)
- **Property** : +17 colonnes (currency, bedrooms, bathrooms, furnished, floor_number, total_floors, year_built, parking_spaces, featured, views_count, reference_number, favorites_count, visits_count, reviews_count, average_rating, available_from, published_at), 3 colonnes renommées, `type`/`contract_type`/`title_type`/`currency` → enums, +relations (inventories, conversations)
- **Address** : +1 colonne (neighborhood)
- **Booking** : `customer_id` → NOT NULL, `user_id` → `created_by_id`, `user()` → `creator()`, `cancellation_by` → CancellationBy enum, ➖ `deposit_paid` (remplacé par Accessor dynamique), +relations (documents, invoices) ; BookingStatus +valeur `rejected` + `expired`
- **BookingPayment** : +3 colonnes (refund_amount, refund_reason), `currency` → Currency enum, +trait `HasPaymentAttributes`, +relation `invoice()` morphOne
- **LeasePayment** : `payment_type` → `LeasePaymentType` enum (+valeur `deposit_refund`), `currency` → Currency enum, `due_date` → nullable, +trait `HasPaymentAttributes`, +relation `invoice()` morphOne
- **Customer** : +6 colonnes (id_type → IdType enum, id_number, occupation, emergency_contact_name, emergency_contact_phone, **pipeline_stage**), +relations (visits, notes)
- **Review** : `model_id`/`model_type` → `reviewable_id`/`reviewable_type`, relation `model()` → `reviewable()`, +3 colonnes **reply_content / replied_by_id / replied_at** + relation `repliedBy()`
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
- **PropertyVisit** : +colonne `cancellation_reason`, `type` → VisitType élargi (self_guided, hybrid), +contrainte CHECK
- **Property** : `amenities` JSON ➖ remplacée par Tags de type `amenity` (migration P3.10), +relations `price_histories()` et `invoices()`
- **Lease** : `terminated_by` → `terminated_by_id`, `payment_frequency` → `PaymentFrequency` enum, `currency` → Currency enum, ➖ colonnes `guarantor_name/phone/id_number` (remplacées par FK `guarantor_id` vers modèle `Guarantor`), +relations `guarantor()`, `payouts()`, `invoices()`
- **MaintenanceRequest** : +relation `requesterCustomer()`
- **Document** : morphTo élargi à User, Agency, Booking

### Nouveaux modèles (22)

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

### Modèles documentés a posteriori (16) ✅ — TCK-310

**Ils ne sont pas nouveaux : ils existaient déjà et ce document les ignorait.** Détail complet en
[Modèles documentés a posteriori](#modèles-documentés-a-posteriori-tck-310).

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

### Enums renommés (2)

- ProprietyStatus → **PropertyStatus**
- ProprietyVisibility → **PropertyVisibility**

### Nouveaux enums (45)

- **Scalaires métier :** UserType, Currency, CancellationBy, IdType, CollaboratorRole, TagType, RelationshipType, RelationshipStatus
- **Agence / Propriété :** AgencyStatus, PropertyType, ContractType, TitleType
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
  enums PHP portés par les seize modèles ajoutés ; les autres colonnes de statut de ces modèles sont
  des `string` contrôlées applicativement, et c'est écrit modèle par modèle.

---

## Index recommandés

> Index critiques à déclarer dans les migrations pour les requêtes les plus fréquentes.

| Table | Colonnes indexées | Justification |
|-------|-------------------|---------------|
| properties | `status`, `contract_type` | Filtres de base sur toutes les listes |
| properties | `user_id`, `agency_id` | Récupération du portefeuille |
| properties | `visibility`, `published_at` | Scope `published()` |
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
| document_share_links | `token` | Résolution du lien public (unique) |
| document_share_links | `document_id`, `expires_at` | Liste des liens actifs d'un document |
| tasks | `assigned_to_id`, `due_at` | Tâches à échéance d'un utilisateur |
| tasks | `taskable_type`, `taskable_id` | Tâches liées à une entité |
| customer_notes | `customer_id`, `created_at DESC` | Historique des notes d'un client |
| settings | `(key, scope, scope_id)` | Résolution unique d'un paramètre |
| integrations | `(provider, agency_id)` | Intégration unique par fournisseur / agence |
| bank_statements | `(agency_id, status)` | Relevés ouverts par agence 🆕 |
| bank_statements | `(agency_id, created_at)` | Tri chronologique par agence 🆕 |
| bank_statement_lines | `(bank_statement_id, match_status)` | File de réconciliation par relevé 🆕 |
| bank_statement_lines | `(matched_payment_type, matched_payment_id)` | Recherche inverse depuis un paiement 🆕 |
| bank_statement_lines | `(posted_at, amount)` | Recherche d'appariement par date / montant 🆕 |

> ✅ **Les seize tables documentées a posteriori (TCK-310) ne sont pas reprises ici, délibérément.**
> Ce tableau porte des index *recommandés* — une prescription. Leurs index, eux, sont **mesurés
> dans les migrations** et écrits section par section. Les recopier ici transformerait une mesure en
> prescription et créerait un second endroit à tenir à jour, donc un second endroit à faire mentir.

---

## Règles d'invariance

> Ces règles doivent être respectées à tout moment dans l'application. Elles sont implémentées via des Observers Laravel.

### Règle 1 — User ↔ Customer

Tout User ayant un rôle de locataire actif doit avoir un `Customer` associé (`Customer.user_id` rempli).

- Un User peut exister sans Customer (propriétaire, agent, admin, service_provider).
- Dès qu'un User devient locataire (signature d'un Lease en tant que `tenant`), un Customer doit être créé ou associé.
- **Implémentation :** `UserObserver` ou logique dans `LeaseService` lors de la création d'un bail.
- **Conséquence :** `MaintenanceRequest.requester_id` pointe vers User ; `MaintenanceRequest.requesterCustomer()` retourne le Customer via `user->customer()`.

### Règle 2 — Compteurs cache

Les colonnes `*_count` et `average_rating` ne doivent **jamais** être mises à jour via `save()` sur le modèle parent. Utiliser exclusivement :
- `DB::increment('table', 'column')` pour les compteurs simples
- Jobs planifiés (`RecalculatePropertyRatingsJob`, etc.) pour `average_rating`
- Observers pour synchronisation événementielle (ex: `FavoriteObserver::created()` → incrémente `properties.favorites_count`)

### Règle 3 — Morph `referenceable` dans AppNotification

La relation `referenceable()` de `AppNotification` est intentionnellement **non standard** (morph manuel via `referenceable_id`/`referenceable_type` sans utiliser Eloquent `morphTo` standard). Le motif qui tient encore : un **contrôle fin des types autorisés** — Booking, Lease, LeasePayment, MaintenanceRequest.

> ℹ️ Cette règle invoquait aussi « éviter la création des tables `model_has_...` de spatie ». Ce
> motif est **caduc depuis TCK-278** : le paquet est désinstallé et ces tables n'existent plus. Il
> est retiré ici plutôt que conservé, parce qu'une justification périmée se relit comme une
> justification vivante.

### Règle 5 — Profil = rôle

> 🆕 TCK-278 (refonte RBAC). Le User ne porte plus de rôle ; toute autorisation passe par le profil.

Loi architecturale : **le rôle d'un humain dans un contexte est l'existence d'un profil polymorphe actif dans ce contexte.** Le User est une identité authentifiée pure (email, mot de passe, 2FA, OAuth, status). Il n'a plus de table `model_has_roles` ni d'array `$user->roles[]`.

- **Inventaire des profils porteurs de rôle** :
  - `AgentProfile` ↔ rôle `agent`, scope `agency`
  - `AgencyAdminProfile` ↔ rôle `agency_admin`, scope `agency`
  - `OwnerProfile` ↔ rôle `owner`, scope `agency`
  - `ServiceProviderProfile` + `ServiceProviderAgencyCollaboration` ↔ rôle `service_provider`, scope `agency` via la collaboration
  - `BrokerProfile` + `BrokerAgencyCollaboration` ↔ rôle `broker`, scope `agency` via la collaboration
  - `PlatformProfile` ↔ rôles plateforme (`super_admin` / `support` / `viewer`), scope `null` (cross-tenant)
- **Rôles dérivés non-profil-isés** (phase 1) : `customer` ⇔ `Booking.user_id` existant chez l'agence ; `tenant` ⇔ `Lease.tenant_id` actif. Profile-isation reportée à un ticket dédié si TCK-020 / TCK-090 en font émerger le besoin.
- **Résolution d'une capacité** : un `MembershipCapabilityResolver` (service applicatif) mappe `(Capability, ProfileType) → bool` en phase 1 (table de vérité code-defined), et consulte le pivot `agency_role_capabilities` en phase 2 (TCK-279). Le site d'appel reste `$user->canActAt(Capability::PropertiesPublish, $agency)`.
- **Suppression d'un profil** = révocation immédiate du rôle correspondant. Aucun héritage résiduel, aucun cache de rôle sur User.
- **Invariant base de données** : il est **interdit** d'écrire dans `model_has_roles` / `model_has_permissions` après le cutover TCK-278. Ces tables sont supprimées par la migration de refonte.

### Règle 6 — 1 profil = 1 rôle personnalisé — ⏳ **NON IMPLÉMENTÉE**

> ⏳ **Rien de cette règle n'existe dans le code.** Vérifié le 2026-08-12 : le modèle
> `AgencyRole` n'existe pas, les tables `agency_roles` / `agency_role_capabilities` non
> plus, la colonne `agency_role_id` non plus, et **TCK-279 est `blocked`**.
>
> Cette section était rédigée **au présent de l'indicatif**, comme une loi en vigueur — un
> lecteur pouvait construire sur une invariance qui n'a jamais existé. Elle décrit une
> **cible**, pas un état.
>
> Ce qui régit réellement l'autorisation aujourd'hui : l'enum `Capability` (44 cas) résolue
> par `MembershipCapabilityResolver`, dont la table de vérité est **définie en code** —
> [ADR-0003](adr/0003-capacites-enum-code-defined.md). Sa signature a justement été gelée
> pour que cette Règle 6 puisse la remplacer plus tard sans toucher un seul site d'appel.

> 🆕 TCK-279 (rôles personnalisés). Préalable : Règle 5 + tables `agency_roles` / `agency_role_capabilities`.

**Au futur, donc.** Chaque profil métier (`AgentProfile`, `AgencyAdminProfile`, `OwnerProfile`, `ServiceProviderProfile`) pointera vers **exactement un** `AgencyRole` via `agency_role_id NOT NULL`. Pas de M:N, pas de fallback : la capacité d'un user à agir s'obtient en lisant un seul rôle.

- **Seed agence** : à la création d'une agence, un job/observer seed quatre `AgencyRole` `is_system=true` (un par base_profile_type). Tout profil créé reçoit par défaut le `AgencyRole` système de son type.
- **Personnalisation** : pour modifier les permissions d'un type, l'agency_admin **clone** le rôle système (`is_system=false`), édite le pivot capabilities, puis ré-affecte les profils concernés via `PATCH /api/profiles/{id}/agency-role`.
- **Cumul de capacités** : pour qu'un user cumule deux rôles dans une même agence (« Agent + Validateur »), créer un `AgencyRole` qui bundle les deux. Pas de second profil de même type.
- **Cross-agence** : un user avec des profils dans plusieurs agences a un `AgencyRole` distinct par agence — résolu par `request()->activeProfile()->agency_role`.
- **Suppression d'un AgencyRole utilisé** : refusée (FK restrict). La transition d'un rôle vers un autre passe par la ré-affectation explicite, puis suppression.
- **Plateforme** : `PlatformProfile` n'a pas de `agency_role_id` (les capacités plateforme sont dérivées de `level` directement, pas d'agence à scoper).

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

> À déclarer dans les migrations via `->unique()` ou `->uniqueIndex(['col1', 'col2'])`.

| Table | Colonnes | Type | Condition |
|-------|----------|------|-----------|
| users | `phone` | unique | si non null |
| users | CHECK `(username IS NOT NULL OR email IS NOT NULL)` | contrainte DB | toujours |
| agencies | `license_number` | unique | si non null |
| agencies | `slug` | unique | toujours |
| tags | `name` | unique | toujours |
| tags | `slug` | unique | toujours |
| properties | `reference_number` | unique | si non null |
| leases | `reference_number` | unique | toujours |
| bookings | `reference_number` | unique | si non null |
| lease_payments | `reference_number` | unique | si non null |
| payouts | `reference_number` | unique | toujours |
| invoices | `reference_number` | unique | toujours |
| saved_searches | `(user_id, name)` | unique composé | toujours |
| favorites | `(user_id, property_id)` | unique composé | toujours |
| conversation_participants | `(conversation_id, user_id)` | unique composé | toujours |
| document_share_links | `token` | unique | toujours |
| settings | `(key, scope, scope_id)` | unique composé | toujours |
| integrations | `(provider, agency_id)` | unique composé | toujours |
| owner_profiles | `(user_id, agency_id)` | unique composé | toujours 🆕 |
| agent_profiles | `(user_id, agency_id)` | unique composé | toujours 🆕 |
| broker_profiles | `user_id` | unique | toujours 🆕 |
| broker_profiles | `license_number` | unique | toujours 🆕 |
| service_provider_profiles | `user_id` | unique | toujours 🆕 |
| broker_agency_collaborations | `(broker_profile_id, agency_id)` | unique composé | toujours 🆕 |
| service_provider_agency_collaborations | `(service_provider_profile_id, agency_id)` | unique composé | toujours 🆕 |
| bank_statements | `(agency_id, file_hash)` | unique composé | toujours 🆕 |

---

## Comportements FK (onDelete)

> Règle à appliquer systématiquement dans toutes les migrations. Documenter le choix pour chaque FK.

| Type de relation | Comportement | Exemples |
|-----------------|-------------|---------|
| Table enfant "de vie" — ne peut pas exister sans le parent | `cascadeOnDelete()` | messages → conversation, lease_payments → lease, booking_payments → booking, conversation_participants → conversation, inventories → lease, favorites → property/user, property_price_histories → property, document_share_links → document, customer_notes → customer, integrations → agency |
| FK vers User/Customer "acteur historique" — les logs/actions restent même si l'utilisateur est supprimé | `nullOnDelete()` | activity_log.causer_id, property_visits.visitor_id, leases.terminated_by_id, app_notifications.user_id, guarantors.added_by_id, payouts.issued_by_id, property_price_histories.changed_by_id, reviews.replied_by_id, document_share_links.created_by_id, customer_notes.author_id, tasks.assigned_to_id, tasks.created_by_id, settings.updated_by_id |
| FK métier critique — suppression bloquée si des données dépendent | `restrictOnDelete()` | leases.property_id, leases.tenant_id, lease_payments.lease_id, payouts.landlord_id, invoices.customer_id |
| FK optionnelle — perd son lien si le parent est supprimé | `nullOnDelete()` | properties.agency_id, leases.agency_id, leases.guarantor_id, leases.renewed_from_lease_id, properties.parent_id, bookings.customer_id, payouts.agency_id, payouts.lease_id, payouts.booking_id |

---

## Évolutions futures

> Fonctionnalités et modèles évalués et **volontairement reportés** à cette itération. Chaque entrée indique son statut et son déclencheur d'implémentation.

### EF1 — Modèle `Receipt` séparé

**Statut :** reporté.

Le champ `receipt_number` sur `BookingPayment` et `LeasePayment`, combiné à la génération PDF via medialibrary, couvre le besoin actuel. Un modèle `Receipt` distinct n'apporte pas de valeur supplémentaire pour le MVP.

**Déclencheur :** apparition d'un workflow de récépissé distinct du paiement (ex: récépissé de dépôt de dossier sans paiement immédiat).

### EF2 — Modèle `Commission`

**Statut :** reporté.

Les colonnes `commission_amount` et `commission_rate` sur `Lease` suffisent pour le MVP.

**Déclencheurs :**
- Besoin de ventiler une commission entre plusieurs bénéficiaires (agence + agent + courtier externe).
- Besoin de tracker les versements échelonnés d'une commission.
- Besoin de générer des états comptables de commissions pour l'agence.

### EF3 — Modèle `NotificationPreference` (préférences fines)

**Statut :** reporté.

Les 3 booleans (`notifications_email_enabled`, `notifications_push_enabled`, `notifications_sms_enabled`) sur `User` couvrent 80% des besoins.

**Déclencheur :** demande UX d'une matrice fine par canal × par type de notification (ex: "emails OK pour paiements mais pas pour messages").

**Schéma probable :** `user_id`, `notification_type` (NotificationType), `channel` (NotificationChannel), `enabled` (boolean) — unique(`user_id`, `notification_type`, `channel`).

### EF4 — Fusion `BookingPayment` / `LeasePayment`

**Statut :** **refusé.**

Les workflows sont réellement distincts (ponctuel vs récurrent avec échéancier). Fusionner imposerait ~8 colonnes nullable selon le cas, complexifierait les validations et les index. La factorisation se fait via le trait `HasPaymentAttributes` (colonnes et casts partagés).

### EF5 — Table `message_reads` (lecture fine des messages)

**Statut :** **refusé pour l'instant.**

Le système actuel (`conversation_participant.last_read_at` comparé à `message.created_at`) est suffisant pour les conversations à 2 participants.

**Déclencheur :** apparition de conversations à > 5 participants (canaux support multi-agents, groupes d'équipe agence). Schéma probable : `message_reads(message_id, user_id, read_at)`.

### EF6 — spatie/laravel-activitylog : migration des données

Si des données existent dans la table `activity_logs` custom, une migration de données vers la table `activity_log` du package est nécessaire. Le schéma diffère (notamment `causer_id`/`causer_type` vs `user_id`, et `properties` json vs colonnes séparées).

### EF7 — Multi-branches agence (`Agency.parent_agency_id`)

**Statut :** reporté.

Le modèle `Agency` reste à un seul niveau pour le MVP. L'ajout d'une FK réflexive `parent_agency_id` (+ relations `parent()` / `branches()`) permettrait de gérer des sous-agences / franchises.

**Déclencheur :** première demande d'un client franchise ou d'un groupe immobilier avec plusieurs antennes juridiquement distinctes mais partageant un backoffice.

### EF8 — Modèle `AgentAvailability`

**Statut :** reporté.

Le suivi des congés et indisponibilités des agents peut être géré par un calendrier externe ou un champ libre dans le MVP.

**Déclencheur :** gestion d'une équipe > 10 agents nécessitant une planification formalisée (répartition des visites, rotation de garde). Schéma probable : `user_id`, `start_at`, `end_at`, `type` (`leave`, `off`, `busy`), `notes`.

### EF9 — Modèle `ExchangeRate`

**Statut :** reporté.

L'enum `Currency` existe déjà (XOF, XAF, EUR, USD) mais la conversion effective entre devises n'est pas implémentée. Un modèle `ExchangeRate` (base_currency, target_currency, rate, valid_from, valid_to, source) permettrait de stocker les taux historisés.

**Déclencheur :** première transaction devant être réglée dans une devise différente de celle du bail / de l'annonce (ex: bail en XOF payé en EUR).
