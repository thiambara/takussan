# Matrice de corrélation — Passe 002

Légende : ✅ pleinement supporté · ⚠️ partiellement supporté ou capacité latente · ❌ non supporté.

> **Note de stabilité :** ni `docs/features.md` ni `docs/models-spec.md` n'ont été modifiés depuis la passe 001 (commit `57bd3ed`). La matrice ci-dessous est donc identique à celle de la passe 001 — elle est reproduite intégralement pour permettre la lecture autonome de la passe 002, mais aucun statut n'a évolué.

---

## 1. Features → Modèles

### 1.1 Gestion des biens (`features.md §1.1`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Créer un bien | `Property` | ✅ |
| P0 | Adresse géolocalisée | `Address` (morphOne) | ✅ |
| P0 | Photos | `Property.photos` (medialibrary) | ✅ |
| P0 | Statut | `PropertyStatus` enum | ✅ |
| P0 | Publier / dépublier | `Property.visibility` + `published_at` | ✅ |
| P0 | Modifier / supprimer (soft delete) | `Property.deleted_at` | ✅ |
| P1 | Plans, vidéos, visites 360° | collections medialibrary | ✅ |
| P1 | Tags / amenités | `Tag` + `TagType.amenity` | ✅ |
| P1 | Historique de prix | `PropertyPriceHistory` | ✅ |
| P1 | Collaborateurs + % commission | `PropertyCollaborator.permissions` (json) | ⚠️ pas de `commission_share` dédié |
| P1 | Compteurs vues / favoris | `Property.views_count`, `favorites_count` | ✅ |
| P2 | Dupliquer un bien | applicatif | ⚠️ |
| P2 | Modération avant publication | `PropertyStatus.pending` ambigu | ⚠️ pas de `moderator_id` / `moderation_notes` |
| P2 | Archivage en lot | `deleted_at` | ✅ |
| P3 | Import CSV / MLS | — | ❌ (P3) |
| P3 | Estimation auto IA | — | ❌ (P3) |

### 1.2 Recherche & découverte publique (`features.md §1.2`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Page d'accueil | `Property.featured`, `published_at` | ✅ |
| P0 | Recherche plein-texte | `Property` Scout | ✅ |
| P0 | Filtres de base | `Property` + `Address` | ✅ |
| P0 | Fiche bien publique | `Property` + relations | ✅ |
| P0 | Tri | `BaseModelTrait` | ✅ |
| P1 | Filtres avancés | `furnished`, `floor_number`, `Tag` | ✅ |
| P1 | Recherche par carte | `Address.lat/lng` | ✅ |
| P1 | Favoris | `Favorite` | ✅ |
| P1 | Recherches sauvegardées + alertes | `SavedSearch` | ✅ |
| P1 | Partage d'un bien | applicatif | ✅ |
| P2 | Comparateur | applicatif | ✅ |
| P2 | Biens similaires | applicatif | ✅ |
| P2 | Historique des biens consultés | aucun modèle | ❌ |
| P3 | Recherche vocale / NLP | applicatif | ✅ (P3) |

### 1.3 Réservations courte durée & visites (`features.md §1.3`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Demander une réservation | `Booking` | ✅ |
| P1 | Accepter / refuser / annuler | `BookingStatus` + `reason_*` | ✅ |
| P1 | Acompte et solde | `BookingPayment` + `BookingPaymentType` | ✅ |
| P1 | Calendrier de disponibilité | `Booking.start_date/end_date` | ⚠️ pas de `PropertyAvailability` |
| P1 | Paiements liés à réservation | relations | ✅ |
| P2 | Expiration auto | `Booking.expiration_date` + `BookingStatus.expired` | ✅ |
| P2 | Planification de visites | `PropertyVisit` | ✅ |
| P2 | Rappels avant visite | `AppNotification` + job | ✅ |
| P3 | Annulation + remboursement partiel | `BookingPayment.refund_*` | ✅ |

