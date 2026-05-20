# Property Search on Meilisearch (TCK-280) — Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Migrate the public property search (`GET /api/public/properties/search`) and the dashboard listing's `filter[search]` from raw SQL `LIKE` to Laravel Scout + Meilisearch, with native push-down of filters, facets and geo — keeping the `{data, facets, meta}` JSON contract identical.

**Architecture:** Meilisearch is the single Scout engine on every environment (local, preview, prod **and CI** — no `collection` fallback). The public search delegates from a thin controller to a new `App\Services\Search\PropertySearchService` that issues **one** Meilisearch query via Scout's search callback, reading `hits`, `totalHits` and `facetDistribution` from the raw response. The generic `filter[search]` callback in `HasQueryBuilder` is routed through the existing `withSearch()` scope when the model is `Searchable`.

**Tech Stack:** Laravel 13 · PHP 8.3 · Laravel Scout ^11.1 · meilisearch/meilisearch-php ^1.16 · PHPUnit · GitHub Actions.

**Reference:** ticket `docs/backlog/tickets/TCK-280-search-properties-meilisearch.md`; specs `docs/features.md#12`, `#24`, `docs/models-spec.md#3`.

---

## Key decisions (read before coding)

1. **Single engine.** `phpunit.xml` sets `SCOUT_DRIVER=meilisearch`; CI provisions a Meilisearch service container. No `collection` fallback code. `applySearchFilter` / `orderBySearchRelevance` / `matchingPropertyTypes` / `normalizeSearchTerm` are **deleted** from `PublicPropertyController`.
2. **One round-trip for the public search.** Use `Property::search($q, $callback)->raw()`. The callback sets `filter`, `facets`, `sort`, `page`, `hitsPerPage` and returns `$index->search(...)`. `raw()` returns the Meilisearch `SearchResult` exposing `getHits()`, `getTotalHits()`, `getTotalPages()`, `getFacetDistribution()`. Using `page`+`hitsPerPage` makes Meilisearch return the **exact** `totalHits` (not `estimatedTotalHits`) → correct `meta.total`.
3. **`shouldBeSearchable()` stays unchanged** — drafts / non-public properties are never indexed. The public endpoint adds the `scopePublic` equivalent as a Meilisearch `filter` (defence-in-depth). *Consequence:* the dashboard `filter[search]`, once Scout-aware, only text-matches indexed (public, non-draft) properties — non-public/draft listings are no longer found by free-text search on the dashboard. Recorded as a known limitation; revisit in a follow-up if it matters.
4. **Type aliases.** Meilisearch typo-tolerance covers `appartemnt → appartement`, but not the FR→enum mapping `appartement → type=apartment`. Index a `type_label` searchable field carrying the French alias words so French type terms still match.
5. **Facet conjunctivity preserved.** Today's 3 `GROUP BY` queries count over the fully-filtered set. Meilisearch `facetDistribution` is computed over the result set after `filter` — same behaviour.
6. **No frontend change.** `{data, facets, meta}` stays structurally identical (`facets.locations`, `facets.bedrooms`, `facets.types`).

### Public-visibility filter (mirror of `Property::scopePublic`)

`scopePublic` = `visibility = public` AND `is_test = false` AND `published_at IS NOT NULL` AND status **not in** `[draft, sold, rented, archived, under_maintenance, unavailable, pending_review, rejected]`. The Meilisearch `filter` array must reproduce exactly this.

---

## Task 1: Branch + Meilisearch test infrastructure

**Files:**
- Modify: `takussan-api/phpunit.xml`
- Modify: `.github/workflows/api-ci.yml`
- Create: `takussan-api/tests/Concerns/InteractsWithMeilisearch.php`

**Step 1.1 — Branch.**
```bash
cd /Users/aminethiam/Documents/perso/takussan
git checkout -b feat/tck-280-property-search-meilisearch
```

