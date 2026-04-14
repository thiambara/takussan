# Matrice de corrélation — Passe 001

Légende : ✅ pleinement supporté · ⚠️ partiellement supporté ou capacité latente · ❌ non supporté.

---

## 1. Features → Modèles

### 1.1 Gestion des biens (`features.md §1.1`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Créer un bien | `Property` (tous champs de base) | ✅ |
| P0 | Associer une adresse géolocalisée | `Address` (morphOne), `latitude/longitude` | ✅ |
| P0 | Uploader des photos | `Property.photos` (medialibrary) | ✅ |
| P0 | Définir le statut | `PropertyStatus` enum | ✅ |
| P0 | Publier / dépublier | `Property.visibility` + `published_at` | ✅ |
| P0 | Modifier / supprimer (soft delete) | `Property.deleted_at` | ✅ |
| P1 | Plans, vidéos, visites 360° | `Property.plans/videos/virtual_tours` collections | ✅ |
| P1 | Tags / amenités | `Tag` + `TagType.amenity` | ✅ |
| P1 | Historique de prix | `PropertyPriceHistory` | ✅ |
| P1 | Collaborateurs + % commission | `PropertyCollaborator.permissions` (json) | ⚠️ — pas de colonne `commission_share` dédiée |
| P1 | Compteurs vues / favoris | `Property.views_count`, `favorites_count` | ✅ |
| P2 | Dupliquer un bien (template) | Logique applicative, aucun support direct | ⚠️ |
| P2 | Modération avant publication | `PropertyStatus.pending` existe | ⚠️ — pas de `moderator_id` / `moderation_notes` |
| P2 | Archivage en lot | `deleted_at` suffit | ✅ |
| P3 | Import CSV / MLS | Pas de modèle `ImportJob` | ❌ (P3 — non bloquant) |
| P3 | Estimation auto IA | Pas de modèle | ❌ (P3 — non bloquant) |

### 1.2 Recherche & découverte publique (`features.md §1.2`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Page d'accueil (vedette, derniers) | `Property.featured`, `published_at` | ✅ |
| P0 | Recherche plein-texte | `Property` trait `Searchable` (Scout) | ✅ |
| P0 | Filtres de base | `Property` (type, price, bedrooms, area) + `Address` | ✅ |
| P0 | Fiche bien publique | `Property` + relations | ✅ |
| P0 | Tri des résultats | Scopes + `BaseModelTrait` | ✅ |
| P1 | Filtres avancés (étage, meublé, amenités) | `furnished`, `floor_number`, `Tag` | ✅ |
| P1 | Recherche par carte | `Address.latitude/longitude` | ✅ |
| P1 | Favoris | `Favorite` | ✅ |
| P1 | Recherches sauvegardées + alertes | `SavedSearch` | ✅ |
| P1 | Partage d'un bien | Logique URL applicative | ✅ |
| P2 | Comparateur de biens | Applicatif (pas de modèle nécessaire) | ✅ |
| P2 | Biens similaires | Algorithme, pas de modèle | ✅ |
| P2 | Historique des biens consultés | Aucun modèle `PropertyViewHistory` | ❌ |
| P3 | Recherche vocale / NLP | Applicatif | ✅ (P3) |

### 1.3 Réservations courte durée & visites (`features.md §1.3`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Demander une réservation | `Booking` | ✅ |
| P1 | Accepter / refuser / annuler | `BookingStatus` + `reason_for_rejection/cancellation` | ✅ |
| P1 | Paiement acompte et solde | `BookingPayment` + `BookingPaymentType` | ✅ |
| P1 | Calendrier de disponibilité par bien | `Booking.start_date/end_date` agrégé | ⚠️ — pas de modèle `PropertyAvailability` ni slot explicite |
| P1 | Paiements liés à la réservation | Relation `Booking.booking_payments()` | ✅ |
| P2 | Expiration auto des demandes | `Booking.expiration_date` + `BookingStatus.expired` | ✅ |
| P2 | Planification de visites | `PropertyVisit` | ✅ |
| P2 | Rappels automatiques avant visite | `AppNotification` + job planifié | ✅ |
| P3 | Annulation + remboursement partiel | `BookingPayment.refund_amount/reason` | ✅ |

