# Internal Entities Search on Meilisearch (TCK-281) Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Make `Customer`, `MaintenanceRequest`, `Agency` and `User` searchable through Meilisearch so their `filter[search]` becomes typo-tolerant and relevance-ranked, like `Property` (TCK-280).

**Architecture:** Each model gets Laravel Scout's `Searchable` trait, a minimal `toSearchableArray()` (id + search fields only — no sensitive data), a `shouldBeSearchable()` that drops soft-deleted rows, and an `index-settings` block in `config/scout.php`. No Scout-side tenant filter: the existing `HasQueryBuilder` `filter[search]` callback already intersects the Scout id list with each controller's tenant-scoped `$base` query (`$base ∩ whereIn`), so tenant isolation is guaranteed without new code. The only change to the callback is raising its id cap (1000 → 5000) so a tenant's matches are never truncated out of the global relevance ranking. Meilisearch is the single Scout engine on every environment, CI included (TCK-280 decision).

**Tech Stack:** Laravel 13, PHP 8.3, Laravel Scout ^11.1, Meilisearch, `spatie/laravel-query-builder`, PHPUnit.

**Ticket:** `docs/backlog/tickets/TCK-281-search-internal-entities-meilisearch.md` (status `doing`).

**Reference implementation:** TCK-280 — `Property` model (`app/Models/Property.php` lines 23/31/141-236), `config/scout.php` `meilisearch.index-settings`, `tests/Concerns/InteractsWithMeilisearch.php`, `tests/Feature/Public/PropertySearchTest.php`.

**Conventions:**
- Run `./vendor/bin/pint` before every commit (project rule).
- Tests run on Meilisearch (`phpunit.xml` pins `SCOUT_DRIVER=meilisearch`). A local/CI Meilisearch instance must be reachable.
- Run a single test class with `php artisan test --filter=<ClassName>`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Infrastructure — raise the search id cap + register the new managed indexes

**Files:**
- Modify: `app/Models/Concerns/HasQueryBuilder.php` (the `search` callback, ~line 128)
- Modify: `tests/Concerns/InteractsWithMeilisearch.php` (`$meilisearchManagedModels`, ~line 32)

No new test — Task 1 is an enabler; the per-model tests in Tasks 2-5 and the existing suite cover it.

**Step 1: Raise the id cap in the `filter[search]` callback**

In `app/Models/Concerns/HasQueryBuilder.php`, inside the `AllowedFilter::callback('search', ...)` closure, the Searchable branch currently reads:

```php
if (in_array(Searchable::class, class_uses_recursive($model), true)) {
    $ids = $model::search($value)->take(1000)->keys()->all();
    $q->whereIn($model->getQualifiedKeyName(), $ids);

    return;
}
```

Change it to:

```php
if (in_array(Searchable::class, class_uses_recursive($model), true)) {
    // TCK-281 — cap raised from 1000. Internal list searches (customers,
    // maintenance, agencies, users) intersect this id set with a
    // controller-side tenant scope; the cap must be generous enough not to
    // truncate a tenant's matches buried in the global relevance ranking.
    $ids = $model::search($value)->take(5000)->keys()->all();
    $q->whereIn($model->getQualifiedKeyName(), $ids);

    return;
}
```

**Step 2: Add the four models to the per-test index reset list**

In `tests/Concerns/InteractsWithMeilisearch.php`, add imports and extend `$meilisearchManagedModels` so each test flushes the new indexes too (otherwise a `RefreshDatabase` rollback leaves stale Meilisearch docs):

```php
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
```

```php
/**
 * Searchable indexes reset before each test.
 *
 * @var array<int,class-string>
 */
private array $meilisearchManagedModels = [
    Property::class,
    Document::class,
    Customer::class,
    MaintenanceRequest::class,
    Agency::class,
    User::class,
];
```

**Step 3: Verify the suite still parses and is green**

Run: `php artisan test --filter=PropertySearchTest`
Expected: PASS (Task 1 changes are backward-compatible — `Customer`/`MaintenanceRequest`/`Agency`/`User` are not Searchable yet, so `removeAllFromSearch()` on them is a harmless no-op against an empty index).

