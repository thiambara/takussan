# Rapport d'analyse — Backend vs `features.md`

> ## ⛔ DOCUMENT PÉRIMÉ — ne pas s'en servir pour prioriser
>
> **Audit code-vs-spec daté du 2026-04-18. Re-mesuré le 2026-08-12 : il est faux.**
>
> Il déclare **25 fonctionnalités « ❌ non implémenté »**. **20 d'entre elles sont implémentées
> aujourd'hui** — « Aucun endpoint `unpublish` n'existe » alors que `routes/api/properties.php:42`
> le définit ; « Dupliquer un bien ❌ » alors que la route et `PropertyPolicy::duplicate()`
> existent ; « Aucun job de rappel de visite » alors que `SendPropertyVisitReminders` est planifié
> toutes les cinq minutes.
>
> **Un agent qui le lit pour prioriser rouvre des chantiers finis.** C'est le piège le plus coûteux
> de `docs/` : il ne se présente pas comme une opinion mais comme une mesure, et sa forme
> (tableaux, ✅/❌) inspire une confiance que son contenu ne mérite plus.
>
> Conservé pour son historique et sa méthode. L'état réel du projet est dans
> [`../CLAUDE.md`](../CLAUDE.md) ; les manquements mesurés sont dans [`ardoise.md`](ardoise.md).

> Audit du 18/04/2026.
> Comparaison systématique de chaque fonctionnalité **P0** et **P1** du [catalogue fonctionnel](./features.md) avec le code backend existant (`takussan-api`).

---

## Légende

| Statut | Signification |
|--------|---------------|
| ✅ | Implémenté et fonctionnel |
| ⚠️ | Partiellement implémenté — manque un aspect |
| ❌ | Non implémenté |
| ➖ | P2/P3 — hors scope MVP, non évalué |

---

## 1. Domaines métier

### 1.1 Gestion des biens

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Créer un bien | ✅ | `PropertyController::store` — type, transaction, caractéristiques |
| P0 | Associer une adresse géolocalisée | ✅ | Adresse morph + lat/lng dans le store/update |
| P0 | Uploader des photos | ✅ | `PropertyMediaController` + Spatie MediaLibrary |
| P0 | Définir le statut | ✅ | `PropertyStatus` enum avec tous les statuts |
| P0 | Publier un bien | ✅ | `PropertyController::publish` |
| P0 | **Dépublier un bien** | ❌ | **Aucun endpoint `unpublish` n'existe.** On ne peut que publier. |
| P0 | Modifier / supprimer (soft delete) | ✅ | `update` + `destroy` (SoftDeletes) |
| P0 | Référence unique auto-générée | ✅ | `TK-{YEAR}-{RANDOM}` dans `Property::booted()` |
| P1 | Uploader plans, vidéos, 360° | ⚠️ | La collection `photos` n'accepte que `image/*`. Pas de collection `videos`/`plans`. |
| P1 | Tags / amenités | ✅ | Relation morph `tags()` + `TagController` CRUD |
| P1 | Historique de prix auto | ✅ | `PropertyPriceHistory` model + observer + endpoint index |
| P1 | Collaborateurs + commissions | ⚠️ | Modèle `PropertyCollaborator` existe, **mais aucun endpoint API** pour gérer les collaborateurs. |
| P1 | Hiérarchie de biens (immeuble→lots) | ⚠️ | `parent_id`, `children()`, `parent()` existent dans le modèle. **Mais aucune logique API** pour créer/lister des enfants. |
| P1 | Type de titre foncier | ✅ | `TitleType` enum + champ `title_type` dans Property |
| P1 | Compteurs de vues et favoris | ⚠️ | `views_count` existe dans le modèle + `FavoriteController`. **Mais pas d'endpoint d'incrémentation de vues.** Le `FavoriteObserver` met à jour `favorites_count`. |
| P2 | Dupliquer un bien | ❌ | — |
| P2 | Modération avant publication | ❌ | — |

