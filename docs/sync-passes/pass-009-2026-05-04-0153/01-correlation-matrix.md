# 01 — Matrice de corrélation Feature ↔ Modèle

> Passe 009 — 2026-05-04

## Légende

- ✅ = feature supportée par un ou plusieurs modèles documentés
- ⚠️ = partiellement supportée (pas de modèle dédié, ou modèle partiel)
- ❌ = non supportée (et P0/P1 — bloquant)

---

## 1. Domaines métier

### 1.1 Gestion des biens

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Créer un bien | Property, Address, User | ✅ |
| P0 | Associer une adresse géolocalisée | Address (morphOne sur Property) | ✅ |
| P0 | Uploader des photos | Property via medialibrary (photos) | ✅ |
| P0 | Définir le statut | Property.status, PropertyStatus enum | ✅ |
| P0 | Publier et dépublier | Property.visibility, PropertyVisibility, published_at | ✅ |
| P0 | Modifier / supprimer (soft delete) | Property (SoftDeletes) | ✅ |
| P0 | Référence unique auto | Property.reference_number | ✅ |
| P1 | Uploader plans, vidéos, visites 360° | Property via medialibrary (plans, videos, virtual_tours) | ✅ |
| P1 | Tags / amenités | Tag (type=amenity, morphToMany Property) | ✅ |
| P1 | Historique de prix auto | PropertyPriceHistory | ✅ |
| P1 | Collaborateurs avec commission | PropertyCollaborator (commission_share) | ✅ |
| P1 | Hiérarchie de biens | Property.parent_id, parent(), children() | ✅ |
| P1 | Type de titre foncier | Property.title_type, TitleType enum | ✅ |
| P1 | Compteurs vues et favoris | Property.views_count, favorites_count | ✅ |
| P2 | Dupliquer un bien | Applicatif (pas de modèle dédié nécessaire) | ✅ |
| P2 | Modération avant publication | Agency.is_verified uniquement — pas de file de modération | ⚠️ |
| P2 | Archivage en lot | Applicatif (SoftDeletes, pas de modèle dédié) | ✅ |
| P3 | Suivi administratif | Property.admin_monitored | ✅ |
| P3 | Import CSV / API externe | Pas de modèle — hors périmètre | ⚠️ |
| P3 | Estimation auto (IA) | Pas de modèle — hors périmètre | ⚠️ |

### 1.2 Recherche & découverte publique

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Page d'accueil | Property (featured, published, views_count) | ✅ |
| P0 | Recherche plein-texte | Property (Scout Searchable) | ✅ |
| P0 | Filtres de base | Property (status, type, price, area, bedrooms, contract_type) | ✅ |
| P0 | Fiche bien publique | Property, Address, medialibrary (photos) | ✅ |
| P0 | Tri des résultats | Applicatif (spatie query builder sort) | ✅ |
| P1 | Filtres avancés | Property (furnished, floor_number, amenities via Tags) | ✅ |
| P1 | Carte interactive | Address (latitude, longitude) | ✅ |
| P1 | Favoris | Favorite | ✅ |
| P1 | Recherches sauvegardées + alertes | SavedSearch | ✅ |
| P1 | Partage d'un bien | Applicatif (pas de modèle dédié) | ✅ |
| P2 | Comparateur de biens | Applicatif (pas de modèle dédié) | ⚠️ |
| P2 | Biens similaires / suggestions | Applicatif (pas de modèle dédié) | ⚠️ |
| P2 | Historique local (navigateur) | Applicatif (localStorage, pas backend) | ✅ |
| P3 | Recherche vocale | Pas de modèle — hors périmètre | ⚠️ |

### 1.3 Réservations courte durée & visites

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P1 | Demander une réservation | Booking, Customer | ✅ |
| P1 | Accepter / refuser / annuler | Booking.status, BookingStatus | ✅ |
| P1 | Paiement acompte et solde (30%) | BookingPayment (deposit), Booking.total_amount | ✅ |
| P1 | Vue calendrier agrégée | Booking (start_date, end_date, status), PropertyVisit (scheduled_at) | ✅ |
| P1 | Consultation paiements liés | BookingPayment (via booking_id) | ✅ |
| P2 | Expiration auto des demandes | Booking.expiration_date | ✅ |
| P2 | Planification de visites | PropertyVisit (type, agent_id, duration_minutes, feedback) | ✅ |
| P2 | Rappels auto avant visite | Applicatif (AppNotification + scheduled_at) | ✅ |
| P3 | Annulation avec remboursement partiel auto | BookingPayment.refund_amount existe mais pas de workflow automatisé | ⚠️ |