> If `removeAllFromSearch()` errors because a model is not Searchable, that means a later task's model is referenced before its trait is added — that is expected only transiently; Tasks 2-5 add the traits. Run this step's check again after Task 5 if needed.

**Step 4: Pint + commit**

```bash
./vendor/bin/pint
git add app/Models/Concerns/HasQueryBuilder.php tests/Concerns/InteractsWithMeilisearch.php
git commit -m "$(cat <<'EOF'
chore(api): raise Scout id cap to 5000 + register internal indexes (TCK-281)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Customer — Searchable

**Files:**
- Test: `tests/Feature/Search/CustomerSearchTest.php` (create)
- Modify: `app/Models/Customer.php`
- Modify: `config/scout.php`

**Step 1: Write the test**

Create `tests/Feature/Search/CustomerSearchTest.php`:

```php
<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

class CustomerSearchTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_customer_search_is_typo_tolerant(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        Customer::factory()->create([
            'agency_id' => $agency->id,
            'first_name' => 'Amadou',
            'last_name' => 'Diop',
        ]);
        $this->indexSearchable(Customer::class);

        $this->getJson('/api/customers?filter[search]=Amadu')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.first_name', 'Amadou');
    }

    public function test_customer_search_never_leaks_across_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agencyA]);

        Customer::factory()->create(['agency_id' => $agencyA->id, 'last_name' => 'Searchableton']);
        Customer::factory()->create(['agency_id' => $agencyB->id, 'last_name' => 'Searchableton']);
        $this->indexSearchable(Customer::class);

        $response = $this->getJson('/api/customers?filter[search]=Searchableton')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_soft_deleted_customer_is_not_searchable(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $customer = Customer::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ghostton',
        ]);
        $customer->delete();
        $this->indexSearchable(Customer::class);

        $this->getJson('/api/customers?filter[search]=Ghostton')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }
}
```

**Step 2: Run the test to verify it fails**

Run: `php artisan test --filter=CustomerSearchTest`
Expected: FAIL — `Customer` has no `makeAllSearchable()` (not Searchable yet) and/or the typo query returns 0 via SQL `LIKE`.

**Step 3: Make `Customer` Searchable**

In `app/Models/Customer.php`:

- Add the import: `use Laravel\Scout\Searchable;`
- Add `Searchable` to the trait list (keep alphabetical): `use Auditable, HasFactory, Searchable, SoftDeletes;`
- Add these two methods (e.g. just after `getFullNameAttribute()`):

```php
/**
 * TCK-281 — index only the id and the free-text search fields. Sensitive
 * columns (`id_number`, `metadata`, `emergency_contact_*`) are never sent
 * to Meilisearch.
 *
 * @return array<string,mixed>
 */
public function toSearchableArray(): array
{
    return [
        'id' => $this->id,
        'first_name' => $this->first_name,
        'last_name' => $this->last_name,
        'email' => $this->email,
        'phone' => $this->phone,
    ];
}

public function shouldBeSearchable(): bool
{
    return ! $this->trashed();
}
```

**Step 4: Add the Meilisearch index-settings**

In `config/scout.php`:

- Add to the imports at the top: `use App\Models\Customer;`
- Add an entry inside `meilisearch.index-settings` (after the `Document::class` entry):

```php
Customer::class => [
    'searchableAttributes' => ['first_name', 'last_name', 'email', 'phone'],
    'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
],
```

**Step 5: Run the test to verify it passes**

Run: `php artisan test --filter=CustomerSearchTest`
Expected: PASS (3 tests).

**Step 6: Run the existing Customer suite to catch regressions**

Run: `php artisan test --filter=Customer`
Expected: PASS. Adding `Searchable` switches `filter[search]` on `/api/customers` from SQL `LIKE` to Meilisearch. If any existing test searches customers without indexing, add `use InteractsWithMeilisearch;` to that test class and call `$this->indexSearchable(Customer::class);` after seeding, before the search request.

**Step 7: Pint + commit**

```bash
./vendor/bin/pint
git add app/Models/Customer.php config/scout.php tests/Feature/Search/CustomerSearchTest.php
git commit -m "$(cat <<'EOF'
feat(api): customer search on Meilisearch (TCK-281)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: MaintenanceRequest — Searchable

