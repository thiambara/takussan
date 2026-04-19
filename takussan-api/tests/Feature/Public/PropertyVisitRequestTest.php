<?php

namespace Tests\Feature\Public;

use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyVisitRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_anonymous_visit_request_with_contact_triplet_returns_201(): void
    {
        $property = Property::factory()->published()->create();

        $response = $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'scheduled_at' => now()->addDays(2)->toIso8601String(),
            'visitor_name' => 'Awa Ndiaye',
            'visitor_email' => 'awa@example.com',
            'visitor_phone' => '+221770000000',
        ]);

        $response->assertCreated()->assertJsonStructure([
            'data' => ['id', 'property_id', 'status', 'type', 'scheduled_at'],
        ]);

        $this->assertDatabaseHas('property_visits', [
            'property_id' => $property->id,
            'visitor_id' => null,
            'visitor_email' => 'awa@example.com',
            'visitor_phone' => '+221770000000',
            'status' => VisitStatus::Scheduled->value,
            'type' => VisitType::InPerson->value,
        ]);
    }

    public function test_authenticated_visit_request_returns_201_and_uses_user(): void
    {
        $property = Property::factory()->published()->create();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'scheduled_at' => now()->addDays(3)->toIso8601String(),
            'duration_minutes' => 45,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('property_visits', [
            'property_id' => $property->id,
            'visitor_id' => $user->id,
            'duration_minutes' => 45,
            'status' => VisitStatus::Scheduled->value,
        ]);
    }

    public function test_anonymous_missing_contact_returns_422(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'scheduled_at' => now()->addDays(1)->toIso8601String(),
        ])->assertUnprocessable();
    }

    public function test_scheduled_in_past_returns_422(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'scheduled_at' => now()->subDay()->toIso8601String(),
            'visitor_name' => 'A',
            'visitor_email' => 'a@b.com',
            'visitor_phone' => '+221770000000',
        ])->assertUnprocessable();
    }

    public function test_unknown_slug_returns_404(): void
    {
        $this->postJson('/api/public/properties/unknown-slug/visit-request', [
            'scheduled_at' => now()->addDay()->toIso8601String(),
        ])->assertNotFound();
    }
}