### 1.4 Location longue durée (`features.md §1.4`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Créer un bail | `Lease` | ✅ |
| P1 | Garants + documents | `Guarantor` + `id_documents` | ✅ |
| P1 | Échéancier mensuel | `LeasePayment` + `PaymentFrequency` | ✅ |
| P1 | Enregistrer paiement | `LeasePayment` + `PaymentStatus` | ✅ |
| P1 | Relances impayés | `PaymentStatus.late` + `AppNotification` | ✅ |
| P1 | Remboursement caution | `LeasePaymentType.deposit_refund` | ✅ |
| P1 | Historique bail | relations | ✅ |
| P2 | Renouvellement / avenant | `LeaseStatus.renewed` | ⚠️ pas de `renewed_from_lease_id` ni `LeaseAmendment` |
| P2 | Résiliation anticipée + pénalités | `terminated_at`, `LeasePayment.late_fee` | ✅ |
| P2 | Révision annuelle (indice) | modification directe | ⚠️ pas de modèle `RentReview` |
| P3 | Signature électronique | externe | ✅ (P3) |
| P3 | Espace locataire dédié | UI | ✅ (P3) |

### 1.5 Transactions & paiements (`features.md §1.5`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Enregistrer un paiement | `BookingPayment` / `LeasePayment` | ✅ |
| P1 | Générer facture | `Invoice` | ✅ |
| P1 | Reversement bailleur | `Payout` | ✅ |
| P1 | Historique par entité | morphMany | ✅ |
| P1 | Suivi statuts | `PaymentStatus`, `InvoiceStatus`, `PayoutStatus` | ✅ |
| P2 | Passerelle paiement | `transaction_id` + `metadata` | ✅ |
| P2 | Rapprochement bancaire | aucun modèle | ⚠️ |
| P2 | Relance auto factures | `Invoice.status.overdue` + `AppNotification` | ✅ |
| P3 | Commissions auto par agent | reporté | ⚠️ (P3) |
| P3 | Compta exportable FEC | applicatif | ✅ (P3) |

### 1.6 CRM (`features.md §1.6`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Créer un Customer | `Customer` | ✅ |
| P0 | Liste / recherche | `Customer` + filtres | ✅ |
| P1 | Lier Customer ↔ User | `Customer.user_id` | ✅ |
| P1 | Relation agent ↔ client | `UserCustomerRelationship` | ✅ |
| P1 | Pièces d'identité | `id_documents` + `Document` | ✅ |
| P1 | Historique d'interactions | `activitylog` | ✅ |
| P1 | Notes libres | `Customer.metadata` / `UCR.notes` | ⚠️ pas de `CustomerNote` horodaté |
| P2 | Pipeline de prospects | `CustomerStatus` insuffisant | ❌ |
| P2 | Tâches et rappels | aucun modèle `Task` | ❌ |
| P2 | Segmentation / tags | `Tag` + `TagType.crm` | ✅ |
| P3 | Campagnes email / SMS | applicatif | ✅ (P3) |

### 1.7 Communication & messagerie (`features.md §1.7`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Conversation 1↔1 | `Conversation` + `ConversationParticipant` | ✅ |
| P1 | Message + pièces jointes | `Message` + `attachments` | ✅ |
| P1 | Liste + non-lu | `last_message_*` + `last_read_at` | ✅ |
| P1 | Notification temps réel | `AppNotification` | ✅ |
| P2 | Conversations de groupe | `ConversationType.group` | ✅ |
| P2 | Accusés lecture (>5) | reporté | ⚠️ (P2 reporté) |
| P2 | Recherche historique | pas de Scout sur `Message` | ⚠️ |
| P3 | Audio / vidéo | applicatif | ✅ (P3) |
| P3 | Traduction auto | applicatif | ✅ (P3) |

