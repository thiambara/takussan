# Recommandations — `docs/models-spec.md` (Passe 001)

> Changements proposés à la spécification des modèles pour couvrir les features P0/P1/P2 actuellement ❌ ou ⚠️. Chaque entrée cite la feature cible et décrit le modèle / colonne / enum à ajouter — sans SQL.

---

## R1. Modèle `PropertyViewHistory` 🆕

- **Feature cible :** `features.md §1.2 P2` — « Historique des biens consultés ».
- **But :** tracer les consultations côté serveur pour un utilisateur connecté (multi-appareils).
- **Colonnes :** `id`, `user_id` FK users, `property_id` FK properties, `viewed_at` datetime, `source` string (homepage, search, map, direct…), `created_at`.
- **Relations :** `user` belongsTo User, `property` belongsTo Property.
- **Index :** `(user_id, viewed_at DESC)`, `property_id`.
- **onDelete :** `cascadeOnDelete()` (user et property).
- **Note :** append-only, pas de `updated_at`.

## R2. Modèle `PropertyAvailability` 🆕 (ou reprise via `Booking`)

- **Feature cible :** `features.md §1.3 P1` — « Calendrier de disponibilité par bien ».
- **But :** permettre le blocage manuel de créneaux (maintenance, visite privée, indisponibilité ponctuelle) en plus des `Booking` confirmés.
- **Colonnes :** `id`, `property_id`, `start_at`, `end_at`, `reason` enum (`booked`, `blocked_manual`, `maintenance`, `visit_block`), `notes`, `created_by_id`, timestamps.
- **Index :** `(property_id, start_at, end_at)`.
- **Alternative :** générer la disponibilité dynamiquement via `Booking` + `PropertyVisit` + indisponibilité journalière. Si cette option est retenue, le statut de la feature passe à ✅ et R2 devient inutile.
- **Recommandation :** trancher lors de la passe 002.

## R3. Extension `Property` — modération avant publication

- **Feature cible :** `features.md §1.1 P2` — « Modération et validation avant publication ».
- **Colonnes à ajouter :**
  - `moderation_status` enum (`pending`, `approved`, `rejected`) — distinct de `status`/`visibility`.
  - `moderated_by_id` FK users (nullOnDelete).
  - `moderated_at` datetime.
  - `moderation_notes` text.
- **Nouvel enum :** `PropertyModerationStatus`.
- **Justification :** `PropertyStatus.pending` est trop ambigu (il sert déjà pour « bien en cours de mise en ligne »).

## R4. Extension `PropertyCollaborator` — part de commission

- **Feature cible :** `features.md §1.1 P1` — « Ajouter des collaborateurs au bien (% de commission) ».
- **Colonnes à ajouter :**
  - `commission_share` decimal(5,2) nullable — pourcentage alloué à ce collaborateur.
- **Contrainte applicative :** somme des `commission_share` d'un même property ≤ 100.

## R5. Modèle `DocumentShareLink` 🆕

- **Feature cible :** `features.md §1.10 P1` — « Partage sécurisé par lien temporaire ».
- **Colonnes :** `id`, `document_id` FK, `token` string unique, `expires_at` datetime nullable, `password_hash` string nullable, `max_downloads` integer nullable, `downloads_count` integer default 0, `created_by_id` FK users, `revoked_at` nullable, timestamps.
- **Index :** `token` unique, `(document_id, expires_at)`.
- **onDelete :** `cascadeOnDelete()` sur `document_id`, `nullOnDelete()` sur `created_by_id`.

## R6. Modèle `Task` 🆕 (CRM + rappels)

- **Feature cible :** `features.md §1.6 P2` — « Tâches et rappels attachés à un client » (et transverse pour Lease / Property).
- **Colonnes :**
  - `id`, `title`, `description` text nullable.
  - `taskable_id` / `taskable_type` — morphTo (Customer, Lease, Property, MaintenanceRequest…).
  - `assigned_to_id` FK users, `created_by_id` FK users.
  - `due_at` datetime nullable, `completed_at` datetime nullable.
  - `priority` enum (`low`, `medium`, `high`).
  - `status` enum (`open`, `in_progress`, `done`, `cancelled`).
  - timestamps + `deleted_at`.
- **Nouveaux enums :** `TaskStatus`, `TaskPriority`.
- **Index :** `(assigned_to_id, due_at)`, `(taskable_type, taskable_id)`.

