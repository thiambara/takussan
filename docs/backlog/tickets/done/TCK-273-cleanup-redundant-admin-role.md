---
id: TCK-273
title: Suppression du rôle Spatie redondant `admin`
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-05-12
updated: 2026-05-12
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#spatielaravel-permission
tags: [back, front, security, rbac, tech-debt]
---

## Objectif utilisateur

_Pas d'effet utilisateur direct — nettoyage de dette RBAC._ Aligner le code
sur la spec : un seul rôle global (`super_admin`), plus de rôle `admin`
fantôme qui pollue les checks d'autorisation sans être jamais attribué.

## Contrat de données

**Modèle** : `User` via `spatie/laravel-permission` (cf. `spec_refs.models`).
Le rôle `admin` est créé par `database/seeders/System/RolesAndPermissionsSeeder.php`
avec strictement les mêmes permissions que `super_admin` (`Permission::pluck('name')->toArray()`).

**État actuel** :
- Le rôle existe en BDD (table `roles` Spatie).
- Il n'est listé ni dans `app/Models/Enums/UserRole.php`, ni dans
  `docs/models-spec.md:40`, ni dans `takussan-web/src/types/user.ts:1`.
- Aucun flux ne l'attribue (signup, invitation, agency upgrade, super-admin
  bootstrap, `UserRoleController::allowedRoles()` l'expose mais aucun appel
  programmatique ne le pose).
- ~184 occurrences dans `takussan-api/app/` (policies, controllers, services,
  commands, requests) + 2 occurrences frontend (`PropertyReviews.tsx:191`,
  `LeaseDetail.tsx:76`) le testent via `hasRole('admin')` / `hasAnyRole(['admin', …])`.
- Aucune branche `'admin'` n'est sémantiquement distincte de `'super_admin'` :
  ils sont systématiquement listés ensemble comme "globaux".

**Pattern de remplacement** (par catégorie de check) :

| Pattern actuel | Remplacement |
|---|---|
| `hasRole(['admin', 'super_admin'])` (et permutation) | `hasRole('super_admin')` ou `$user->isSuperAdmin()` |
| `hasRole('admin')` standalone (toujours après `isSuperAdmin() \|\|`) | supprimer le `\|\| hasRole('admin')` |
| `hasRole(['admin', 'agency_admin'])` (Policies, super_admin via `Gate::before`) | `hasRole('agency_admin')` |
| `hasRole(['admin', 'super_admin', 'agency_admin'])` (controllers) | `hasRole(['super_admin', 'agency_admin'])` |
| `hasRole(['agent', 'agency_admin', 'super_admin', 'admin'])` | `hasRole(['agent', 'agency_admin', 'super_admin'])` |
| Listes `allowedRoles()` etc. contenant `'admin'` | retirer l'entrée |
| Migration data | révoquer le rôle `admin` à tout user qui le porterait + supprimer la row `roles.name='admin'` |

**Note** : la spec `docs/features.md:348` a été alignée dans le même PR de
contexte (retrait de `admin` de la liste des rôles prédéfinis) avant ce ticket.

## Contraintes strictes (métier)

- **Aucune élévation/réduction de privilège pour un user existant.** Si un
  user porte le rôle `admin` en BDD (cas non observé en code mais possible
  via seed manuel), la migration data DOIT lui réassigner `super_admin`
  avant de révoquer `admin` — ces deux rôles étaient strictement
  équivalents.
- **Le bypass `Gate::before` de `super_admin`** (`AppServiceProvider.php:228`)
  reste l'unique mécanisme de short-circuit global pour les Policies. Tous
  les `hasRole(['admin', 'agency_admin'])` dans les Policies deviennent
  `hasRole('agency_admin')` car `super_admin` y est déjà couvert par
  `Gate::before`.
- **Aucun changement de surface d'API.** Les endpoints qui exposaient
  `admin` comme rôle assignable (`UserRoleController::allowedRoles()`)
  retournent désormais la liste sans `admin`. Tout appel client tentant
  d'assigner `admin` doit recevoir une 422 (validation Spatie).
