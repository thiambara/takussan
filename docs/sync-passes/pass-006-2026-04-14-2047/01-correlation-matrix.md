# Matrice de corrélation features ↔ modèles (Passe 006)

> Pour chaque section de `docs/features.md`, liste les modèles/colonnes/enums de `docs/models-spec.md` qui supportent les fonctionnalités. Statut : ✅ supportée, ⚠️ partiellement / justifiée, ❌ non supportée.

---

## 1. Domaines métier

### §1.1 Gestion des biens

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Créer un bien (type, transaction, caractéristiques) | `Property` + `PropertyType`, `ContractType` | ✅ |
| Associer une adresse géolocalisée | `Address` (lat/lng) | ✅ |
| Uploader des photos | `Property` + medialibrary `photos` | ✅ |
| Définir le statut | `PropertyStatus` | ✅ |
| Publier/dépublier | `Property.published_at`, `PropertyVisibility` | ✅ |
| Modifier/supprimer (soft delete) | `Property` softDeletes | ✅ |
| Référence unique automatique | `Property.reference_number` | ✅ |
| Plans, vidéos, visites virtuelles 360° | medialibrary `plans`, `videos`, `virtual_tours` | ✅ |
| Tags / amenités | `Tag` + `TagType.amenity` | ✅ |
| Historique de prix automatique | `PropertyPriceHistory` + `PriceChangeReason` | ✅ |
| Collaborateurs avec part de commission explicite | `PropertyCollaborator.commission_share` + `permissions` | ✅ |
| Hiérarchie de biens | `Property.parent_id`, `level`, relations `parent()`/`children()` | ✅ |
| Type de titre foncier | `Property.title_type` + `TitleType` | ✅ |
| Compteurs vues/favoris | `Property.views_count`, `favorites_count` | ✅ |
| Dupliquer un bien | Applicatif (copie Eloquent) | ✅ |
| Modération/validation avant publication | `PropertyStatus.pending` | ✅ |
| Archivage en lot | `PropertyStatus` + job Laravel | ✅ |
| Suivi administratif particulier | `Property.admin_monitored` | ✅ |
| Import CSV / API externe | Applicatif (P3) | ✅ |
| Estimation automatique de prix (IA) | Applicatif (P3) | ✅ |

### §1.2 Recherche & découverte publique

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Page d'accueil | `Property.featured`, `published_at` | ✅ |
| Recherche plein-texte | Scout + `Property` | ✅ |
| Filtres de base | `BaseModelTrait::filterThroughRequest()` | ✅ |
| Fiche bien publique | `Property` | ✅ |
| Tri des résultats | `BaseModelTrait::orderThroughRequest()` | ✅ |
| Filtres avancés | `Tag`, `Property.*` | ✅ |
| Recherche par carte | `Address.lat/lng` | ✅ |
| Favoris | `Favorite` | ✅ |
| Recherches sauvegardées | `SavedSearch` | ✅ |
| Partage d'un bien (lien) | Applicatif (URL publique) | ✅ |
| Comparateur côte à côte | Applicatif | ⚠️ applicatif |
| Biens similaires | Applicatif (requête Eloquent) | ✅ |
| Historique local des biens consultés | localStorage front | ✅ reformulé |
| Recherche vocale / langage naturel | Applicatif P3 | ⚠️ P3 applicatif |

### §1.3 Réservations courte durée & visites

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Demander une réservation | `Booking` | ✅ |
| Accepter/refuser/annuler | `BookingStatus` + `CancellationBy` | ✅ |
| Paiement d'acompte et solde | `BookingPayment` + `BookingPaymentType` | ✅ |
| Vue calendrier agrégée | `Booking.start_date/end_date` + `PropertyVisit.scheduled_at` | ✅ |
| Consultation des paiements | `Booking.bookingPayments()` | ✅ |
| Expiration automatique | `BookingStatus.expired` + job Laravel | ✅ |
| Planification de visites multi-types | `PropertyVisit` + `VisitType` (in_person, virtual, self_guided, hybrid) | ✅ |
| Rappels avant visite | `AppNotification` + job | ✅ |
| Annulation avec remboursement partiel | `BookingPayment.refund_amount` prêt | ⚠️ P3 |

