<?php

namespace Tests\Feature\Boost;

use App\Models\Enums\ContractType;
use App\Models\Property;
use App\Services\Admin\PlatformSettingService;
use App\Services\Search\PropertySearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §7, AC13) — en PREMIÈRE page seulement, les X premières places vont aux
 * vedettes qui satisfont la recherche, dans l'ordre organique ; elles comptent dans `total` et ne
 * reparaissent pas plus bas, ni dans les pages suivantes. X = 0 est inerte.
 *
 * Corpus (ordre `ranked_at` décroissant) : o1, o2, f1, o3, o4, f2, o5, o6, f3 — f = vedette.
 */
class ReservedTopResultsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var array<string, int> */
    private array $id = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        $corpus = [
            'o1' => [1, false, ContractType::Rent], 'o2' => [2, false, ContractType::Rent], 'f1' => [2.5, true, ContractType::Sale],
            'o3' => [3, false, ContractType::Rent], 'o4' => [4, false, ContractType::Rent], 'f2' => [4.5, true, ContractType::Rent],
            'o5' => [5, false, ContractType::Rent], 'o6' => [6, false, ContractType::Rent], 'f3' => [10, true, ContractType::Rent],
        ];
        foreach ($corpus as $nom => [$jours, $vedette, $contrat]) {
            $this->id[$nom] = Property::factory()->published()->create([
                'published_at' => now()->subHours((int) ($jours * 24)),
                'featured' => $vedette,
                'contract_type' => $contrat,
            ])->id;
        }
        $this->indexProperties();
    }

    public function test_les_deux_premieres_places_vont_aux_vedettes_et_ne_reparaissent_pas(): void
    {
        $this->regler(slots: 0, reserved: 2);

        $p1 = $this->chercher(1);
        $this->assertSame([$this->id['f1'], $this->id['f2'], $this->id['o1'], $this->id['o2']], array_column($p1['data'], 'id'));
        $this->assertSame(['reserved', 'reserved', 'organic', 'organic'], array_column($p1['data'], 'placement'));
        $this->assertSame(9, $p1['meta']['total']);
        $this->assertSame(3, $p1['meta']['last_page']);

        $p2 = $this->chercher(2);
        $p3 = $this->chercher(3);
        $this->assertSame([$this->id['o3'], $this->id['o4'], $this->id['o5'], $this->id['o6']], array_column($p2['data'], 'id'));
        $this->assertSame([$this->id['f3']], array_column($p3['data'], 'id'));

        $tous = [...array_column($p1['data'], 'id'), ...array_column($p2['data'], 'id'), ...array_column($p3['data'], 'id')];
        $this->assertCount(9, array_unique($tous), 'aucun doublon, aucun absent');
    }

    public function test_x_egal_zero_est_inerte(): void
    {
        $this->regler(slots: 0, reserved: 0);

        $p1 = $this->chercher(1);

        $this->assertSame([$this->id['o1'], $this->id['o2'], $this->id['f1'], $this->id['o3']], array_column($p1['data'], 'id'));
        $this->assertSame(['organic', 'organic', 'organic', 'organic'], array_column($p1['data'], 'placement'));
        $this->assertSame([], $p1['sponsored']);
    }

    public function test_seules_les_vedettes_qui_satisfont_les_filtres_prennent_une_place(): void
    {
        $this->regler(slots: 0, reserved: 2);

        $p1 = $this->chercher(1, ['contract_type' => 'rent']);

        $this->assertSame([$this->id['f2'], $this->id['f3']], array_slice(array_column($p1['data'], 'id'), 0, 2));
        $this->assertNotContains($this->id['f1'], array_column($p1['data'], 'id'));
        $this->assertSame(8, $p1['meta']['total']);
    }

    public function test_un_bien_deja_servi_en_emplacement_ne_prend_pas_de_place_reservee(): void
    {
        $this->regler(slots: 1, reserved: 2);

        $p1 = $this->chercher(1);
        $sponsorise = array_column($p1['sponsored'], 'id');
        $reserves = array_column(array_filter($p1['data'], fn (array $b) => $b['placement'] === 'reserved'), 'id');

        $this->assertCount(1, $sponsorise);
        $this->assertSame([], array_intersect($sponsorise, $reserves));
        $vedettes = [$this->id['f1'], $this->id['f2'], $this->id['f3']];
        $this->assertSame(array_slice(array_values(array_diff($vedettes, $sponsorise)), 0, 2), array_values($reserves));
        $this->assertSame(9, $p1['meta']['total'], 'l’emplacement est hors total');
    }

    private function regler(int $slots, int $reserved): void
    {
        app(PlatformSettingService::class)->bulkUpdate([
            'boost.sponsored_slots_per_page' => $slots,
            'boost.reserved_top_results' => $reserved,
        ], $this->actingAsRole('super_admin'));
    }

    /**
     * @param  array<string, mixed>  $filtres
     * @return array<string, mixed>
     */
    private function chercher(int $page, array $filtres = []): array
    {
        return app(PropertySearchService::class)->search($filtres + ['page' => $page, 'per_page' => 4]);
    }
}