**Step 1.2 — `phpunit.xml`:** change the pinned Scout driver and add Meilisearch connection defaults so the suite always runs on Meilisearch.
```xml
<env name="SCOUT_DRIVER" value="meilisearch"/>
<env name="SCOUT_QUEUE" value="false"/>
<env name="MEILISEARCH_HOST" value="http://127.0.0.1:7700"/>
<env name="MEILISEARCH_KEY" value="masterKey"/>
```
(Replace the existing `<env name="SCOUT_DRIVER" value="collection"/>` line. `MessageSearchTest` self-pins `collection` in its own `setUp()`, so message/document search tests are unaffected.)

**Step 1.3 — `api-ci.yml`:** add a Meilisearch service container to the `lint-and-test` job, expose it, and sync index settings before the test run.
```yaml
    services:
      meilisearch:
        image: getmeili/meilisearch:v1.16
        env:
          MEILI_MASTER_KEY: masterKey
          MEILI_NO_ANALYTICS: 'true'
          MEILI_ENV: development
        ports:
          - 7700:7700
        options: >-
          --health-cmd "curl -fsS http://localhost:7700/health || exit 1"
          --health-interval 5s --health-timeout 5s --health-retries 10
```
In the `Run tests` step add to `env:`:
```yaml
          SCOUT_DRIVER: meilisearch
          MEILISEARCH_HOST: http://127.0.0.1:7700
          MEILISEARCH_KEY: masterKey
```
Add a step **before** `Run tests`:
```yaml
      - name: Sync Meilisearch index settings
        env:
          SCOUT_DRIVER: meilisearch
          MEILISEARCH_HOST: http://127.0.0.1:7700
          MEILISEARCH_KEY: masterKey
        run: php artisan scout:sync-index-settings
```

**Step 1.4 — `InteractsWithMeilisearch` trait.** A test concern that (a) syncs index settings once per process, (b) flushes the `properties` index before each test, (c) provides `indexProperties()` to bulk-index seeded data and block until Meilisearch finishes.
```php
<?php

namespace Tests\Concerns;

use App\Models\Property;
use Illuminate\Support\Facades\Artisan;
use Meilisearch\Client;
use Meilisearch\Contracts\TasksQuery;

trait InteractsWithMeilisearch
{
    private static bool $settingsSynced = false;

    protected function setUpMeilisearch(): void
    {
        if (! self::$settingsSynced) {
            Artisan::call('scout:sync-index-settings');
            self::$settingsSynced = true;
        }
        Property::removeAllFromSearch();
        $this->waitForMeilisearch();
    }

    /** Bulk-index every currently-seeded property and wait for Meilisearch. */
    protected function indexProperties(): void
    {
        Property::makeAllSearchable();
        $this->waitForMeilisearch();
    }

    /** Block until no Meilisearch task is enqueued or processing (10s cap). */
    protected function waitForMeilisearch(): void
    {
        $client = app(Client::class);
        $deadline = microtime(true) + 10.0;
        do {
            $pending = $client->getTasks(
                (new TasksQuery)->setStatuses(['enqueued', 'processing'])
            )->getResults();
            if ($pending === []) {
                return;
            }
            usleep(50_000);
        } while (microtime(true) < $deadline);
    }
}
```
Call `setUpMeilisearch()` from each search test's `setUp()` (Task 5).

**Step 1.5 — Verify** the workflow file parses: `bash -n` is not applicable to YAML; instead `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/api-ci.yml'))"` → no error.

---

## Task 2: Complete `config/scout.php` index-settings for `Property`

**Files:**
- Modify: `takussan-api/config/scout.php:147-152`

