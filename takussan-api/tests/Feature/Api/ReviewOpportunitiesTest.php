<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §3) — `GET /api/me/review-opportunities` : ce que l'acteur peut noter et n'a
 * pas encore noté, avec la preuve, calculé par la même règle que les `authorize()` de dépôt.
 */
class ReviewOpportunitiesTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_it_lists_every_eligible_subject_once_with_its_proof_and_drops_what_was_rated(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $client = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $client->id]);
        $agentX = User::factory()->create();
        $this->materializeRoleProfile($agentX, 'agent', $agency);
        $agentY = User::factory()->create();
        $this->materializeRoleProfile($agentY, 'agent', $agency);

        $visited = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agentX->id]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $visited->id, 'visitor_id' => $client->id,
            'agent_id' => $agentX->id, 'status' => VisitStatus::Completed,
        ]);
        $rented = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $agentY->id]);
        $lease = Lease::factory()->create([
            'property_id' => $rented->id, 'agency_id' => $agency->id,
            'tenant_id' => $customer->id, 'status' => LeaseStatus::Active,
        ]);
        $provider = ServiceProviderProfile::factory()->create(['user_id' => User::factory()->create()->id]);
        $intervention = MaintenanceRequest::factory()->create([
            'property_id' => $rented->id, 'requester_id' => $client->id,
            'assigned_to' => $provider->user_id, 'status' => MaintenanceStatus::Completed,
        ]);
        // Bruit : une visite non terminée, une intervention ouverte.
        PropertyVisit::factory()->create(['visitor_id' => $client->id, 'agent_id' => $agentY->id, 'status' => VisitStatus::Scheduled]);
        MaintenanceRequest::factory()->create(['requester_id' => $client->id, 'assigned_to' => $provider->user_id, 'status' => MaintenanceStatus::Open]);

        $this->actingAsApi($client);
        $items = collect($this->getJson('/api/me/review-opportunities')->assertOk()->json('data'))
            ->map(fn (array $i) => "{$i['type']}:{$i['subject']['id']}:{$i['context']['type']}:{$i['context']['id']}")
            ->sort()->values()->all();

        $this->assertSame(collect([
            "property:{$rented->id}:lease:{$lease->id}",
            "agent:{$agentX->id}:visit:{$visit->id}",
            "agent:{$agentY->id}:lease:{$lease->id}",
            "agency:{$agency->id}:lease:{$lease->id}",
            "service_provider:{$provider->id}:maintenance_request:{$intervention->id}",
        ])->sort()->values()->all(), $items);

        // Chaque invitation mène à un dépôt accepté, puis disparaît.
        $this->postJson("/api/agents/{$agentY->id}/reviews", ['rating' => 4])->assertCreated();
        $this->postJson("/api/service-providers/{$provider->id}/reviews", ['rating' => 5, 'maintenance_request_id' => $intervention->id])->assertCreated();
        $this->postJson("/api/properties/{$rented->id}/reviews", ['rating' => 5])->assertCreated();
        $this->postJson("/api/agencies/{$agency->id}/reviews", ['rating' => 5])->assertCreated();

        $left = collect($this->getJson('/api/me/review-opportunities')->assertOk()->json('data'))
            ->map(fn (array $i) => "{$i['type']}:{$i['subject']['id']}")->all();
        $this->assertSame(["agent:{$agentX->id}"], $left);
    }

    public function test_an_agent_is_never_invited_to_rate_themself(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);
        PropertyVisit::factory()->create(['visitor_id' => $agent->id, 'agent_id' => $agent->id, 'status' => VisitStatus::Completed]);

        $this->actingAsApi($agent);
        $this->assertSame([], $this->getJson('/api/me/review-opportunities')->assertOk()->json('data'));
    }
}
