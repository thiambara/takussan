# TCK-108 — Délégation temporaire de permissions (plan d'implémentation)

> Ce plan sera également enregistré dans `docs/plans/2026-04-27-tck-108-permission-delegation.md` à l'implémentation (cohérent avec les patterns TCK-105/106/107).

## Contexte

Aujourd'hui, l'attribution d'un rôle à un agent (TCK-014) est **statique** : un admin d'agence promeut un membre, et le rôle reste jusqu'à modification manuelle. Quand un `agency_admin` part en vacances ou en mission, l'agence doit soit déléguer manuellement (et oublier de révoquer au retour), soit refuser de couvrir l'absence. TCK-108 ajoute un mécanisme **borné dans le temps** : un admin crée une délégation `(user, role, starts_at, ends_at)`, le rôle s'active automatiquement à `starts_at`, expire à `ends_at`, et toute la mécanique d'audit + notifications suit.

**Choix de scope confirmés via exploration** :

- **Spatie teams déjà activé** (`config/permission.php:138`, `team_foreign_key = 'agency_id'`). Toute la machinerie d'agency-scoping est native — on s'aligne dessus, pas besoin de réinventer le scope. Les `assignRole(role, $agency)` / `removeRole(role, $agency)` Spatie sont nos primitives.
- **Mapping vocabulaire ticket → réalité projet** :
  - `agency_manager` (ticket) → **rôle `agency_admin`** (existant en seeder).
  - `agency_owner` (ticket) → **colonne `agencies.primary_admin_id`** (pas un rôle Spatie). Donc le concept "non délégable agency_owner" se traduit en : on ne peut pas changer/déléguer un primary_admin via ce mécanisme.
  - Rôles non délégables = **`super_admin`, `admin`** (les 2 rôles transverses, hors agence). Cf. `database/seeders/System/RolesAndPermissionsSeeder.php`.
  - Délégables par défaut = **`agency_admin`, `agent`, `owner`** (rôles agency-scoped). Pas `tenant`/`customer`/`service_provider` (ce sont des contre-parties externes, pas des collaborateurs). Liste configurable en `config/role_delegations.php`.
- **Stratégie de résolution des rôles effectifs** : on ne touche **pas** `model_has_roles` à l'activation/expiration de manière naïve. À la place, on **utilise Spatie `assignRole`/`removeRole` avec le team `$agency`** (sémantique team-scoped native) — mais via un **syncer ref-counted** : à chaque transition d'état, le service recalcule l'union (rôles natifs au moment de la création de la délégation + somme des délégations actives) et appelle `syncRoles` sur le team agence. Snapshot des rôles natifs stocké dans la ligne `role_delegations` au moment du `store` (colonne `user_native_roles_snapshot` JSON). Cela résout :
  - les délégations multiples du même rôle au même user (cumul OK, expiration partielle ne supprime pas le rôle si une autre délégation est encore active),
  - le cas où l'utilisateur **gagne** entre-temps le rôle nativement (le snapshot fige l'état de référence),
  - l'idempotence du job (recalcul = même résultat à chaque appel).
- **Cache Spatie permissions** invalidé per-user via `app(PermissionRegistrar::class)->forgetCachedPermissions()` après chaque sync. Cohérent avec `AgencyMemberRoleController` (pattern existant).
- **AppNotification (TCK-049)** : on **étend** l'enum `NotificationType` avec 3 nouveaux cas (`role_delegated`, `role_delegation_expired`, `role_delegation_revoked`). On passe par `NotificationService::notify()` (constructeur injecté) — pas de création directe d'`AppNotification`.
- **Activity log (transverse)** : `RoleDelegation` utilise le trait `App\Models\Bases\Auditable` (logs auto sur fillable dirty) + appels manuels `activity()->causedBy($user)->performedOn($delegation)->log(...)` pour les events `activated`, `expired`, `revoked` (pas couverts par le trait).
- **Frontend** : la page `/admin/team` (TCK-065) existe — on **étend** ce répertoire avec un sous-écran `/admin/team/delegations` plutôt que de créer un nouveau silo. Pattern `<Tabs>` cohérent avec le reste de l'admin.
- **Date library frontend** : aucune dépendance externe (`/src/lib/calendar-date.ts` pur JS, fuseau `Africa/Dakar`). On construit le date-range picker sur shadcn `Popover` + `Calendar` (déjà utilisés pour les filtres bookings).

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js 16, App Router)                                 │
│                                                                    │
│  app/(dashboard)/admin/team/page.tsx                               │
│   └─ <Tabs>                                                        │
│       ├─ "Membres"      → <TeamManagement />     (existant TCK-065)│
│       └─ "Délégations"  → <DelegationManagement /> (NEW)           │
│                            ├─ <DelegationList /> (table + filtres) │
│                            ├─ <CreateDelegationDialog />           │
│                            │   ├─ user picker (autocomplete agence)│
│                            │   ├─ role select (delegable list)     │
│                            │   ├─ date range picker                │
│                            │   ├─ motif textarea (optionnel)       │
│                            │   └─ résumé + warnings (conflits)     │
│                            └─ <RevokeDelegationDialog />           │
└──────────────┬─────────────────────────────────────────────────────┘
               │
   GET    /api/agencies/{agency}/role-delegations
   POST   /api/agencies/{agency}/role-delegations
   DELETE /api/agencies/{agency}/role-delegations/{id}
               │