### 1.8 Maintenance (`features.md §1.8`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Signaler un problème | `MaintenanceRequest` + `photos` | ✅ |
| P1 | Assigner prestataire | `assigned_to` | ✅ |
| P1 | Suivi statuts | `MaintenanceStatus` | ✅ |
| P1 | Photos + rapport | `completion_photos` + `resolution_notes` | ✅ |
| P1 | Historique par bien | relation | ✅ |
| P2 | Devis + validation | `estimated_cost` | ⚠️ pas de workflow `Quote` |
| P2 | Priorisation | `MaintenancePriority` | ✅ |
| P3 | Facturation prestataire | `Invoice` | ✅ |
| P3 | Contrats récurrents | aucun modèle | ❌ (P3) |

### 1.9 État des lieux (`features.md §1.9`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Inventaire entrée/sortie | `Inventory` + `InventoryType` | ✅ |
| P1 | Photos par pièce | `rooms` (json) + `photos` | ✅ |
| P1 | Consulter / éditer | CRUD | ✅ |
| P2 | Signature des deux parties | `tenant_signed`, `owner_signed` | ✅ |
| P2 | Export PDF | `Document` | ✅ |
| P3 | Comparaison auto | applicatif | ✅ (P3) |
| P3 | IA dégradations | applicatif | ✅ (P3) |

### 1.10 Documents & contrats (`features.md §1.10`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Uploader un document | `Document` + `file` | ✅ |
| P1 | Catégoriser par type | `DocumentType` | ✅ |
| P1 | Partage sécurisé par lien temporaire | aucun modèle | ❌ |
| P1 | Recherche bibliothèque | pas de Scout | ⚠️ |
| P2 | Génération PDF templates | aucun modèle | ⚠️ |
| P2 | Versioning | aucun champ | ⚠️ |
| P3 | Signature électronique | externe | ✅ (P3) |
| P3 | OCR | applicatif | ✅ (P3) |

### 1.11 Avis & réputation (`features.md §1.11`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P2 | Laisser un avis | `Review` (morphTo) | ✅ |
| P2 | Consulter avis publics | `is_approved` + scopes | ✅ |
| P2 | Modération | `approved_by`, `approved_at` | ✅ |
| P2 | Répondre publiquement | aucun champ `reply_*` | ⚠️ |
| P3 | Détection auto suspects | `reported_count` | ✅ (P3) |
| P3 | Badges | aucun modèle | ❌ (P3) |

### 1.12 Agence & équipe (`features.md §1.12`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Créer / configurer agence | `Agency` | ✅ |
| P0 | Ajouter / retirer agents | `User.agency_id` | ✅ |
| P0 | Attribution rôles | `spatie/permission` | ✅ |
| P1 | Statistiques globales | `*_count`, `average_rating` | ✅ |
| P1 | Paramètres commission | `Agency.commission_rate` | ✅ |
| P2 | Multi-branches | pas de `parent_agency_id` | ⚠️ |
| P2 | Congés / dispo agents | aucun modèle | ❌ |
| P3 | Plan SaaS | aucun modèle | ❌ (P3) |
| P3 | Marketplace inter-agences | aucun modèle | ❌ (P3) |

### 2.1 Authentification (`features.md §2.1`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Inscription email | `User` | ✅ |
| P0 | Connexion Sanctum | tokens Sanctum | ✅ |
| P0 | Déconnexion / révocation | Sanctum | ✅ |
| P0 | Mot de passe oublié | Laravel | ✅ |
| P0 | Vérification email | `email_verified_at` | ✅ |
| P0 | Édition profil | `User` + `avatar` | ✅ |
| P1 | Phone OTP | `phone_verified_at` | ✅ |
| P1 | OAuth Google | `google_id` | ✅ |
| P1 | 2FA TOTP | `two_factor_*` | ✅ |
| P1 | Sessions actives | Sanctum | ✅ |
| P2 | Suppression RGPD | `deleted_at` + applicatif | ⚠️ |
| P2 | OAuth Facebook / Apple | aucune colonne | ⚠️ |
| P3 | Magic link | applicatif | ✅ (P3) |

