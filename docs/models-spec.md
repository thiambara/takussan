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

### `spatie/laravel-permission`

Gère les **rôles et permissions** via le trait `HasRoles` sur le modèle `User`.
Les rôles sont définis dans l'enum `UserRole` et les permissions sont assignées via le seeder `RolesAndPermissionsSeeder`.
Les tables `roles`, `permissions`, `model_has_roles`, `model_has_permissions` et `role_has_permissions` sont gérées automatiquement par le package — elles ne sont **pas** décrites dans ce document.

**Rôles existants :** customer, agency_admin, super_admin, agent, owner, service_provider

**Scope multi-agences (teams) :** le package est configuré en mode `teams = true` avec `team_foreign_key = agency_id`. Les rôles et permissions personnalisés créés par un `agency_admin` sont automatiquement scopés à son `agency_id`, ce qui permet à chaque agence d'avoir sa propre matrice de rôles sans collision. Les rôles globaux (super_admin) ne sont pas rattachés à une agence.

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
**Description :** Compte utilisateur de la plateforme. Représente tout acteur authentifié : propriétaire, agent immobilier, locataire, courtier ou administrateur.

| Colonne | Type | Nullable | Défaut | Description | Changement |
|---------|------|----------|--------|-------------|------------|
| id | bigint PK | | auto | Identifiant unique | |
| username | string | oui | null | Nom d'utilisateur unique | |
| email | string | oui | null | Adresse email unique | |
| password | string | | | Mot de passe hashé | |
| type | UserType | oui | null | Type de compte (voir enum UserType) — distinct des rôles spatie (UserRole) : le type décrit la nature de l'acteur, le rôle ses permissions | |
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
| agency_id | FK agencies | oui | null | Agence de rattachement | |
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
- ➖ `model_id` + `model_type` (nullableMorphs 'model') — non utilisés, redondants avec `agency_id` et la relation `customer()`
- ➖ `avatar_url` — remplacé par media collection `avatar` via spatie/medialibrary

**Traits :**
- `InteractsWithMedia` (spatie/laravel-medialibrary) — collection `avatar`
- `HasRoles` (spatie/laravel-permission) — gestion des rôles et permissions
- `HasApiTokens` (laravel/sanctum) — authentification API

**Accesseurs :**
- `full_name` : concaténation de `first_name` + `last_name`

**Relations :**
- `agency()` → belongsTo Agency
- `added_by()` → belongsTo User
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

**Table :** `app_notifications` ✏️ ancien `notifications` (approche hybride — cf. `docs/claude-code-prompt-notifications.md`)
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

**Note :** La relation `referenceable()` est intentionnellement manuelle (morph non standard pour éviter les tables `model_has_...` de spatie). Le canal `app_database` est enregistré dans `AppServiceProvider` via `ChannelManager::extend()`.

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
| provider | string | | | Identifiant du fournisseur (`wave`, `orange_money`, `stripe`, `mls`, `twilio`…) |
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

## Enums

### Enums existants (à renommer / ajuster)

| Actuel | Nouveau nom | Valeurs |
|--------|-------------|---------|
| ~~ProprietyStatus~~ | **PropertyStatus** | available, sold, rented, under_maintenance, unavailable, pending |
| ~~ProprietyVisibility~~ | **PropertyVisibility** | public, private |
| BookingStatus | BookingStatus | pending, confirmed, rejected, cancelled, completed, **expired** |
| UserStatus | UserStatus | active, inactive, blocked, deleted |
| UserRole | UserRole | customer, agency_admin, super_admin, **agent**, **owner**, **service_provider** (✏️ `vendor` → `service_provider`) |
| CustomerStatus | CustomerStatus | active, inactive, blocked, deleted |

> **Note `UserType` vs `UserRole` :** `UserType` décrit la **nature de l'acteur** (qui il est — owner, agent, broker, admin, service_provider), `UserRole` (spatie) décrit ses **permissions** (ce qu'il peut faire). Un même agent peut avoir le type `agent` et le rôle `agency_admin`. Les deux coexistent sans redondance. Un `service_provider` (prestataire de maintenance) a le type `service_provider` et le rôle spatie `service_provider`.

### Nouveaux enums

| Nom | Valeurs | Utilisé par |
|-----|---------|-------------|
| **UserType** | owner, agent, broker, **admin**, **service_provider** (✏️ `tenant` retiré) | User.type |
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
| **ConversationType** | direct, group, booking, lease, property | Conversation.type |
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

### Nouveaux modèles (20)

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

### Enums renommés (2)

- ProprietyStatus → **PropertyStatus**
- ProprietyVisibility → **PropertyVisibility**

### Nouveaux enums (41)

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

La relation `referenceable()` de `AppNotification` est intentionnellement **non standard** (morph manuel via `referenceable_id`/`referenceable_type` sans utiliser Eloquent `morphTo` standard). Cela évite la création des tables `model_has_...` de spatie et permet un contrôle fin des types autorisés : Booking, Lease, LeasePayment, MaintenanceRequest.

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