### 1.4 Location longue durée (baux)

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P1 | Créer un bail | Lease, Customer, User (landlord) | ✅ |
| P1 | Ajouter garants avec documents | Guarantor (medialibrary id_documents) | ✅ |
| P1 | Générer échéancier de loyers | LeasePayment (period_start, period_end, due_date) | ✅ |
| P1 | Enregistrer paiement mensuel | LeasePayment | ✅ |
| P1 | Relances auto en cas d'impayé | LeasePayment (status=late), AppNotification | ✅ |
| P1 | Pénalités de retard auto | LeasePayment.late_fee | ✅ |
| P1 | Remboursement caution fin de bail | LeasePayment (type=deposit_refund) | ✅ |
| P1 | Historique complet d'un bail | Lease + LeasePayment (relations) | ✅ |
| P2 | Renouveler / avenant | Lease.renewed_from_lease_id, renewedFrom(), renewals() | ✅ |
| P2 | Résiliation anticipée | Lease.terminated_at, termination_reason, terminated_by_id | ✅ |
| P2 | Révision annuelle du loyer | Applicatif via ActivityLog (pas de modèle dédié) | ⚠️ |
| P3 | Signature électronique | Pas de modèle — EF, hors périmètre | ⚠️ |
| P3 | Espace locataire dédié | Applicatif (vue filtrée, pas de modèle dédié) | ✅ |

### 1.5 Transactions & paiements

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Enregistrer un paiement | BookingPayment, LeasePayment | ✅ |
| P1 | Générer une facture | Invoice (customer_id, polymorphic invoiceable) | ✅ |
| P1 | Reversement au bailleur | Payout (landlord_id, net_amount, commission) | ✅ |
| P1 | Historique des paiements par entité | BookingPayment, LeasePayment (relations) | ✅ |
| P1 | Suivi des statuts | PaymentStatus enum | ✅ |
| P2 | Passerelle de paiement | Integration (provider, credentials chiffrés) — partiel | ⚠️ |
| P2 | Rapprochement bancaire semi-auto | BankStatement, BankStatementLine (code) — **absents de models-spec.md** → ❌ | ⚠️ |
| P2 | Relance auto factures en retard | Invoice (status=overdue), AppNotification | ✅ |
| P3 | Commissions automatiques | Pas de modèle — EF2 | ⚠️ |
| P3 | Comptabilité exportable | Pas de modèle — hors périmètre | ⚠️ |

### 1.6 CRM & relation client

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Créer un Customer | Customer | ✅ |
| P0 | Liste et recherche clients | Customer (Searchable via Scout) | ✅ |
| P1 | Lier Customer à User | Customer.user_id | ✅ |
| P1 | Relation agent ↔ client | UserCustomerRelationship | ✅ |
| P1 | Pièces d'identité et documents | Customer via medialibrary (id_documents), Document | ✅ |
| P1 | Historique d'interactions | ActivityLog (spatie) | ✅ |
| P1 | Contact principal | UserCustomerRelationship.is_primary | ✅ |
| P1 | Notes horodatées | CustomerNote (author_id, pinned) | ✅ |
| P2 | Pipeline de prospects | Customer.pipeline_stage, CustomerPipelineStage enum | ✅ |
| P2 | Tâches et rappels | Task (polymorphic taskable → Customer) | ✅ |
| P2 | Segmentation / tags clients | Tag (type=crm, morphToMany Customer) | ✅ |
| P3 | Campagnes email/SMS | Pas de modèle — hors périmètre | ⚠️ |