**Step 2.1** — Replace the `Property::class` block under `meilisearch.index-settings` with:
```php
            Property::class => [
                'searchableAttributes' => [
                    'title', 'type_label', 'description',
                    'neighborhood', 'city', 'reference_number',
                ],
                'filterableAttributes' => [
                    'type', 'contract_type', 'rent_period', 'status', 'visibility',
                    'price', 'bedrooms', 'bathrooms', 'area', 'furnished',
                    'floor_number', 'featured', 'is_test', 'agency_id', 'user_id',
                    'available_from', 'published_at', 'city', 'neighborhood',
                    'tags', '_geo',
                ],
                'sortableAttributes' => ['price', 'created_at', 'published_at', 'featured'],
                'rankingRules' => ['sort', 'words', 'typo', 'proximity', 'attribute', 'exactness'],
            ],
```
(`'sort'` stays first in `rankingRules` so an explicit `sort` dominates relevance — AC3. `_geo` in `filterableAttributes` enables `_geoBoundingBox` — AC4.)

**Step 2.2 — Verify:** `php artisan config:show scout.meilisearch.index-settings` lists the new attributes (or `php -l config/scout.php`).

---

## Task 3: `Property` — searchable payload

**Files:**
- Modify: `takussan-api/app/Models/Property.php` (`toSearchableArray`, add `makeAllSearchableUsing`, add a type-alias map)
- Test: `takussan-api/tests/Unit/PropertySearchableArrayTest.php`

**Step 3.1 — Write the failing test** `tests/Unit/PropertySearchableArrayTest.php`:
```php
<?php

namespace Tests\Unit;

use App\Models\Address;
use App\Models\Enums\PropertyType;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertySearchableArrayTest extends TestCase
{
    use RefreshDatabase;

    public function test_searchable_array_flattens_address_and_geo(): void
    {
        $property = Property::factory()->published()->create([
            'type' => PropertyType::Apartment,
            'price' => 250000,
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
            'neighborhood' => 'Almadies',
            'latitude' => 14.7,
            'longitude' => -17.5,
        ]);

        $arr = $property->fresh('address')->toSearchableArray();

        $this->assertSame('Dakar', $arr['city']);
        $this->assertSame('Almadies', $arr['neighborhood']);
        $this->assertSame(['lat' => 14.7, 'lng' => -17.5], $arr['_geo']);
        $this->assertSame(250000.0, $arr['price']);
        $this->assertStringContainsString('appartement', $arr['type_label']);
        $this->assertIsInt($arr['published_at']);
    }

    public function test_searchable_array_omits_geo_when_no_coordinates(): void
    {
        $property = Property::factory()->published()->create();

        $this->assertArrayNotHasKey('_geo', $property->toSearchableArray());
    }
}
```

**Step 3.2 — Run, expect FAIL:** `php artisan test --filter=PropertySearchableArrayTest` → fails on `_geo` / `type_label`.

**Step 3.3 — Implement.** Add a type-alias constant and rewrite `toSearchableArray()`; add `makeAllSearchableUsing()`:
```php
    /** French search aliases per property type — indexed as `type_label`. */
    public const TYPE_SEARCH_ALIASES = [
        'land' => 'terrain', 'house' => 'maison', 'apartment' => 'appartement',
        'villa' => 'villa', 'studio' => 'studio', 'room' => 'chambre',
        'office' => 'bureau', 'shop' => 'boutique magasin commerce',
        'warehouse' => 'entrepot', 'factory' => 'usine', 'farm' => 'ferme',
        'hotel' => 'hotel', 'resort' => 'resort', 'garage' => 'garage',
        'parking' => 'parking', 'other' => 'autre',
    ];

    public function toSearchableArray(): array
    {
        $address = $this->address;

        $data = [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'reference_number' => $this->reference_number,
            'type_label' => self::TYPE_SEARCH_ALIASES[$this->type?->value] ?? '',
            'type' => $this->type?->value,
            'contract_type' => $this->contract_type?->value,
            'rent_period' => $this->rent_period?->value,
            'status' => $this->status?->value,
            'visibility' => $this->visibility?->value,
            'price' => $this->price !== null ? (float) $this->price : null,
            'bedrooms' => $this->bedrooms,
            'bathrooms' => $this->bathrooms,
            'area' => $this->area,
            'furnished' => (bool) $this->furnished,
            'floor_number' => $this->floor_number,
            'featured' => (bool) $this->featured,
            'is_test' => (bool) $this->is_test,
            'agency_id' => $this->agency_id,
            'user_id' => $this->user_id,
            'available_from' => $this->available_from?->timestamp,
            'published_at' => $this->published_at?->timestamp,
            'created_at' => $this->created_at?->timestamp,
            'city' => $address?->city,
            'neighborhood' => $address?->neighborhood,
            'tags' => $this->tags->pluck('name')->all(),
        ];

        if ($address && $address->latitude !== null && $address->longitude !== null) {
            $data['_geo'] = [
                'lat' => (float) $address->latitude,
                'lng' => (float) $address->longitude,
            ];
        }

        return $data;
    }

    /** Eager-load relations needed by toSearchableArray during scout:import. */
    protected function makeAllSearchableUsing($query)
    {
        return $query->with('address', 'tags');
    }
```