- **`UserRole` enum** doit rester la source de vérité unique. Aucun code
  ne doit re-référencer la chaîne `'admin'` après ce ticket.
- **Tests** : tout test qui acting-as un user `admin` doit basculer sur
  `super_admin` (équivalence stricte de permissions — comportement attendu
  identique).
- **Migration idempotente et réversible** : `down()` recrée le rôle vide
  (sans permissions) — c'est volontairement non-symétrique : on ne peut
  pas reconstituer la liste des users qui portaient le rôle (information
  perdue par design — ces users sont déjà super_admin).

## Delta à produire

### Backend — code

- [ ] `database/seeders/System/RolesAndPermissionsSeeder.php` — retirer
      l'entrée `'admin' => Permission::pluck('name')->toArray()` du tableau
      `$roles`.
- [ ] `app/Http/Controllers/Api/UserRoleController.php::allowedRoles()` —
      retirer `'admin'`.
- [ ] **Replace_all dans `takussan-api/app/`** — appliquer le tableau
      "Pattern de remplacement" ci-dessus aux ~184 occurrences. Fichiers
      identifiés (non exhaustif, à vérifier exhaustivement avec
      `grep -rn "'admin'" takussan-api/app/`) :
  - Policies : `OwnerProfilePolicy`, `InvitationPolicy`, `AgentProfilePolicy`,
    `MediaPolicy`, `LeasePolicy`, `PropertyPolicy`,
    `Profiles/ServiceProviderProfilePolicy`.
  - Support : `AgencyKindGuard`.
  - Middlewares : `Http/Middleware/ResolveActiveProfile`.
  - Requests : `Http/Requests/UpdatePropertyRequest`.
  - Controllers : `AgencyStatsController`, `AuditLogController`,
    `CustomerNoteController`, `DashboardController`, `DashboardAgentController`,
    `ExportController`, `GuarantorController`, `InvitationController`,
    `KpiConfigController`, `PayoutController`, `PermissionController`,
    `PropertyAddressController`, `PropertyCollaboratorController`,
    `PropertyPriceHistoryController`, `ReviewController`, `RoleController`,
    `UserAdminController`, `UserRoleController`,
    `Agency/RegenerateWatermarksController`,
    `Agency/TenantOnboardingPendingController`,
    `Me/TenantOnboardingChecklistController`.
  - Services : `Admin/AgencyProvisioningService` (clé `'admin'` du payload
    de provisionnement — **conserver** : c'est un nom de variable, pas un rôle),
    `Crm/PipelineStatsService`, `Dashboard/DashboardRoleResolver`,
    `Export/ExportDataService`, `Inventory/InventorySignatureService`,
    `Model/BookingService`, `Model/InventoryService`,
    `Model/InvoiceService`, `Model/LeaseService`, `Model/PayoutService`,
    `Search/DocumentSearchService`, `Search/SearchService`.
  - Console : `Console/Commands/CheckThresholdAlertsCommand`.
  - Resources : aucun (`Resources/Api/Admin/AgencyProvisioningResource` ne
    contient que des clés de payload, à conserver).
- [ ] Migration data `database/migrations/YYYY_MM_DD_HHMMSS_remove_admin_role.php` :
  ```php
  // up():
  // 1. Pour chaque user portant 'admin' qui n'a pas 'super_admin' →
  //    lui assigner 'super_admin' (équivalence stricte de permissions).
  // 2. Détacher 'admin' de tous les users (table model_has_roles).
  // 3. Détacher 'admin' de toutes les permissions (table role_has_permissions).
  // 4. DELETE le rôle 'admin' de la table roles.
  // down():
  // 1. Recréer le rôle 'admin' (vide). La spec interdit la réassignation
  //    automatique aux users (info perdue par design).
  ```

### Backend — tests

- [ ] Update des tests qui actent comme `admin` pour acter comme `super_admin` :
      `tests/Feature/Api/UserAdminTest.php`, `RoleAccessTest.php`,
      `ReviewModerationWorkflowTest.php`, `AuditLogTest.php`,
      `ParticipantManagementTest.php`, `AgencyAgentTest.php`,
      `ReviewModerationQueueTest.php`, `ActivityLogEndpointTest.php`,
      `ReviewTest.php`, `AgencyMembersListTest.php`, `DocumentTest.php`,
      `SystemMessagesTest.php`, `ExportActivityLogPolicyTest.php`,
      `Authorization/SuperAdminTeamContextTest.php`,
      `Admin/AgencyOnboardingTest.php`, `Admin/AgencyOnboardingCurrencyTest.php`,
      et tout autre fichier identifié par
      `grep -rln "'admin'" takussan-api/tests/`.
- [ ] Nouveau test `tests/Feature/Migrations/RemoveAdminRoleMigrationTest.php` :
  - [ ] Avant migration : seed un user avec rôle `admin` (sans super_admin)
        → après migration : il porte `super_admin` ; le rôle `admin` n'existe
        plus dans la table roles ; aucune ligne `model_has_roles` ne référence
        l'ancien role_id.
  - [ ] Avant migration : seed un user avec `admin` + `super_admin` → après :
        il porte uniquement `super_admin` (pas de doublon).
  - [ ] Idempotence : ré-exécuter la migration sur une BDD déjà migrée ne
        casse pas.

### Frontend

- [ ] `takussan-web/src/app/(public)/properties/[slug]/components/PropertyReviews.tsx:191` —
      supprimer `|| userRoles.includes('admin')`.
- [ ] `takussan-web/src/app/(public)/properties/[slug]/components/__tests__/canReplyToReview.test.ts:69` —
      mettre à jour le cas de test `userRoles: ['admin']` → `['super_admin']`.
- [ ] `takussan-web/src/components/leases/LeaseDetail.tsx:76` — retirer
      `'admin'` de la liste `['super_admin', 'admin', 'agency_admin', 'agent', 'owner']`.
- [ ] Vérifier qu'aucun mock ou fixture (`__tests__/`, `factories/`, MSW
      handlers) ne pose `'admin'` dans `user.roles` ; remplacer par
      `'super_admin'` si trouvé.