## R7. Extension `Customer` — pipeline CRM

- **Feature cible :** `features.md §1.6 P2` — « Pipeline de prospects ».
- **Option A (légère) :** ajouter la colonne `pipeline_stage` enum (`lead`, `prospect`, `qualified`, `negotiating`, `converted`, `lost`) — distinct de `status` (qui reste administratif : active/inactive/blocked/deleted).
- **Option B (riche) :** créer un modèle `CustomerPipelineHistory` append-only qui trace les transitions.
- **Recommandation :** option A en priorité, option B en P3.
- **Nouvel enum :** `CustomerPipelineStage`.

## R8. Modèle `CustomerNote` 🆕

- **Feature cible :** `features.md §1.6 P1` — « Notes libres sur un client » (reformulée en B6).
- **Colonnes :** `id`, `customer_id`, `author_id` FK users, `body` text, `pinned` boolean, timestamps + `deleted_at`.
- **Index :** `(customer_id, created_at DESC)`.
- **Alternative :** utiliser `spatie/laravel-activitylog` avec un event `note.added` — moins structuré mais évite un modèle supplémentaire. À trancher.

## R9. Modèle `MaintenanceQuote` 🆕 (optionnel)

- **Feature cible :** `features.md §1.8 P2` — « Demande de devis et validation avant travaux ».
- **Colonnes :** `id`, `maintenance_request_id`, `provider_id` FK users, `amount` decimal, `currency`, `description` text, `status` enum (`pending`, `approved`, `rejected`), `approved_by_id`, `approved_at`, timestamps.
- **Alternative :** se contenter de `MaintenanceRequest.estimated_cost` + workflow basé sur `MaintenanceStatus`. Dans ce cas, clarifier la reformulation B7.

## R10. Extension `Lease` — renouvellement / avenant

- **Feature cible :** `features.md §1.4 P2` — « Renouvellement ou avenant au bail ».
- **Colonnes à ajouter :**
  - `renewed_from_lease_id` FK leases nullable (`nullOnDelete`).
- **Recommandation alternative :** créer un modèle `LeaseAmendment` (id, lease_id, type enum, diff json, applied_at, created_by_id) pour tracer chaque avenant — plus coûteux mais plus propre.

## R11. Modèle `RentReview` 🆕 (ou observer sur `Lease.monthly_rent`)

- **Feature cible :** `features.md §1.4 P2` — « Révision annuelle du loyer (indice) ».
- **Option A (journal) :** modèle `RentReview` append-only avec `lease_id`, `old_rent`, `new_rent`, `reason` enum (`annual_index`, `mutual_agreement`, `correction`), `effective_at`, `created_by_id`.
- **Option B (observer) :** journaliser via `spatie/activitylog` en taguant explicitement.
- **Recommandation :** option A, cohérente avec `PropertyPriceHistory`.

## R12. Extension `Review` — réponse publique

- **Feature cible :** `features.md §1.11 P2` — « Répondre publiquement à un avis ».
- **Colonnes à ajouter :**
  - `reply_content` text nullable.
  - `replied_by_id` FK users nullable.
  - `replied_at` datetime nullable.
- **Alternative :** créer un modèle `ReviewReply` dédié — pertinent si plusieurs réponses doivent être possibles. Sinon 3 colonnes suffisent.

## R13. Extension `Agency` — multi-branches

- **Feature cible :** `features.md §1.12 P2` — « Gestion multi-branches / sous-agences ».
- **Colonnes à ajouter :**
  - `parent_agency_id` FK agencies nullable (`nullOnDelete`).
- **Relations :** `parent()`, `branches()` hasMany.
- **Index :** `parent_agency_id`.

## R14. Modèle `AgentAvailability` 🆕

- **Feature cible :** `features.md §1.12 P2` — « Gestion des congés / disponibilité des agents ».
- **Colonnes :** `id`, `user_id` FK users, `start_at`, `end_at`, `type` enum (`leave`, `off`, `busy`), `notes`, timestamps.
- **Index :** `(user_id, start_at, end_at)`.

## R15. Modèle `Setting` 🆕

- **Feature cible :** `features.md §2.9 P2` — « Paramètres globaux de plateforme ».
- **Colonnes :** `id`, `key` string unique, `value` json, `scope` enum (`global`, `agency`), `scope_id` bigint nullable (polymorphe ou FK agencies selon choix), `updated_by_id`, timestamps.
- **Note :** structure flexible, clé dictionnaire-based.

