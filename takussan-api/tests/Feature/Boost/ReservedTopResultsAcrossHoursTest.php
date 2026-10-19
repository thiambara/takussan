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
 * TCK-1008 (P55.01) — les places réservées de la page 1 se recalculent à chaque page, et la graine
 * de rotation porte l'heure : une page 2 servie après le changement d'heure excluait d'autres biens
 * que ceux que la page 1 avait montrés en tête (un doublon, un absent).
 *
 * Décision du porteur : le front transmet aux pages suivantes l'heure de graine de la page 1
 * (`seed_hour`, rendue par l'API), que l'API n'accepte que si elle vaut l'heure courante ou la
 * précédente ; sinon elle prend l'heure courante, comme avant.
 *
 * Corpus de `ReservedTopResultsTest` (ordre `ranked_at` décroissant) : o1, o2, f1, o3, o4, f2, o5,
 * o6, f3 — f = vedette. Un emplacement, deux places réservées, quatre biens par page.
 */
class ReservedTopResultsAcrossHoursTest extends TestCase
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
            'o1' => [1, false], 'o2' => [2, false], 'f1' => [2.5, true],
            'o3' => [3, false], 'o4' => [4, false], 'f2' => [4.5, true],
            'o5' => [5, false], 'o6' => [6, false], 'f3' => [10, true],
        ];
        foreach ($corpus as $nom => [$jours, $vedette]) {
            $this->id[$nom] = Property::factory()->published()->create([
                'published_at' => now()->subHours((int) ($jours * 24)),
                'featured' => $vedette,
                'contract_type' => ContractType::Rent,
            ])->id;
        }
        $this->indexProperties();
        app(PlatformSettingService::class)->bulkUpdate([
            'boost.sponsored_slots_per_page' => 1,
            'boost.reserved_top_results' => 2,
        ], $this->actingAsRole('super_admin'));
    }

    public function test_les_pages_2_et_3_servies_apres_le_changement_d_heure_completent_la_page_1(): void
    {
        $rouges = [];
        $graines = [];
        for ($h = 0; $h < 24; $h++) {
            $this->travelTo(Carbon::parse('2026-10-13 00:59:00', 'UTC')->addHours($h));
            $p1 = $this->chercher(1);
            $this->assertSame(now()->utc()->format('Y-m-d\TH'), $p1['seed_hour']);

            $this->travel(1)->minutes();
            $p2 = $this->chercher(2, $p1['seed_hour']);
            $p3 = $this->chercher(3, $p1['seed_hour']);

            $ids = [...array_column($p1['data'], 'id'), ...array_column($p2['data'], 'id'), ...array_column($p3['data'], 'id')];
            if (count($ids) !== 9 || count(array_unique($ids)) !== 9) {
                $rouges[] = sprintf('%02d:59 → %s', $h, implode(',', array_map(fn (int $id) => array_search($id, $this->id, true), $ids)));
            }
            $graines[] = $p2['seed_hour'] === $p1['seed_hour'];
        }

        $this->assertSame([], $rouges, 'doublon ou absent entre la page 1 (hh:59) et les pages 2-3 (hh+1:00)');
        $this->assertNotContains(false, $graines, 'la page 2 garde la graine de la page 1');
    }

    public function test_une_heure_de_graine_plus_ancienne_que_l_heure_precedente_est_ignoree(): void
    {
        $this->travelTo(Carbon::parse('2026-10-13 05:10:00', 'UTC'));

        $sans = $this->chercher(2);
        $trop = $this->chercher(2, '2026-10-13T03');
        $future = $this->chercher(2, '2026-10-13T06');
        $illisible = $this->chercher(2, 'pas-une-heure');

        $this->assertSame('2026-10-13T05', $sans['seed_hour']);
        foreach ([$trop, $future, $illisible] as $reponse) {
            $this->assertSame('2026-10-13T05', $reponse['seed_hour']);
            $this->assertSame(array_column($sans['data'], 'id'), array_column($reponse['data'], 'id'));
            $this->assertSame(array_column($sans['sponsored'], 'id'), array_column($reponse['sponsored'], 'id'));
        }
        $this->assertSame('2026-10-13T04', $this->chercher(2, '2026-10-13T04')['seed_hour'], 'l’heure précédente est acceptée');
    }

    public function test_la_route_publique_transmet_l_heure_de_graine_et_la_rend(): void
    {
        $this->travelTo(Carbon::parse('2026-10-13 00:59:00', 'UTC'));
        $p1 = $this->getJson('/api/public/properties/search?per_page=4')->assertOk()->json();
        $this->assertSame('2026-10-13T00', $p1['seed_hour']);

        $this->travel(1)->minutes();
        $p2 = $this->getJson('/api/public/properties/search?per_page=4&page=2&seed_hour='.$p1['seed_hour'])->assertOk()->json();

        $this->assertSame('2026-10-13T00', $p2['seed_hour']);
        $this->assertSame(
            array_column($this->chercher(2, '2026-10-13T00')['data'], 'id'),
            array_column($p2['data'], 'id'),
        );
    }

    /** @return array<string, mixed> */
    private function chercher(int $page, ?string $heure = null): array
    {
        $params = ['page' => $page, 'per_page' => 4];
        if ($heure !== null) {
            $params['seed_hour'] = $heure;
        }

        return app(PropertySearchService::class)->search($params);
    }
}
