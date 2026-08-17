<?php

namespace Tests;

use App\Models\User;
use Illuminate\Testing\TestResponse;

/**
 * Base des tests qui frappent une route `/api/*`.
 *
 * Sa raison d'être tient en une ligne : ces routes authentifient par le garde
 * `sanctum`, et `actingAsRole()` seul poserait l'utilisateur sur le garde par
 * défaut — l'appel partirait donc en 401 sans dire pourquoi.
 *
 * TCK-309 — elle étendait `Tests\BaseTestCase`, maillon intermédiaire fondu
 * dans `Tests\TestCase` faute d'usage propre. Voir le docblock de
 * `Tests\TestCase` pour la règle des trois bases.
 */
abstract class ApiTestCase extends TestCase
{
    protected function actingAsApi(User $user): static
    {
        $this->actingAs($user, 'sanctum');

        return $this;
    }

    /**
     * Same as actingAsRole(), but authenticates via the sanctum guard used
     * by `/api/*` routes.
     *
     * @param  array<string,mixed>  $attributes
     */
    protected function apiActingAsRole(string $role, array $attributes = []): User
    {
        return $this->actingAsRole($role, $attributes, 'sanctum');
    }

    /**
     * @param  array<string,mixed>  $headers
     */
    protected function apiGet(string $uri, array $headers = []): TestResponse
    {
        return $this->getJson($uri, $headers);
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  array<string,mixed>  $headers
     */
    protected function apiPost(string $uri, array $data = [], array $headers = []): TestResponse
    {
        return $this->postJson($uri, $data, $headers);
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  array<string,mixed>  $headers
     */
    protected function apiPut(string $uri, array $data = [], array $headers = []): TestResponse
    {
        return $this->putJson($uri, $data, $headers);
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  array<string,mixed>  $headers
     */
    protected function apiPatch(string $uri, array $data = [], array $headers = []): TestResponse
    {
        return $this->patchJson($uri, $data, $headers);
    }

    /**
     * @param  array<string,mixed>  $data
     * @param  array<string,mixed>  $headers
     */
    protected function apiDelete(string $uri, array $data = [], array $headers = []): TestResponse
    {
        return $this->deleteJson($uri, $data, $headers);
    }
}
