# Recommandations — `docs/models-spec.md` (Passe 006)

> Changements proposés à la spécification des modèles.

---

## Recommandations actionnables

**Aucune.**

Les 23 recommandations (R1–R23) de la passe 001 ont toutes été appliquées à `docs/models-spec.md` entre les passes 005 et 006.

## Récapitulatif des recommandations pass-001 — toutes résolues

| Référence | Sujet | Type | Statut |
|-----------|-------|------|--------|
| R1 | `PropertyViewHistory` | Nouveau modèle | ✅ écarté — reformulation B2 (localStorage) retenue |
| R2 | `PropertyAvailability` (blocage créneaux manuels) | Nouveau modèle | ✅ écarté — feature §1.3 reformulée en vue calendrier agrégée |
| R3 | `Lease.renewed_from_lease_id` + relation | Extension | ✅ appliqué |
| R4 | `Review.reply_content / replied_by_id / replied_at` | Extension | ✅ appliqué |
| R5 | `DocumentShareLink` | Nouveau modèle #29 | ✅ appliqué |
| R6 | `Task` polymorphe + enums | Nouveau modèle #32 | ✅ appliqué |
| R7 | `Customer.pipeline_stage` + `CustomerPipelineStage` | Extension | ✅ appliqué |
| R8 | `LeaseAmendment` | Nouveau modèle | ✅ écarté — remplacé par `Lease.renewed_from_lease_id` |
| R9 | `MaintenanceQuote` | Nouveau modèle | ✅ écarté — `MaintenanceRequest.estimated_cost` + workflow documenté |
| R10 | `Review.reply_*` (doublon R4) | Extension | ✅ appliqué |
| R11 | `PropertyCollaborator.commission_share` | Extension | ✅ appliqué |
| R12 | `Review.reply_*` (doublon R4) | Extension | ✅ appliqué |
| R13 | `User.facebook_id / apple_id` | Extension | ✅ appliqué |
| R14 | `SocialAccount` | Nouveau modèle | ✅ écarté — option A (colonnes directes sur User) retenue |
| R15 | `Setting` | Nouveau modèle #30 | ✅ appliqué |
| R16 | `Integration` | Nouveau modèle #31 | ✅ appliqué |
| R17 | `CustomerNote` | Nouveau modèle #33 | ✅ appliqué |
| R18 | `NotificationChannel.whatsapp` | Extension enum | ✅ appliqué |
| R19 | `Inventory.signed_by_tenant_at / signed_by_owner_at` | Extension | ✅ appliqué |
| R20 | spatie/permission teams scope par agency | Clarification | ✅ appliqué |
| R21 | `AgentAvailability` | Nouveau modèle | ✅ reporté en EF8 (déclencheur : équipe > 10 agents) |
| R22 | Retrait de `ConversationType.support` | Nettoyage | ✅ appliqué |
| R23 | Documentation des évolutions futures EF1–EF9 | Clarification | ✅ appliqué (9 EF documentés) |

### Détail des nouveaux modèles ajoutés (M1, M8–M12)

1. **#29 DocumentShareLink** — Partage sécurisé par lien temporaire (§1.10 P1)
   - Colonnes : `document_id` (FK documents cascadeOnDelete), `token` (string unique), `created_by_id` (FK users), `expires_at`, `password_hash` (nullable), `max_downloads` (nullable), `downloads_count`, `revoked_at`, `last_accessed_at`.
   - Index : `token` (unique), `expires_at`.

2. **#30 Setting** — Paramètres globaux ou scopés par agence (§2.9 P2)
   - Colonnes : `key` (string), `value` (json), `scope` (`SettingScope` : global, agency), `scope_id` (nullable unsignedBigInt), `updated_by_id` (FK users nullOnDelete).
   - Unique : (`key`, `scope`, `scope_id`).

3. **#31 Integration** — Intégrations tierces API (§2.9 P2)
   - Colonnes : `provider` (string), `agency_id` (FK agencies cascadeOnDelete), `credentials` (encrypted json), `is_active`, `last_used_at`, `metadata` (json), softDeletes.
   - Unique : (`provider`, `agency_id`).

