<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-1105 (P92.04) — `agencies.license_number` est unique sur toutes les lignes, supprimées
 * comprises. Un numéro déjà porté se refuse en 422 sur `license_number` à la modification, au lieu
 * du 500 de la contrainte. La création par `POST /api/agencies` est retirée (TCK-2311, P225.06) :
 * ses deux cas sont partis avec elle, et la console ne reçoit pas de numéro d'agrément.
 */
class AgencyLicenseNumberUniqueTest extends ApiTestCase
{
    use RefreshDatabase;

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
