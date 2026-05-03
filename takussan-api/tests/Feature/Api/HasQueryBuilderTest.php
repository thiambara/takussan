<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\UserStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Spatie\QueryBuilder\Exceptions\InvalidFilterQuery;
use Spatie\QueryBuilder\Exceptions\InvalidIncludeQuery;
use Spatie\QueryBuilder\Exceptions\InvalidSortQuery;
use Tests\TestCase;

class HasQueryBuilderTest extends TestCase
{
    use RefreshDatabase;

    public function test_whitelisted_exact_filter_applies(): void
    {
        // TCK-142 — `users.agency_id` was dropped; we exercise the same
        // mechanism on a different whitelisted column (`status`).
        User::factory()->count(2)->create(['status' => UserStatus::Active]);
        User::factory()->count(3)->create(['status' => UserStatus::Inactive]);

        $request = Request::create('/', 'GET', ['filter' => ['status' => UserStatus::Active->value]]);

        $this->assertSame(2, User::buildQuery(request: $request)->count());
    }

    public function test_search_filter_matches_any_declared_search_field(): void
    {
        User::factory()->create(['first_name' => 'Aminata', 'email' => 'aminata@example.com']);
        User::factory()->create(['first_name' => 'Moussa', 'email' => 'moussa@example.com']);

        $request = Request::create('/', 'GET', ['filter' => ['search' => 'aminat']]);

        $this->assertSame(1, User::buildQuery(request: $request)->count());
    }

    public function test_non_whitelisted_filter_raises_invalid_filter_query(): void
    {
        $agency = Agency::factory()->create();
        User::factory()->create([
            'agency_id' => $agency->id,
            'status' => UserStatus::Active,
        ]);

        $request = Request::create('/', 'GET', ['filter' => ['password' => 'anything']]);

        $this->expectException(InvalidFilterQuery::class);
        User::buildQuery(request: $request)->get();
    }

    public function test_whitelisted_sort_applies(): void
    {
        $older = User::factory()->create(['first_name' => 'Abdou']);
        $newer = User::factory()->create(['first_name' => 'Zara']);

        $request = Request::create('/', 'GET', ['sort' => '-first_name']);

        $ids = User::buildQuery(request: $request)->pluck('id')->all();

        $this->assertSame($newer->id, $ids[0]);
        $this->assertSame($older->id, $ids[1]);
    }

    public function test_non_whitelisted_sort_raises_invalid_sort_query(): void
    {
        User::factory()->create();

        $request = Request::create('/', 'GET', ['sort' => 'password']);

        $this->expectException(InvalidSortQuery::class);
        User::buildQuery(request: $request)->get();
    }

    public function test_whitelisted_include_loads_relation(): void
    {
        // TCK-142 — User no longer carries an `agency` relation directly;
        // the User model declares no whitelisted includes. Asking for any
        // include must now raise InvalidIncludeQuery instead of silently
        // loading something.
        User::factory()->create();

        $request = Request::create('/', 'GET', ['include' => 'agency']);

        $this->expectException(InvalidIncludeQuery::class);
        User::buildQuery(request: $request)->get();
    }

    public function test_sparse_fields_limit_returned_columns(): void
    {
        $user = User::factory()->create(['first_name' => 'Yaya', 'last_name' => 'Diop']);

        $request = Request::create('/', 'GET', [
            'fields' => ['users' => 'id,first_name'],
        ]);

        $result = User::buildQuery(request: $request)->first();

        $this->assertSame($user->id, $result->id);
        $this->assertSame('Yaya', $result->first_name);
        // last_name should not have been loaded.
        $this->assertNull($result->getAttributes()['last_name'] ?? null);
    }
}
