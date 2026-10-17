<?php

namespace Tests\Feature\Boost;

use App\Models\Agency;
use App\Models\BoostProduct;
use App\Models\Enums\CreditLotOrigin;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Services\Boost\BoostPurchaseService;
use App\Services\Boost\BoostStatsRecorder;
use App\Services\Credits\CreditLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

/**
 * TCK-793 (P18.05) — un versement qui échoue ne perd pas les compteurs de l'heure : ils restent en
 * cache, et le tick suivant les verse. `flush()` retirait chaque compteur (`pull`) AVANT d'écrire sa
 * ligne : une écriture qui levait les perdait sans trace.
 */
class BoostStatsFlushFailureTest extends TestCase
{
    use RefreshDatabase;

    private Property $property;

    private PropertyBoost $boost;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-12 10:20:00'));
        $agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $agency]);
        app(CreditLedger::class)->grant($agency, CreditLotOrigin::Welcome, 100, now()->addDays(30));
        $this->property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $this->boost = app(BoostPurchaseService::class)->purchase(
            $this->property, BoostProduct::query()->where('kind', 'featured')->where('duration_days', 7)->sole(), $admin,
        );
    }

    public function test_une_ecriture_qui_leve_laisse_les_compteurs_au_tick_suivant(): void
    {
        $recorder = app(BoostStatsRecorder::class);
        $recorder->impressions([$this->property->id, $this->property->id]);
        $recorder->click($this->property, '10.0.0.1');
        $this->travel(1)->hours();

        $panne = true;
        DB::beforeExecuting(function (string $sql) use (&$panne) {
            if ($panne && str_contains($sql, 'property_boost_daily_stats')) {
                throw new RuntimeException('écriture des statistiques indisponible');
            }
        });

        try {
            $recorder->flush();
            $this->fail('le versement devait lever');
        } catch (RuntimeException $e) {
            $this->assertSame('écriture des statistiques indisponible', $e->getMessage());
        }
        $heure = now()->subHour();
        $this->assertSame(2, (int) cache()->get(BoostStatsRecorder::key($this->boost->id, $heure, 'impressions')), 'les impressions restent en cache');
        $this->assertSame(1, (int) cache()->get(BoostStatsRecorder::key($this->boost->id, $heure, 'clicks')), 'le clic aussi');

        $panne = false;
        $this->artisan('boosts:tick')->assertSuccessful();
        $this->artisan('boosts:tick')->assertSuccessful();

        $ligne = DB::table('property_boost_daily_stats')->where('property_boost_id', $this->boost->id)->sole();
        $this->assertSame(2, (int) $ligne->impressions);
        $this->assertSame(1, (int) $ligne->clicks);
        $this->assertNull(cache()->get(BoostStatsRecorder::key($this->boost->id, $heure, 'impressions')), 'une fois versé, le compteur est retiré');
    }
}
