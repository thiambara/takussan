<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Services\Admin\PlatformSettingService;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/** TCK-633 lot F (ADR-0061 §10) — un emplacement servi par la recherche compte une impression. */
class SponsoredImpressionsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_la_recherche_compte_les_emplacements_servis(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $boost = app(BoostPurchaseService::class)->purchase($property, BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(), $admin);
        Property::factory()->count(2)->published()->create();
        $this->indexProperties();
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 1, 'boost.reserved_top_results' => 0], $this->actingAsRole('super_admin'));

        $this->getJson('/api/public/properties/search')->assertOk()->assertJsonPath('sponsored.0.id', $property->id);
        $this->getJson('/api/public/properties/search')->assertOk();

        $this->assertSame(2, (int) Cache::get(BoostStatsRecorder::key($boost->id, now(), 'impressions')));
    }
}