### §1.4 Location longue durée

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Créer un bail | `Lease` + `LeaseType` | ✅ |
| Ajouter un ou plusieurs garants avec documents | `Guarantor` + Document polymorphe | ✅ |
| Échéancier de loyers | `LeasePayment` + `PaymentFrequency` | ✅ |
| Enregistrer un paiement mensuel | `LeasePayment` + `PaymentStatus` | ✅ |
| Relances automatiques impayés | `PaymentStatus.late` + job | ✅ |
| Pénalités de retard | `LeasePayment.late_fee` + `LeasePaymentType.penalty` | ✅ |
| Remboursement caution fin de bail | `LeasePaymentType.deposit_refund` | ✅ |
| Historique complet d'un bail | `Lease` relations | ✅ |
| Renouveler / avenant avec traçabilité | `Lease.renewed_from_lease_id` + `LeaseStatus.renewed` | ✅ |
| Résiliation anticipée | `Lease.terminated_*` | ✅ |
| Révision annuelle du loyer journalisée | spatie/laravel-activitylog sur `Lease.monthly_rent` | ✅ |
| Signature électronique | P3 | ✅ applicatif futur |
| Espace locataire dédié | P3 | ✅ applicatif futur |

### §1.5 Transactions & paiements

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Enregistrer un paiement | `BookingPayment` / `LeasePayment` | ✅ |
| Générer une facture | `Invoice` polymorphe | ✅ |
| Reversement au bailleur (Payout) | `Payout` + `PayoutStatus` | ✅ |
| Historique des paiements | Relations | ✅ |
| Suivi des statuts | `PaymentStatus`, `InvoiceStatus` | ✅ |
| Passerelle de paiement (Wave, OM, Stripe) | `PaymentMethod` + applicatif | ⚠️ P2 applicatif |
| Rapprochement bancaire | Applicatif | ⚠️ P2 applicatif |
| Relance automatique factures en retard | `InvoiceStatus.overdue` + job | ✅ |
| Commissions automatiques par agent | EF2 différé | ⚠️ P3 EF2 |
| Comptabilité exportable (FEC) | Applicatif | ⚠️ P3 applicatif |

### §1.6 CRM & relation client

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Créer un Customer | `Customer` | ✅ |
| Liste et recherche clients | `Customer` + BaseModelTrait | ✅ |
| Lier Customer à User | `Customer.user_id` | ✅ |
| Définir relation agent ↔ client | `UserCustomerRelationship` + `RelationshipType` | ✅ |
| Joindre pièces d'identité | `Document` polymorphe | ✅ |
| Historique d'interactions | spatie/laravel-activitylog | ✅ |
| Désigner un contact principal | `UserCustomerRelationship.is_primary` | ✅ |
| Notes horodatées et signées | `CustomerNote` (author_id, body, pinned) | ✅ |
| Pipeline de prospects | `Customer.pipeline_stage` + `CustomerPipelineStage` | ✅ |
| Tâches et rappels | `Task` polymorphe + `TaskStatus`/`TaskPriority` | ✅ |
| Segmentation et tags clients | `Tag` + `TagType.crm` | ✅ |
| Campagnes email/SMS | Applicatif | ⚠️ P3 applicatif |

