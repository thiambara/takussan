<?php

namespace Tests\Feature\Api;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Tests\TestCase;

class ApiErrorFormatTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_api_request_returns_json_401(): void
    {
        // Plain get() — no Accept header. Middleware must still force JSON.
        $response = $this->get('/api/auth/me');

        $response->assertStatus(401)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure(['message']);
    }

    public function test_unknown_api_route_returns_json_404(): void
    {
        $response = $this->get('/api/this-route-does-not-exist');

        $response->assertStatus(404)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure(['message']);
    }

    public function test_validation_failure_returns_json_422_with_errors(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email' => 'not-an-email',
            'password' => '',
        ]);

        $response->assertStatus(422)
            ->assertJsonStructure(['message', 'errors' => ['email', 'password']]);
    }

    public function test_forbidden_http_exception_returns_json_403(): void
    {
        Route::middleware('api')->get('/api/_test/forbidden', function () {
            throw new AccessDeniedHttpException('Forbidden resource');
        });

        $response = $this->get('/api/_test/forbidden');

        $response->assertStatus(403)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonPath('message', 'Forbidden resource');
    }

    public function test_method_not_allowed_returns_json_405(): void
    {
        // /api/auth/login only accepts POST — hitting GET triggers 405.
        $response = $this->get('/api/auth/login');

        $response->assertStatus(405)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure(['message']);
    }
}
