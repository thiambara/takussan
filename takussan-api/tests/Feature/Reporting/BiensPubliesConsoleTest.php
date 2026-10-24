<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use App\Services\Reporting\PlatformMetricsSnapshotter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P167.07 (TCK-2087) — « Biens publiés » de la console plateforme compte le prédicat du catalogue
 * (`Property::public()`, TCK-1115), et non le seul `status = published` : la tuile, l'instantané
 * et la liste que la tuile ouvre (`filter[public]=1`, TCK-2036) disent le même nombre.
 */
class BiensPubliesConsoleTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_tuile_l_instantane_et_la_liste_comptent_la_regle_du_catalogue(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $bien = fn (array $attrs) => Property::factory()->create($attrs + [
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'is_test' => false,
            'published_at' => now()->subDay(),
        ]);
        $disponible = $bien([]);
        $disponibleBis = $bien([]);
        $publie = $bien(['status' => PropertyStatus::Published]);
        // Témoins : loué resté public, publié mais privé, bien de test, jamais mis en ligne.
        $bien(['status' => PropertyStatus::Rented]);
        $bien(['status' => PropertyStatus::Published, 'visibility' => PropertyVisibility::Private]);
        $bien(['is_test' => true]);
        $bien(['published_at' => null]);

        $this->assertSame(3, app(PlatformMetricsSnapshotter::class)->stocks(now())['properties_published']);

        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/system/metrics')
            ->assertOk()
            ->assertJsonPath('data.properties.published', 3);

        $ids = collect($this->getJson('/api/properties?filter[public]=1&fields[properties]=id&per_page=50')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->json('data'))->pluck('id')->sort()->values()->all();
        $this->assertSame(collect([$disponible->id, $disponibleBis->id, $publie->id])->sort()->values()->all(), $ids);
    }
}
