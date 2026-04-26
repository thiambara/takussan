<?php

namespace Tests\Feature\Controllers\Api;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class MaintenanceQuoteControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_agent_can_request_quote()
    {
        Notification::fake();
        $agent = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $agent->id]);
        $provider = User::factory()->create();
        
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::Open,
        ]);

        $response = $this->actingAs($agent)
            ->postJson("/api/maintenance-requests/{$mr->id}/quote/request");

        $response->assertOk();
        $this->assertEquals(MaintenanceStatus::QuoteRequested->value, $response->json('data.status'));
    }

    public function test_provider_can_submit_quote()
    {
        Notification::fake();
        $provider = User::factory()->create();
        
        $mr = MaintenanceRequest::factory()->create([
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::QuoteRequested,
        ]);

        $response = $this->actingAs($provider)
            ->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", [
                'amount' => 500,
                'currency' => 'XOF',
            ]);

        $response->assertOk();
        $this->assertEquals(MaintenanceStatus::QuoteSubmitted->value, $response->json('data.status'));
        $this->assertEquals(500, $response->json('data.quote_amount'));
    }

    public function test_unassigned_provider_cannot_submit_quote()
    {
        $provider = User::factory()->create();
        $otherProvider = User::factory()->create();
        
        $mr = MaintenanceRequest::factory()->create([
            'assigned_to' => $otherProvider->id,
            'status' => MaintenanceStatus::QuoteRequested,
        ]);

        $response = $this->actingAs($provider)
            ->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", [
                'amount' => 500,
            ]);

        $response->assertForbidden();
    }

    public function test_agent_can_approve_quote()
    {
        Notification::fake();
        $agent = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $agent->id]);
        
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'status' => MaintenanceStatus::QuoteSubmitted,
        ]);

        $response = $this->actingAs($agent)
            ->postJson("/api/maintenance-requests/{$mr->id}/quote/approve");

        $response->assertOk();
        $this->assertEquals(MaintenanceStatus::Approved->value, $response->json('data.status'));
    }

    public function test_agent_can_reject_quote_with_reason()
    {
        Notification::fake();
        $agent = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $agent->id]);
        
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'status' => MaintenanceStatus::QuoteSubmitted,
        ]);

        $response = $this->actingAs($agent)
            ->postJson("/api/maintenance-requests/{$mr->id}/quote/reject", [
                'reason' => 'Le prix est beaucoup trop élevé',
            ]);

        $response->assertOk();
        $this->assertEquals(MaintenanceStatus::Rejected->value, $response->json('data.status'));
        
        $mr->refresh();
        $this->assertEquals('Le prix est beaucoup trop élevé', $mr->quote_rejection_reason);
    }
}