### 1.4 Location longue durée (baux) (`features.md §1.4`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Créer un bail | `Lease` | ✅ |
| P1 | Ajouter garant + documents | `Guarantor` + `Guarantor.id_documents` | ✅ |
| P1 | Générer échéancier mensuel | `LeasePayment` + `PaymentFrequency` + `payment_day` | ✅ |
| P1 | Enregistrer paiement mensuel | `LeasePayment` + `PaymentStatus` | ✅ |
| P1 | Relances automatiques impayés | `PaymentStatus.late` + `AppNotification` | ✅ |
| P1 | Remboursement caution fin de bail | `LeasePaymentType.deposit_refund` | ✅ |
| P1 | Consultation historique bail | Relations `Lease` | ✅ |
| P2 | Renouvellement / avenant | `LeaseStatus.renewed` | ⚠️ — pas de modèle `LeaseAmendment` ni `renewed_from_lease_id` |
| P2 | Résiliation anticipée + pénalités | `terminated_at`, `termination_reason`, `LeasePayment.late_fee` | ✅ |
| P2 | Révision annuelle du loyer (indice) | Modification directe de `monthly_rent` | ⚠️ — pas de modèle `RentReview` ni journal indexation |
| P3 | Signature électronique | Service externe | ✅ (P3) |
| P3 | Espace locataire dédié | UI applicative | ✅ (P3) |

### 1.5 Transactions & paiements (`features.md §1.5`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Enregistrer un paiement | `BookingPayment` / `LeasePayment` | ✅ |
| P1 | Générer facture | `Invoice` (morphTo invoiceable) | ✅ |
| P1 | Reversement bailleur | `Payout` | ✅ |
| P1 | Historique par entité | Relations morphMany `invoices/payouts` | ✅ |
| P1 | Suivi des statuts | `PaymentStatus`, `InvoiceStatus`, `PayoutStatus` | ✅ |
| P2 | Passerelle de paiement (Wave/OM/Stripe) | `transaction_id` + `metadata` | ✅ |
| P2 | Rapprochement bancaire semi-auto | Pas de modèle `BankReconciliation` | ⚠️ |
| P2 | Relance auto factures en retard | `Invoice.status.overdue` + `AppNotification` | ✅ |
| P3 | Commissions auto par agent | EF2 (reporté) | ⚠️ (P3) |
| P3 | Comptabilité exportable FEC | Applicatif | ✅ (P3) |

### 1.6 CRM & relation client (`features.md §1.6`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Créer un Customer | `Customer` | ✅ |
| P0 | Liste et recherche clients | `Customer` + filtres | ✅ |
| P1 | Lier Customer à User | `Customer.user_id` | ✅ |
| P1 | Relation agent ↔ client | `UserCustomerRelationship` | ✅ |
| P1 | Joindre pièces d'identité | `Customer.id_documents` + `Document` | ✅ |
| P1 | Historique d'interactions | `spatie/laravel-activitylog` | ✅ |
| P1 | Notes libres sur un client | `Customer.metadata` / `UserCustomerRelationship.notes` | ⚠️ — pas de modèle `CustomerNote` horodaté/auteur |
| P2 | Pipeline de prospects | `CustomerStatus` trop pauvre (active/inactive/blocked/deleted) | ❌ |
| P2 | Tâches et rappels | Aucun modèle `Task` / `Reminder` | ❌ |
| P2 | Segmentation / tags clients | `Tag` + `TagType.crm` | ✅ |
| P3 | Campagnes email / SMS | Applicatif | ✅ (P3) |

### 1.7 Communication & messagerie (`features.md §1.7`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Conversation privée 1↔1 | `Conversation` + `ConversationParticipant` | ✅ |
| P1 | Message texte + pièces jointes | `Message` + `attachments` collection | ✅ |
| P1 | Liste conversations + non-lu | `Conversation.last_message_*` + `ConversationParticipant.last_read_at` | ✅ |
| P1 | Notification temps réel | `AppNotification` (canal push/email) | ✅ |
| P2 | Conversations de groupe | `ConversationType.group` | ✅ |
| P2 | Accusés de lecture individuels (>5) | EF5 reporté explicitement | ⚠️ (P2 reporté) |
| P2 | Recherche dans historique | Pas d'indexation Scout sur `Message` | ⚠️ |
| P3 | Appels audio/vidéo | Applicatif | ✅ (P3) |
| P3 | Traduction auto FR/EN/WO | Applicatif | ✅ (P3) |

