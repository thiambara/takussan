<?php

namespace Tests\Feature\Api;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use RuntimeException;
use Spatie\QueryBuilder\Exceptions\InvalidFilterQuery;
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

    public function test_invalid_filter_query_returns_json_400(): void
    {
        // Spatie's InvalidFilterQuery extends Symfony HttpException — render
        // callback must transform it into a 400 JSON response.
        Route::middleware('api')->get('/api/_test/invalid-filter', function () {
            throw InvalidFilterQuery::filtersNotAllowed(
                collect(['unknown_field']),
                collect(['allowed_field']),
            );
        });

        $response = $this->get('/api/_test/invalid-filter');

        $response->assertStatus(400)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure(['message']);
    }

    public function test_unhandled_throwable_returns_json_500(): void
    {
        Route::middleware('api')->get('/api/_test/boom', function () {
            throw new RuntimeException('Unhandled failure');
        });

        // Force non-debug so the default handler returns the canonical 5xx
        // JSON shape instead of a debug trace.
        config(['app.debug' => false]);

        $response = $this->get('/api/_test/boom');

        $response->assertStatus(500)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure(['message']);
    }
}