┌──────────────▼─────────────────────────────────────────────────────┐
│  BACKEND (Laravel 13)                                              │
│                                                                    │
│  routes/api.php → group prefix=agencies/{agency}/role-delegations  │
│   └─ RoleDelegationController (resource: index, store, destroy)    │
│       │                                                            │
│       ├─ StoreRoleDelegationRequest (validation métier)            │
│       └─ RoleDelegationPolicy (admin agence uniquement)            │
│             │                                                      │
│             ▼                                                      │
│  RoleDelegationService                                             │
│   ├─ create($agency, $delegator, $data)                            │
│   │    1. snapshot user_native_roles                               │
│   │    2. status = scheduled OU active (selon starts_at)           │
│   │    3. si active → call sync                                    │
│   │    4. activity log + dispatch event                            │
│   ├─ revoke($delegation, $caller)                                  │
│   │    → status=revoked, sync, log, event                          │
│   ├─ activate($delegation)  [appelé par job]                       │
│   ├─ expire($delegation)    [appelé par job]                       │
│   └─ sync($user, $agency)   ── SOURCE OF TRUTH role resolver       │
│        ├─ unionNatives + activeDelegationsRoles                    │
│        ├─ syncRoles(union, $agency)  (Spatie team-scoped)          │
│        └─ forgetCachedPermissions($user)                           │
│                                                                    │
│  Schedule::job(ProcessRoleDelegationsJob)->everyFiveMinutes()      │
│   └─ scan scheduled→active  +  active→expired                      │
│        per ligne → service.activate() / service.expire()           │
│                                                                    │
│  Events / Listeners (queued):                                      │
│   RoleDelegationActivated → NotifyDelegationActivated              │
│   RoleDelegationExpired   → NotifyDelegationExpired                │
│   RoleDelegationRevoked   → NotifyDelegationRevoked                │
│        → NotificationService::notify(beneficiary + delegator)      │
└────────────────────────────────────────────────────────────────────┘
```

---

## Fichiers critiques (existants à modifier ou référencer)

| Fichier | Rôle dans le plan |
|---|---|
| `takussan-api/config/permission.php` | **Lecture seule** — confirme `teams=true`, `team_foreign_key=agency_id`, `cache.expiration_time=24h`. Stratégie cohérente. |
| `takussan-api/database/seeders/System/RolesAndPermissionsSeeder.php` | Référence des rôles existants (8 rôles). Aucune modification. |
| `takussan-api/app/Models/User.php` | **Pas de modif** : `HasRoles` standard, agency_id direct. Le syncer manipule les roles via Spatie API. |
| `takussan-api/app/Models/Agency.php:74-87` | Référence `members()` + `primary_admin_id`. La policy lit ça. |
| `takussan-api/app/Http/Controllers/Api/AgencyMemberRoleController.php` | **Référence** du pattern `PermissionRegistrar::setPermissionsTeamId($agency->id)` + transactional sync. À reproduire dans `RoleDelegationService::sync()`. |
| `takussan-api/app/Http/Controllers/Api/AgencyController.php` | Pattern resource + buildQuery + JSON helper. À reproduire dans `RoleDelegationController`. |
| `takussan-api/app/Models/Bases/Auditable.php` | Trait à appliquer sur `RoleDelegation` (auto-log fillable dirty). |
| `takussan-api/app/Models/AppNotification.php` + `app/Models/Enums/NotificationType.php` | **Étendu** : 3 nouvelles valeurs d'enum (`role_delegated`, `role_delegation_expired`, `role_delegation_revoked`). |
| `takussan-api/app/Services/Model/NotificationService.php:notify()` | **Réutilisé tel quel** par les listeners. Pas de modif. |
| `takussan-api/app/Policies/BasePolicy.php` | Référence du pattern `super_admin` bypass via `Gate::before` (déjà câblé en `AppServiceProvider`). |
| `takussan-api/routes/console.php` | **Étendu** : ajout `Schedule::job(new ProcessRoleDelegationsJob)->everyFiveMinutes()->withoutOverlapping();`. |
| `takussan-api/routes/api.php` | **Étendu** : group `prefix=agencies/{agency}/role-delegations` middleware `auth:sanctum`. |
| `takussan-api/app/Providers/AppServiceProvider.php` | **Étendu** : `Event::listen(...)` pour les 3 listeners délégation. |
| `takussan-api/lang/{fr,en,wo}/notifications.php` | **Étendu** : titres/corps des 3 nouveaux types. |
| `takussan-web/src/app/(dashboard)/admin/team/page.tsx` | **Étendu** : conversion en page à onglets `<Tabs>` Membres / Délégations. |
| `takussan-web/src/components/admin/TeamManagement.tsx` | **Pas de modif** — encapsulé dans le tab "Membres". |
| `takussan-web/src/lib/queries/agency-members.ts` | **Référence** du pattern `fetchAgencyMembers` paginé ; on duplique pour `fetchRoleDelegations`. |
| `takussan-web/src/hooks/useApiForm.ts` + `src/components/forms/*` | Réutilisés tels quels pour le formulaire création. |
| `takussan-web/src/components/ui/dialog.tsx` + `popover.tsx` | Réutilisés pour modal création + date-range picker. |
| `takussan-web/src/lib/calendar-date.ts` | Réutilisé pour parse/format ISO + add days. |
| `takussan-web/src/messages/{fr,en,wo}.json` | **Étendu** : namespace `admin.delegations.*`. |
| `docs/backlog/INDEX.md` | TCK-108 `todo → review` à l'ouverture de la PR ; **target = `dev`** (mémoire utilisateur). |

---

## Nouveaux fichiers à créer

### Backend — migration & enum

- `takussan-api/database/migrations/2026_04_28_000000_create_role_delegations_table.php`
  ```php
  Schema::create('role_delegations', function (Blueprint $table) {
      $table->id();
      $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();         // beneficiary
      $table->foreignId('delegator_id')->constrained('users')->restrictOnDelete();    // admin author
      $table->foreignId('agency_id')->constrained('agencies')->cascadeOnDelete();
      $table->string('role');                                                         // Spatie role name
      $table->dateTime('starts_at')->nullable();                                      // null = immediate
      $table->dateTime('ends_at');
      $table->string('status')->default('scheduled');                                 // RoleDelegationStatus
      $table->text('reason')->nullable();
      $table->json('user_native_roles_snapshot');                                     // ["agent"] e.g.
      $table->dateTime('activated_at')->nullable();
      $table->dateTime('expired_at')->nullable();
      $table->dateTime('revoked_at')->nullable();
      $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
      $table->timestamps();
      $table->index(['user_id', 'status']);
      $table->index(['agency_id', 'status']);
      $table->index('ends_at');
      $table->index(['status', 'starts_at']);
  });
  ```

- `takussan-api/app/Models/Enums/RoleDelegationStatus.php`
  ```php
  enum RoleDelegationStatus: string {
      case Scheduled = 'scheduled';
      case Active = 'active';
      case Revoked = 'revoked';
      case Expired = 'expired';
  }
  ```

- `takussan-api/config/role_delegations.php` (nouveau fichier de config)
  ```php
  return [
      'delegable_roles' => ['agency_admin', 'agent', 'owner'],
      'non_delegable_roles' => ['super_admin', 'admin'],
      'max_duration_days' => 366,
      'scheduler_interval_minutes' => 5,
  ];
  ```

### Backend — modèle

- `takussan-api/app/Models/RoleDelegation.php`
  - Étend `AbstractModel` (cohérent avec les autres modèles du repo).
  - Trait `Auditable` (auto-log dirty fillable).
  - Casts : `status => RoleDelegationStatus::class`, `starts_at|ends_at|activated_at|expired_at|revoked_at => datetime`, `user_native_roles_snapshot => array`.
  - Fillable : `user_id, delegator_id, agency_id, role, starts_at, ends_at, status, reason, user_native_roles_snapshot, activated_at, expired_at, revoked_at, revoked_by`.
  - Relations : `user()`, `delegator()`, `agency()`, `revokedBy()`.
  - Scopes :
    - `scopeActive($q)` — `status=Active` AND `(starts_at IS NULL OR starts_at<=now)` AND `ends_at>=now`
    - `scopeScheduled($q)` — `status=Scheduled`
    - `scopeReadyToActivate($q)` — `status=Scheduled AND (starts_at IS NULL OR starts_at<=now)`
    - `scopeReadyToExpire($q)` — `status=Active AND ends_at<=now`
  - Méthode `markActive()` : assigne `status=Active, activated_at=now`.
  - Méthode `markExpired()` : assigne `status=Expired, expired_at=now`.
  - Méthode `markRevoked(User $by)` : assigne `status=Revoked, revoked_at=now, revoked_by=$by->id`.

### Backend — service

- `takussan-api/app/Services/Permissions/RoleDelegationService.php`
  ```php
  class RoleDelegationService {
      public function __construct(
          private readonly PermissionRegistrar $registrar,
      ) {}

      public function create(Agency $agency, User $delegator, array $data): RoleDelegation { ... }
      public function revoke(RoleDelegation $delegation, User $caller): void { ... }
      public function activate(RoleDelegation $delegation): void { ... }       // job
      public function expire(RoleDelegation $delegation): void { ... }         // job
      public function sync(User $user, Agency $agency): void { ... }           // canonical
  }
  ```
  - **`create`** :
    1. Validation métier non couverte par FormRequest (ex. unicité, conflits) → throw `ValidationException` avec messages clairs (voir AC).
    2. Snapshot rôles natifs : `$nativeRoles = $user->roles()->wherePivot('agency_id', $agency->id)->pluck('name')->all();`
    3. Détermine status initial : `Scheduled` si `starts_at && starts_at > now`, sinon `Active`.
    4. Insert ligne ; si Active → `$this->sync($user, $agency)`.
    5. `event(new RoleDelegationCreated($delegation))` (transition `scheduled→active` aussi déclenche `RoleDelegationActivated`).
    6. `activity()->causedBy($delegator)->performedOn($delegation)->withProperties(['role' => $role])->log('role_delegation.created');`
  - **`revoke`** : `$delegation->markRevoked($caller); $this->sync($user, $agency); activity()->log; event(new RoleDelegationRevoked($delegation));`
  - **`activate`** (idempotent) : si `status !== Scheduled` return ; `$delegation->markActive(); $this->sync; event(new RoleDelegationActivated);`. Garde idempotence : status check avant tout.
  - **`expire`** (idempotent) : si `status !== Active` return ; `markExpired; sync; event(new RoleDelegationExpired);`.
  - **`sync($user, $agency)`** — **canonique** :
    1. `$this->registrar->setPermissionsTeamId($agency->id);`
    2. `$activeDelegations = RoleDelegation::active()->where('user_id', $user->id)->where('agency_id', $agency->id)->get();`
    3. `$delegatedRoles = $activeDelegations->pluck('role')->unique()->all();`
    4. `$snapshotNatives = ...` — l'union des `user_native_roles_snapshot` des délégations actives ; si aucune active, on **lit les rôles natifs courants** (cas où on supprime la dernière délégation et il faut retomber sur l'état natif courant, qui peut avoir évolué).
    5. **Décision** : on ne touche **que les rôles potentiellement délégués** pour ne pas écraser les rôles natifs assignés en parallèle (par TCK-014). Algorithme final :
       ```
       union = currentNativeRoles($user, $agency) ∪ delegatedRoles
       $user->syncRoles($union, $agency)
       ```
       `currentNativeRoles` = rôles actuellement dans `model_has_roles` MOINS rôles couverts par une délégation active dont le snapshot ne les contenait pas.
       
       **Plus simple et correct** : on conserve un fait simple — `model_has_roles` reflète à tout instant les rôles natifs + rôles activement délégués. À la création d'une délégation, on note le snapshot natif. À la sync on calcule :
       ```
       wantedRoles = (currentRolesInPivot \ rolesGrantedSolelyByExpiredOrRevoked) ∪ rolesFromActiveDelegations
       ```
       où `rolesGrantedSolelyByExpiredOrRevoked` = rôles présents sur le pivot qui sont **uniquement** justifiés par une délégation `expired/revoked` ET non présents dans le snapshot natif d'aucune autre délégation active.
       
       **Implémentation simplifiée et robuste** retenue :
       ```php
       $activeDelegRoles = $user->roleDelegations()->active()->forAgency($agency)->pluck('role')->unique();
       $currentPivotRoles = $user->getRoleNames();   // team-scoped grâce à setPermissionsTeamId
       $rolesEverDelegated = $user->roleDelegations()->forAgency($agency)->pluck('role')->unique();
       
       $rolesToKeep = $currentPivotRoles
           ->reject(fn($r) => $rolesEverDelegated->contains($r) && ! $activeDelegRoles->contains($r))
           ->merge($activeDelegRoles)
           ->unique()
           ->values()
           ->all();
       
       $user->syncRoles($rolesToKeep);  // team déjà setté
       ```
       Cela retire les rôles dont l'unique justification est une délégation expirée/révoquée ET qui n'ont pas une autre justification active. C'est conservateur : si un admin a manuellement ajouté un rôle pendant la délégation, on ne le retire pas.
    6. `$this->registrar->forgetCachedPermissions(); $user->load('roles', 'permissions');`

### Backend — endpoints HTTP

- `takussan-api/app/Http/Requests/Permissions/StoreRoleDelegationRequest.php`
  - `authorize()` : vrai (vérification fine via Policy dans le controller).
  - `rules()` :
    ```php
    'user_id' => ['required', 'integer', Rule::exists('users', 'id')],
    'role' => ['required', 'string', Rule::in(config('role_delegations.delegable_roles'))],
    'starts_at' => ['nullable', 'date'],
    'ends_at' => ['required', 'date', 'after:starts_at', 'before_or_equal:'.now()->addDays(config('role_delegations.max_duration_days'))->toIso8601String()],
    'reason' => ['nullable', 'string', 'max:500'],
    ```
  - `withValidator($v)` :
    - `$v->after(fn() => $this->validateNotSelf($v));` — `delegator_id != user_id`.
    - `$v->after(fn() => $this->validateBeneficiaryInAgency($v));` — `user.agency_id === route('agency').id`.
    - `$v->after(fn() => $this->validateRoleNotPrimaryAdmin($v));` — si `role=agency_admin` ET le user est déjà `primary_admin` de l'agence → 422 (inutile).
    - **Pas** de validation "déléguer super_admin → 422" : déjà bloqué par `Rule::in(delegable_roles)`.
  - `messages()` : i18n via `lang/{locale}/role_delegations.php`.

- `takussan-api/app/Http/Controllers/Api/Permissions/RoleDelegationController.php`
  - Resource controller `(index, store, destroy)`.
  - `index(Agency $agency, Request $r)` :
    - `$this->authorize('viewAny', [RoleDelegation::class, $agency]);`
    - `RoleDelegation::query()->where('agency_id', $agency->id)->buildQuery(...)` (Spatie query-builder pattern repo) → filterable par `status`, `user_id`, sortable par `created_at`/`ends_at`.
    - Includes : `user, delegator, revokedBy`.
  - `store(Agency $agency, StoreRoleDelegationRequest $r, RoleDelegationService $s)` :
    - `$this->authorize('create', [RoleDelegation::class, $agency]);`
    - `$delegation = $s->create($agency, $r->user(), $r->validated());`
    - `return $this->json(['data' => RoleDelegationResource::make($delegation)], 201);`
  - `destroy(Agency $agency, RoleDelegation $delegation, RoleDelegationService $s)` :
    - `abort_unless($delegation->agency_id === $agency->id, 404);`
    - `$this->authorize('revoke', $delegation);`
    - `$s->revoke($delegation, $r->user());`
    - `return $this->json(['data' => RoleDelegationResource::make($delegation->refresh())]);`

- `takussan-api/app/Policies/RoleDelegationPolicy.php` (extends `BasePolicy`)
  - `viewAny(User $user, Agency $agency)` : true si `user.agency_id === agency.id` ET `(user.id === agency.primary_admin_id OR hasRole('agency_admin', agency))`.
  - `view(User $user, RoleDelegation $del)` : true si `viewAny(user, $del->agency)` OR `user.id === $del->user_id` (le bénéficiaire voit la sienne).
  - `create(User $user, Agency $agency)` : `viewAny`.
  - `revoke(User $user, RoleDelegation $del)` : `viewAny(user, $del->agency)`.
  - **Pas** d'override pour `super_admin`/`admin` : `Gate::before` global déjà câblé en `AppServiceProvider` (cf. BasePolicy).

- `takussan-api/app/Http/Resources/Permissions/RoleDelegationResource.php`
  - Champs : `id, user_id, user (mini), delegator_id, delegator (mini), agency_id, role, role_label (translated), status, status_label (translated), starts_at, ends_at, reason, activated_at, expired_at, revoked_at, revoked_by, created_at, updated_at`.
  - Conditional `user`/`delegator`/`revokedBy` via `$this->whenLoaded('user')` — pattern existant dans `PropertyResource`.

### Backend — job + scheduler

- `takussan-api/app/Jobs/Permissions/ProcessRoleDelegationsJob.php`
  - `implements ShouldQueue` ; default queue ; pas de tries custom (default 1, on log les erreurs).
  - `handle(RoleDelegationService $service)` :
    1. **Activation** : `RoleDelegation::readyToActivate()->cursor()->each(fn($d) => $service->activate($d));`
    2. **Expiration** : `RoleDelegation::readyToExpire()->cursor()->each(fn($d) => $service->expire($d));`
    3. Idempotence garantie côté `service.activate/expire` (status check préalable).
  - Pas de chunk explicite (cardinalité attendue ≤ 1000 délégations actives à un instant T sur tout le SaaS — `cursor()` suffit).

- Modification `routes/console.php` :
  ```php
  use App\Jobs\Permissions\ProcessRoleDelegationsJob;
  Schedule::job(new ProcessRoleDelegationsJob)->everyFiveMinutes()->withoutOverlapping();
  ```

### Backend — events & listeners

- `takussan-api/app/Events/Permissions/RoleDelegationActivated.php` — `public RoleDelegation $delegation;` ; `Dispatchable, SerializesModels`.
- `takussan-api/app/Events/Permissions/RoleDelegationExpired.php` — idem.
- `takussan-api/app/Events/Permissions/RoleDelegationRevoked.php` — idem.
- `takussan-api/app/Listeners/Permissions/NotifyDelegationActivated.php` — `implements ShouldQueue`. `handle(RoleDelegationActivated $e, NotificationService $svc)` :
  - Notify `$delegation->user` (bénéficiaire) avec `NotificationType::RoleDelegated`, title/body via `lang/.../notifications.php`, `data = ['role' => $role, 'agency_id' => ..., 'ends_at' => ..., 'is_critical' => false]`, `referenceableType=RoleDelegation::class, referenceableId=$id`.
  - Notify `$delegation->delegator` également (info confirmation pour l'admin) avec body distinct ("Délégation à {beneficiary} activée").
- `takussan-api/app/Listeners/Permissions/NotifyDelegationExpired.php` — idem, type `RoleDelegationExpired`. Notify bénéficiaire + délégateur.
- `takussan-api/app/Listeners/Permissions/NotifyDelegationRevoked.php` — idem, type `RoleDelegationRevoked`. Notify bénéficiaire (impacté) + délégateur (confirmation).

- Modification `app/Models/Enums/NotificationType.php` :
  ```php
  case RoleDelegated = 'role_delegated';
  case RoleDelegationExpired = 'role_delegation_expired';
  case RoleDelegationRevoked = 'role_delegation_revoked';
  ```

- Modification `lang/fr/notifications.php` (et en, wo) — section `types`:
  ```php
  'role_delegated' => 'Rôle délégué',
  'role_delegation_expired' => 'Délégation expirée',
  'role_delegation_revoked' => 'Délégation révoquée',
  ```
  Plus, dans `messages` ou nouveau fichier `lang/{locale}/role_delegations.php` :
  - `notifications.activated.title`, `.body` (paramétrés `:role`, `:agency`, `:ends_at`)
  - `.expired.title`, `.body`
  - `.revoked.title`, `.body`
  - `validation.*` (messages des règles métier).

- Modification `app/Providers/AppServiceProvider.php::boot()` — registration :
  ```php
  Event::listen(RoleDelegationActivated::class, NotifyDelegationActivated::class);
  Event::listen(RoleDelegationExpired::class, NotifyDelegationExpired::class);
  Event::listen(RoleDelegationRevoked::class, NotifyDelegationRevoked::class);
  ```

### Backend — routes

Modification `routes/api.php` (ou `routes/api/agencies.php` si pattern existant) — dans le groupe `auth:sanctum` :
```php
Route::prefix('agencies/{agency}')->group(function () {
    Route::apiResource('role-delegations', RoleDelegationController::class)
        ->only(['index', 'store', 'destroy']);
});
```
Liaison route-model : `Agency` via `id`, `RoleDelegation` via `id` ; `Route::scopeBindings()` n'est pas nécessaire (le controller vérifie `agency_id` dans `destroy`).

### Backend — tests

- `tests/Feature/Api/Permissions/RoleDelegationTest.php` — **15 tests** (couvre AC1, AC4–AC9) :
  1. `test_admin_creates_delegation_in_future_then_status_is_scheduled` (AC1)
  2. `test_admin_creates_delegation_immediate_then_status_is_active` — variation
  3. `test_index_returns_paginated_delegations_filtered_by_agency` (scoping)
  4. `test_index_filterable_by_status_and_user`
  5. `test_admin_can_revoke_active_delegation` (AC4) — assert sync removes role + AppNotification créée
  6. `test_revoke_idempotent_on_already_revoked` — 2× DELETE = 200 + no double event
  7. `test_non_admin_cannot_create_delegation_returns_403` (AC5)
  8. `test_cannot_delegate_super_admin_returns_422` (AC6)
  9. `test_cannot_delegate_admin_returns_422` (AC6 variant)
  10. `test_cannot_self_delegate_returns_422` (AC7)
  11. `test_cannot_delegate_more_than_one_year_returns_422` (AC8)
  12. `test_cannot_delegate_to_user_outside_agency_returns_422` (scoping)
  13. `test_unauthenticated_returns_401`
  14. `test_beneficiary_can_view_own_delegation_but_not_others`
  15. `test_resource_includes_user_delegator_and_translated_labels`

- `tests/Feature/Jobs/Permissions/ProcessRoleDelegationsJobTest.php` — **5 tests** (AC2, AC3, AC10) :
  1. `test_activates_scheduled_delegations_when_starts_at_passed` (AC2) — assert role on user via Spatie pivot + AppNotification
  2. `test_does_not_activate_when_starts_at_in_future` — control
  3. `test_expires_active_delegations_when_ends_at_passed` (AC3) — role removed
  4. `test_idempotent_two_runs_do_not_duplicate_notifications` (AC10) — Queue::fake before second run, assert no event redispatched
  5. `test_concurrent_active_delegations_keep_role_until_last_expires` — 2 délégations même rôle, expiration de l'une → rôle persiste ; expiration de l'autre → rôle retiré

- `tests/Unit/Services/Permissions/RoleDelegationServiceTest.php` — **6 tests** (mécanique sync) :
  1. `test_create_with_immediate_start_assigns_role_via_spatie`
  2. `test_create_with_future_start_does_not_assign_role`
  3. `test_revoke_removes_role_and_invalidates_cache`
  4. `test_sync_preserves_native_role_when_delegation_revoked`
  5. `test_sync_preserves_role_when_other_active_delegation_exists` (cumul)
  6. `test_sync_does_not_remove_role_added_natively_during_delegation` (admin a ajouté `agent` manuellement pendant la délégation → on ne le retire pas)

- `tests/Feature/Permissions/PolicyIntegrationTest.php` — **3 tests** :
  1. `test_user_with_active_delegation_passes_policy_check_for_delegated_role` — user.hasRole('agency_admin') === true le temps de la délégation
  2. `test_user_loses_policy_check_after_delegation_expires`
  3. `test_user_with_only_native_agent_role_does_not_pass_agency_admin_check`

### Frontend — types

- `takussan-web/src/types/role-delegation.ts`
  ```ts
  export type RoleDelegationStatus = 'scheduled' | 'active' | 'expired' | 'revoked';
  export interface RoleDelegation {
    id: number;
    user_id: number;
    user?: { id: number; first_name: string; last_name: string; email: string };
    delegator_id: number;
    delegator?: { id: number; first_name: string; last_name: string };
    agency_id: number;
    role: string;
    role_label: string;
    status: RoleDelegationStatus;
    status_label: string;
    starts_at: string | null;
    ends_at: string;
    reason: string | null;
    activated_at: string | null;
    expired_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }
  ```

### Frontend — query layer

- `takussan-web/src/lib/queries/role-delegations.ts`
  - `fetchRoleDelegations(agencyId, token, { page, perPage, sort, filters }): PaginatedResponse<RoleDelegation>` — duplique la mécanique de `fetchAgencyMembers` avec params `fields[role_delegations]=...` (mémoire utilisateur — sparse fieldsets obligatoires).
  - `createRoleDelegation(agencyId, body, token): RoleDelegation`.
  - `revokeRoleDelegation(agencyId, id, token): RoleDelegation`.

### Frontend — composants

- `takussan-web/src/components/admin/delegations/DelegationManagement.tsx`
  - Wrapper qui orchestre liste + dialog création + dialog révocation.
  - Reproduit la structure de `TeamManagement.tsx` (filtres en haut, table en dessous, bouton "Nouvelle délégation" en haut-droite).
  - Filtres : `status` (Tous / Actif / À venir / Expiré / Révoqué), `user` (search par nom).
  - Hooks : `useApiQuery(['role-delegations', agencyId, filters], ...)`.

- `takussan-web/src/components/admin/delegations/DelegationList.tsx`
  - Table : Utilisateur, Rôle délégué, Période (badge status + dates), Motif, Actions.
  - Status badges discrets (selon ticket) : `active` = stone-700/stone-100 ; `scheduled` = stone-500 ; `expired` = stone-400 italic ; `revoked` = rose-700 ghost.
  - Actions : bouton "Révoquer" (visible si status ∈ {scheduled, active}) ouvre `RevokeDelegationDialog`.

- `takussan-web/src/components/admin/delegations/CreateDelegationDialog.tsx`
  - `Dialog` shadcn + `useApiForm` + Zod schema :
    ```ts
    z.object({
      user_id: z.number().int().positive(),
      role: z.enum(['agency_admin', 'agent', 'owner']),
      starts_at: z.string().datetime().nullable().optional(),
      ends_at: z.string().datetime(),
      reason: z.string().max(500).optional(),
    }).refine(d => !d.starts_at || new Date(d.ends_at) > new Date(d.starts_at), { message: 'ends_at_after_starts_at', path: ['ends_at'] })
    ```
  - User picker : `<UserPicker agencyId={agency.id} excludeUserId={currentUser.id} />` — composant nouveau, autocomplete sur `fetchAgencyMembers` filtré.
  - Role select : `<FormSelect>` avec options `[agency_admin, agent, owner]` traduites.
  - Date range picker : `<DateRangePicker>` nouveau, basé sur `Popover` + 2 `<Calendar>` (shadcn) — checkbox "Démarrage immédiat" qui désactive `starts_at`.
  - Reason : `<FormTextarea maxLength={500}>`.
  - Résumé en clair (computed) : `"{first_name} {last_name} aura le rôle {role_label} du {starts_at|maintenant} au {ends_at}"`.
  - Warning conflits : avant submit, query `GET /role-delegations?filter[user_id]=X&filter[status]=active` → si déjà délégué pour ce rôle, afficher banner "Une délégation active existe déjà pour ce rôle (cumul autorisé)".
  - Submit → `createRoleDelegation(agencyId, validated, token)` ; toast success ; invalide `['role-delegations', agencyId]`.

- `takussan-web/src/components/admin/delegations/RevokeDelegationDialog.tsx`
  - Confirmation modale ; champ motif optionnel (pas envoyé au backend dans cette V1 — l'API ne l'accepte pas, seul `reason` initial). On le note dans le composant pour V2 si besoin.
  - Submit → `revokeRoleDelegation(agencyId, id, token)`; toast ; invalide cache.

- `takussan-web/src/components/admin/delegations/UserPicker.tsx` (nouveau, réutilisable)
  - Combobox base UI ; autocomplete sur les membres de l'agence ; affiche avatar + nom + rôle natif.

- `takussan-web/src/components/admin/delegations/DateRangePicker.tsx` (nouveau)
  - Popover + Calendar shadcn ; deux modes : range complet (start+end) ou end-only (immédiat).
  - Validation : `end > start`, `end <= today + 366 days`.

### Frontend — page tab

- Modification `takussan-web/src/app/(dashboard)/admin/team/page.tsx` :
  - Conversion en client component léger (`'use client'`) qui utilise `<Tabs defaultValue="members">` shadcn.
  - Tab "Membres" → `<TeamManagement />` (existant, inchangé).
  - Tab "Délégations" → `<DelegationManagement agency={agency} />`.
  - Garde le check `isAdmin()` côté server, transmet le contexte au client.

### Frontend — i18n

- Ajout dans `takussan-web/src/messages/fr.json` (et en, wo) :
  ```json
  "admin": {
    "delegations": {
      "title": "Délégations de rôle",
      "create_button": "Nouvelle délégation",
      "filters": { "status": "Statut", "user": "Utilisateur" },
      "status": {
        "active": "Actif",
        "scheduled": "À venir",
        "expired": "Expiré",
        "revoked": "Révoqué"
      },
      "table": { "user": "Utilisateur", "role": "Rôle", "period": "Période", "reason": "Motif", "actions": "Actions" },
      "form": {
        "user": "Bénéficiaire",
        "role": "Rôle à déléguer",
        "starts_at": "Début (laisser vide = immédiat)",
        "ends_at": "Fin",
        "reason": "Motif (optionnel)",
        "summary": "{user} aura le rôle {role} du {start} au {end}",
        "submit": "Créer la délégation"
      },
      "revoke": {
        "title": "Révoquer la délégation",
        "body": "Le rôle sera retiré immédiatement à {user}.",
        "submit": "Révoquer"
      },
      "errors": { "self_delegation": "Vous ne pouvez pas vous déléguer un rôle.", "non_delegable_role": "Ce rôle ne peut pas être délégué.", "max_duration": "La durée maximale est de 12 mois." }
    }
  }
  ```

### Frontend — tests

- `takussan-web/src/components/admin/delegations/__tests__/CreateDelegationDialog.test.tsx` — 5 tests :
  1. Rendering empty form, submit disabled
  2. Validates ends_at > starts_at inline
  3. Validates ends_at ≤ now+366d
  4. Submits with `starts_at=null` when "immédiat" checkbox cocheé
  5. Affiche le warning conflit quand délégation active existante pour user+role
- `takussan-web/src/components/admin/delegations/__tests__/DelegationList.test.tsx` — 3 tests :
  1. Renders status badges distincts pour les 4 statuts
  2. Bouton Révoquer visible uniquement pour `active`/`scheduled`
  3. Click Révoquer ouvre le dialog
- `takussan-web/src/lib/queries/__tests__/role-delegations.test.ts` — 2 tests :
  1. `fetchRoleDelegations` build correct query params (sparse fields, filters)
  2. `createRoleDelegation` POSTe avec body validé

---

## Détails d'implémentation clés

### Pourquoi un `RoleDelegationService::sync()` plutôt qu'override `User::hasRole`

Override du `HasRoles` trait introduit deux fragilités :
1. Spatie cache permission par-user — un override de `hasRole` qui union sur des données externes (`role_delegations`) implique d'invalider ce cache à chaque consultation OU d'accepter un délai de cohérence. Compliqué.
2. Tous les helpers Spatie (`->permissions()`, `->getAllPermissions()`, broadcast, `Gate::check`) regardent le pivot `model_has_roles`. Si on ne le sync pas, on doit override 6+ méthodes — risque de drift.

La solution **sync** garde `model_has_roles` comme **source unique de vérité Spatie** : à tout instant, le pivot reflète exactement les rôles effectifs (natifs + délégations actives). Tout le reste de Laravel (Gate, policies, broadcast) fonctionne sans modif. Le coût : invalider le cache Spatie après chaque sync (1 ligne, pattern existant). Bénéfice : robustesse, pas d'override invasif, idempotence triviale.

### Idempotence du job

`RoleDelegationService::activate($delegation)` commence par `if ($delegation->status !== Scheduled) return;`. `expire()` symétrique. Donc si le scheduler tourne 2× (overlap, fenêtre debug), la 2e passe est un no-op. Pas de double event, pas de double notification. Test dédié AC10.

`->withoutOverlapping()` côté scheduler ajoute une 2e ceinture (lock fichier de Laravel). Couvre le cas du restart de worker pendant exécution.

### Conflits de délégations — UI seulement

Le ticket précise : "deux délégations actives du même rôle pour le même user dans la même agence → autorisé (cumul de la période la plus longue), mais l'UI alerte l'admin lors de la création". Donc :
- Backend : aucune validation contre les conflits. La sync est ref-counted (cf. ci-dessus).
- Frontend : avant submit, query GET `/role-delegations?filter[user_id]=X&filter[role]=Y&filter[status]=active` (filterable via spatie query-builder). Si non-vide, afficher banner.

### Snapshot des rôles natifs — pourquoi le stocker

Lors de la révocation/expiration, on doit savoir quels rôles **étaient déjà natifs avant** la délégation, pour les conserver. Sans snapshot, on ne distingue pas "le rôle était natif depuis le début" de "le rôle a été ajouté par cette délégation et doit être retiré à expiration". Le snapshot est un JSON figé, lecture seule, jamais mis à jour.

Algorithme final de `sync` (formalisé) — **conservateur, sans risque de retirer un rôle non géré par la délégation** :

```
inputs : user, agency
  pivotRolesNow := user.roles().wherePivot(agency_id=agency.id).pluck('name')
  rolesEverDelegated := RoleDelegation::where(user_id=user.id, agency_id=agency.id).pluck('role').unique()
  activeDelegRoles := RoleDelegation::active()->where(...)->pluck('role')->unique()

  # Pour chaque rôle ever delegated :
  #   - s'il est dans activeDelegRoles → on le garde
  #   - sinon (toutes ses délégations sont expirées/révoquées) → on le retire SAUF s'il est natif
  #     (mais comment savoir s'il est natif ? Si une autre délégation du même rôle a un snapshot qui le contient)
  rolesNativeSomewhere := union des snapshots des délégations terminées récentes pour cet user×agency × ce rôle
                          (la plus récente snapshot fait foi)

  rolesToKeep := pivotRolesNow
       \ { r in rolesEverDelegated : r not in activeDelegRoles AND r not in rolesNativeSomewhere }
       ∪ activeDelegRoles
```

Cette formulation gère les cas limites :
- Si l'admin ajoute manuellement un rôle pendant la délégation : `rolesEverDelegated` ne le contient pas, il est dans `pivotRolesNow`, il reste.
- Si la délégation finit et l'utilisateur n'a jamais eu le rôle nativement : retrait.
- Si 2 délégations chevauchantes du même rôle, l'une expire : `activeDelegRoles` contient encore le rôle, garde.
- Si 1 délégation, snapshot = `[]`, expire : rôle retiré.

Test 6 du `RoleDelegationServiceTest` couvre exactement ces 4 cas.

### Cache Spatie permissions

`PermissionRegistrar::forgetCachedPermissions()` clear la cache **globale** (toutes les requêtes en cours rechargent depuis DB la prochaine fois qu'elles vérifient une permission). Coût : 1 hit DB sur les N requêtes en parallèle, négligeable. Existant `AgencyMemberRoleController` fait pareil. Pas de cache dirty.

### Audit log — events activés/expirés/révoqués

Le trait `Auditable` log auto les fillable dirty (donc create + update). Mais "expired" ou "activated" sont des transitions automatiques — on veut une entrée explicite du **type d'event**. D'où les appels manuels :
```php
activity()
    ->causedBy(/* system user pour activate/expire */ null)
    ->performedOn($delegation)
    ->withProperties(['role' => $delegation->role, 'agency_id' => $delegation->agency_id])
    ->event($delegation->status->value)
    ->log("role_delegation.{$delegation->status->value}");
