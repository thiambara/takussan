<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-1105 (P92.04) — `agencies.license_number` est unique sur toutes les lignes, supprimées
 * comprises. Un numéro déjà porté se refuse en 422 sur `license_number`, à la création comme à la
 * modification, au lieu du 500 de la contrainte. Le numéro d'une agence supprimée n'est pas libéré.
 */
class AgencyLicenseNumberUniqueTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_creer_avec_le_numero_d_une_agence_vivante_rend_422(): void
    {
        Agency::factory()->create(['license_number' => 'AGR-2026-001']);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/agencies', ['name' => 'Nouvelle', 'license_number' => 'AGR-2026-001'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('license_number');
    }

    public function test_creer_avec_le_numero_d_une_agence_supprimee_rend_422(): void
    {
        Agency::factory()->create(['license_number' => 'AGR-2026-002'])->delete();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/agencies', ['name' => 'Nouvelle', 'license_number' => 'AGR-2026-002'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('license_number');

        // Témoin : un numéro libre passe.
        $this->postJson('/api/agencies', ['name' => 'Nouvelle', 'license_number' => 'AGR-2026-003'])
            ->assertCreated();
    }

    public function test_modifier_vers_un_numero_pris_rend_422(): void
    {
        Agency::factory()->create(['license_number' => 'AGR-2026-004']);
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id, 'license_number' => 'AGR-2026-005']);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['license_number' => 'AGR-2026-004'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('license_number');

        // Témoin : renvoyer son propre numéro n'est pas un doublon.
        $this->patchJson("/api/agencies/{$agency->id}", ['license_number' => 'AGR-2026-005', 'name' => 'Renommée'])
            ->assertOk();
    }
}