### 2.2 Rôles & permissions (`features.md §2.2`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Rôles prédéfinis | `UserRole` + spatie | ✅ |
| P0 | Permissions granulaires | spatie | ✅ |
| P0 | Mes vs toutes ressources | conventions `.update_all` | ✅ |
| P1 | Attribution / retrait | spatie | ✅ |
| P1 | Éditeur de rôles par agence | spatie non scopé | ⚠️ |
| P2 | Délégation temporaire | aucun modèle | ❌ |
| P3 | Règles conditionnelles | policies | ✅ (P3) |

### 2.3 Notifications (`features.md §2.3`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Centre in-app | `AppNotification` | ✅ |
| P0 | Lu / non lu | `is_read`, `read_at` | ✅ |
| P0 | Email transactionnel | `NotificationChannel.email` | ✅ |
| P1 | Push | `NotificationChannel.push` | ✅ |
| P1 | Préférences par canal | `notifications_*_enabled` | ✅ |
| P1 | Templates multilingues | aucun modèle | ⚠️ |
| P2 | SMS | `NotificationChannel.sms` | ✅ |
| P2 | Digest | applicatif | ✅ |
| P3 | WhatsApp | absent enum | ⚠️ (P3) |

### 2.4 Recherche & filtres (`features.md §2.4`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Plein-texte biens | `Property` Scout | ✅ |
| P0 | Filtres dynamiques | `BaseModelTrait` | ✅ |
| P0 | Pagination | `paginatedThroughRequest` | ✅ |
| P1 | Tri dynamique | `orderThroughRequest` | ✅ |
| P1 | Recherches sauvegardées | `SavedSearch` | ✅ |
| P2 | Full-text msg/docs | Scout absent | ⚠️ |
| P2 | Autocomplétion | applicatif | ✅ |
| P3 | Recherche sémantique | applicatif | ✅ (P3) |

### 2.5 Reporting (`features.md §2.5`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P1 | Dashboard agence | `Agency.*_count` | ✅ |
| P1 | Dashboard bailleur | relations | ✅ |
| P1 | Dashboard agent | relations + activity | ✅ |
| P1 | Dashboard locataire | `LeasePayment`, `Document` | ✅ |
| P2 | Export CSV | applicatif | ✅ |
| P2 | Export PDF | `Document` | ✅ |
| P2 | Graphiques temporels | applicatif | ✅ |
| P3 | KPI personnalisables | applicatif | ✅ (P3) |
| P3 | Alertes seuils | ad hoc | ⚠️ (P3) |

### 2.6 Audit (`features.md §2.6`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Journal automatique | `activitylog` | ✅ |
| P1 | Consultation par entité | requêtes | ✅ |
| P1 | Filtrage | applicatif | ✅ |
| P2 | Export audit trail | applicatif | ✅ |
| P3 | Alertes actions sensibles | applicatif | ✅ (P3) |

### 2.7 Médias (`features.md §2.7`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Upload + validation | `medialibrary` | ✅ |
| P0 | Conversions | `registerMediaConversions()` | ✅ |
| P0 | Suppression sécurisée | medialibrary | ✅ |
| P1 | Upload multiple DnD | frontend | ✅ |
| P1 | Réorganisation DnD | `order_column` | ✅ |
| P2 | CDN webp/avif | config | ✅ |
| P2 | Watermark | applicatif | ✅ |
| P3 | Streaming vidéo | externe | ✅ (P3) |

### 2.8 i18n (`features.md §2.8`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | FR/EN/WO | `preferred_language` | ✅ |
| P0 | Sélection langue | `preferred_language` | ✅ |
| P1 | Fuseau horaire | `User.timezone` | ✅ |
| P1 | Format date/nombre | applicatif | ✅ |
| P2 | Multi-devises + taux | enum sans `ExchangeRate` | ⚠️ |
| P3 | Traduction auto | applicatif | ✅ (P3) |