### 1.8 Maintenance & interventions (`features.md §1.8`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Signaler un problème + photos | `MaintenanceRequest` + `photos` | ✅ |
| P1 | Assigner un prestataire | `assigned_to` FK User | ✅ |
| P1 | Suivi des statuts | `MaintenanceStatus` | ✅ |
| P1 | Photos + rapport intervention | `completion_photos` + `resolution_notes` | ✅ |
| P1 | Historique par bien | Relation `Property.maintenance_requests` | ✅ |
| P2 | Devis + validation avant travaux | `estimated_cost` | ⚠️ — pas de modèle `Quote` / workflow d'approbation |
| P2 | Priorisation | `MaintenancePriority` | ✅ |
| P3 | Facturation prestataire → agence | `Invoice` | ✅ |
| P3 | Contrats de maintenance récurrents | Aucun modèle | ❌ (P3) |

### 1.9 État des lieux & inventaires (`features.md §1.9`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Créer inventaire entrée/sortie | `Inventory` + `InventoryType` | ✅ |
| P1 | Photos par pièce + état | `rooms` (json) + `photos` collection | ✅ |
| P1 | Consulter / éditer | `Inventory` CRUD | ✅ |
| P2 | Signature des deux parties | `tenant_signed`, `owner_signed` (+ timestamps) | ✅ |
| P2 | Export PDF | `Document` morphMany | ✅ |
| P3 | Comparaison auto entrée/sortie | Applicatif | ✅ (P3) |
| P3 | Reconnaissance IA dégradations | Applicatif | ✅ (P3) |

### 1.10 Documents & contrats (`features.md §1.10`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Uploader un document | `Document` + collection `file` | ✅ |
| P1 | Catégoriser par type | `DocumentType` | ✅ |
| P1 | Partage sécurisé par lien temporaire | Aucun modèle `DocumentShareLink` | ❌ |
| P1 | Recherche dans bibliothèque | Pas de Scout sur `Document` | ⚠️ |
| P2 | Génération PDF depuis templates | Aucun modèle `DocumentTemplate` | ⚠️ |
| P2 | Versioning des documents | Pas de colonne `version` ni `parent_document_id` | ⚠️ |
| P3 | Signature électronique intégrée | Service externe | ✅ (P3) |
| P3 | OCR / extraction | Applicatif | ✅ (P3) |

### 1.11 Avis & réputation (`features.md §1.11`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P2 | Laisser un avis (bien/agent/agence) | `Review` (morphTo) | ✅ |
| P2 | Consulter avis publics | `Review.is_approved` + scopes | ✅ |
| P2 | Modération (masquer/supprimer) | `approved_by`, `approved_at`, `deleted_at` | ✅ |
| P2 | Répondre publiquement à un avis | Aucun champ `reply_content` / modèle `ReviewReply` | ⚠️ |
| P3 | Détection auto avis suspects | Applicatif + `reported_count` | ✅ (P3) |
| P3 | Badges de réputation | Pas de modèle | ❌ (P3) |

### 1.12 Agence & équipe (`features.md §1.12`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Créer / configurer une agence | `Agency` | ✅ |
| P0 | Ajouter / retirer des agents | `User.agency_id` | ✅ |
| P0 | Attribution de rôles | `spatie/permission` | ✅ |
| P1 | Statistiques globales | `properties_count`, `active_leases_count`, `average_rating` | ✅ |
| P1 | Paramètres de commission | `Agency.commission_rate` | ✅ |
| P2 | Gestion multi-branches | Pas de `parent_agency_id` | ⚠️ |
| P2 | Congés / disponibilité agents | Aucun modèle `AgentAvailability` | ❌ |
| P3 | Plan d'abonnement SaaS | Aucun modèle `Subscription` | ❌ (P3) |
| P3 | Marketplace inter-agences | Pas de modèle | ❌ (P3) |