**Step 3.4 — Run, expect PASS:** `php artisan test --filter=PropertySearchableArrayTest`.

---

## Task 4: `PropertySearchService` — the Meilisearch query

**Files:**
- Create: `takussan-api/app/Services/Search/PropertySearchService.php`
- Test: `takussan-api/tests/Feature/Search/PropertySearchServiceTest.php`

**Step 4.1 — Write the failing test** covering: text relevance + typo, price range, location, facets, sort, geo bounding box, exact `total`. Each test seeds data then calls `$this->indexProperties()`. Use the `InteractsWithMeilisearch` trait.

Representative cases (full file written during execution):
```php
public function test_typo_tolerant_text_search(): void
{
    Property::factory()->published()->create(['title' => 'Bel appartement neuf']);
    Property::factory()->published()->create(['title' => 'Villa avec piscine']);
    $this->indexProperties();

    $result = app(PropertySearchService::class)->search(['q' => 'appartemnt']);

    $this->assertSame(1, $result['meta']['total']);
    $this->assertStringContainsString('appartement', $result['data'][0]['title']);
}

public function test_price_range_and_total_are_exact(): void
{
    Property::factory()->count(3)->published()->create(['price' => 100000]);
    Property::factory()->count(2)->published()->create(['price' => 900000]);
    $this->indexProperties();

    $result = app(PropertySearchService::class)->search(['price_max' => 500000, 'per_page' => 2]);

    $this->assertSame(3, $result['meta']['total']);     // exact, not estimated
    $this->assertSame(2, $result['meta']['last_page']);
    $this->assertCount(2, $result['data']);
}
```
(Also: `test_facets_reflect_filtered_set`, `test_sort_price_asc_dominates_relevance`, `test_geo_bounding_box_excludes_outside`, `test_draft_never_returned`.)

**Step 4.2 — Run, expect FAIL** (class missing): `php artisan test --filter=PropertySearchServiceTest`.

**Step 4.3 — Implement `PropertySearchService`.** Public method `search(array $params): array` returning `['data' => [...], 'facets' => [...], 'meta' => [...]]`.

Responsibilities:
- **Filter array** (Meilisearch array syntax — outer = AND, inner = OR):
  - Always: `visibility = 'public'`, `is_test = false`, `published_at IS NOT NULL`,
    `status NOT IN ['draft','sold','rented','archived','under_maintenance','unavailable','pending_review','rejected']`.
  - `q`/`search` → passed as the Meilisearch query string, not a filter.
  - `location` → `neighborhood = '<value>'`; `city` → `city = '<value>'`.
  - `price_min`/`price_max` → `price >= n` / `price <= n`.
  - `bedrooms`, `bathrooms`, `floor_number` → `field = n`.
  - `type` (comma list) → `["type = 'a'", "type = 'b'"]` inner-OR array.
  - `contract_type`, `rent_period` → `field = '<value>'`.
  - `furnished` → `furnished = true|false`.
  - `tags` (comma list) → inner-OR array of `tags = '<tag>'`.
  - `available_from` → inner-OR `["available_from IS NULL", "available_from <= <ts>"]`.
  - geo: when `lat_min/lat_max/lng_min/lng_max` all present →
    `_geoBoundingBox([latMax, lngMax], [latMin, lngMin])` (Meilisearch wants `[topRightLat,topRightLng],[bottomLeftLat,bottomLeftLng]`).
  - All string values escaped: wrap in single quotes, escape embedded quotes.