Same structure as Task 2. The maintenance list is tenant-scoped through the request's `property` (`property.agency_id` / `property.user_id`), so the isolation fixture seeds properties.

**Files:**
- Test: `tests/Feature/Search/MaintenanceRequestSearchTest.php` (create)
- Modify: `app/Models/MaintenanceRequest.php`
- Modify: `config/scout.php`

**Step 1: Write the test**

Create `tests/Feature/Search/MaintenanceRequestSearchTest.php`:

```php
<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

class MaintenanceRequestSearchTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_maintenance_search_is_typo_tolerant(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'title' => 'Fuite robinet cuisine',
        ]);
        $this->indexSearchable(MaintenanceRequest::class);

        $this->getJson('/api/maintenance-requests?filter[search]=robinet')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_maintenance_search_never_leaks_across_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agencyA]);

        $propertyA = Property::factory()->create(['agency_id' => $agencyA->id]);
        $propertyB = Property::factory()->create(['agency_id' => $agencyB->id]);
        $stranger = User::factory()->create();

        MaintenanceRequest::factory()->create([
            'property_id' => $propertyA->id,
            'title' => 'Probleme chaudiere unique',
        ]);
        MaintenanceRequest::factory()->create([
            'property_id' => $propertyB->id,
            'requester_id' => $stranger->id,
            'title' => 'Probleme chaudiere unique',
        ]);
        $this->indexSearchable(MaintenanceRequest::class);

        $response = $this->getJson('/api/maintenance-requests?filter[search]=chaudiere')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_soft_deleted_maintenance_request_is_not_searchable(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agent', ['agency' => $agency]);

        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $request = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'title' => 'Intervention fantome',
        ]);
        $request->delete();
        $this->indexSearchable(MaintenanceRequest::class);

        $this->getJson('/api/maintenance-requests?filter[search]=fantome')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }
}
```

> If `MaintenanceRequestController::index()` does not return `meta.total`, assert on the `data` array length instead (`$this->assertCount(1, $response->json('data'))`). Confirm by reading `app/Http/Controllers/Api/MaintenanceRequestController.php`.

**Step 2: Run the test — expected FAIL** (`MaintenanceRequest` not Searchable yet).

Run: `php artisan test --filter=MaintenanceRequestSearchTest`

**Step 3: Make `MaintenanceRequest` Searchable**

In `app/Models/MaintenanceRequest.php`:
- Add `use Laravel\Scout\Searchable;`
- Add `Searchable` to the trait list: `use HasFactory, InteractsWithMedia, Searchable, SoftDeletes;`
- Add the methods:

```php
/**
 * TCK-281 — index only id + free-text search fields.
 *
 * @return array<string,mixed>
 */
public function toSearchableArray(): array
{
    return [
        'id' => $this->id,
        'title' => $this->title,
        'description' => $this->description,
    ];
}

public function shouldBeSearchable(): bool
{
    return ! $this->trashed();
}
```

**Step 4: Add the index-settings** in `config/scout.php`:
- Import: `use App\Models\MaintenanceRequest;`
- Entry:

```php
MaintenanceRequest::class => [
    'searchableAttributes' => ['title', 'description'],
    'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
],
```

**Step 5: Run the test — expected PASS.**

Run: `php artisan test --filter=MaintenanceRequestSearchTest`

**Step 6: Run the existing maintenance suite.**

Run: `php artisan test --filter=Maintenance`
Expected: PASS. Fix any test that searches maintenance requests without indexing (add `InteractsWithMeilisearch` + `indexSearchable`).

**Step 7: Pint + commit**

