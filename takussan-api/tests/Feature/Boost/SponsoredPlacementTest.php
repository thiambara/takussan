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
 * TCK-2500 (décision 5a de l'audit UX) — les emplacements « Sponsorisé » espacés : un en tête de page, puis un toutes
 * les dix cartes, chacun avec sa `position` dans la suite des cartes affichées ; jamais deux de suite ; jamais une
 * vedette déjà présente parmi les cartes de la page.
 */
class SponsoredPlacementTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** @var list<int> */
    private array $vedettes = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-11-09 10:00:00'));

        // 40 biens récents (la page 1 entière), puis 3 vedettes plus anciennes : hors de la page 1 organique.
        foreach (range(1, 40) as $i) {
            Property::factory()->published()->create(['contract_type' => ContractType::Rent, 'published_at' => now()->subHours($i), 'ranked_at' => now()->subHours($i)]);
        }
        foreach (range(1, 3) as $i) {
            $this->vedettes[] = Property::factory()->published()->create([
                'featured' => true, 'contract_type' => ContractType::Rent,
                'published_at' => now()->subDays(10 + $i), 'ranked_at' => now()->subDays(10 + $i),
            ])->id;
        }
        $this->indexProperties();
        $this->reglages(3);
    }

    private function reglages(int $emplacements): void
    {
        app(PlatformSettingService::class)->bulkUpdate([
            'boost.sponsored_slots_per_page' => $emplacements,
            'boost.reserved_top_results' => 0,
        ], $this->actingAsRole('super_admin'));
    }

    /** AC1 — trois vedettes, plafond 3, page de 40 : en position 1, 12 et 23 (0, 11, 22 en base 0). */
    public function test_ac1_une_en_tete_puis_une_toutes_les_dix_cartes(): void
    {
        $reponse = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=40')->assertOk();

        $this->assertCount(40, $reponse->json('data'));
        $this->assertSame([0, 11, 22], array_column($reponse->json('sponsored'), 'position'));
        $this->assertEqualsCanonicalizing($this->vedettes, array_column($reponse->json('sponsored'), 'id'));
        $this->assertSame(['sponsored', 'sponsored', 'sponsored'], array_column($reponse->json('sponsored'), 'placement'));
    }

    /** AC2 — plafond à 0 : aucune vedette. */
    public function test_ac2_plafond_a_zero_aucune_vedette(): void
    {
        $this->reglages(0);

        $this->getJson('/api/public/properties/search?contract_type=rent&per_page=40')->assertOk()->assertJsonPath('sponsored', []);
    }

    /** AC3 — une vedette présente parmi les cartes de la page n'est pas servie en emplacement ; la suivante la remplace. */
    public function test_ac3_jamais_aussi_resultat_organique_de_la_meme_page(): void
    {
        // La page 2 (per_page 40) porte les 3 vedettes en organique : aucune ne peut y être sponsorisée.
        $page2 = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=40&page=2')->assertOk();
        $this->assertEqualsCanonicalizing($this->vedettes, array_column($page2->json('data'), 'id'));
        $this->assertSame([], $page2->json('sponsored'));

        // Une page de 41 cartes qui porte UNE des vedettes : les deux autres seulement, sans doublon.
        $page = app(PropertySearchService::class)->search(['contract_type' => 'rent', 'per_page' => 41, 'page' => 1]);
        $organiques = array_column($page['data'], 'id');
        $sponsorises = array_column($page['sponsored'], 'id');
        $this->assertCount(1, array_intersect($this->vedettes, $organiques));
        $this->assertSame([], array_intersect($sponsorises, $organiques));
        $this->assertCount(2, $sponsorises);
        $this->assertSame([0, 11], array_column($page['sponsored'], 'position'));
    }

    /**
     * Revue de TCK-2500 — un plafond au moins égal au vivier sert TOUTES les vedettes filtrées, sur une page assez longue
     * (50 cartes sans vedette) pour leur offrir à chacune un emplacement : l'espacement et l'exclusion ne perdent rien.
     */
    public function test_un_plafond_au_moins_egal_au_vivier_sert_toutes_les_vedettes(): void
    {
        foreach (range(41, 50) as $i) {
            Property::factory()->published()->create(['contract_type' => ContractType::Rent, 'published_at' => now()->subHours($i), 'ranked_at' => now()->subHours($i)]);
        }
        $this->indexProperties();
        $this->reglages(10);

        $reponse = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=50')->assertOk();

        $this->assertCount(50, $reponse->json('data'));
        $this->assertSame([], array_intersect($this->vedettes, array_column($reponse->json('data'), 'id')), 'aucune vedette parmi les cartes');
        $this->assertEqualsCanonicalizing($this->vedettes, array_column($reponse->json('sponsored'), 'id'));
        $this->assertSame([0, 11, 22], array_column($reponse->json('sponsored'), 'position'));
    }

    /** Jamais deux de suite : une page courte (moins de dix cartes) n'en montre qu'un, en tête. */
    public function test_une_page_courte_n_en_montre_qu_un(): void
    {
        $courte = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=9')->assertOk();
        $this->assertSame([0], array_column($courte->json('sponsored'), 'position'));

        $vingt = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=19')->assertOk();
        $this->assertSame([0, 11], array_column($vingt->json('sponsored'), 'position'));
    }
}
