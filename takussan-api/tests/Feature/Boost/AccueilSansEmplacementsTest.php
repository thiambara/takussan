<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\ContractType;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Admin\PlatformSettingService;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-687 (P18.01) — la rangée « À vendre » de l'accueil lit `/public/properties/search` sans en
 * afficher les emplacements. `placements=false` coupe les emplacements ET les places réservées :
 * aucune impression comptée, et `data` est l'ordre organique seul (aucune place payée sans robe).
 *
 * Le témoin sans le paramètre garde que le corpus produit bien un emplacement, une place réservée
 * et une impression : sans lui, le test serait vert sur un corpus où rien n'est sponsorisé.
 */
class AccueilSansEmplacementsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $produit = BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole();
        foreach (range(1, 3) as $i) {
            $vedette = Property::factory()->published()->create(['agency_id' => $agency->id, 'contract_type' => ContractType::Sale]);
            app(BoostPurchaseService::class)->purchase($vedette, $produit, $admin);
        }
        Property::factory()->count(3)->published()->create(['contract_type' => ContractType::Sale]);
        $this->indexProperties();
        app(PlatformSettingService::class)->bulkUpdate([
            'boost.sponsored_slots_per_page' => 3,
            'boost.reserved_top_results' => 2,
        ], $this->actingAsRole('super_admin'));
    }

    public function test_temoin_sans_le_parametre_la_requete_tire_les_emplacements_et_compte(): void
    {
        $r = $this->getJson('/api/public/properties/search?contract_type=sale&per_page=12')->assertOk();

        $this->assertNotSame([], $r->json('sponsored'));
        $this->assertGreaterThan(0, $this->impressions());
    }

    public function test_placements_false_ne_sert_aucun_emplacement_et_ne_compte_rien(): void
    {
        $r = $this->getJson('/api/public/properties/search?contract_type=sale&per_page=12&placements=false')->assertOk();

        $this->assertSame([], $r->json('sponsored'));
        $this->assertSame(['organic'], array_values(array_unique(array_column($r->json('data'), 'placement'))));
        $this->assertCount(6, $r->json('data'));
        $this->assertSame(6, $r->json('meta.total'));
        $this->assertSame(0, $this->impressions());
    }

    public function test_placements_invalide_rend_422(): void
    {
        $this->getJson('/api/public/properties/search?placements=peut-etre')->assertStatus(422);
    }

    private function impressions(): int
    {
        $total = 0;
        foreach (PropertyBoost::query()->pluck('id') as $id) {
            $total += (int) Cache::get(BoostStatsRecorder::key($id, now(), 'impressions'));
        }

        return $total;
    }
}