### 1.2 Recherche & découverte publique

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Page d'accueil (biens vedettes, récents) | ✅ | `PublicPropertyController::index` — filtres `featured`, tri par `published_at` |
| P0 | Recherche plein-texte | ✅ | Laravel Scout (Searchable) + `PublicPropertyController::search` |
| P0 | Filtres de base | ✅ | `BaseModelTrait::scopeFilter` — ville, type, prix, chambres, surface |
| P0 | Fiche bien publique | ✅ | `PublicPropertyController::show` (par slug) |
| P0 | Tri des résultats | ✅ | `BaseModelTrait::scopeSort` |
| P1 | Filtres avancés (amenités, etc.) | ⚠️ | Filtres existants via `requestFilterable`, mais **pas de filtre par amenités/tags** dans l'API publique. |
| P1 | Recherche par carte interactive | ⚠️ | L'adresse a `latitude`/`longitude`, **mais pas de recherche géospatiale** (bounding box, rayon). C'est un travail frontend+API. |
| P1 | Favoris | ✅ | `FavoriteController` — add/remove/list |
| P1 | Recherches sauvegardées + alertes | ✅ | `SavedSearchController` CRUD + `SendSavedSearchAlerts` job planifié |
| P1 | Partage d'un bien (lien) | ✅ | Fiche publique par slug = lien partageable |

### 1.3 Réservations courte durée & visites

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P1 | Demander une réservation | ✅ | `BookingController::store` |
| P1 | Accepter, refuser, annuler | ✅ | `confirm`, `reject`, `cancel` endpoints |
| P1 | Paiement d'acompte et solde | ✅ | `BookingPaymentController` (store, refund) |
| P1 | **Vue calendrier agrégée** | ❌ | **Aucun endpoint calendrier.** Pas de route qui agrège réservations confirmées + visites planifiées par date. |
| P1 | Consultation paiements réservation | ✅ | `bookings/{id}/payments` |
| P2 | Expiration auto des demandes | ✅ | `ExpireBookings` job planifié hourly |
| P2 | Planification de visites | ✅ | `PropertyVisitController` CRUD + statuts |
| P2 | **Rappels auto avant visite** | ❌ | **Aucun job de rappel de visite.** Seuls les rappels de loyer existent. |

### 1.4 Location longue durée (baux)

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P1 | Créer un bail | ✅ | `LeaseController::store` + `LeaseService::create` |
| P1 | Ajouter garant(s) | ✅ | `GuarantorController` CRUD, lié au bail |
| P1 | Générer échéancier de loyers | ✅ | `LeaseService::generateSchedule` + job async |
| P1 | Enregistrer un paiement mensuel | ✅ | `LeasePaymentController::store` + `markPaid` |
| P1 | Relances auto impayés | ✅ | `SendLeasePaymentReminders` job quotidien |
| P1 | Pénalités de retard auto | ⚠️ | `ApplyLatePaymentPenalties` job passe les paiements en `Late`, **mais ne calcule pas de montant de pénalité** (pas de champ penalty_amount, pas de taux configurable). |
| P1 | **Remboursement de la caution** | ❌ | **Aucune logique de remboursement de caution en fin de bail.** Le `LeaseService::terminate` ne gère pas le retour de dépôt. |
| P1 | Historique complet d'un bail | ✅ | `LeaseController::show` charge `payments`, audit log via Spatie |
| P2 | Renouveler / avenant | ✅ | `LeaseService::renew` avec `renewed_from_lease_id` |
| P2 | Résiliation anticipée + pénalités | ⚠️ | `LeaseService::terminate` existe, **mais pas de calcul automatique de pénalités de résiliation.** |