### Specs & doc

- [ ] `docs/features.md:348` — **déjà aligné** dans le PR de contexte de
      ce ticket (retrait de `admin` de la liste des rôles prédéfinis).
      Vérifier la cohérence avant merge.
- [ ] `docs/models-spec.md:40` — pas de changement (la ligne ne mentionnait
      déjà pas `admin`).

## Critères d'acceptation

- [ ] AC1 — `grep -rn "'admin'" takussan-api/app/ takussan-web/src/`
      ne retourne plus aucune occurrence où `'admin'` désigne un rôle
      Spatie (les occurrences résiduelles concernent uniquement :
      `ParticipantRole::Admin` pour les conversations, les clés de payload
      `'admin'` du `AgencyProvisioningService`, les chemins URL `/admin/...`,
      et les noms de classes/dossiers `Admin\…`).
- [ ] AC2 — `Role::where('name', 'admin')->exists()` retourne `false`
      après migration (sur fresh seed et sur DB migrée existante).
- [ ] AC3 — Tout user qui portait le rôle `admin` avant migration porte
      désormais `super_admin` (préservation stricte de privilège — vérifié
      par le test de migration).
- [ ] AC4 — Tenter d'assigner le rôle `'admin'` via
      `POST /api/users/{id}/roles` renvoie 422 (la valeur n'est plus dans
      `allowedRoles()`).
- [ ] AC5 — Toute la suite de tests backend passe : `php artisan test`
      vert, `./vendor/bin/pint` clean.
- [ ] AC6 — `npm run lint` + `npm run build` du frontend passent ; aucun
      check résiduel sur `userRoles.includes('admin')`.