```
Pour `revoke`, `causedBy` = `$caller`. Pour les transitions auto, `null` (system).

### NotificationType — extension

Le `NotificationType` enum est lu dans `lang/{locale}/notifications.php` pour la traduction. On ajoute :
- `role_delegated` : "Vous avez reçu une délégation temporaire" / "Une délégation à {beneficiary} est maintenant active" (selon destinataire).
- `role_delegation_expired` : "Votre délégation a pris fin" / "La délégation à {beneficiary} a expiré".
- `role_delegation_revoked` : "Votre délégation a été révoquée" / "Vous avez révoqué la délégation de {beneficiary}".

`is_critical=false` (pas paging d'astreinte). `delivery_channel=app` (in-app uniquement, conforme hors-périmètre ticket : pas d'email/SMS dans cette V1).

### Sécurité — agent ne voit pas les autres délégations

La policy `viewAny` autorise admin agence ET super_admin/admin (via `Gate::before`). `view` autorise en plus le bénéficiaire pour SA délégation. L'agent simple → 403 sur l'index. Test dédié AC5 + test 14 du `RoleDelegationTest` (`test_beneficiary_can_view_own_delegation_but_not_others`).

### Spatie `team_id` cohérent partout

`PermissionRegistrar::setPermissionsTeamId($agency->id)` doit être appelé **avant** chaque `assignRole`/`removeRole`/`syncRoles` dans le service. Le bouchon est `RoleDelegationService::sync` qui le fait en première ligne. Les requêtes Eloquent sur `RoleDelegation` n'ont pas besoin de team — elles filtrent par `agency_id` directement.

### Spatie cache — TTL 24h vs sync invalide

`config('permission.cache.expiration_time')` = 24h, donc la cache peut survivre largement après une délégation. Heureusement `forgetCachedPermissions()` est explicite. **Tous** les chemins du service appellent ce clear. Un test unitaire mock `PermissionRegistrar` et asserte l'appel.

---

## Mapping critères d'acceptation → vérifications

| AC | Vérification |
|---|---|
| **AC1** — Création délégation `agency_admin` future → `status=scheduled` | `RoleDelegationTest::test_admin_creates_delegation_in_future_then_status_is_scheduled` — assert `201`, JSON `data.status === 'scheduled'`, DB row inséré |
| **AC2** — Job active la délégation à `starts_at`, agent gagne le rôle | `ProcessRoleDelegationsJobTest::test_activates_scheduled_delegations_when_starts_at_passed` — `travel(starts_at)`, dispatch job, assert `$user->hasRole('agency_admin', $agency) === true`, AppNotification créée |
| **AC3** — Job expire la délégation à `ends_at`, agent perd le rôle | `ProcessRoleDelegationsJobTest::test_expires_active_delegations_when_ends_at_passed` |
| **AC4** — Admin révoque immédiatement → `status=revoked`, agent perd le rôle dans la requête courante | `RoleDelegationTest::test_admin_can_revoke_active_delegation` — DELETE puis `$user->refresh(); assert hasRole === false` |
| **AC5** — Agent non admin POST → 403 | `RoleDelegationTest::test_non_admin_cannot_create_delegation_returns_403` |
| **AC6** — Délégation `super_admin` → 422 message explicite | `RoleDelegationTest::test_cannot_delegate_super_admin_returns_422` (+ variant `admin`) |
| **AC7** — Auto-délégation → 422 | `RoleDelegationTest::test_cannot_self_delegate_returns_422` |
| **AC8** — Délégation > 12 mois → 422 | `RoleDelegationTest::test_cannot_delegate_more_than_one_year_returns_422` |
| **AC9** — Bénéficiaire reçoit AppNotification à activation ET expiration | `ProcessRoleDelegationsJobTest::test_activates_...` + `test_expires_...` — `Notification::fake()` ou DB assertion sur `app_notifications` table |
| **AC10** — Job idempotent : 2 runs → pas de doublon | `ProcessRoleDelegationsJobTest::test_idempotent_two_runs_do_not_duplicate_notifications` — `Event::fake`, run × 2, asserts 1 event seulement |

---

## Variables d'environnement

**Aucune nouvelle variable**. Le ticket est entièrement piloté par la DB (migrations) et la config Laravel (`config/role_delegations.php` — fichier mais valeurs en dur, pas d'env override prévu en V1).

---

## Étapes d'exécution (ordre recommandé)

### Backend

1. **Migration + Enum** — `2026_04_28_000000_create_role_delegations_table.php`, `RoleDelegationStatus.php`. `php artisan migrate` smoke.
2. **Config** — `config/role_delegations.php`.
3. **Modèle** `RoleDelegation` + scopes + relations + `Auditable`.
4. **Étendre enum `NotificationType`** + `lang/{locale}/notifications.php` + `lang/{locale}/role_delegations.php` (nouveau).
5. **Service** `RoleDelegationService` :
   - d'abord `sync()` (cœur fonctionnel) + tests `RoleDelegationServiceTest` × 6 (unitaires, mocks `PermissionRegistrar`).
   - puis `create`, `revoke`, `activate`, `expire` (orchestration).
6. **Events + Listeners** + registration `AppServiceProvider`.
7. **Policy** `RoleDelegationPolicy` + tests sur `policies/RoleDelegationPolicyTest`.
8. **FormRequest** `StoreRoleDelegationRequest` + tests validation (3 cas par règle critique).
9. **Resource** `RoleDelegationResource`.
10. **Controller** `RoleDelegationController` (resource controller index/store/destroy).
11. **Routes** ajoutées dans le groupe `auth:sanctum`.
12. **Tests Feature API** `RoleDelegationTest` × 15 (couvre AC1, AC4–AC9).
13. **Job** `ProcessRoleDelegationsJob` + tests `ProcessRoleDelegationsJobTest` × 5 (couvre AC2, AC3, AC10).
14. **Schedule** dans `routes/console.php` (`everyFiveMinutes`, `withoutOverlapping`).
15. **Test policy intégration** — `PolicyIntegrationTest` × 3 (AC implicite : un user avec délégation passe une policy, à expiration échoue).
16. **Lint** `./vendor/bin/pint` (mémoire utilisateur — obligatoire avant commit).

### Frontend

17. **Types** `src/types/role-delegation.ts`.
18. **Query layer** `src/lib/queries/role-delegations.ts` + tests (sparse fields obligatoires — mémoire utilisateur).
19. **Composants atomiques** : `UserPicker`, `DateRangePicker`.
20. **Composants délégation** : `DelegationList`, `RevokeDelegationDialog`, `CreateDelegationDialog` (avec warning conflit), `DelegationManagement`.
21. **i18n** : `admin.delegations.*` dans fr/en/wo.
22. **Page tab** : conversion `app/(dashboard)/admin/team/page.tsx` en page à onglets.
23. **Tests** : `CreateDelegationDialog.test.tsx` × 5, `DelegationList.test.tsx` × 3, `role-delegations.test.ts` × 2.
24. **Lint** `npm run lint`.

### Final

25. **INDEX.md** : passer TCK-108 `todo → review` à l'ouverture de la PR ; **target = `dev`** (mémoire utilisateur).
26. **Commit du plan** : `docs(TCK-108): add temporary role delegation implementation plan` (à l'image de TCK-105/106/107).

---

## Vérification end-to-end

### Tests automatisés ciblés

```bash
# Backend
cd takussan-api
php artisan test --filter='RoleDelegation|ProcessRoleDelegations|PolicyIntegration'   # toutes vertes
php artisan test                                                                       # pas de régression

