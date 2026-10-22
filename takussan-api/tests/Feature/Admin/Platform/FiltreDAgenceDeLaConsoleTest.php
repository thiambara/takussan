<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * P119.01 (TCK-1269) — `filter[agency_id]` de `GET /api/admin/users` passe par la portée commune
 * `User::membreDe()` : l'administrateur d'agence sans profil d'agent ni de bailleur y figure,
 * comme dans `/members` et dans l'équipe de la console (TCK-1244).
 */
class FiltreDAgenceDeLaConsoleTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    public function test_le_filtre_d_agence_rend_l_administrateur_seul(): void
    {
        $agence = Agency::factory()->create();
        $autre = Agency::factory()->create();

        $admin = User::factory()->create(['first_name' => 'AdminSeul']);
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agence->id]);
        $agent = User::factory()->create(['first_name' => 'Agent']);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);
        $ailleurs = User::factory()->create(['first_name' => 'Ailleurs']);
        AgentProfile::factory()->create(['user_id' => $ailleurs->id, 'agency_id' => $autre->id]);

        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $ids = collect($this->getJson("/api/admin/users?filter[agency_id]={$agence->id}&per_page=100")
            ->assertOk()->json('data'))->pluck('id')->sort()->values()->all();

        $this->assertSame(collect([$admin->id, $agent->id])->sort()->values()->all(), $ids);
    }
}