- [ ] AC7 — Un test de non-régression vérifie que les anciens flux
      ouverts à `admin + super_admin` (ex. `GET /api/guarantors`,
      `GET /api/audit-log`, `POST /api/admin/roles`) restent ouverts à
      `super_admin` seul et fermés à `agency_admin` (et inversement pour
      les flux ouverts à `admin + agency_admin`).
- [ ] AC8 — La migration est idempotente : `php artisan migrate` puis
      `php artisan migrate` à nouveau ne génère ni erreur ni état
      incohérent.

## Hors périmètre

- **Refonte de la matrice de permissions** (rebalancing global, ajout/retrait
  de permissions par rôle) — orthogonal. Ce ticket préserve strictement
  l'équivalence `admin ≡ super_admin` qui existait.
- **Renommage de `super_admin`** (ex. en `platform_admin` ou `root`) —
  hors scope.
- **Création d'un nouveau rôle "global intermédiaire"** entre `super_admin`
  et `agency_admin` — si un besoin métier émerge plus tard (techlead
  plateforme, support N2), il fera l'objet d'un ticket dédié avec sa propre
  spec produit.
- **Audit / migration d'autres incohérences spec-vs-code RBAC** (ex.
  `tenant` absent de l'enum `UserRole` mais présent au seeder) — sortira
  d'un ticket TCK séparé si confirmé comme problème.
- **Modification de `ParticipantRole`** (l'enum des participants de
  conversation où `Admin = 'admin'` existe) — c'est un namespace distinct,
  intact.
- **Suppression des dossiers `Http/Controllers/Api/Admin/…` et des routes
  `/api/admin/…`** — ces chemins sont des conventions URL/namespace, pas
  des références au rôle Spatie.

## Notes d'implémentation

- **Spec préalable** : `docs/features.md:348` mentionnait `admin` comme rôle
  global existant — retiré dans le même flux avant l'implémentation pour
  débloquer la suppression côté code (sinon contradiction spec-fidelity).
- **Pattern de bulk replace** appliqué via Python (`/tmp/replace_admin_role.py`)
  sur 77 fichiers prod backend (166 lignes) + un script séparé sur 12
  fichiers tests. Quatre cas hors-pattern traités à la main :
  `AgencyController.php:82, 268`, `DashboardAgencyController.php:42`,
  `DashboardRoleResolver.php:40`.
- **Faux positifs préservés** (chaînes `'admin'` qui ne désignent PAS le
  rôle Spatie) : `ParticipantRole::Admin` (rôle conversation, namespace
  distinct), payload keys de `AgencyProvisioningService` /
  `AgencyProvisioningResource` / `StoreAgencyOnboardingRequest`,
  personas seeder (`UserSeeder`, `DemoUsersSeeder`,
  `AgencyUpgradeRequestSeeder`), Filament panel id/path, URL paths
  `/api/admin/...`, namespaces `Api\Admin\...`. Le frontend conserve
  `ParticipantRole` (`'member' | 'admin'`) pour les participants de
  conversation.
- **Bug controller révélé par TCK-273** :
  `AgencyMemberRoleController::update` faisait un `$locked->hasRole('agency_admin')`
  sans pinner le team context — la check passait inaperçue tant que
  l'actor était `admin` (au team=agency) mais retournait silencieusement
  false pour un `super_admin` actor (team=null), permettant la
  démotion du dernier `agency_admin`. Fixé en plaçant
  `setPermissionsTeamId($agency->id)` au tout début du `DB::transaction`.
- **Test de migration** : le rôle `super_admin` doit déjà exister avant
  de promouvoir les orphan admins ; ajouté un seed défensif dans
  `seedLegacyAdminRole()`.
- **Test stale supprimé** : `test_admin_role_cannot_export` (validait
  une interdiction qui n'a plus de sens — le rôle `admin` n'existe plus)
  remplacé par `test_customer_cannot_export` pour conserver une
  assertion utile sur la policy.
- **Suite tests** : `php artisan test` → 2022 passed, 0 failed
  (6273 assertions). Pint clean. Frontend `canReplyToReview` 9/9 passed.
