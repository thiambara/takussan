<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * P119.03 (TCK-1273) — un identifiant d'agence ou une date illisibles ne rendent plus 500
 * (`SQLSTATE[22P02]`, `[22007]`) : 400 `filter.identifier_invalid` comme `ExactIdentifierFilter`,
 * 422 comme la règle `date` des requêtes d'export.
 */
class FiltresMalFormesDeLaConsoleTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_un_identifiant_d_agence_non_numerique_rend_400(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/users?filter[agency_id]=abc')
            ->assertStatus(400)->assertJsonPath('code', 'filter.identifier_invalid');
    }

    public function test_une_date_illisible_sur_l_activite_d_un_compte_rend_422(): void
    {
        $cible = User::factory()->create();
        $this->apiActingAsRole('super_admin');

        $this->apiGet("/api/admin/users/{$cible->id}/activity?filter[date_from]=nawak")
            ->assertStatus(422)->assertJsonValidationErrors('filter.date_from');
    }

    public function test_une_date_illisible_sur_l_audit_de_la_console_rend_422(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/audit?filter[date_to]=nawak')
            ->assertStatus(422)->assertJsonValidationErrors('filter.date_to');
        $this->apiGet('/api/admin/audit?filter[date_to]=2026-10-22,2026-10-23')
            ->assertStatus(422)->assertJsonValidationErrors('filter.date_to');
    }
}