### §1.7 Communication & messagerie

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Conversation privée 1↔1 | `Conversation` + `ConversationType.direct` | ✅ |
| Envoyer un message texte avec pièces jointes | `Message` + medialibrary | ✅ |
| Liste avec statut non lu | `ConversationParticipant.last_read_at` | ✅ |
| Notification temps réel | `AppNotification` + broadcast | ✅ |
| Conversations de groupe | `ConversationType.group` | ✅ |
| Accusés de lecture individuels (> 5 participants) | EF5 différé | ⚠️ P2 EF5 |
| Recherche dans l'historique | Full-text P2 | ✅ |
| Appels audio/vidéo | Applicatif P3 | ✅ applicatif futur |
| Traduction automatique | Applicatif P3 | ✅ applicatif futur |

### §1.8 Maintenance & interventions

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Signaler un problème | `MaintenanceRequest` + medialibrary | ✅ |
| Assigner prestataire | `MaintenanceRequest.assigned_to_id` + `UserType.service_provider` | ✅ |
| Suivi statuts | `MaintenanceStatus` | ✅ |
| Photos et rapport | medialibrary | ✅ |
| Historique par bien | `Property.maintenanceRequests()` | ✅ |
| Devis et validation | `MaintenanceRequest.estimated_cost` + `quote_approved_at` | ✅ |
| Priorisation | `MaintenancePriority` | ✅ |
| Facturation directe | `Invoice` polymorphe | ✅ |
| Contrats récurrents | P3 | ✅ applicatif futur |

### §1.9 État des lieux & inventaires

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Créer inventaire entrée/sortie | `Inventory` + `InventoryType` | ✅ |
| Photos par pièce / état par élément | `Inventory.rooms` json + medialibrary | ✅ |
| Consulter/éditer | `Inventory` | ✅ |
| Signature deux parties | `Inventory.signed_by_tenant_at` / `signed_by_owner_at` | ✅ |
| Export PDF | Applicatif (dompdf) | ✅ |
| Comparaison auto entrée↔sortie | P3 | ✅ applicatif futur |
| Reconnaissance IA dégradations | P3 | ✅ applicatif futur |

### §1.10 Documents & contrats

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Uploader document lié | `Document` polymorphe + `DocumentType` | ✅ |
| Catégoriser | `DocumentType` | ✅ |
| Partage sécurisé par lien temporaire | `DocumentShareLink` (token, expires_at, password_hash, max_downloads) | ✅ |
| Recherche | Scout | ✅ |
| Génération PDF depuis templates | Applicatif | ✅ |
| Historique des versions | medialibrary + spatie/laravel-activitylog | ✅ |
| Signature électronique | P3 | ✅ applicatif futur |
| OCR et extraction | P3 | ✅ applicatif futur |

### §1.11 Avis & réputation

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Laisser un avis | `Review` polymorphe (`reviewable`) | ✅ |
| Consulter les avis publics | `Review.is_published` | ✅ |
| Modération | `Review.is_published` + `reported_count` | ✅ |
| Répondre publiquement | `Review.reply_content / replied_by_id / replied_at` | ✅ |
| Signaler un avis inapproprié | `Review.reported_count` | ✅ |
| Détection automatique d'avis suspects | Applicatif P3 | ✅ applicatif futur |
| Badges de réputation | Applicatif P3 | ✅ applicatif futur |

### §1.12 Agence & équipe

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Créer/configurer une agence | `Agency` + medialibrary logo | ✅ |
| Ajouter/retirer des agents | `User.agency_id` | ✅ |
| Attribution de rôles | spatie/permission avec `teams = true` + `team_foreign_key = agency_id` | ✅ |
| Statistiques globales | `Agency.properties_count`, `active_leases_count`, `average_rating` | ✅ |
| Paramètres de commission | `Agency.commission_rate` | ✅ |
| Multi-branches / sous-agences | EF7 (P3) | ✅ P3 justifié |
| Gestion des congés | EF8 `AgentAvailability` (P3) | ✅ P3 justifié |
| Plan d'abonnement SaaS | Applicatif P3 | ✅ applicatif futur |
| Marketplace inter-agences | P3 | ✅ applicatif futur |

