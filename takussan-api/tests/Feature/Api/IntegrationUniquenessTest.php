<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-640 — une intégration en double se refuse en 422, et une intégration supprimée se remplace.
 *
 * Avant : un second `(stripe, agence)` cassait en 500 sur l'index, un second `(stripe, NULL)` de
 * plateforme passait en silence, et une intégration supprimée en douceur interdisait d'en recréer une.
 */
class IntegrationUniquenessTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_second_integration_of_the_same_provider_for_an_agency_is_a_422(): void
    {
        $this->agencyAdmin();
        $this->store()->assertCreated();

        $this->store()->assertUnprocessable()->assertJsonValidationErrors('provider');
        $this->assertSame(1, Integration::query()->where('provider', 'stripe')->count());
    }

    public function test_a_second_platform_integration_of_the_same_provider_is_a_422(): void
    {
        $admin = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);

        $this->store()->assertCreated()->assertJsonPath('data.agency_id', null);

        $this->store()->assertUnprocessable()->assertJsonValidationErrors('provider');
        $this->assertSame(1, Integration::query()->whereNull('agency_id')->count());
    }

    public function test_a_deleted_integration_can_be_recreated(): void
    {
        $this->agencyAdmin();
        $id = $this->store()->assertCreated()->json('data.id');
        $this->deleteJson("/api/integrations/{$id}")->assertNoContent();

        $this->store()->assertCreated();
    }

    private function agencyAdmin(): User
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->withTwoFactor()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        Sanctum::actingAs($admin);

        return $admin;
    }

    private function store()
    {
        return $this->postJson('/api/integrations', [
            'provider' => 'stripe',
            'credentials' => ['secret_key' => 'sk_test_123'],
        ]);
    }
}