### 1.7 Communication & messagerie

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P1 | Conversation 1↔1 | Conversation, ConversationParticipant | ✅ |
| P1 | Message avec pièces jointes | Message via medialibrary (attachments) | ✅ |
| P1 | Liste conversations + non lu | ConversationParticipant.last_read_at | ✅ |
| P1 | Notification temps réel | AppNotification | ✅ |
| P2 | Conversations de groupe | Conversation.type=group, ConversationParticipant | ✅ |
| P2 | Accusés de lecture | ConversationParticipant.last_read_at | ✅ |
| P2 | Recherche historique messages | Applicatif (Scout full-text sur Message.content) | ✅ |
| P3 | Appels audio/vidéo | Pas de modèle — hors périmètre | ⚠️ |
| P3 | Traduction auto | Pas de modèle — hors périmètre | ⚠️ |

### 1.8 Maintenance & interventions

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P1 | Signaler un problème | MaintenanceRequest (photos via medialibrary) | ✅ |
| P1 | Assigner un prestataire | MaintenanceRequest.assigned_to (User avec ServiceProviderProfile) | ✅ |
| P1 | Suivi des statuts | MaintenanceStatus enum | ✅ |
| P1 | Photos/rapport après intervention | MaintenanceRequest via medialibrary (completion_photos) | ✅ |
| P1 | Historique par bien | MaintenanceRequest (via property_id) | ✅ |
| P2 | Demande de devis et validation | Applicatif (pas de modèle dédié) | ⚠️ |
| P2 | Priorisation | MaintenanceRequest.priority, MaintenancePriority enum | ✅ |
| P3 | Facturation directe prestataire | Invoice (invoiceable vers MaintenanceRequest) — partiel | ⚠️ |
| P3 | Contrats de maintenance | Pas de modèle — hors périmètre | ⚠️ |

### 1.9 État des lieux & inventaires

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P1 | Créer inventaire entrée/sortie | Inventory | ✅ |
| P1 | Photos par pièce | Inventory via medialibrary (photos), Inventory.rooms (JSON) | ✅ |
| P1 | Consulter / éditer | Inventory (status, relations) | ✅ |
| P2 | Signature des deux parties | Inventory (tenant_signed, owner_signed, signed_at) | ✅ |
| P2 | Export PDF | Applicatif (Document generation via medialibrary) | ✅ |
| P3 | Comparaison auto entrée↔sortie | Pas de modèle — hors périmètre | ⚠️ |
| P3 | Reconnaissance IA dégradations | Pas de modèle — hors périmètre | ⚠️ |

### 1.10 Documents & contrats

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Uploader document lié à une entité | Document (polymorphic documentable) | ✅ |
| P1 | Catégoriser par type | Document.type, DocumentType enum | ✅ |
| P1 | Partage sécurisé par lien temporaire | DocumentShareLink (token, expires_at, password_hash, max_downloads) | ✅ |
| P1 | Recherche dans la bibliothèque | Applicatif (Scout ou requêtes filtrées) | ✅ |
| P2 | Génération PDF depuis templates | Applicatif (medialibrary + templates, pas de modèle dédié) | ✅ |
| P2 | Historique des versions | Applicatif (medialibrary + ActivityLog spatie) | ✅ |
| P3 | Signature électronique intégrée | Pas de modèle — hors périmètre | ⚠️ |
| P3 | OCR et extraction auto | Pas de modèle — hors périmètre | ⚠️ |

### 1.11 Avis & réputation

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P2 | Laisser un avis | Review (polymorphic reviewable → Property, Agency, User) | ✅ |
| P2 | Consulter les avis publics | Review (is_approved, scopes) | ✅ |
| P2 | Modération | Review.is_approved, approved_by, approved_at | ✅ |
| P2 | Répondre publiquement | Review.reply_content, replied_by_id, replied_at | ✅ |
| P2 | Signaler un avis | Review.reported_count | ✅ |
| P3 | Détection auto avis suspects | Pas de modèle — hors périmètre | ⚠️ |
| P3 | Badges de réputation | Pas de modèle — hors périmètre | ⚠️ |