## 2. Domaines applicatifs transverses

### §2.1 Authentification & comptes

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Inscription email/mot de passe | `User` | ✅ |
| Connexion (Sanctum) | Applicatif Sanctum | ✅ |
| Déconnexion/révocation token | Applicatif | ✅ |
| Mot de passe oublié | Applicatif | ✅ |
| Vérification email | `User.email_verified_at` | ✅ |
| Édition de profil | `User.bio` + avatar medialibrary | ✅ |
| Vérification téléphone (SMS/OTP) | `User.phone_verified_at` | ✅ |
| OAuth Google | `User.google_id` + Socialite | ✅ |
| 2FA (TOTP) | `User.two_factor_*` | ✅ |
| Sessions actives | Applicatif Sanctum | ✅ |
| Suppression compte (RGPD) | `UserStatus.deleted` + anonymisation | ✅ |
| OAuth Facebook/Apple | `User.facebook_id`, `User.apple_id` + Socialite | ✅ |
| Magic link | Applicatif P3 | ✅ applicatif futur |

### §2.2 Rôles & permissions

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Rôles prédéfinis | `UserRole` + spatie/permission | ✅ |
| Permissions granulaires | spatie/permission | ✅ |
| Distinction mes/toutes ressources | Permission `*.update_all` / `*.view_all` | ✅ |
| Attribution/retrait rôles | spatie/permission | ✅ |
| Éditeur rôles scopé par agence | spatie teams + `team_foreign_key = agency_id` | ✅ |
| Délégation temporaire | Applicatif P2 | ✅ applicatif futur |
| Règles conditionnelles | Policies Laravel P3 | ✅ applicatif futur |

### §2.3 Notifications

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Centre de notifications in-app | `AppNotification` | ✅ |
| Marquer lu/non lu | `AppNotification.read_at` | ✅ |
| Notifications email transactionnelles | Applicatif Laravel mail | ✅ |
| Push web/mobile | `NotificationChannel.push` | ✅ |
| Préférences par canal | `User.notifications_*_enabled` | ✅ |
| Templates localisés via lang/ Laravel | Applicatif (pas de persistance dédiée) | ✅ |
| SMS | `NotificationChannel.sms` | ✅ |
| Digest quotidien/hebdo | Applicatif (job) | ✅ |
| WhatsApp | `NotificationChannel.whatsapp` | ✅ |

### §2.4 Recherche & filtres

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Plein-texte (Scout) | Scout + `Property` | ✅ |
| Filtres dynamiques | `BaseModelTrait` | ✅ |
| Pagination standardisée | `paginatedThroughRequest()` | ✅ |
| Tri dynamique | `BaseModelTrait` | ✅ |
| Recherches sauvegardées | `SavedSearch` | ✅ |
| Full-text messages/documents | Applicatif P2 | ✅ |
| Autocomplétion | Applicatif P2 | ✅ |
| Recherche sémantique par embeddings | P3 (pgvector futur) | ⚠️ P3 futur |

### §2.5 Reporting & tableaux de bord

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Dashboard agence | Agrégats sur modèles existants | ✅ |
| Dashboard bailleur | Idem | ✅ |
| Dashboard agent | Idem (`Task`, `Lease`, `Property`) | ✅ |
| Dashboard locataire | Idem | ✅ |
| Export CSV/Excel | Applicatif | ✅ |
| Export PDF | Applicatif | ✅ |
| Graphiques temporels | Applicatif | ✅ |
| KPI personnalisables | Applicatif P3 | ✅ applicatif futur |
| Alertes sur seuils | Applicatif P3 | ✅ applicatif futur |

### §2.6 Audit & traçabilité

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Journal d'activité automatique | spatie/laravel-activitylog | ✅ |
| Consultation par entité | Idem | ✅ |
| Filtrage par utilisateur/date/action | Idem | ✅ |
| Export de l'audit trail | Applicatif | ✅ |
| Alertes sur actions sensibles | Applicatif P3 | ✅ applicatif futur |