### 2.9 Administration (`features.md §2.9`)

| Prio | Feature | Modèles / colonnes | Statut |
|------|---------|-------------------|--------|
| P0 | Tags / amenités | `Tag` + `TagType` | ✅ |
| P0 | Gestion utilisateurs | `UserStatus` | ✅ |
| P1 | Gestion enums métier | enums PHP | ✅ |
| P1 | Config email templates | applicatif | ⚠️ |
| P2 | Paramètres globaux | aucun modèle `Setting` | ❌ |
| P2 | Intégrations tierces | aucun modèle `Integration` | ❌ |
| P3 | Mode maintenance | applicatif | ✅ (P3) |
| P3 | Feature flags | applicatif | ✅ (P3) |

---

## 2. Modèles → Features

Tous les 28 modèles sont rattachés à au moins une feature ; aucun n'est orphelin. Les capacités latentes signalées en passe 001 restent inchangées.

| Modèle | Features couvertes | Statut | Capacités latentes |
|--------|--------------------|--------|--------------------|
| `User` | §1.6, §2.1, §2.2, §2.3, §2.8, §1.12 | ✅ | — |
| `Agency` | §1.12, §2.5 | ✅ | — |
| `Property` | §1.1, §1.2, §1.3, §1.4, §1.8 | ✅ | ⚠️ `parent_id`, `reference_number`, `title_type`, `admin_monitored` non évoqués |
| `Address` | §1.1, §1.2 | ✅ | — |
| `Booking` | §1.3, §1.5 | ✅ | — |
| `BookingPayment` | §1.3, §1.5 | ✅ | — |
| `Customer` | §1.6, §1.4 | ✅ | — |
| `PropertyCollaborator` | §1.1 | ✅ | ⚠️ `commission_share` non modélisé |
| `UserCustomerRelationship` | §1.6 | ✅ | ⚠️ `is_primary` non évoqué |
| `Tag` | §1.1, §1.6 | ✅ | — |
| `Review` | §1.11 | ✅ | ⚠️ `reported_count` non exploité |
| `AppNotification` | §2.3, §1.7 | ✅ | — |
| `Lease` | §1.4, §1.5 | ✅ | — |
| `LeasePayment` | §1.4, §1.5 | ✅ | ⚠️ `late_fee` non évoqué explicitement |
| `Favorite` | §1.2 | ✅ | — |
| `PropertyVisit` | §1.3 | ✅ | ⚠️ `VisitType.self_guided/hybrid`, `duration_minutes` non évoqués |
| `Conversation` | §1.7, §1.8 | ✅ | ⚠️ `ConversationType.support` non évoqué |
| `ConversationParticipant` | §1.7 | ✅ | — |
| `Message` | §1.7 | ✅ | — |
| `MaintenanceRequest` | §1.8 | ✅ | — |
| `Document` | §1.10, §1.6, §1.4, §1.9 | ✅ | — |
| `SavedSearch` | §1.2, §2.4 | ✅ | — |
| `Inventory` | §1.9 | ✅ | ⚠️ `general_condition` non évoqué |
| `Invoice` | §1.5 | ✅ | — |
| `PropertyPriceHistory` | §1.1 | ✅ | — |
| `Guarantor` | §1.4 | ✅ | — |
| `Payout` | §1.5 | ✅ | — |

**Bilan modèles :** 28 / 28 ✅, identique à la passe 001.

---

## 3. Compteurs récapitulatifs

| Axe | ✅ | ⚠️ | ❌ |
|-----|----|----|----|
| Features → Modèles | 128 | 22 | 9 |
| Modèles → Features | 28 | 0 | 0 |
| **Total** | **156** | **22** | **9** |

Δ vs passe 001 : 0 / 0 / 0.
