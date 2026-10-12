<?php

namespace Tests\Feature\Boost;

use App\Models\Enums\ContractType;
use App\Models\Property;
use App\Services\Admin\PlatformSettingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §7, AC12) — en tête de chaque page, N emplacements tirés parmi les vedettes
 * qui satisfont les MÊMES filtres, hors `total` ; la même heure rend le même tirage ; les pages
 * successives font passer chaque vedette ; un bien sponsorisé garde sa place organique.
 */
class SponsoredRotationTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var list<int> */
    private array $vedettesLocation = [];

    private int $vedetteVente;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-12 10:00:00'));
        foreach (range(1, 5) as $i) {
            $this->vedettesLocation[] = Property::factory()->published()->create([
                'featured' => true, 'contract_type' => ContractType::Rent, 'published_at' => now()->subDays($i),
            ])->id;
        }
        $this->vedetteVente = Property::factory()->published()->create(['featured' => true, 'contract_type' => ContractType::Sale])->id;
        Property::factory()->count(3)->published()->create(['contract_type' => ContractType::Rent, 'published_at' => now()->subDays(8)]);
        $this->indexProperties();

        app(PlatformSettingService::class)->bulkUpdate([
            'boost.sponsored_slots_per_page' => 2,
            'boost.reserved_top_results' => 0,
        ], $this->actingAsRole('super_admin'));
    }

    public function test_les_emplacements_sortent_hors_pagination_parmi_les_vedettes_filtrees(): void
    {
        $reponse = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=3')->assertOk();

        $sponsorises = array_column($reponse->json('sponsored'), 'id');
        $this->assertCount(2, $sponsorises);
        $this->assertSame([], array_diff($sponsorises, $this->vedettesLocation));
        $this->assertNotContains($this->vedetteVente, $sponsorises);
        $this->assertSame(['sponsored', 'sponsored'], array_column($reponse->json('sponsored'), 'placement'));
        $this->assertSame(8, $reponse->json('meta.total'), 'hors total');
        $this->assertCount(3, $reponse->json('data'));
    }

    public function test_meme_heure_meme_tirage_et_chaque_vedette_passe_a_son_tour(): void
    {
        $tirage = fn (int $page) => array_column($this->getJson("/api/public/properties/search?contract_type=rent&per_page=3&page={$page}")->json('sponsored'), 'id');

        $this->assertSame($tirage(1), $tirage(1));
        $this->travel(30)->minutes();
        $this->assertSame($tirage(1), $tirage(1), 'la même heure');

        $vus = array_unique([...$tirage(1), ...$tirage(2), ...$tirage(3)]);
        $this->assertEqualsCanonicalizing($this->vedettesLocation, array_values($vus));
    }

    public function test_un_bien_sponsorise_garde_sa_place_organique(): void
    {
        $reponse = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=40')->assertOk();

        $organiques = array_column($reponse->json('data'), 'id');
        foreach (array_column($reponse->json('sponsored'), 'id') as $id) {
            $this->assertContains($id, $organiques);
        }
        $this->assertCount(8, $organiques);
    }

    public function test_n_egal_zero_ne_sert_aucun_emplacement(): void
    {
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 0], $this->actingAsRole('super_admin'));

        $this->getJson('/api/public/properties/search?contract_type=rent')->assertOk()->assertJsonPath('sponsored', []);
    }
}