- **Sort:** `price_asc → ['price:asc']`, `price_desc → ['price:desc']`, `created_desc → ['created_at:desc']`, `relevance` with no term → `['featured:desc','published_at:desc']`, `relevance` with a term → no `sort` (engine relevance).
- **Query:**
```php
$page = max(1, (int) ($params['page'] ?? 1));
$perPage = min(100, max(1, (int) ($params['per_page'] ?? 20)));

$result = Property::search($term, function ($index, string $query, array $options)
    use ($filter, $sort, $page, $perPage) {
    $options['filter'] = $filter;
    $options['facets'] = ['neighborhood', 'bedrooms', 'type'];
    if ($sort !== []) {
        $options['sort'] = $sort;
    }
    $options['page'] = $page;
    $options['hitsPerPage'] = $perPage;

    return $index->search($query, $options);
})->raw();
```
- **Hydrate** `data`: `$ids = collect($result->getHits())->pluck('id')`; load `Property::with('address','media')->whereIn('id',$ids)->get()`, re-order by `$ids`, render `PropertyResource::collection(...)->resolve()`.
- **Facets:** map `getFacetDistribution()` → `['locations' => $fd['neighborhood'] ?? [], 'bedrooms' => $fd['bedrooms'] ?? [], 'types' => $fd['type'] ?? []]`.
- **Meta:** `['current_page' => $page, 'last_page' => max(1,$result->getTotalPages()), 'per_page' => $perPage, 'total' => $result->getTotalHits()]`.

**Step 4.4 — Run, expect PASS:** `php artisan test --filter=PropertySearchServiceTest`.

---

## Task 5: Wire `PublicPropertyController::search` to the service

**Files:**
- Modify: `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:86-345`
- Modify: `takussan-api/tests/Feature/Public/PropertySearchTest.php`
- Modify: `takussan-api/tests/Feature/PublicPropertySearchFiltersTest.php`

**Step 5.1 — Adapt the existing search tests.** Both classes must `use InteractsWithMeilisearch`, call `setUpMeilisearch()` in `setUp()`, and call `$this->indexProperties()` after seeding (before hitting the endpoint). `PropertySearchTest::test_search_alias_prioritizes_matching_property_types` asserts a brittle exact ordering from the old scorer — rewrite it to assert that searching `appartement` returns the apartment-typed property and that a typo (`appartemnt`) also matches, without asserting tie-break order between type-match and title-only-match.

**Step 5.2 — Run, expect FAIL** (tests now require indexing / new behaviour).

**Step 5.3 — Implement.** Replace `search()` body: keep the existing `$request->validate([...])`, then:
```php
public function search(Request $request, PropertySearchService $service): array
{
    $validated = $request->validate([ /* unchanged ruleset */ ]);

    return $service->search($validated);
}
```
Delete `applySearchFilter`, `orderBySearchRelevance`, `matchingPropertyTypes`, `normalizeSearchTerm` and the now-unused imports (`Builder`, `DB` if unused elsewhere — check `map()`/`reviews()` still need `DB`). Keep `index()`, `compare()`, `byIds()`, `map()`, `show()`, etc. untouched.

**Step 5.4 — Run, expect PASS:** `php artisan test --filter=PropertySearchTest` and `--filter=PublicPropertySearchFiltersTest`.

---

## Task 6: `HasQueryBuilder` `filter[search]` → Scout-aware