### 1.12 Agence & équipe

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Créer et configurer une agence | Agency | ✅ |
| P0 | Ajouter / retirer des agents | User via AgentProfile (par agence) | ✅ |
| P0 | Attribution de rôles | spatie/laravel-permission (HasRoles, scoped par profil) | ✅ |
| P1 | Statistiques globales d'agence | Applicatif (Agency.properties_count, active_leases_count, average_rating) | ✅ |
| P1 | Paramètres de commission | Agency.commission_rate, AgentProfile.commission_rate | ✅ |
| P3 | Gestion multi-branches | Pas de modèle — hors périmètre | ⚠️ |
| P3 | Congés / disponibilité agents | Pas de modèle — hors périmètre | ⚠️ |
| P3 | Abonnement SaaS | Pas de modèle — hors périmètre | ⚠️ |
| P3 | Marketplace inter-agences | Pas de modèle — hors périmètre | ⚠️ |

---

## 2. Domaines applicatifs transverses

### 2.1 Authentification & comptes

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Inscription email/mot de passe | User | ✅ |
| P0 | Connexion (tokens Sanctum) | User (HasApiTokens) | ✅ |
| P0 | Déconnexion / révocation token | User (Sanctum) | ✅ |
| P0 | Mot de passe oublié / reset | User (password, remember_token) | ✅ |
| P0 | Vérification email | User.email_verified_at | ✅ |
| P0 | Édition profil (nom, bio, avatar) | User (first_name, last_name, bio, avatar medialibrary) | ✅ |
| P1 | Vérification téléphone (SMS/OTP) | User.phone_verified_at | ✅ |
| P1 | OAuth Google | User.google_id | ✅ |
| P1 | 2FA TOTP + recovery codes | User (two_factor_enabled, two_factor_secret, two_factor_recovery_codes) | ✅ |
| P1 | Gestion sessions actives | Sanctum (personal_access_tokens) | ✅ |
| P2 | Suppression compte RGPD | User (SoftDeletes), AccountDeletionRequest (existe en code) | ✅ |
| P2 | OAuth Facebook / Apple | User.facebook_id, apple_id | ✅ |
| P3 | Magic link | Pas de modèle — hors périmètre | ⚠️ |

#### Profils & contexte actif

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Liste des profils | User.profiles() accesseur, OwnerProfile, AgentProfile, BrokerProfile, ServiceProviderProfile | ✅ |
| P0 | Sélection profil actif | Middleware ResolveActiveProfile, cookie active_profile_id | ✅ |
| P0 | Auto-bascule si 1 seul profil | Applicatif (middleware) | ✅ |
| P0 | Switch de profil en UI | Applicatif (header/menu, pas de modèle dédié) | ✅ |
| P0 | Permissions scopées profil actif | spatie teams=true, team_id=profile.agency_id | ✅ |
| P1 | KYC distinct par profil | OwnerProfile (rib, tax_id, id_document_*), AgentProfile (license_number), BrokerProfile (license_number, insurance), ServiceProviderProfile (certifications) | ✅ |
| P1 | Création/désactivation profil par admin | Applicatif (API endpoints, profils status) | ✅ |
| P2 | Indication visuelle "profil actif" | Applicatif (UI, pas de modèle dédié) | ✅ |
| P2 | Audit log changements de profil | ActivityLog (spatie) via ResolveActiveProfile | ✅ |

### 2.2 Rôles & permissions

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Rôles prédéfinis (7 rôles) | spatie/laravel-permission, UserRole | ✅ |
| P0 | Permissions granulaires | spatie (permissions table, HasRoles) | ✅ |
| P0 | Distinction "mes" vs "toutes" | Applicatif (policies, scopes) | ✅ |
| P0 | Résolution runtime via profil actif | ResolveActiveProfile middleware, setPermissionsTeamId | ✅ |
| P1 | Attribution/retrait rôles à un profil | spatie (model_has_roles avec team_id) | ✅ |
| P1 | Éditeur de rôles custom scopé agence | spatie teams, Role/ Permission models | ✅ |
| P2 | Délégation temporaire | Applicatif (pas de modèle dédié) | ⚠️ |
| P3 | Règles conditionnelles | Applicatif (policies Laravel, pas de modèle dédié) | ⚠️ |

