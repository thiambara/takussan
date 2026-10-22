<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P119.04 (TCK-1275) — les délégations de rôle déclarent leur tri (`sort=created_at`, un `sort=`
 * inconnu rend 400 au lieu d'être ignoré en retirant l'ordre par défaut), et les biens d'une
 * agence dans la console sortent du plus récent au plus ancien, départagés par `id`.
 */
class TrisDeclaresDeLAngle119Test extends TestCase
{
    use RefreshDatabase;

    public function test_les_delegations_se_trient_par_created_at_et_refusent_un_tri_inconnu(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        $admin->update(['agency_id' => $agency->id]);
        $attributs = ['delegator_id' => $admin->id, 'agency_id' => $agency->id, 'role' => 'agency_admin'];

        // Écrite d'abord, mais la plus récente : l'ordre physique contredit l'ordre demandé.
        $recente = RoleDelegation::factory()->create([...$attributs, 'user_id' => User::factory()->create()->id, 'created_at' => '2026-10-20 10:00:00']);
        $ancienne = RoleDelegation::factory()->create([...$attributs, 'user_id' => User::factory()->create()->id, 'created_at' => '2026-10-01 10:00:00']);

        $this->actingAs($admin);

        $ids = collect($this->getJson("/api/agencies/{$agency->id}/role-delegations?sort=created_at")
            ->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$ancienne->id, $recente->id], $ids);

        $this->getJson("/api/agencies/{$agency->id}/role-delegations?sort=user_id")->assertStatus(400);
    }

    public function test_les_biens_d_une_agence_sortent_du_plus_recent_departages_par_id(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();

        $ancien = Property::factory()->create(['agency_id' => $agency->id, 'created_at' => '2026-10-01 10:00:00']);
        $jumeauA = Property::factory()->create(['agency_id' => $agency->id, 'created_at' => '2026-10-20 10:00:00']);
        $jumeauB = Property::factory()->create(['agency_id' => $agency->id, 'created_at' => '2026-10-20 10:00:00']);

        $ids = collect($this->getJson("/api/admin/agencies/{$agency->id}/properties?fields[properties]=id,created_at")
            ->assertOk()->json('data'))->pluck('id')->all();

        $this->assertSame([$jumeauB->id, $jumeauA->id, $ancien->id], $ids);
    }
}
