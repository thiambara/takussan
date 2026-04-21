<?php

namespace Tests;

use App\Models\User;
use Illuminate\Testing\TestResponse;

abstract class ApiTestCase extends BaseTestCase
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
