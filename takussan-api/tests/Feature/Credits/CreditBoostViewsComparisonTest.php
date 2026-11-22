<?php

namespace Tests\Feature\Credits;

use App\Models\Agency;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\PropertyDailyView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2923 — `GET /api/credits/boosts` : `views_7d` (les sept derniers jours de la mise en avant) et
 * `views_prev_7d` (les sept jours avant son début), lus de la seule série datée `property_daily_views`.
 */
class CreditBoostViewsComparisonTest extends ApiTestCase
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

    private function views(Property $property, string $day, int $views): void
    {
        PropertyDailyView::query()->create(['property_id' => $property->id, 'day' => $day, 'views' => $views]);
    }

    /** @return array<string, mixed> */
    private function row(int $id): array
    {
        $row = collect($this->apiGet('/api/credits/boosts')->assertOk()->json('data'))->firstWhere('id', $id);
        $this->assertNotNull($row);

        return $row;
    }

    public function test_ac1_une_mise_en_avant_commencee_il_y_a_sept_jours_se_compare_a_la_semaine_d_avant(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $other = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $boost = $this->boost($property, '2026-11-13 10:00', null);

        $this->views($property, '2026-11-05', 99);   // avant la semaine d'avant
        $this->views($property, '2026-11-06', 4);    // semaine d'avant : du 6 au 12
        $this->views($property, '2026-11-12', 6);
        $this->views($property, '2026-11-14', 10);   // les 7 derniers jours : du 14 au 20
        $this->views($property, '2026-11-20', 20);
        $this->views($other, '2026-11-15', 500);     // un autre bien

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->row($boost->id);

        $this->assertSame(10, $row['views_prev_7d']);
        $this->assertSame(30, $row['views_7d']);
    }

    public function test_ac1_sans_vue_avant_le_debut_la_semaine_d_avant_vaut_zero(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $boost = $this->boost($property, '2026-11-18 09:00', null);
        $this->views($property, '2026-11-18', 7);    // le jour du début compte dans la mise en avant

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->row($boost->id);

        $this->assertSame(0, $row['views_prev_7d']);
        $this->assertSame(7, $row['views_7d']);
    }

    public function test_une_mise_en_avant_terminee_garde_sa_semaine(): void
    {
        $agency = Agency::factory()->create();
        $property = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $boost = $this->boost($property, '2026-11-01 09:00', '2026-11-08 09:00');
        $this->views($property, '2026-10-25', 3);    // semaine d'avant : du 25 au 31 oct.
        $this->views($property, '2026-11-01', 1);    // trop tôt pour les 7 derniers jours (du 2 au 8)
        $this->views($property, '2026-11-02', 5);
        $this->views($property, '2026-11-08', 8);
        $this->views($property, '2026-11-09', 1000); // après la fin

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $row = $this->row($boost->id);

        $this->assertSame(3, $row['views_prev_7d']);
        $this->assertSame(13, $row['views_7d']);
    }
}
