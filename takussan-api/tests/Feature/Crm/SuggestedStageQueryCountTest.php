<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2591 — `suggested_stage` se calcule pour la page en requêtes groupées : leur nombre ne
 * dépend pas du nombre de fiches.
 */
class SuggestedStageQueryCountTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_number_of_queries_does_not_grow_with_the_page(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        $seed = function (int $n) use ($agency, $agent, $property): void {
            foreach (range(1, $n) as $i) {
                $this->travelTo(now()->subDays(5));
                $fiche = Customer::factory()->create([
                    'agency_id' => $agency->id, 'added_by_id' => $agent->id,
                    'status' => CustomerStatus::Active, 'pipeline_stage' => CustomerPipelineStage::Lead,
                ]);
                $this->travelBack();
                PropertyVisit::factory()->create(['property_id' => $property->id, 'customer_id' => $fiche->id, 'visitor_id' => null, 'status' => VisitStatus::Confirmed]);
                Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id, 'customer_id' => $fiche->id, 'created_by_id' => $agent->id, 'kind' => BookingKind::Application]);
            }
        };

        Sanctum::actingAs($agent);
        $url = '/api/customers?per_page=50&fields[customers]=id,pipeline_stage,suggested_stage';
        $count = function () use ($url): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $rows = $this->getJson($url)->assertOk()->json('data');
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();
            $this->assertNotEmpty($rows);
            $this->assertSame('negotiating', $rows[0]['suggested_stage']['to']);

            return $n;
        };

        $seed(3);
        $count(); // échauffement
        $few = $count();

        $seed(12);
        $this->assertSame($few, $count());
    }
}