### 1.5 Transactions & paiements

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Enregistrer un paiement | ✅ | `LeasePaymentController` + `BookingPaymentController` |
| P1 | Générer une facture | ✅ | `InvoiceController::store` + `InvoiceService` |
| P1 | Reversement au bailleur (Payout) | ✅ | `PayoutController` + `PayoutService` complet |
| P1 | Historique des paiements par entité | ✅ | Endpoints nested sous leases/bookings |
| P1 | Suivi des statuts | ✅ | `PaymentStatus`, `InvoiceStatus`, `PayoutStatus` enums |
| P2 | Intégration passerelle paiement | ❌ | — |
| P2 | **Relance auto factures en retard** | ❌ | **Aucun job de relance pour les factures.** Les relances ne concernent que les loyers. |

### 1.6 CRM & relation client

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Créer un Customer | ✅ | `CustomerController::store` |
| P0 | Liste et recherche | ✅ | `CustomerController::index` |
| P1 | Lier Customer à User | ✅ | Champ `user_id` dans Customer |
| P1 | Relation agent ↔ client | ✅ | Modèle `UserCustomerRelationship` |
| P1 | Joindre pièces d'identité | ✅ | `DocumentController` avec `documentable_type` polymorphe |
| P1 | Historique d'interactions | ✅ | Via Spatie Activitylog (auditable) |
| P1 | **Désigner un contact principal** | ❌ | **Pas de champ `is_primary` ou logique de « contact principal » sur `UserCustomerRelationship`.** |
| P1 | Notes horodatées par agent | ✅ | `CustomerNoteController` (index/store/destroy) |
| P2 | Pipeline de prospects | ⚠️ | `CustomerPipelineStage` enum existe, **mais aucun endpoint API pour gérer les transitions de pipeline.** |
| P2 | Tâches/rappels sur client | ✅ | `TaskController` CRUD — tâches assignables polymorphes |

### 1.7 Communication & messagerie

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P1 | Conversation 1↔1 | ✅ | `ConversationController::store` + types |
| P1 | Envoyer message + PJ | ✅ | `ConversationController::sendMessage` |
| P1 | Liste conversations + non lu | ✅ | `ConversationController::index` |
| P1 | **Notification en temps réel** | ❌ | **Pas de Broadcasting/WebSocket configuré.** Les notifications sont in-app DB uniquement, pas de push temps réel. |

### 1.8 Maintenance & interventions

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P1 | Signaler un problème | ✅ | `MaintenanceRequestController::store` |
| P1 | Assigner un prestataire | ✅ | Champ `assigned_to_id` dans update |
| P1 | Suivi des statuts | ✅ | `MaintenanceStatus` enum (Open, InProgress, Resolved, Cancelled…) |
| P1 | Photos + rapport après intervention | ⚠️ | Le modèle supporte les documents, **mais pas de champ structuré `resolution_report` ou collection media dédiée pour le rapport.** |
| P1 | Historique par bien | ✅ | `Property::maintenanceRequests()` relation |

### 1.9 État des lieux & inventaires

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P1 | Créer inventaire entrée/sortie | ✅ | `InventoryController::store` — type `entry`/`exit` |
| P1 | Photos par pièce | ⚠️ | Les rooms sont en JSON (`rooms.*.name`, `rooms.*.condition`), **mais pas d'upload de photos par pièce** via l'API. |
| P1 | Consulter / éditer | ✅ | `show` + `update` (PATCH) pour les drafts |

### 1.10 Documents & contrats

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Uploader un document lié | ✅ | `DocumentController::store` — polymorphe |
| P1 | Catégoriser par type | ✅ | `DocumentType` enum (contract, cni, rib, quittance…) |
| P1 | Partage sécurisé par lien temporaire | ✅ | `DocumentShareLinkController` — création + expiration |
| P1 | Recherche dans la bibliothèque | ⚠️ | `DocumentController::index` liste, **mais pas de recherche plein-texte sur le contenu des documents.** |