### 2.1 Authentification & comptes (`features.md §2.1`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Inscription email + mot de passe | `User` (email, password) | ✅ |
| P0 | Connexion Sanctum | Sanctum tokens | ✅ |
| P0 | Déconnexion / révocation | Sanctum | ✅ |
| P0 | Mot de passe oublié | Table Laravel standard | ✅ |
| P0 | Vérification email | `email_verified_at` | ✅ |
| P0 | Édition de profil | `User` + `avatar` collection | ✅ |
| P1 | Vérification phone OTP | `phone_verified_at` | ✅ |
| P1 | OAuth Google | `google_id` | ✅ |
| P1 | 2FA TOTP | `two_factor_enabled/secret/recovery_codes` | ✅ |
| P1 | Gestion sessions actives | Tokens Sanctum | ✅ |
| P2 | Suppression compte RGPD | `deleted_at` + anonymisation (applicatif) | ⚠️ |
| P2 | OAuth Facebook / Apple | Aucune colonne `facebook_id` / `apple_id` | ⚠️ |
| P3 | Magic link | Applicatif | ✅ (P3) |

### 2.2 Rôles & permissions (`features.md §2.2`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Rôles prédéfinis | `UserRole` enum + spatie | ✅ |
| P0 | Permissions granulaires | spatie/permission | ✅ |
| P0 | Mes vs toutes ressources | conventions `.update_all` / `.delete_all` | ✅ |
| P1 | Attribution / retrait | spatie | ✅ |
| P1 | Éditeur de rôles par agence | spatie non scopé par `agency_id` | ⚠️ |
| P2 | Délégation temporaire | Pas de modèle `PermissionDelegation` | ❌ |
| P3 | Règles conditionnelles | Policies applicatives | ✅ (P3) |

### 2.3 Notifications (`features.md §2.3`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Centre in-app (cloche/feed) | `AppNotification` | ✅ |
| P0 | Marquer lu / non lu | `is_read`, `read_at` | ✅ |
| P0 | Email transactionnel | `NotificationChannel.email` | ✅ |
| P1 | Push web / mobile | `NotificationChannel.push` | ✅ |
| P1 | Préférences par canal | `notifications_email_enabled` etc. | ✅ |
| P1 | Templates multilingues | Pas de modèle `NotificationTemplate` | ⚠️ |
| P2 | Notifications SMS | `NotificationChannel.sms` | ✅ |
| P2 | Digest quotidien / hebdo | Applicatif | ✅ |
| P3 | Notifications WhatsApp | Absent de `NotificationChannel` | ⚠️ (P3) |

### 2.4 Recherche & filtres (`features.md §2.4`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Plein-texte biens | `Property` Scout | ✅ |
| P0 | Filtres dynamiques | `BaseModelTrait` | ✅ |
| P0 | Pagination standardisée | `paginatedThroughRequest` | ✅ |
| P1 | Tri dynamique | `orderThroughRequest` | ✅ |
| P1 | Recherches sauvegardées | `SavedSearch` | ✅ |
| P2 | Full-text messages / documents | Scout non configuré sur `Message` / `Document` | ⚠️ |
| P2 | Suggestions autocomplétion | Applicatif | ✅ |
| P3 | Recherche sémantique | Applicatif | ✅ (P3) |

### 2.5 Reporting & tableaux de bord (`features.md §2.5`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Dashboard agence | `Agency.*_count` + agrégats | ✅ |
| P1 | Dashboard bailleur | `User.leases`, `Payout` | ✅ |
| P1 | Dashboard agent | Relations + activity log | ✅ |
| P1 | Dashboard locataire | `LeasePayment`, `Document` | ✅ |
| P2 | Export CSV / Excel | Applicatif | ✅ |
| P2 | Export PDF | `Document` + medialibrary | ✅ |
| P2 | Graphiques temporels | Applicatif | ✅ |
| P3 | KPI personnalisables | Applicatif | ✅ (P3) |
| P3 | Alertes sur seuils | `SavedSearch`-like (ad hoc) | ⚠️ (P3) |

### 2.6 Audit & traçabilité (`features.md §2.6`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Journal automatique | `spatie/laravel-activitylog` | ✅ |
| P1 | Consultation par entité | Requêtes sur `activity_log` | ✅ |
| P1 | Filtrage (user/date/action) | Applicatif | ✅ |
| P2 | Export audit trail | Applicatif | ✅ |
| P3 | Alertes actions sensibles | Applicatif | ✅ (P3) |

### 2.7 Médias & fichiers (`features.md §2.7`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Upload + validation | `spatie/medialibrary` | ✅ |
| P0 | Conversions d'images | `registerMediaConversions()` | ✅ |
| P0 | Suppression sécurisée | Medialibrary | ✅ |
| P1 | Upload multiple drag&drop | Frontend | ✅ |
| P1 | Réorganisation par DnD | Medialibrary `order_column` | ✅ |
| P2 | CDN / webp / avif | Config medialibrary | ✅ |
| P2 | Watermark auto | Applicatif | ✅ |
| P3 | Streaming vidéo adaptatif | Externe | ✅ (P3) |

