<?php

namespace Tests\Feature\Testing;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\ExpectationFailedException;
use Tests\TestCase;

class TestCaseHelpersTest extends TestCase
{
    use RefreshDatabase;

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
            'meta' => ['total' => 2, 'per_page' => 15, 'current_page' => 1, 'last_page' => 1],
        ]);

        $response = $this->getJson('/_tests/paginated');
        $this->assertJsonStructurePaginated($response);
    }

    /**
     * TCK-304 — l'helper doit ROUGIR sur une enveloppe amputée. Sans ce test, sa version
     * précédente (qui exigeait `links`, absent de 51 endpoints sur 57) restait verte parce
     * qu'aucun test ne l'appelait : une assertion que personne n'appelle n'assère rien.
     */
    public function test_assert_json_structure_paginated_rejects_a_truncated_envelope(): void
    {
        Route::get('/_tests/paginated-truncated', fn () => [
            'data' => [['id' => 1]],
            'meta' => ['total' => 1, 'current_page' => 1],   // ni per_page ni last_page
        ]);

        $response = $this->getJson('/_tests/paginated-truncated');

        $this->expectException(ExpectationFailedException::class);
        $this->assertJsonStructurePaginated($response);
    }

    /**
     * TCK-304 — et sur une clé présente mais nulle, que l'ancienne version acceptait.
     */
    public function test_assert_json_structure_paginated_rejects_a_null_pagination_value(): void
    {
        Route::get('/_tests/paginated-null', fn () => [
            'data' => [],
            'meta' => ['total' => 0, 'per_page' => 15, 'current_page' => 1, 'last_page' => null],
        ]);

        $response = $this->getJson('/_tests/paginated-null');

        $this->expectException(ExpectationFailedException::class);
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
