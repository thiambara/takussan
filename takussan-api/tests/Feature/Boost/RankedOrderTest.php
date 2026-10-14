<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\User;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-633 lot F (ADR-0061 §7) — les résultats organiques ne lisent plus `featured` : la liste
 * publique et les rangées de l'accueil suivent `ranked_at`, qu'une Remontée remet à maintenant.
 */
class RankedOrderTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_liste_publique_suit_ranked_at_et_ignore_featured(): void
    {
        $agency = Agency::factory()->create();
        $ancienneVedette = Property::factory()->published()->create(['agency_id' => $agency->id, 'published_at' => now()->subDays(9), 'featured' => true]);
        $recent = Property::factory()->published()->create(['agency_id' => $agency->id, 'published_at' => now()->subDay()]);
        $ancien = Property::factory()->published()->create(['agency_id' => $agency->id, 'published_at' => now()->subDays(5)]);

        $this->assertSame([$recent->id, $ancien->id, $ancienneVedette->id], $this->ids());

        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 50, now()->addDays(30));
        app(BoostPurchaseService::class)->purchase($ancien->fresh(), BoostProduct::query()->where('kind', 'bump')->sole(), User::factory()->create());

        $this->assertSame([$ancien->id, $recent->id, $ancienneVedette->id], $this->ids(), 'la Remontée remet le bien en tête');
    }

    public function test_la_rangee_vedette_de_l_accueil_tourne_parmi_les_vedettes_et_reste_stable_dans_l_heure(): void
    {
        $vedettes = Property::factory()->count(6)->published()->create(['featured' => true])->pluck('id')->all();
        Property::factory()->count(3)->published()->create();

        $premier = array_column($this->getJson('/api/public/properties/discovery?per_row=2')->assertOk()->json('data.featured.items'), 'id');
        $second = array_column($this->getJson('/api/public/properties/discovery?per_row=2')->json('data.featured.items'), 'id');

        $this->assertCount(2, $premier);
        $this->assertSame($premier, $second);
        $this->assertSame([], array_diff($premier, $vedettes));
    }

    /** @return list<int> */
    private function ids(): array
    {
        return array_column($this->getJson('/api/public/properties')->assertOk()->json('data'), 'id');
    }
}