4. **#32 Task** — Tâches polymorphes CRM/général (§1.6 P2)
   - Colonnes : `title`, `description`, `taskable_id` / `taskable_type` (morph), `assigned_to_id` (FK users), `created_by_id` (FK users), `due_at`, `completed_at`, `status` (`TaskStatus`), `priority` (`TaskPriority`), softDeletes.
   - Index : (`assigned_to_id`, `due_at`), (`taskable_type`, `taskable_id`).

5. **#33 CustomerNote** — Notes horodatées sur un client (§1.6 P1)
   - Colonnes : `customer_id` (FK customers cascadeOnDelete), `author_id` (FK users nullOnDelete), `body` (text), `pinned` (boolean), softDeletes.
   - Index : (`customer_id`, `created_at`).

### Extensions sur modèles existants (M2, M3, M5, M7, M11, M13)

- **User** (M7) : `facebook_id`, `apple_id` nullable (option A retenue).
- **Customer** (M11) : `pipeline_stage` + enum `CustomerPipelineStage`.
- **PropertyCollaborator** (M5) : `commission_share` decimal(5,2).
- **Review** (M3) : `reply_content`, `replied_by_id`, `replied_at` + relation `repliedBy()`.
- **Lease** (M2) : `renewed_from_lease_id` + relations `renewedFrom()` / `renewals()`.
- **Inventory** (M13) : `signed_by_tenant_at`, `signed_by_owner_at`.

### Nouveaux enums (M10, M11, ajouts divers)

- `CustomerPipelineStage` : lead, prospect, qualified, negotiating, converted, lost.
- `TaskStatus` : open, in_progress, done, cancelled.
- `TaskPriority` : low, medium, high.
- `SettingScope` : global, agency.
- `NotificationChannel` : +`whatsapp`.
- `LeasePaymentType` : +`deposit_refund`.
- `ConversationType` : `direct, group, booking, lease, property` (retrait de `support`).

### Évolutions futures documentées (M15–M17)

- **EF7** — Multi-branches agence (`Agency.parent_agency_id`). Déclencheur : demande franchise ou sous-agences.
- **EF8** — Modèle `AgentAvailability`. Déclencheur : équipe > 10 agents nécessitant un planning partagé.
- **EF9** — Modèle `ExchangeRate`. Déclencheur : première transaction hors devise de base.

### Configuration packages (M4)

- **spatie/laravel-permission** configuré en mode `teams = true` avec `team_foreign_key = agency_id`. Les rôles et permissions personnalisés créés par un `agency_admin` sont automatiquement scopés à son agence.

### Index, contraintes et FK (M18)

- **Index recommandés** : +7 entrées (`document_share_links.token`, `document_share_links.expires_at`, `tasks(assigned_to_id, due_at)`, `tasks` morph, `customer_notes(customer_id, created_at)`, `settings(key, scope, scope_id)`, `integrations(provider, agency_id)`).
- **Contraintes d'unicité** : +3 entrées (`document_share_links.token`, `(key, scope, scope_id)`, `(provider, agency_id)`).
- **Comportements FK onDelete** : cascadeOnDelete (`document_share_links.document_id`, `customer_notes.customer_id`, `integrations.agency_id`), nullOnDelete (`leases.renewed_from_lease_id`, `tasks.assigned_to_id`, `customer_notes.author_id`, `settings.updated_by_id`).

---

## Nouvelles recommandations issues de la passe 006

**Aucune.** Aucune incohérence, aucun modèle orphelin, aucune feature non supportée.

## Critère de convergence

Les 3 critères sont remplis :

1. ✅ Aucun ❌ dans les deux sens.
2. ✅ Les 12 ⚠️ restants sont tous justifiés (applicatif pur ou EF différé).
3. ✅ La passe 006 ne produit aucune recommandation actionnable.

**Convergence atteinte.**
