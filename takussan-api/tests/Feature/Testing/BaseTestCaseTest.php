<?php

namespace Tests\Feature\Testing;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\BaseTestCase;

class BaseTestCaseTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_acting_as_role_creates_user_and_assigns_role(): void
    {
        $user = $this->actingAsRole('agent');

        $this->assertNotNull($user->agency_id);
        app(PermissionRegistrar::class)->setPermissionsTeamId($user->agency_id);
        $this->assertTrue($user->hasRole('agent'));
        $this->assertAuthenticatedAs($user);
    }

    public function test_acting_as_role_seeds_roles_lazily(): void
    {
        $this->assertSame(0, Role::query()->count());

        $this->actingAsRole('customer');

        $this->assertGreaterThan(0, Role::query()->count());
    }

    public function test_acting_as_role_accepts_custom_agency(): void
    {
        $user = $this->actingAsRole('customer');
        $agency = Agency::findOrFail($user->agency_id);

        $second = $this->actingAsRole('agent', ['agency' => $agency]);

        $this->assertSame($agency->id, $second->agency_id);
    }

    public function test_acting_as_role_accepts_agency_id_directly(): void
    {
        $user = $this->actingAsRole('customer');

        $second = $this->actingAsRole('agent', ['agency_id' => $user->agency_id]);

        $this->assertSame($user->agency_id, $second->agency_id);
    }

    public function test_acting_as_role_prefers_agency_model_over_agency_id_on_conflict(): void
    {
        $user = $this->actingAsRole('customer');
        $agency = Agency::findOrFail($user->agency_id);

        $second = $this->actingAsRole('agent', [
            'agency' => $agency,
            'agency_id' => $user->agency_id + 9999,
        ]);

        $this->assertSame($agency->id, $second->agency_id);
    }

    public function test_assert_json_structure_paginated_validates_pagination_shape(): void
    {
        Route::get('/_tests/paginated', fn () => [
            'data' => [['id' => 1], ['id' => 2]],
            'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 15, 'total' => 2],
            'links' => ['first' => null, 'last' => null, 'prev' => null, 'next' => null],
        ]);

        $response = $this->getJson('/_tests/paginated');
        $this->assertJsonStructurePaginated($response);
    }

    public function test_assert_json_error_validates_message_and_status(): void
    {
        $response = TestResponse::fromBaseResponse(
            response()->json(['message' => 'Nope'], 403)
        );

        $this->assertJsonError($response, 403);
        $this->assertJsonError($response, 403, 'Nope');
    }
}