### 2.3 Notifications

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Centre de notifications in-app | AppNotification | ✅ |
| P0 | Marquer lu / non lu | AppNotification.is_read, read_at | ✅ |
| P0 | Notifications email transactionnelles | AppNotification (delivery_channel=email) | ✅ |
| P1 | Push web et mobile | AppNotification (delivery_channel=push) | ✅ |
| P1 | Préférences par canal | User (notifications_email/push/sms_enabled) | ✅ |
| P1 | Templates localisés (lang/) | Applicatif (fichiers de langue Laravel) | ✅ |
| P2 | Notifications SMS | AppNotification (delivery_channel=sms) | ✅ |
| P2 | Digest quotidien/hebdo | Applicatif (job planifié, pas de modèle dédié) | ⚠️ |
| P3 | WhatsApp | NotificationChannel enum inclut whatsapp, pas d'implémentation | ⚠️ |

### 2.4 Recherche & filtres

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Recherche plein-texte biens (Scout) | Property (Searchable) | ✅ |
| P0 | Filtres dynamiques | Applicatif (spatie query builder) | ✅ |
| P0 | Pagination standardisée | Applicatif (spatie query builder per_page) | ✅ |
| P1 | Tri dynamique | Applicatif (spatie query builder sort) | ✅ |
| P1 | Recherches sauvegardées | SavedSearch | ✅ |
| P2 | Full-text messages + documents | Applicatif (Scout sur Message.content, Document) | ✅ |
| P2 | Suggestions autocomplétion | Applicatif (pas de modèle dédié) | ⚠️ |
| P3 | Recherche sémantique (embeddings) | Pas de modèle — hors périmètre | ⚠️ |

### 2.5 Reporting & tableaux de bord

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P1 | Dashboard agence | Applicatif (agrégation Agency + Property + Lease) | ⚠️ |
| P1 | Dashboard bailleur | Applicatif (agrégation Property + LeasePayment + Payout) | ⚠️ |
| P1 | Dashboard agent | Applicatif (agrégation Customer + Booking + Task) | ⚠️ |
| P1 | Dashboard locataire | Applicatif (agrégation LeasePayment + MaintenanceRequest) | ⚠️ |
| P2 | Export CSV/Excel | Applicatif (pas de modèle dédié) | ⚠️ |
| P2 | Export PDF | Applicatif (medialibrary + templates) | ✅ |
| P2 | Graphiques temporels | Applicatif (pas de modèle dédié) | ⚠️ |
| P3 | KPI personnalisables | Pas de modèle — hors périmètre | ⚠️ |
| P3 | Alertes sur seuils | Pas de modèle — hors périmètre | ⚠️ |

### 2.6 Audit & traçabilité

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Journal d'activité auto | spatie/laravel-activitylog (LogsActivity trait) | ✅ |
| P1 | Consultation par entité | ActivityLog (spatie, subject morph) | ✅ |
| P1 | Filtrage user/date/action | ActivityLog (spatie, causer, properties) | ✅ |
| P2 | Export audit trail | Applicatif (pas de modèle dédié) | ⚠️ |
| P3 | Alertes actions sensibles | Pas de modèle — hors périmètre | ⚠️ |

### 2.7 Médias & fichiers

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Upload avec validation | spatie/laravel-medialibrary (InteractsWithMedia) | ✅ |
| P0 | Conversions images | medialibrary (registerMediaConversions) | ✅ |
| P0 | Suppression sécurisée | medialibrary (deleteMedia, SoftDeletes) | ✅ |
| P1 | Upload multiple drag&drop | Applicatif (UI + medialibrary) | ✅ |
| P1 | Réorganisation médias | Applicatif (medialibrary order_column) | ✅ |
| P2 | CDN + formats modernes | Applicatif (config medialibrary, CDN) | ⚠️ |
| P2 | Watermark auto | Applicatif (medialibrary conversions) | ⚠️ |
| P3 | Streaming vidéo adaptatif | Pas de modèle — hors périmètre | ⚠️ |

### 2.8 Internationalisation & préférences

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Langues FR/EN/WO | User.preferred_language | ✅ |
| P0 | Sélection langue utilisateur | User.preferred_language | ✅ |
| P1 | Fuseau horaire | User.timezone (default Africa/Dakar) | ✅ |
| P1 | Format date/nombre localisé | Applicatif (Carbon locale, Intl) | ✅ |
| P2 | Devise configurable par agence | Agency.settings (JSON), Currency enum | ✅ |
| P3 | Conversion multi-devises | Pas de modèle — EF9 hors périmètre | ⚠️ |
| P3 | Traduction auto contenus | Pas de modèle — hors périmètre | ⚠️ |

