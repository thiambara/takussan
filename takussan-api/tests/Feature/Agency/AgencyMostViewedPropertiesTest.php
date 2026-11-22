<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\PropertyDailyView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2923 — `GET /api/agencies/{agency}/properties/most-viewed` : les biens publics de l'agence, du plus
 * vu au moins vu sur le mois civil en cours, à qui peut écrire la vitrine.
 */
class AgencyMostViewedPropertiesTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Http::preventStrayRequests();
        $this->travelTo(Carbon::parse('2026-11-20 10:00:00'));
    }

    private function views(Property $property, string $day, int $views): void
    {
        PropertyDailyView::query()->create(['property_id' => $property->id, 'day' => $day, 'views' => $views]);
    }

    public function test_ac2_les_biens_publies_de_l_agence_par_vues_du_mois(): void
    {
        $agency = Agency::factory()->create();
        $peu = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $beaucoup = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $moisDernier = Property::factory()->published()->create(['agency_id' => $agency->id]);
        $brouillon = Property::factory()->create(['agency_id' => $agency->id, 'status' => PropertyStatus::Draft]);
        $autreAgence = Property::factory()->published()->create(['agency_id' => Agency::factory()->create()->id]);

        $this->views($peu, '2026-11-01', 3);
        $this->views($beaucoup, '2026-11-02', 10);
        $this->views($beaucoup, '2026-11-19', 15);
        $this->views($beaucoup, '2026-10-31', 1000);   // le mois précédent ne compte pas
        $this->views($moisDernier, '2026-10-30', 500);
        $this->views($brouillon, '2026-11-10', 900);
        $this->views($autreAgence, '2026-11-10', 800);

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $data = $this->apiGet("/api/agencies/{$agency->id}/properties/most-viewed")->assertOk()->json('data');

        $this->assertSame([$beaucoup->id, $peu->id], array_column($data, 'id'));
        $this->assertSame([25, 3], array_column($data, 'views_month'));
        $this->assertArrayHasKey('main_photo_url', $data[0]);
    }

    public function test_limit_borne_la_liste(): void
    {
        $agency = Agency::factory()->create();
        foreach (range(1, 3) as $n) {
            $this->views(Property::factory()->published()->create(['agency_id' => $agency->id]), '2026-11-05', $n);
        }

        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->assertCount(2, $this->apiGet("/api/agencies/{$agency->id}/properties/most-viewed?limit=2")->assertOk()->json('data'));
        $this->apiGet("/api/agencies/{$agency->id}/properties/most-viewed?limit=99")->assertStatus(422);
    }

    public function test_ac3_un_agent_sans_droit_sur_la_vitrine_recoit_403(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agent', ['agency' => $agency]);

        $this->apiGet("/api/agencies/{$agency->id}/properties/most-viewed")->assertForbidden();
        $this->apiGet("/api/agencies/{$agency->id}/properties/most-viewed?limit=99")->assertForbidden();
    }

    public function test_ac3_l_admin_d_une_autre_agence_recoit_403(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);

        $this->apiGet("/api/agencies/{$agency->id}/properties/most-viewed")->assertForbidden();
    }
}