### 1.11 Avis & réputation

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P2 | Laisser un avis | ✅ | `ReviewController` — property + agency |
| P2 | Consulter avis publics | ✅ | `indexForProperty`, `indexForAgency` (publics si `is_approved`) |
| P2 | Modération | ✅ | `approve` endpoint (admin only) |
| P2 | Répondre publiquement | ✅ | `reply` endpoint |
| P2 | **Signaler un avis** | ❌ | **Pas d'endpoint `report` pour signaler un avis inapproprié.** |

### 1.12 Agence & équipe

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Créer/configurer une agence | ✅ | `AgencyController` CRUD |
| P0 | Ajouter/retirer des agents | ⚠️ | Géré par `agency_id` sur User, **mais pas d'endpoint explicite pour ajouter/retirer un agent d'une agence.** |
| P0 | Attribution de rôles aux membres | ✅ | Via Spatie Permission (team-scoped) |
| P1 | Statistiques globales d'agence | ✅ | `DashboardController::agencyStats` |
| P1 | **Paramètres de commission par défaut** | ❌ | **Pas de champ `default_commission_rate` sur Agency, ni de logique de commission par défaut.** |

---

## 2. Domaines applicatifs transverses

### 2.1 Authentification & comptes

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Inscription email/mdp | ✅ | `AuthController::register` |
| P0 | Connexion (Sanctum) | ✅ | `AuthController::login` |
| P0 | Déconnexion + révocation | ✅ | `AuthController::logout` |
| P0 | Mot de passe oublié + reset | ✅ | `PasswordResetController` |
| P0 | Vérification email | ✅ | `EmailVerificationController` |
| P0 | Édition de profil | ✅ | `AuthController::updateProfile` |
| P1 | Vérification téléphone (OTP) | ✅ | `PhoneVerificationController` |
| P1 | OAuth Google | ✅ | `OAuthController` (redirect + callback) |
| P1 | 2FA (TOTP + recovery codes) | ✅ | `TwoFactorController` (enable/confirm/disable/codes) |
| P1 | Sessions actives | ✅ | `SessionController` (index/destroy) |
| P2 | **Suppression de compte + RGPD** | ❌ | **Aucun endpoint de suppression/anonymisation de compte.** |

### 2.2 Rôles & permissions

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Rôles prédéfinis | ✅ | `UserRole` enum + seeder Spatie Permission |
| P0 | Permissions granulaires | ✅ | Policies inline dans les controllers |
| P0 | Distinction mes ressources vs toutes | ✅ | Scoping par `user_id`/`agency_id` dans chaque controller |
| P1 | Attribution/retrait de rôles | ⚠️ | Via Filament admin, **mais pas d'endpoint API dédié** pour assigner/retirer des rôles. |
| P1 | **Éditeur de rôles custom par agence** | ❌ | **Non implémenté.** Spatie Teams est utilisé, mais pas d'UI/API pour créer des rôles personnalisés par agence. |

### 2.3 Notifications

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Centre de notifications in-app | ✅ | `NotificationController::index` |
| P0 | Marquer lu / non lu | ✅ | `markAsRead` + `markAllRead` |
| P0 | Notifications email transactionnelles | ⚠️ | `NotificationService` crée les notifs in-app, **mais pas d'envoi d'email automatique** (pas de `Notification` class Laravel avec canal `mail`). |
| P1 | Push web/mobile | ❌ | — |
| P1 | Préférences par canal | ❌ | **Pas de modèle/endpoint pour les préférences de notification par canal.** |
| P1 | **Templates localisés (lang/)** | ❌ | **Aucun fichier `lang/` projet.** Les messages sont en dur dans le code source (français hardcodé). |

### 2.4 Recherche & filtres

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Recherche plein-texte (Scout) | ✅ | `Searchable` sur Property |
| P0 | Filtres dynamiques | ✅ | `BaseModelTrait::scopeFilter` |
| P0 | Pagination standardisée | ✅ | `per_page` + meta `total/current_page/last_page` |
| P1 | Tri dynamique | ✅ | `BaseModelTrait::scopeSort` |
| P1 | Recherches sauvegardées | ✅ | `SavedSearchController` |