### 2.9 Administration & configuration

| Prio | Feature | Modèles | Statut |
|------|---------|---------|--------|
| P0 | Gestion des tags/amenités | Tag | ✅ |
| P0 | Gestion des utilisateurs | User (status, block/activate) | ✅ |
| P1 | Gestion des enums métier | Applicatif (seeds, config — pas de modèle dédié) | ✅ |
| P1 | Configuration email | Setting (key=email.*) | ✅ |
| P2 | Paramètres globaux | Setting (scope=global) | ✅ |
| P2 | Intégrations tierces (API keys) | Integration (credentials chiffrés) | ✅ |
| P3 | Mode maintenance programmé | Pas de modèle — hors périmètre | ⚠️ |
| P3 | Feature flags | Pas de modèle — hors périmètre | ⚠️ |

---

## Modèles → Features

| Modèle | Features supportées | Statut |
|--------|---------------------|--------|
| 1. User | §2.1 (toute l'auth), §2.2 (HasRoles), §2.8 (préférences), §1.1 (owner), §1.4 (landlord) | ✅ |
| 2. Agency | §1.12, §1.1 (agency_id), §2.5 (dashboard agence) | ✅ |
| 3. Property | §1.1, §1.2, §1.3, §1.4 | ✅ |
| 4. Address | §1.1, §1.2 (carte) | ✅ |
| 5. Booking | §1.3, §1.5 | ✅ |
| 6. BookingPayment | §1.3, §1.5 | ✅ |
| 7. Customer | §1.6, §1.3, §1.4 | ✅ |
| 8. PropertyCollaborator | §1.1 (collaborateurs) | ✅ |
| 9. UserCustomerRelationship | §1.6 | ✅ |
| 10. Tag | §1.1 (amenities), §1.6 (crm), §2.9 | ✅ |
| 11. Review | §1.11 | ✅ |
| 12. AppNotification | §2.3, §1.7 | ✅ |
| 13. ActivityLog → spatie | §2.6 | ✅ |
| 14. Lease | §1.4, §1.5 | ✅ |
| 15. LeasePayment | §1.4, §1.5 | ✅ |
| 16. Favorite | §1.2 | ✅ |
| 17. PropertyVisit | §1.3 | ✅ |
| 18. Conversation | §1.7 | ✅ |
| 19. ConversationParticipant | §1.7 | ✅ |
| 20. Message | §1.7 | ✅ |
| 21. MaintenanceRequest | §1.8 | ✅ |
| 22. Document | §1.10, §1.1, §1.4, §1.6, §1.8 | ✅ |
| 23. SavedSearch | §1.2, §2.4 | ✅ |
| 24. Inventory | §1.9 | ✅ |
| 25. Invoice | §1.5, §1.4, §1.3 | ✅ |
| 26. PropertyPriceHistory | §1.1 | ✅ |
| 27. Guarantor | §1.4 | ✅ |
| 28. Payout | §1.5 | ✅ |
| 29. DocumentShareLink | §1.10 | ✅ |
| 30. Setting | §2.9, §2.2 (scoped) | ✅ |
| 31. Integration | §2.9, §1.5 | ✅ |
| 32. Task | §1.6 | ✅ |
| 33. CustomerNote | §1.6 | ✅ |
| 34. OwnerProfile | §2.1 (profils) | ✅ |
| 35. AgentProfile | §2.1 (profils), §1.12 | ✅ |
| 36. BrokerProfile | §2.1 (profils) | ✅ |
| 37. ServiceProviderProfile | §2.1 (profils), §1.8 | ✅ |
| 38. BrokerAgencyCollaboration | §2.1 (profils courtier) | ✅ |
| 39. ServiceProviderAgencyCollaboration | §2.1 (profils prestataire) | ✅ |
| — **BankStatement** | §1.5 P2 (rapprochement bancaire) — existe en code, absent de models-spec.md | ❌ |
| — **BankStatementLine** | §1.5 P2 (rapprochement bancaire) — existe en code, absent de models-spec.md | ❌ |