```bash
./vendor/bin/pint
git add app/Models/MaintenanceRequest.php config/scout.php tests/Feature/Search/MaintenanceRequestSearchTest.php
git commit -m "$(cat <<'EOF'
feat(api): maintenance request search on Meilisearch (TCK-281)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Agency — Searchable (+ fix existing agency search tests)

**Files:**
- Test: `tests/Feature/Search/AgencySearchTest.php` (create)
- Modify: `app/Models/Agency.php`
- Modify: `config/scout.php`
- Modify: `tests/Feature/Api/AgencyTest.php` (existing search test breaks)
- Modify: `tests/Feature/Api/Admin/AgencyModerationTest.php` (existing search tests break)

**Step 1: Write the test**

Create `tests/Feature/Search/AgencySearchTest.php`:

```php
<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

class AgencySearchTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_agency_search_is_typo_tolerant_for_super_admin(): void
    {
        $this->actingAsRole('super_admin');

        Agency::factory()->create(['name' => 'Immobiliere Teranga']);
        $this->indexSearchable(Agency::class);

        $this->getJson('/api/agencies?filter[search]=Terenga')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_agency_search_is_bounded_to_visible_agencies(): void
    {
        $agencyA = Agency::factory()->create(['name' => 'Cabinet Searchunique']);
        Agency::factory()->create(['name' => 'Bureau Searchunique']);
        $this->actingAsRole('agent', ['agency' => $agencyA]);

        $this->indexSearchable(Agency::class);

        $response = $this->getJson('/api/agencies?filter[search]=Searchunique')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }
}
```

**Step 2: Run the test — expected FAIL** (`Agency` not Searchable yet).

Run: `php artisan test --filter=AgencySearchTest`

**Step 3: Make `Agency` Searchable**

In `app/Models/Agency.php`:
- Add `use Laravel\Scout\Searchable;`
- Add `Searchable` to the trait list: `use HasFactory, InteractsWithMedia, LemonSqueezyBillable, Searchable, SoftDeletes;`
- Add the methods:

```php
/**
 * TCK-281 — index only id + free-text search fields.
 *
 * @return array<string,mixed>
 */
public function toSearchableArray(): array
{
    return [
        'id' => $this->id,
        'name' => $this->name,
        'email' => $this->email,
        'license_number' => $this->license_number,
    ];
}

public function shouldBeSearchable(): bool
{
    return ! $this->trashed();
}
```

**Step 4: Add the index-settings** in `config/scout.php`:
- Import: `use App\Models\Agency;`
- Entry:

```php
Agency::class => [
    'searchableAttributes' => ['name', 'email', 'license_number'],
    'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
],
```

**Step 5: Run the test — expected PASS.**

Run: `php artisan test --filter=AgencySearchTest`

**Step 6: Fix the existing agency search tests**

`Agency` is now Searchable, so `filter[search]` on `/api/agencies` and `/api/admin/agencies` goes through Meilisearch. The existing tests seed agencies but never index them:

- `tests/Feature/Api/AgencyTest.php` — the test at line ~38 (`filter[search]=Scope`).
- `tests/Feature/Api/Admin/AgencyModerationTest.php` — tests at lines ~55 and ~87 (`filter[search]=Synthese`, `filter[search]=Volume`).

For each class: add `use Tests\Concerns\InteractsWithMeilisearch;` (and the `use InteractsWithMeilisearch;` statement inside the class), then in each affected test method call `$this->indexSearchable(Agency::class);` after the agencies are created and before the `getJson(...filter[search]...)` request.

Run after fixing: `php artisan test --filter=AgencyTest` then `php artisan test --filter=AgencyModerationTest`
Expected: PASS.

**Step 7: Pint + commit**

```bash
./vendor/bin/pint
git add app/Models/Agency.php config/scout.php tests/Feature/Search/AgencySearchTest.php tests/Feature/Api/AgencyTest.php tests/Feature/Api/Admin/AgencyModerationTest.php
git commit -m "$(cat <<'EOF'
feat(api): agency search on Meilisearch (TCK-281)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: User — Searchable (+ fix existing user search tests)