### 2.5 Reporting & tableaux de bord

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P1 | Dashboard agence | ✅ | `DashboardController::agencyStats` |
| P1 | Dashboard bailleur | ✅ | `DashboardController::ownerStats` |
| P1 | Dashboard agent | ✅ | `DashboardController::agentStats` |
| P1 | Dashboard locataire | ✅ | `DashboardController::tenantStats` |
| P2 | **Export CSV / Excel** | ❌ | **Aucune route d'export.** |
| P2 | **Export PDF** | ❌ | **Aucun template de génération PDF (quittance, facture).** |

### 2.6 Audit & traçabilité

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Journal d'activité auto | ✅ | Spatie Activitylog via trait `Auditable` |
| P1 | Consultation par entité | ✅ | `AuditLogController::forEntity` |
| P1 | Filtrage par user/date/action | ✅ | `AuditLogController::index` avec filtres |

### 2.7 Médias & fichiers

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Upload avec validation | ✅ | Spatie MediaLibrary + MIME types |
| P0 | Conversions (thumbnail, preview) | ✅ | `registerMediaConversions` sur Property |
| P0 | Suppression sécurisée | ✅ | `PropertyMediaController::destroy` |
| P1 | Upload multiple + drag & drop | ⚠️ | L'upload multiple est supporté côté API. Le **reorder** existe (`PropertyMediaController::reorder`). Drag & drop = frontend. |

### 2.8 Internationalisation & préférences

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | **Langues : FR, EN, WO** | ❌ | **Aucun fichier de traduction `lang/` dans le projet.** Tous les messages sont en français hardcodé. |
| P0 | **Sélection langue par user** | ❌ | **Pas de champ `locale` sur le modèle User, ni de middleware de détection de langue.** |
| P1 | Fuseau horaire utilisateur | ❌ | **Pas de champ `timezone` sur User, ni de conversion automatique.** |
| P1 | Format date/nombre localisé | ❌ | **Pas de layer de localisation.** |

### 2.9 Administration & configuration

| Prio | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| P0 | Gestion tags/amenités | ✅ | `TagController` CRUD |
| P0 | Gestion utilisateurs (activation, blocage) | ⚠️ | `UserStatus` enum (active, blocked, suspended) existe. **Mais pas d'endpoint API admin pour bloquer/activer un user.** Filament pourrait gérer ça. |
| P1 | Gestion enums métier | ⚠️ | Les enums sont en PHP, **pas de CRUD dynamique** — c'est un choix d'architecture (enums = code, pas DB). Acceptable. |
| P1 | **Configuration email (templates, expéditeur)** | ❌ | **Pas de système de templates email configurables.** |
| P2 | Paramètres globaux plateforme | ✅ | `SettingController` CRUD |
| P2 | Intégrations tierces (API keys) | ✅ | `IntegrationController` CRUD |

---

## Résumé des manquements critiques (P0 + P1)

### ❌ Non implémentés — À développer

| # | Domaine | Fonctionnalité | Prio | Effort estimé |
|---|---------|----------------|------|---------------|
| 1 | Biens | Endpoint **dépublier** un bien | P0 | 🟢 Faible |
| 2 | Baux | **Remboursement de la caution** en fin de bail | P1 | 🟡 Moyen |
| 3 | Réservations | **Vue calendrier agrégée** (réservations + visites) | P1 | 🟡 Moyen |
| 4 | CRM | **Désigner un contact principal** agent ↔ client | P1 | 🟢 Faible |
| 5 | Agence | **Paramètres de commission par défaut** | P1 | 🟢 Faible |
| 6 | Messagerie | **Notifications temps réel** (Broadcasting/WebSocket) | P1 | 🔴 Élevé |
| 7 | Notifications | **Emails transactionnels via canaux Laravel** | P0 | 🟡 Moyen |
| 8 | Notifications | **Préférences par canal** par utilisateur | P1 | 🟡 Moyen |
| 9 | i18n | **Fichiers lang/ (FR, EN, WO)** + sélection langue user | P0 | 🟡 Moyen |
| 10 | i18n | **Fuseau horaire utilisateur** + localisation formats | P1 | 🟢 Faible |
| 11 | Rôles | **Éditeur de rôles custom par agence** | P1 | 🔴 Élevé |
| 12 | Admin | **Endpoint blocage/activation utilisateur** | P0 | 🟢 Faible |
| 13 | Auth | **Suppression de compte** + anonymisation RGPD | P2 | 🟡 Moyen |