# Frontend
cd takussan-web
npx vitest run --reporter=verbose src/components/admin/delegations src/lib/queries/role-delegations
npm run lint
```

### Smoke manuel

1. **Backend** : seed 2 agencies A/B avec primary_admin distinct + 2 agents par agence ; donner role `agent` à chacun via Spatie team-scoped.
2. `php artisan serve --port=8002`.
3. Auth en tant que primary_admin de A : `POST /api/agencies/A.id/role-delegations` body `{user_id: agentA.id, role: 'agency_admin', starts_at: null, ends_at: now+1d, reason: 'test'}` → `201`, status `active`. AppNotification créée.
4. Vérifier en tinker : `User::find(agentA.id)->hasRole('agency_admin', AgencyA)` → `true`.
5. `POST` même endpoint mais `user_id=agent_de_B` → `422` (validation `user dans agence`).
6. `POST` avec `role=super_admin` → `422`.
7. `POST` avec `user_id=primaryAdminA.id` (auto-délégation) → `422`.
8. `DELETE /api/agencies/A.id/role-delegations/{id}` → `200`, `User::find(agentA.id)->hasRole('agency_admin')` → `false`.
9. **Job** : créer délégation `starts_at=now+1min, ends_at=now+2min` → `php artisan tinker → travel(now+90s) → ProcessRoleDelegationsJob::dispatchSync()` → status `active`, AppNotification activation. `travel(now+125s) → dispatchSync()` → status `expired`, AppNotification expiration.
10. **Frontend** : `npm run dev`, login primary_admin A, aller `/admin/team`, onglet "Délégations" → liste vide. Cliquer "Nouvelle délégation" → formulaire, sélectionner agent, rôle `agency_admin`, dates ; warning si conflit. Submit → row apparaît. Click "Révoquer" → confirmation → row passe `revoked`.
11. **i18n** : switch locale en/wo → labels traduits.
12. **a11y** : Lighthouse sur `/admin/team` — Accessibility ≥ 90.

### Pint / lint

- `./vendor/bin/pint --test` (backend) : pas de diff.
- `npm run lint` (frontend) : pas de warning.

---

## Hors périmètre (rappel + simplifications)

Repris du ticket :

- **Délégation multi-agence** (un user delegate sur plusieurs agences en une seule action) — V2.
- **Délégation de permissions atomiques** (pas un rôle entier) — pas demandé, ticket dédié si émerge.
- **Workflow d'approbation** (le délégateur demande, un super-admin valide) — pas demandé.
- **Historique audit visualisable côté UI** — couvert par ActivityLog général, pas de vue dédiée.
- **Notifications email/SMS** — uniquement AppNotification in-app dans ce ticket.

Simplifications explicites du plan :

- **Pas de motif sur révocation** : la V1 stocke uniquement le `reason` initial. Le champ "motif révocation" du dialog frontend est noté pour V2 mais non envoyé au backend (l'API ne l'accepte pas).
- **Pas de UI d'audit dédiée** : les events `activity_log` créés sont consultables via `php artisan tinker` ou export job (`ExportActivityLogJob` mentionné en console.php). UI éventuelle = ticket dédié.
- **Pas de compactage de notifications** : chaque event = 1 notification individuelle. Le digest journalier (TCK-049) compactera s'il est activé pour ces types.
- **Mapping vocabulaire** : `agency_manager`/`agency_owner` du ticket sont alignés sur `agency_admin` (rôle) / `primary_admin_id` (colonne). Documenté en haut du plan.
