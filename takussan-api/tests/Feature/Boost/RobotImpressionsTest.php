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
 * TCK-792 (P18.04, décision du porteur) — aucune impression sponsorisée quand l'agent est reconnu
 * comme robot, par une liste courte sans dépendance. Un robot qui parcourt la recherche ou l'accueil
 * gonflait les impressions sans jamais produire de clic.
 */
class RobotImpressionsTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private PropertyBoost $boost;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->utc()->startOfHour()->addMinute());
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $this->boost = app(BoostPurchaseService::class)->purchase($property, BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(), $admin);
        Property::factory()->count(2)->published()->create();
        $this->indexProperties();
        app(PlatformSettingService::class)->bulkUpdate(['boost.sponsored_slots_per_page' => 1, 'boost.reserved_top_results' => 0], $this->actingAsRole('super_admin'));
    }

    public function test_une_recherche_sous_googlebot_ne_compte_aucune_impression(): void
    {
        $this->appeler('/api/public/properties/search', '198.51.100.1', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
            ->assertOk()->assertJsonPath('sponsored.0.id', $this->boost->property_id);
        $this->assertSame(0, $this->impressions(), 'le robot voit l’emplacement, mais ne le compte pas');

        $this->appeler('/api/public/properties/search', '198.51.100.2', 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36');
        $this->assertSame(1, $this->impressions(), 'témoin : un navigateur compte');
    }

    public function test_l_accueil_sous_un_robot_ne_compte_aucune_impression(): void
    {
        $this->appeler('/api/public/properties/discovery', '198.51.100.1', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)')->assertOk();
        $this->assertSame(0, $this->impressions());

        $this->appeler('/api/public/properties/discovery', '198.51.100.2', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15');
        $this->assertSame(1, $this->impressions(), 'témoin : un navigateur compte');
    }

    private function appeler(string $uri, string $ip, string $agent): TestResponse
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->withHeader('User-Agent', $agent)->getJson($uri);
    }

    private function impressions(): int
    {
        return (int) Cache::get(BoostStatsRecorder::key($this->boost->id, now(), 'impressions'));
    }
}
