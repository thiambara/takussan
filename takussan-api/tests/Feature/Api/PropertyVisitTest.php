<?php

namespace Tests\Feature\Api;

use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyVisitTest extends TestCase
{
    use RefreshDatabase;

    public function test_schedule_and_complete_visit(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($visitor);

        $response = $this->postJson('/api/property-visits', [
            'property_id' => $property->id,
            'scheduled_at' => now()->addDays(2)->toDateTimeString(),
            'duration_minutes' => 30,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'scheduled');

        $visitId = $response->json('data.id');

        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visitId}/complete", [
            'feedback' => 'Très bien',
            'rating' => 4.5,
        ])->assertOk()
            ->assertJsonPath('data.status', 'completed');
    }

    public function test_cancel_visit(): void
    {
        $visitor = User::factory()->create();
        $visit = PropertyVisit::factory()->create(['visitor_id' => $visitor->id]);

        Sanctum::actingAs($visitor);

        $this->postJson("/api/property-visits/{$visit->id}/cancel", ['reason' => 'conflit agenda'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_owner_can_confirm_scheduled_visit(): void
    {
        $owner = User::factory()->create();
        $visitor = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $visitor->id,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visit->id}/confirm")
            ->assertOk()
            ->assertJsonPath('data.status', 'confirmed');
    }

    public function test_non_owner_cannot_confirm_visit(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $other->id,
        ]);

        Sanctum::actingAs($other);

        $this->postJson("/api/property-visits/{$visit->id}/confirm")->assertForbidden();
    }

    public function test_cannot_confirm_cancelled_visit(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $visit = PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'status' => \App\Models\Enums\VisitStatus::Cancelled,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visit->id}/confirm")->assertStatus(422);
    }
}