### 2.8 i18n & préférences (`features.md §2.8`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Langues FR/EN/WO | `preferred_language` | ✅ |
| P0 | Sélection langue | `preferred_language` | ✅ |
| P1 | Fuseau horaire | `User.timezone` | ✅ |
| P1 | Format date/nombre localisé | Applicatif | ✅ |
| P2 | Multi-devises avec taux | Enum `Currency` sans modèle `ExchangeRate` | ⚠️ |
| P3 | Traduction auto contenus | Applicatif | ✅ (P3) |

### 2.9 Administration & configuration (`features.md §2.9`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Gestion tags/amenités | `Tag` + `TagType` | ✅ |
| P0 | Gestion utilisateurs | `UserStatus` | ✅ |
| P1 | Gestion enums métier | Enums PHP natifs (choix de design) | ✅ |
| P1 | Config email templates | Applicatif | ⚠️ — pas de modèle `EmailTemplate` |
| P2 | Paramètres globaux plateforme | Aucun modèle `Setting` | ❌ |
| P2 | Intégrations tierces (API keys) | Aucun modèle `Integration` | ❌ |
| P3 | Mode maintenance programmé | Applicatif | ✅ (P3) |
| P3 | Feature flags | Applicatif | ✅ (P3) |

---

## 2. Modèles → Features

Tous les modèles sont rattachés à au moins une feature. Les cellules « capacité latente » signalent des colonnes ou enums dont aucune feature ne parle explicitement.

| Modèle | Features couvertes | Statut | Capacités latentes |
|--------|--------------------|--------|-----|
| `User` | §1.6, §2.1, §2.2, §2.3, §2.8, §1.12 | ✅ | — |
| `Agency` | §1.12, §2.5 | ✅ | — |
| `Property` | §1.1, §1.2, §1.3, §1.4, §1.8 | ✅ | ⚠️ `parent_id`, `reference_number`, `title_type`, `admin_monitored` non évoqués par features.md |
| `Address` | §1.1, §1.2 | ✅ | — |
| `Booking` | §1.3, §1.5 | ✅ | — |
| `BookingPayment` | §1.3, §1.5 | ✅ | — |
| `Customer` | §1.6, §1.4 | ✅ | — |
| `PropertyCollaborator` | §1.1 | ✅ | ⚠️ % de commission spécifique à un collaborateur non modélisé explicitement |
| `UserCustomerRelationship` | §1.6 | ✅ | ⚠️ `is_primary` non évoqué par features.md |
| `Tag` | §1.1, §1.6 | ✅ | — |
| `Review` | §1.11 | ✅ | ⚠️ `reported_count` non évoqué par features.md (pas de "Signaler un avis") |
| `AppNotification` | §2.3, §1.7 | ✅ | — |
| `Lease` | §1.4, §1.5 | ✅ | — |
| `LeasePayment` | §1.4, §1.5 | ✅ | ⚠️ `late_fee` non évoqué explicitement |
| `Favorite` | §1.2 | ✅ | — |
| `PropertyVisit` | §1.3 | ✅ | ⚠️ `VisitType.self_guided/hybrid`, `duration_minutes` non évoqués |
| `Conversation` | §1.7, §1.8 | ✅ | ⚠️ `ConversationType.support` non évoqué par features.md |
| `ConversationParticipant` | §1.7 | ✅ | — |
| `Message` | §1.7 | ✅ | — |
| `MaintenanceRequest` | §1.8 | ✅ | — |
| `Document` | §1.10, §1.6, §1.4, §1.9 | ✅ | — |
| `SavedSearch` | §1.2, §2.4 | ✅ | — |
| `Inventory` | §1.9 | ✅ | ⚠️ `general_condition` (enum `InventoryCondition`) non évoqué explicitement |
| `Invoice` | §1.5 | ✅ | — |
| `PropertyPriceHistory` | §1.1 | ✅ | — |
| `Guarantor` | §1.4 | ✅ | — |
| `Payout` | §1.5 | ✅ | — |

**Bilan modèles :** 28 / 28 ✅ — aucun modèle orphelin. Plusieurs capacités latentes à promouvoir côté features.md.