## R16. Modèle `Integration` 🆕

- **Feature cible :** `features.md §2.9 P2` — « Gestion des intégrations tierces (API keys) ».
- **Colonnes :** `id`, `provider` string (wave, orange_money, stripe, mls…), `agency_id` FK nullable, `credentials` text (encrypted), `is_active` boolean, `last_used_at` nullable, `metadata` json, timestamps + `deleted_at`.
- **Contrainte :** `(provider, agency_id)` unique.

## R17. Modèle `ExchangeRate` 🆕 (P2)

- **Feature cible :** `features.md §2.8 P2` — « Multi-devises (XOF, EUR, USD) avec taux de change ».
- **Colonnes :** `id`, `base_currency` Currency enum, `target_currency` Currency enum, `rate` decimal(12,6), `valid_from` date, `valid_to` date nullable, `source` string, timestamps.
- **Index :** `(base_currency, target_currency, valid_from)`.

## R18. Enum `NotificationChannel` — ajout `whatsapp`

- **Feature cible :** `features.md §2.3 P3` — « Notifications WhatsApp ».
- **Changement :** ajouter `whatsapp` à l'enum `NotificationChannel` (actuellement : `app`, `email`, `sms`, `push`).
- **Impact :** aligné avec la préparation P3, non bloquant.

## R19. Extension `User` — OAuth multi-fournisseurs

- **Feature cible :** `features.md §2.1 P2` — « OAuth Facebook / Apple ».
- **Options :**
  - **A :** ajouter `facebook_id`, `apple_id` nullable sur `User`.
  - **B :** introduire un modèle `SocialAccount` (id, user_id, provider enum, provider_user_id string, access_token, refresh_token, created_at).
- **Recommandation :** option B pour éviter l'inflation de colonnes et supporter la déconnexion de fournisseurs indépendamment.

## R20. Scout sur `Message` et `Document`

- **Feature cible :** `features.md §2.4 P2` — « Recherche full-text sur messages et documents » et `§1.10 P1` — « Recherche dans la bibliothèque de documents ».
- **Changement :** ajouter le trait `Searchable` à `Message` et `Document`, documenter l'index dans `models-spec.md`.
- **Note :** impact sur les performances d'indexation — à planifier.

## R21. Modèle `NotificationTemplate` 🆕 (P1)

- **Feature cible :** `features.md §2.3 P1` — « Templates multilingues ».
- **Colonnes :** `id`, `key` string unique, `locale` string(5), `subject` string, `body` text, `channel` NotificationChannel, `is_active` boolean, timestamps.
- **Index :** `(key, locale, channel)` unique composé.
- **Alternative :** fichiers de traduction Laravel + blade. Si cette option est retenue, R21 peut être annulée.

## R22. Scope multi-agence des rôles (clarification)

- **Feature cible :** `features.md §2.2 P1` — « Éditeur de rôles personnalisés par agence ».
- **Changement :** documenter explicitement dans `models-spec.md` si `spatie/laravel-permission` est configuré en mode `teams = true` avec `team_foreign_key = agency_id`, ou si une couche applicative (policy scoping) assure le filtrage.
- **Impact :** pas de migration, juste une clarification architecturale.

## R23. Index complémentaires à considérer

- `property_view_histories (user_id, viewed_at DESC)` — si R1 retenu.
- `tasks (assigned_to_id, due_at)` — si R6 retenu.
- `document_share_links (token)` unique — si R5 retenu.
- `agencies (parent_agency_id)` — si R13 retenu.

---

## Synthèse

- **Nouveaux modèles proposés :** 10 (R1, R2, R5, R6, R8, R9, R11, R14, R15, R16, R17, R21 — plusieurs optionnels ou « option A/B »).
- **Extensions de modèles existants :** 7 (R3 Property, R4 PropertyCollaborator, R7 Customer, R10 Lease, R12 Review, R13 Agency, R19 User).
- **Extensions d'enums :** 1 (R18 NotificationChannel).
- **Changements de configuration / traits :** 2 (R20 Scout, R22 spatie scope).

Une fois les arbitrages effectués sur chaque option (A/B), `models-spec.md` pourra être révisé puis une passe 002 lancée pour vérifier la convergence.