**Files:**
- Test: `tests/Feature/Search/UserSearchTest.php` (create)
- Modify: `app/Models/User.php`
- Modify: `config/scout.php`
- Modify: `tests/Feature/Api/UserAdminTest.php` (existing search test breaks)
- Modify: `tests/Feature/Api/Admin/UserDetailTest.php` (existing search test breaks)

The `/api/users` list requires the caller to be `super_admin` or `agency_admin` of the active agency; it scopes non-super-admins to users holding an agent/owner/agency-admin profile at that agency. Creating a user with `agency_id => X` materialises an `OwnerProfile` at X (the legacy mutator, `app/Models/User.php:210-229`), which the controller scope matches.

**Step 1: Write the test**

Create `tests/Feature/Search/UserSearchTest.php`:

```php
<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

class UserSearchTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_user_search_is_typo_tolerant_for_agency_admin(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        User::factory()->create([
            'agency_id' => $agency->id,
            'first_name' => 'Amadou',
            'last_name' => 'Diallo',
        ]);
        $this->indexSearchable(User::class);

        $this->getJson('/api/users?filter[search]=Amadu')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_user_search_never_leaks_across_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agencyA]);

        User::factory()->create(['agency_id' => $agencyA->id, 'last_name' => 'Crossagencyton']);
        User::factory()->create(['agency_id' => $agencyB->id, 'last_name' => 'Crossagencyton']);
        $this->indexSearchable(User::class);

        $response = $this->getJson('/api/users?filter[search]=Crossagencyton')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_soft_deleted_user_is_not_searchable(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $user = User::factory()->create([
            'agency_id' => $agency->id,
            'last_name' => 'Ghostuserton',
        ]);
        $user->delete();
        $this->indexSearchable(User::class);

        $this->getJson('/api/users?filter[search]=Ghostuserton')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }
}
```

> If `UserAdminController::index()` returns `meta.total`, the assertions above hold. The actor (`agency_admin`) has a random name and will not match the distinctive search terms, so it does not inflate `meta.total`.

**Step 2: Run the test — expected FAIL** (`User` not Searchable yet).

Run: `php artisan test --filter=UserSearchTest`

**Step 3: Make `User` Searchable**

In `app/Models/User.php`:
- Add `use Laravel\Scout\Searchable;`
- Add `Searchable` to the trait list on the class (line ~39): keep it ordered, e.g. `use HasApiTokens, HasFactory, HasProfiles, HasQueryBuilder, InteractsWithMedia, LogsActivity, Notifiable, Searchable, SoftDeletes;`
- Add the methods (e.g. just after `getFullNameAttribute()`):

```php
/**
 * TCK-281 — index only id + free-text search fields. Credentials and 2FA
 * secrets are never indexed.
 *
 * @return array<string,mixed>
 */
public function toSearchableArray(): array
{
    return [
        'id' => $this->id,
        'first_name' => $this->first_name,
        'last_name' => $this->last_name,
        'email' => $this->email,
        'username' => $this->username,
        'phone' => $this->phone,
    ];
}

public function shouldBeSearchable(): bool
{
    return ! $this->trashed();
}
```

**Step 4: Add the index-settings** in `config/scout.php`:
- Import: `use App\Models\User;`
- Entry:

```php
User::class => [
    'searchableAttributes' => ['first_name', 'last_name', 'email', 'username', 'phone'],
    'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
],
```

**Step 5: Run the test — expected PASS.**

Run: `php artisan test --filter=UserSearchTest`

**Step 6: Fix the existing user search tests**

`User` is now Searchable, so `filter[search]` on `/api/users` and `/api/admin/users` goes through Meilisearch:

- `tests/Feature/Api/UserAdminTest.php` — `test_admin_can_search_users_by_name` (line ~40-50): add `use Tests\Concerns\InteractsWithMeilisearch;` + the `use InteractsWithMeilisearch;` statement, then call `$this->indexSearchable(User::class);` after the two `User::factory()->create(...)` calls and before the `getJson('/api/users?filter[search]=Amadou')` request.
- `tests/Feature/Api/Admin/UserDetailTest.php` — the test at line ~30 (`filter[search]=awa.roles@example.test`): same treatment — add the trait and `indexSearchable(User::class)` after the fixtures, before the search request.

