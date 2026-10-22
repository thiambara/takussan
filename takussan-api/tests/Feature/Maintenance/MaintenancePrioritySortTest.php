<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenancePriority;
use App\Models\MaintenanceRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1304 (P134.04) — `sort=priority` des demandes de maintenance trie sur le rang de
 * {@see MaintenancePriority}, dérivé de ses cas : `low` < `normal` < `high` < `urgent`.
 */
class MaintenancePrioritySortTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_demandes_se_trient_par_rang_de_priorite(): void
    {
        foreach ([MaintenancePriority::Normal, MaintenancePriority::Urgent, MaintenancePriority::Low, MaintenancePriority::High] as $priorite) {
            MaintenanceRequest::factory()->create(['priority' => $priorite]);
        }
        $this->actingAsRole('super_admin');

        $lire = fn (string $tri) => collect($this->getJson("/api/maintenance-requests?sort={$tri}")->assertOk()->json('data'))
            ->pluck('priority')
            ->all();

        $this->assertSame(['urgent', 'high', 'normal', 'low'], $lire('-priority'));
        $this->assertSame(['low', 'normal', 'high', 'urgent'], $lire('priority'));
    }

    public function test_le_rang_suit_les_cas_de_l_enum(): void
    {
        $this->assertSame(
            ['low', 'normal', 'high', 'urgent'],
            array_map(fn (MaintenancePriority $p) => $p->value, MaintenancePriority::cases()),
        );
    }

    public function test_des_demandes_de_meme_priorite_se_departagent_dans_le_sens_du_tri(): void
    {
        $demandes = collect(range(1, 3))->map(fn () => MaintenanceRequest::factory()->create(['priority' => MaintenancePriority::Urgent]));
        $demandes->first()->update(['title' => 'Relue']);
        $this->actingAsRole('super_admin');

        $ids = $demandes->pluck('id')->sort()->values()->all();
        $lire = fn (string $tri) => collect($this->getJson("/api/maintenance-requests?sort={$tri}")->assertOk()->json('data'))
            ->pluck('id')
            ->all();

        $this->assertSame(array_reverse($ids), $lire('-priority'));
        $this->assertSame($ids, $lire('priority'));
    }
}
