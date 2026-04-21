<?php

namespace Tests\Feature\Testing;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\ApiTestCase;

class ApiTestCaseTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_api_get_sends_json_accept_header(): void
    {
        Route::get('/_tests/api-json', fn () => ['ok' => true]);

        $response = $this->apiGet('/_tests/api-json');

        $response->assertOk()->assertJson(['ok' => true]);
        $this->assertStringContainsString('application/json', $response->headers->get('content-type'));
    }

    public function test_api_post_sends_json_body(): void
    {
        Route::post('/_tests/echo', fn (Request $r) => $r->all());

        $response = $this->apiPost('/_tests/echo', ['hello' => 'world']);

        $response->assertOk()->assertJson(['hello' => 'world']);
    }

    public function test_api_put_and_patch_and_delete_send_json(): void
    {
        Route::put('/_tests/res', fn () => ['verb' => 'PUT']);
        Route::patch('/_tests/res', fn () => ['verb' => 'PATCH']);
        Route::delete('/_tests/res', fn () => ['verb' => 'DELETE']);

        $this->apiPut('/_tests/res')->assertOk()->assertJson(['verb' => 'PUT']);
        $this->apiPatch('/_tests/res')->assertOk()->assertJson(['verb' => 'PATCH']);
        $this->apiDelete('/_tests/res')->assertOk()->assertJson(['verb' => 'DELETE']);
    }

    public function test_api_acting_as_role_authenticates_sanctum_guard(): void
    {
        Route::middleware('auth:sanctum')->get('/_tests/me', fn (Request $r) => [
            'id' => $r->user()->id,
        ]);

        $user = $this->apiActingAsRole('agent');

        $this->apiGet('/_tests/me')
            ->assertOk()
            ->assertJson(['id' => $user->id]);
    }

    public function test_api_get_without_auth_returns_json_401(): void
    {
        Route::middleware('auth:sanctum')->get('/_tests/private', fn () => ['ok' => true]);

        $response = $this->apiGet('/_tests/private');

        $this->assertJsonError($response, 401);
    }
}