Run after fixing: `php artisan test --filter=UserAdminTest` then `php artisan test --filter=UserDetailTest`
Expected: PASS.

**Step 7: Pint + commit**

```bash
./vendor/bin/pint
git add app/Models/User.php config/scout.php tests/Feature/Search/UserSearchTest.php tests/Feature/Api/UserAdminTest.php tests/Feature/Api/Admin/UserDetailTest.php
git commit -m "$(cat <<'EOF'
feat(api): user search on Meilisearch (TCK-281)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Docs, full suite, ticket close-out

**Files:**
- Modify: `docs/configuration.md` (§3.6 — search)
- Modify: `docs/backlog/tickets/TCK-281-search-internal-entities-meilisearch.md` (Notes d'implémentation, status)
- Modify: `docs/backlog/INDEX.md` (Doing → Review)

**Step 1: Document the new searchable models**

In `docs/configuration.md` §3.6, find the first-deploy `scout:import` note (TCK-280 added a `php artisan scout:import "App\Models\Property"` line). Add the four new models so a first deploy / a manual reindex covers them:

```
php artisan scout:import "App\Models\Customer"
php artisan scout:import "App\Models\MaintenanceRequest"
php artisan scout:import "App\Models\Agency"
php artisan scout:import "App\Models\User"
```

Add a one-line note: the `chore/deploy-meilisearch-reindex` branch makes `deploy.sh` auto-detect these (any model defining `toSearchableArray()`); the manual commands above apply only until that branch is merged.

**Step 2: Run the full backend suite on Meilisearch**

Run: `php artisan test`
Expected: PASS — entire suite green. Investigate and fix any remaining test that searches one of the four resources without indexing (same fix: `InteractsWithMeilisearch` + `indexSearchable`).

**Step 3: Walk the acceptance criteria**

Confirm each AC of `TCK-281` is green:
- AC1 — typo-tolerant + relevance: covered by the `*_is_typo_tolerant` tests.
- AC2 — no cross-tenant leak: covered by the `*_never_leaks_across_agencies` / `*_is_bounded_to_visible_agencies` tests.
- AC3 — soft-deleted excluded: covered by the `*_soft_deleted_*_is_not_searchable` tests.
- AC4 — `fields[]` / `include=` / `sort=` / pagination still work: confirmed by the existing per-resource suites staying green (Tasks 2-5 Step 6).
- AC5 — suite green on Meilisearch: Step 2.

**Step 4: Fill the ticket Notes d'implémentation**

In `docs/backlog/tickets/TCK-281-...md`, replace the `_(à remplir par implementing-specs)_` placeholder with the non-obvious decisions only:

- Option B retained: no Scout-side tenant filter. Isolation is the existing `$base ∩ whereIn(idsScout)` intersection; the controller `$base` scopes are OR-disjunctions (`agency_id = X OR added_by_id = me`, …), so there is no single "flat" tenant key to push into Meilisearch. The `take()` cap was raised 1000 → 5000 for recall.
- `models-spec.md #7 Customer` omits the real `customers.agency_id` column — spec gap, to fix in a separate spec PR.
- `User`/`Agency`/`MaintenanceRequest` have no flat `agency_id` (User: dropped at the TCK-142 cutover; Agency: is the tenant; Maintenance: tenant via `property`). Reference the commit SHAs.

Set the frontmatter: `status: review`, `updated: 2026-05-20`.

**Step 5: Update the backlog index**

In `docs/backlog/INDEX.md`, move the `TCK-281` bullet from `## 🚧 Doing` to `## 👀 Review`.

**Step 6: Pint + commit**

```bash
./vendor/bin/pint
git add docs/configuration.md docs/backlog/tickets/TCK-281-search-internal-entities-meilisearch.md docs/backlog/INDEX.md
git commit -m "$(cat <<'EOF'
docs(api): document internal-entity reindex + close TCK-281

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-05-20-internal-search-meilisearch.md`.
Next step: run `.agent/workflows/execute-plan.md` to execute this plan task-by-task in single-flow mode.