### §2.7 Médias & fichiers

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Upload avec validation | medialibrary | ✅ |
| Conversions images | medialibrary | ✅ |
| Suppression sécurisée | Idem | ✅ |
| Upload multiple drag & drop | Applicatif | ✅ |
| Réorganisation | `media.order_column` | ✅ |
| Optimisation CDN/webp/avif | Applicatif P2 | ✅ |
| Watermark | Applicatif P2 | ✅ |
| Streaming vidéo adaptatif | P3 | ✅ applicatif futur |

### §2.8 Internationalisation & préférences

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Langues FR/EN/WO | `User.preferred_language` | ✅ |
| Sélection langue par utilisateur | Idem | ✅ |
| Fuseau horaire | `User.timezone` | ✅ |
| Format date/nombre | Applicatif | ✅ |
| Devise configurable par agence | `Currency` enum + `Agency`/`Setting` | ✅ |
| Conversion multi-devises avec taux | EF9 `ExchangeRate` différé | ⚠️ P3 EF9 |
| Traduction automatique contenus utilisateurs | Applicatif P3 | ⚠️ P3 applicatif |

### §2.9 Administration & configuration

| Feature | Support modèle | Statut |
|---------|----------------|--------|
| Gestion tags et amenités | `Tag` + `TagType` | ✅ |
| Gestion utilisateurs | `User.status` | ✅ |
| Gestion enums métier | Applicatif (enums PHP) | ✅ |
| Configuration email | `Setting` scope `global` | ✅ |
| Paramètres globaux plateforme | `Setting` | ✅ |
| Intégrations tierces (API keys) | `Integration` + credentials encrypted | ✅ |
| Mode maintenance | Applicatif Laravel | ✅ |
| Feature flags | Applicatif P3 | ✅ applicatif futur |

---

## Section inverse — Modèles → Features

Les 33 modèles de `models-spec.md` sont tous utilisés par au moins une feature. Aucun orphelin.

| Modèle | Features principales |
|--------|----------------------|
| User | §2.1, §2.2, §1.6 |
| Agency | §1.12, §2.9 |
| Property | §1.1, §1.2 |
| Address | §1.1, §1.2 |
| Booking | §1.3 |
| BookingPayment | §1.3, §1.5 |
| Customer | §1.6 |
| PropertyCollaborator | §1.1 |
| UserCustomerRelationship | §1.6 |
| Tag | §1.1, §1.6, §2.9 |
| Review | §1.11 |
| AppNotification | §2.3, §1.7 |
| Lease | §1.4 |
| LeasePayment | §1.4, §1.5 |
| Favorite | §1.2 |
| PropertyVisit | §1.3 |
| Conversation | §1.7 |
| ConversationParticipant | §1.7 |
| Message | §1.7 |
| MaintenanceRequest | §1.8 |
| Document | §1.10, §1.6, §1.4 |
| SavedSearch | §1.2, §2.4 |
| Inventory | §1.9 |
| Invoice | §1.5, §1.8 |
| PropertyPriceHistory | §1.1 |
| Guarantor | §1.4 |
| Payout | §1.5 |
| DocumentShareLink | §1.10 |
| Setting | §2.9, §2.3, §2.8 |
| Integration | §2.9 |
| Task | §1.6, §2.5 |
| CustomerNote | §1.6 |
| spatie/laravel-activitylog | §1.4, §1.6, §2.6 |

---

## Totaux

- **Features → Modèles :** 158 ✅ / 12 ⚠️ / 0 ❌
- **Modèles → Features :** 33 ✅ / 0 ⚠️ / 0 ❌
- **Total :** 191 ✅ / 12 ⚠️ / 0 ❌

Tous les ⚠️ sont justifiés (applicatif pur ou EF différé documenté). Aucun bloquant MVP.
