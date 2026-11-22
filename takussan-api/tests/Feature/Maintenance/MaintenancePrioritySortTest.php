<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenancePriority;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Sorts\MaintenancePrioritySort;
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

    /**
     * Relevé de back-3 (2026-11-13, démo) — le tri PAR DÉFAUT (`-priority`, sans `sort=`) passait par
     * `AllowedSort::field()` de spatie, pas par {@see MaintenancePrioritySort} : la priorité
     * se triait comme du TEXTE, `urgent`, `normal`, `low`, `high`. Les deux listes (toutes les demandes,
     * celles d'un bien) trient désormais sur le rang, puis du plus récent au plus ancien.
     */
    public function test_sans_tri_les_demandes_viennent_par_rang_de_priorite_puis_les_plus_recentes(): void
    {
        $bien = Property::factory()->create();
        $creer = fn (MaintenancePriority $p, string $quand) => MaintenanceRequest::factory()->create([
            'property_id' => $bien->id, 'priority' => $p, 'created_at' => $quand,
        ]);
        $creer(MaintenancePriority::High, '2026-11-01 08:00:00');
        $creer(MaintenancePriority::Low, '2026-11-02 08:00:00');
        $creer(MaintenancePriority::Normal, '2026-11-03 08:00:00');
        $creer(MaintenancePriority::Urgent, '2026-11-04 08:00:00');
        $recente = $creer(MaintenancePriority::High, '2026-11-05 08:00:00');
        $this->actingAsRole('super_admin');

        foreach (['/api/maintenance-requests', "/api/properties/{$bien->id}/maintenance-requests"] as $liste) {
            $lignes = collect($this->getJson($liste)->assertOk()->json('data'));

            $this->assertSame(['urgent', 'high', 'high', 'normal', 'low'], $lignes->pluck('priority')->all(), $liste);
            $this->assertSame($recente->id, $lignes[1]['id'], "{$liste} : à priorité égale, la plus récente d'abord.");
        }
    }
}
