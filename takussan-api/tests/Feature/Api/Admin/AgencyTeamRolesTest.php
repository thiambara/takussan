<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1780 (P176.01) — l'onglet Équipe d'une agence, dans la console, rend les rôles tenus DANS
 * cette agence : `GET /api/admin/agencies/{A}/team` ne nomme pas `agency_admin` pour un agent de A
 * qui administre B, ni `owner` pour qui n'est bailleur qu'ailleurs.
 *
 * Avant : le préchargement des profils n'était pas borné à l'agence, et `profileTypes()` empilait
 * ceux de toutes les agences du compte (`["agency_admin","agent","customer"]`).
 */
class AgencyTeamRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_roles_d_un_membre_sont_ceux_qu_il_tient_dans_l_agence_lue(): void
    {
        $this->actingAsRole('super_admin');
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();

        $membre = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $membre->id, 'agency_id' => $a->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $membre->id, 'agency_id' => $b->id]);
        OwnerProfile::factory()->create(['user_id' => $membre->id, 'agency_id' => $b->id]);

        $lignes = collect($this->getJson("/api/admin/agencies/{$a->id}/team?per_page=100")->assertOk()->json('data'))
            ->keyBy('id');
        $this->assertSame(['agent', 'customer'], $lignes[$membre->id]['roles']);

        $lignesB = collect($this->getJson("/api/admin/agencies/{$b->id}/team?per_page=100")->assertOk()->json('data'))
            ->keyBy('id');
        $this->assertSame(['agency_admin', 'owner', 'customer'], $lignesB[$membre->id]['roles']);
    }
}