**Files:**
- Modify: `takussan-api/app/Models/Concerns/HasQueryBuilder.php:108-118`
- Test: `takussan-api/tests/Feature/PropertyDashboardSearchTest.php`

**Step 6.1 — Write the failing test:** an agency user hits `GET /api/properties?filter[search]=<term>`; assert (a) a typo still matches an indexed property, (b) a property from another agency is **not** returned (AC5 — cross-tenant isolation holds because the base query is agency-scoped and Scout ids are intersected via `whereIn`).

**Step 6.2 — Run, expect FAIL.**

**Step 6.3 — Implement.** In `getAllowedQueryFilters()` replace the `search` callback body:
```php
$search[] = AllowedFilter::callback('search', function (Builder $q, string $value) use ($fields) {
    if ($q->getModel()::isSearchable()) {
        $q->withSearch($value);   // BaseModelTrait scope: Scout ids → whereIn

        return;
    }

    $q->where(function (Builder $inner) use ($fields, $value) {
        foreach ($fields as $field) {
            $inner->orWhere($field, 'like', '%'.$value.'%');
        }
    });
});
```
Non-`Searchable` models keep the `LIKE` path. `withSearch()` already caps at 1000 ids and short-circuits empty results — TCK-281 will push `agency_id` into the Scout call itself.

**Step 6.4 — Run, expect PASS:** `php artisan test --filter=PropertyDashboardSearchTest`.

---

## Task 7: Docs, full verification, ticket close-out

**Files:**
- Modify: `takussan-api/config/scout.php` doc comment OR `docs/configuration.md` — note `php artisan scout:import "App\Models\Property"` for first deploy.
- Modify: `docs/backlog/tickets/TCK-280-search-properties-meilisearch.md` (Notes d'implémentation, status).
- Modify: `docs/backlog/INDEX.md` (Doing → Review).

**Step 7.1 — Document first-deploy import.** Add to the deploy notes / `docs/configuration.md §3.6`: after the first deploy that switches `SCOUT_DRIVER=meilisearch`, run once on the server: `php artisan scout:import "App\Models\Property"`. (`scout:sync-index-settings` is already handled per-deploy by the `deploy.sh` plan.)

**Step 7.2 — Run Pint:** `./vendor/bin/pint` (mandatory before any backend commit).

**Step 7.3 — Full backend suite:** `php artisan test` — all green on Meilisearch. Investigate any unrelated test that creates `Property` and now depends on indexing; most non-search tests are unaffected (they never call the search endpoint), but watch for ordering/count assumptions.

**Step 7.4 — Walk the ACs** (AC1–AC7 of TCK-280); confirm each green.

**Step 7.5 — Close out.** Fill TCK-280 "Notes d'implémentation" with the non-obvious decisions (single-engine, `raw()` one-shot facets, dashboard-search index-coverage limitation from decision #3). Set `status: review`. Move the ticket from 🚧 Doing to 👀 Review in `INDEX.md`. Report to the user — do **not** push or open a PR unless asked.

---

## Risks / watch-list

- **Index-settings drift:** `filter` / `facets` / `sort` on an attribute missing from `filterableAttributes`/`sortableAttributes` → Meilisearch 4xx. `scout:sync-index-settings` must run before any search (handled in Task 1 CI step + test trait).
- **Indexing latency in tests:** every search test must `indexProperties()` (waits for tasks) after seeding; `setUpMeilisearch()` flushes between tests so `RefreshDatabase` rollback doesn't leave stale docs.
- **Suite-wide blast radius:** with the `collection` pin removed, any test creating a `Property` now talks to Meilisearch. Non-search tests stay correct (they don't query the index) but pay a small indexing cost; if a test is flaky, wrap its seeding in `Property::withoutSyncingToSearch(fn () => ...)`.
- **`raw()` return type:** with a search callback, `raw()` returns whatever the callback returns — a `Meilisearch\Search\SearchResult`. Use its getters; do not assume an array.
