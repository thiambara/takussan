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
 *
 * TCK-2500 (décision 5a de l'audit UX) — les emplacements sont ESPACÉS (un en tête, puis un toutes les dix cartes) et
 * une vedette déjà parmi les cartes de la page n'y est pas servie une seconde fois. Le corpus est donc fait de pages de
 * dix cartes organiques SANS vedette (trente locations récentes), les vedettes, plus anciennes, venant après : chaque
 * page 1 à 3 peut servir ses deux emplacements.
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
                'featured' => true, 'contract_type' => ContractType::Rent, 'published_at' => now()->subDays(20 + $i),
            ])->id;
        }
        $this->vedetteVente = Property::factory()->published()->create(['featured' => true, 'contract_type' => ContractType::Sale, 'published_at' => now()->subDays(20)])->id;
        foreach (range(1, 30) as $i) {
            Property::factory()->published()->create(['contract_type' => ContractType::Rent, 'published_at' => now()->subHours($i)]);
        }
        foreach (range(1, 10) as $i) {
            Property::factory()->published()->create(['contract_type' => ContractType::Sale, 'rent_period' => null, 'published_at' => now()->subHours($i)]);
        }
        $this->indexProperties();

        app(PlatformSettingService::class)->bulkUpdate([
            'boost.sponsored_slots_per_page' => 2,
            'boost.reserved_top_results' => 0,
        ], $this->actingAsRole('super_admin'));
    }

    /**
     * « Parmi les vedettes FILTRÉES » se prouve sans dépendre du tirage. La graine mêle l'heure et
     * les identifiants, que `nextval()` ne rejoue jamais (piège PostgreSQL n° 6) : vérifier qu'un
     * tirage de 2 parmi 5 locations ne contient pas la vente laissait le test vert, une fois sur
     * trois en moyenne, sous un vivier qui ignore les filtres (six vedettes, vente comprise). Le
     * constat 1 ci-dessous rougit sous cette régression QUEL QUE SOIT le tirage.
     */
    public function test_les_emplacements_sortent_hors_pagination_parmi_les_vedettes_filtrees(): void
    {
        // 1. Une seule vedette satisfait `contract_type=sale`, et la page (dix ventes sans vedette) offre deux
        //    emplacements : un vivier hors filtres comblerait le second, forcément.
        $vente = $this->getJson('/api/public/properties/search?contract_type=sale&per_page=10')->assertOk();
        $this->assertSame([$this->vedetteVente], array_column($vente->json('sponsored'), 'id'), 'la seule vedette qui satisfait les filtres, et elle seule');

        $reponse = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=10')->assertOk();
        $sponsorises = array_column($reponse->json('sponsored'), 'id');
        $this->assertCount(2, $sponsorises);
        $this->assertSame([], array_diff($sponsorises, $this->vedettesLocation));
        $this->assertSame(['sponsored', 'sponsored'], array_column($reponse->json('sponsored'), 'placement'));
        $this->assertSame(35, $reponse->json('meta.total'), 'hors total');
        $this->assertCount(10, $reponse->json('data'));
    }

    public function test_meme_heure_meme_tirage_et_chaque_vedette_passe_a_son_tour(): void
    {
        $tirage = fn (int $page) => array_column($this->getJson("/api/public/properties/search?contract_type=rent&per_page=10&page={$page}")->json('sponsored'), 'id');

        $this->assertSame($tirage(1), $tirage(1));
        $this->travel(30)->minutes();
        $this->assertSame($tirage(1), $tirage(1), 'la même heure');

        $vus = array_unique([...$tirage(1), ...$tirage(2), ...$tirage(3)]);
        $this->assertEqualsCanonicalizing($this->vedettesLocation, array_values($vus));
    }

    /**
     * Un bien sponsorisé garde sa place organique : sur la page où les vedettes arrivent dans l'ordre organique, elles
     * y sont toutes, à leur place — et, depuis TCK-2500, aucune n'y est servie une seconde fois en emplacement.
     */
    public function test_un_bien_sponsorise_garde_sa_place_organique(): void
    {
        $reponse = $this->getJson('/api/public/properties/search?contract_type=rent&per_page=10&page=4')->assertOk();

        $organiques = array_column($reponse->json('data'), 'id');
        $this->assertSame([], array_diff($this->vedettesLocation, $organiques));
        $this->assertCount(5, $organiques);
        $this->assertSame([], $reponse->json('sponsored'));
    }

    public function test_n_egal_zero_ne_sert_aucun_emplacement(): void
    {
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 0], $this->actingAsRole('super_admin'));

        $this->getJson('/api/public/properties/search?contract_type=rent')->assertOk()->assertJsonPath('sponsored', []);
    }
}