### ⚠️ Partiellement implémentés — À compléter

| # | Domaine | Fonctionnalité | Prio | Ce qui manque |
|---|---------|----------------|------|---------------|
| 14 | Biens | Upload vidéos/plans/360° | P1 | Ajouter des collections media `videos`, `plans` |
| 15 | Biens | Endpoint **collaborateurs** | P1 | CRUD API pour `PropertyCollaborator` |
| 16 | Biens | Hiérarchie immeuble→lots (API) | P1 | Endpoints pour manipuler `parent_id`/children |
| 17 | Biens | Compteur de vues | P1 | Endpoint d'incrémentation `POST properties/{id}/view` |
| 18 | Recherche | Filtre par amenités/tags | P1 | Ajouter filtre `tags` dans la SearchService publique |
| 19 | Recherche | Recherche géospatiale (carte) | P1 | Endpoint bounding box ou radius sur lat/lng |
| 20 | Baux | Pénalités de retard (montant calculé) | P1 | Calculer un `penalty_amount` avec un taux configurable |
| 21 | Baux | Résiliation anticipée + pénalités | P2 | Calcul auto des pénalités dans `terminate` |
| 22 | Maintenance | Rapport structuré post-intervention | P1 | Champ `resolution_report` + media dédiée |
| 23 | Inventaire | Photos par pièce | P1 | Upload de medias liés aux rooms |
| 24 | Documents | Recherche plein-texte sur bibliothèque | P1 | Indexer les titres/descriptions dans Scout |
| 25 | Agence | Endpoint ajout/retrait d'agent | P0 | Route dédiée `POST agencies/{id}/agents` |
| 26 | CRM | Pipeline de prospects (API) | P2 | Endpoint de transition de stage |
| 27 | Rôles | Attribution/retrait de rôles via API | P1 | Endpoint admin `POST users/{id}/roles` |
| 28 | Notifs | Templates localisés | P1 | Externaliser les messages des services/jobs dans `lang/` |
| 29 | Visites | Rappels auto avant visite | P2 | Job `SendPropertyVisitReminders` |
| 30 | Factures | Relance auto factures en retard | P2 | Job `SendOverdueInvoiceReminders` |

---

## Recommandation de priorisation

### Sprint immédiat (quick wins P0)

1. **Endpoint `unpublish`** — 30 min
2. **Endpoint admin blocage/activation user** — 1h
3. **Mettre en place `lang/fr` + `lang/en`** avec extraction des messages hardcodés — 2-3h
4. **Endpoint ajout/retrait d'agent** sur agence — 1h
5. **Champ `locale` + `timezone` sur User** + middleware — 1h

### Sprint suivant (P1 stratégique)

6. **Collaborators API** (CRUD)
7. **Commission par défaut** sur Agency
8. **Contact principal** sur UserCustomerRelationship
9. **Calendrier agrégé** (bookings + visits)
10. **Emails transactionnels** via `Notification` classes Laravel

### Backlog V2 (P2)

11. Broadcasting/WebSocket
12. Exports CSV/PDF
13. Pénalités de retard avec montant
14. Remboursement caution
15. Suppression de compte RGPD
