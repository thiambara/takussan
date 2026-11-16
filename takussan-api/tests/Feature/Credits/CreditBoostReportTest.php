<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\PropertyBoostDailyStat;
use App\Models\PropertyDailyView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2924 — `GET /api/credits/boosts/report?days=7|30|90` : par jour, impressions, clics et vues de
 * fiche (TCK-2923) ; par mise en avant, ses totaux sur la période.
 */
class CreditBoostReportTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();
        $this->travelTo(Carbon::parse('2026-11-20 10:00:00'));
    }

    private function boost(Property $property, string $starts, ?string $ended): PropertyBoost
    {
        return PropertyBoost::query()->create([
            'property_id' => $property->id, 'agency_id' => $property->agency_id, 'kind' => BoostKind::Featured,
            'price_credits' => 20, 'duration_days' => 7,
            'starts_at' => Carbon::parse($starts), 'ends_at' => Carbon::parse($starts)->addDays(7),
            'ended_at' => $ended !== null ? Carbon::parse($ended) : null,
            'status' => $ended !== null ? BoostStatus::Ended : BoostStatus::Active,
        ]);
    }

    private function stat(PropertyBoost $boost, string $date, int $impressions, int $clicks): void
    {
        PropertyBoostDailyStat::query()->create([
            'property_boost_id' => $boost->id, 'date' => $date, 'impressions' => $impressions, 'clicks' => $clicks,
        ]);
    }

    private function views(Property $property, string $day, int $views): void
    {
        PropertyDailyView::query()->create(['property_id' => $property->id, 'day' => $day, 'views' => $views]);
    }

    public function test_ac2_trente_jours_consecutifs_et_des_totaux_egaux_a_la_somme_des_jours(): void
    {
        $agency = Agency::factory()->create();
        $a = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $b = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $boostA = $this->boost($a, '2026-11-01 09:00', '2026-11-08 09:00');
        $boostB = $this->boost($b, '2026-11-15 09:00', null);
        $old = $this->boost($a, '2026-09-01 09:00', '2026-09-08 09:00');
        $foreign = $this->boost(Property::factory()->published()->create(['agency_id' => Agency::factory()->create()->id]), '2026-11-02 09:00', null);

        $this->stat($boostA, '2026-11-01', 100, 4);
        $this->stat($boostA, '2026-11-02', 50, 1);
        $this->stat($boostB, '2026-11-02', 0, 0);
        $this->stat($boostB, '2026-11-16', 30, 2);
        $this->stat($old, '2026-09-02', 999, 99);       // hors période
        $this->stat($foreign, '2026-11-02', 777, 77);   // autre espace
        $this->views($a, '2026-11-02', 8);
        $this->views($a, '2026-11-12', 500);            // le bien n'est plus mis en avant
        $this->views($b, '2026-11-16', 6);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $response = $this->apiGet('/api/credits/boosts/report?days=30')->assertOk();

        $days = $response->json('data.days');
        $this->assertCount(30, $days);
        $this->assertSame('2026-10-22', $days[0]['date']);
        $this->assertSame('2026-11-20', $days[29]['date']);
        $byDate = array_column($days, null, 'date');
        $this->assertSame(['date' => '2026-11-02', 'impressions' => 50, 'clicks' => 1, 'views' => 8], $byDate['2026-11-02']);
        $this->assertSame(['date' => '2026-11-12', 'impressions' => 0, 'clicks' => 0, 'views' => 0], $byDate['2026-11-12']);

        $boosts = array_column($response->json('data.boosts'), null, 'id');
        $this->assertSame([$boostB->id, $boostA->id], array_keys($boosts));
        $this->assertSame([150, 5, 8], [$boosts[$boostA->id]['impressions'], $boosts[$boostA->id]['clicks'], $boosts[$boostA->id]['views']]);
        $this->assertSame([30, 2, 6], [$boosts[$boostB->id]['impressions'], $boosts[$boostB->id]['clicks'], $boosts[$boostB->id]['views']]);
        foreach (['impressions', 'clicks', 'views'] as $measure) {
            $this->assertSame(array_sum(array_column($days, $measure)), array_sum(array_column($boosts, $measure)), $measure);
        }
        $this->assertSame(['days' => 30, 'from' => '2026-10-22', 'to' => '2026-11-20'], $response->json('meta'));
    }

    public function test_deux_mises_en_avant_du_meme_bien_ne_doublent_pas_les_vues_du_jour(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $vedette = $this->boost($property, '2026-11-10 09:00', '2026-11-17 09:00');
        $remontee = $this->boost($property, '2026-11-12 08:00', '2026-11-12 08:00');
        $this->views($property, '2026-11-12', 9);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $response = $this->apiGet('/api/credits/boosts/report?days=30')->assertOk();

        $byDate = array_column($response->json('data.days'), null, 'date');
        $this->assertSame(9, $byDate['2026-11-12']['views']);
        $boosts = array_column($response->json('data.boosts'), 'views', 'id');
        $this->assertSame(9, $boosts[$vedette->id]);
        $this->assertSame(9, $boosts[$remontee->id]);
    }

    public function test_ac2_la_periode_est_bornee(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->assertCount(7, $this->apiGet('/api/credits/boosts/report?days=7')->assertOk()->json('data.days'));
        $this->assertCount(90, $this->apiGet('/api/credits/boosts/report?days=90')->assertOk()->json('data.days'));
        $this->assertCount(30, $this->apiGet('/api/credits/boosts/report')->assertOk()->json('data.days'));
        $this->apiGet('/api/credits/boosts/report?days=12')->assertStatus(422);
    }

    public function test_ac3_meme_garde_que_le_portefeuille(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);
        $this->apiGet('/api/credits')->assertForbidden();
        $this->apiGet('/api/credits/boosts/report')->assertForbidden();
        $this->apiGet('/api/credits/boosts/report?days=12')->assertForbidden();

        $this->apiActingAsRole('customer');
        $this->apiGet('/api/credits')->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
        $this->apiGet('/api/credits/boosts/report')->assertStatus(422)->assertJsonPath('code', 'credits.no_space');
    }
}
