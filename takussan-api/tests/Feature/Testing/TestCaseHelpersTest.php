<?php

namespace Tests\Feature\Testing;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TestCaseHelpersTest extends TestCase
{
    use RefreshDatabase;

    public function test_acting_as_role_creates_user_and_assigns_role(): void
    {
        $user = $this->actingAsRole('agent');

        $this->assertNotNull($user->agency_id);
        $this->assertTrue($user->isAgentAt((int) $user->agency_id));
        $this->assertAuthenticatedAs($user);
    }

    public function test_acting_as_role_materializes_owner_profile_for_customer(): void
    {
        // TCK-278 — l'ancien test `seeds_roles_lazily` reposait sur le seeder
        // spatie. Désormais `customer` est un rôle dérivé sans profil
        // polymorphe (cf. Règle 5) — on vérifie juste que `actingAsRole` ne
        // panique pas et n'attache pas de profil agence-scopé.
        $user = $this->actingAsRole('customer');

        $this->assertNull($user->agency_id);
    }

    public function test_acting_as_role_accepts_custom_agency(): void
    {
        // TCK-278 — `customer` is a derived role with no implicit agency
        // (cf. Règle 5). Use `agent` here since the test only cares about
        // agency-reuse semantics, not the role itself.
        $user = $this->actingAsRole('agent');
        $agency = Agency::findOrFail($user->agency_id);

        $second = $this->actingAsRole('agent', ['agency' => $agency]);

        $this->assertSame($agency->id, $second->agency_id);
    }

    public function test_acting_as_role_accepts_agency_id_directly(): void
    {
        $user = $this->actingAsRole('agent');

        $second = $this->actingAsRole('agent', ['agency_id' => $user->agency_id]);

        $this->assertSame($user->agency_id, $second->agency_id);
    }

    public function test_acting_as_role_prefers_agency_model_over_agency_id_on_conflict(): void
    {
        // TCK-278 — `customer` is a derived role with no implicit agency
        // (cf. Règle 5). Use `agent` here since the test only cares about
        // agency-reuse semantics, not the role itself.
        $user = $this->actingAsRole('agent');
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
