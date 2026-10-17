<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Admin\PlatformSettingService;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §10) — un emplacement servi par la recherche compte une impression.
 *
 * TCK-708 (P01.04, décision du porteur) — une fois par visiteur et par bien sur 30 min, et jamais
 * sur un 304 : un changement de filtre lance deux recherches (rendu serveur puis client), et une
 * revalidation ETag rejoue toute la recherche avant de répondre 304.
 */
class SponsoredImpressionsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private Property $property;

    private PropertyBoost $boost;

    protected function setUp(): void
    {
        parent::setUp();
        // Début d'heure : les 31 minutes d'AC3 et AC4 restent dans la même clé horaire du compteur.
        $this->travelTo(now()->utc()->startOfHour()->addMinute());
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $this->property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $this->boost = app(BoostPurchaseService::class)->purchase($this->property, BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(), $admin);
        Property::factory()->count(2)->published()->create();
        $this->indexProperties();
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 1, 'boost.reserved_top_results' => 0], $this->actingAsRole('super_admin'));
    }

    public function test_la_recherche_compte_une_impression_par_visiteur_sur_30_minutes(): void
    {
        $this->rechercher('198.51.100.1')->assertOk()->assertJsonPath('sponsored.0.id', $this->property->id);
        $this->rechercher('198.51.100.1')->assertOk();
        $this->assertSame(1, $this->impressions(), 'la même recherche du même visiteur ne compte qu’une fois');

        $this->rechercher('198.51.100.2')->assertOk();
        $this->assertSame(2, $this->impressions(), 'un autre visiteur compte');

        $this->travel(31)->minutes();
        $this->rechercher('198.51.100.1')->assertOk();
        $this->assertSame(3, $this->impressions(), 'après 30 minutes, le même visiteur compte de nouveau');
    }

    public function test_une_revalidation_en_304_ne_compte_aucune_impression(): void
    {
        $etag = $this->rechercher('198.51.100.1')->assertOk()->headers->get('ETag');
        $this->assertNotNull($etag);
        $this->assertSame(1, $this->impressions());

        $this->travel(31)->minutes();
        $this->rechercher('198.51.100.1', ['If-None-Match' => $etag])->assertStatus(304);

        $this->assertSame(1, $this->impressions());
    }

    public function test_l_accueil_dedoublonne_de_meme(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])->getJson('/api/public/properties/discovery')->assertOk();
        $premier = $this->impressions();
        $this->assertSame(1, $premier, 'témoin : l’accueil sert la Vedette et compte une impression');

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])->getJson('/api/public/properties/discovery')->assertOk();
        $this->assertSame(1, $this->impressions());
    }

    /**
     * TCK-790 (P18.03, décision du porteur) — le rendu serveur appelle l'accueil sans ville, puis le
     * client le rappelle avec `near_city` quand il devine la ville : la rangée vedette, affichée une
     * fois, ne compte qu'une impression.
     */
    public function test_l_accueil_rappele_avec_near_city_ne_compte_qu_une_fois(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])->getJson('/api/public/properties/discovery')->assertOk();
        $this->assertSame(1, $this->impressions(), 'témoin : l’appel sans ville compte la Vedette');

        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.1'])
            ->getJson('/api/public/properties/discovery?near_city=Dakar')
            ->assertOk()
            ->assertJsonFragment(['id' => $this->property->id]);

        $this->assertSame(1, $this->impressions());
    }

    /** @param  array<string, string>  $headers */
    private function rechercher(string $ip, array $headers = []): TestResponse
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->getJson('/api/public/properties/search', $headers);
    }

    private function impressions(): int
    {
        return (int) Cache::get(BoostStatsRecorder::key($this->boost->id, now(), 'impressions'));
    }
}
