<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 — AC12 bis : une visite confirmée est à venir, une visite annulée n'est pas « aujourd'hui ».
 */
class DashboardAgentVisitsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_ac12_bis_upcoming_counts_confirmed_visits_and_today_skips_cancelled_ones(): void
    {
        Carbon::setTestNow('2026-07-15 09:00:00');
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $visit = fn (VisitStatus $status, string $at) => PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'agent_id' => $agent->id,
            'status' => $status,
            'scheduled_at' => $at,
        ]);

        $visit(VisitStatus::Scheduled, '2026-07-16 10:00:00');
        $visit(VisitStatus::Confirmed, '2026-07-18 11:00:00');
        $visit(VisitStatus::Confirmed, '2026-07-21 15:00:00');
        $visit(VisitStatus::Cancelled, '2026-07-19 10:00:00');
        $confirmedToday = $visit(VisitStatus::Confirmed, '2026-07-15 18:00:00');
        $cancelledToday = $visit(VisitStatus::Cancelled, '2026-07-15 18:00:00');

        $this->actingAsApi($agent);
        $visits = $this->getJson('/api/dashboard/agent')->assertOk()->json('data.visits');

        $this->assertSame(4, $visits['upcoming_7d']);
        $this->assertSame(1, $visits['today']);
        $ids = array_column($visits['today_items'], 'id');
        $this->assertContains($confirmedToday->id, $ids);
        $this->assertNotContains($cancelledToday->id, $ids);
    }
}
