<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\VisitStatus;
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
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancellation_reason', 'conflit agenda')
            ->assertJsonPath('data.cancelled_at', fn ($value) => is_string($value));
    }

    public function test_visit_list_exposes_visitor_contact_fields(): void
    {
        $visitor = User::factory()->create();
        $visit = PropertyVisit::factory()->create([
            'visitor_id' => $visitor->id,
            'visitor_name' => 'Awa Diop',
            'visitor_phone' => '+221771112233',
            'visitor_email' => 'awa.visit@example.test',
        ]);

        Sanctum::actingAs($visitor);

        $this->getJson('/api/property-visits?fields[property_visits]=id,visitor_id,visitor_name,visitor_phone,visitor_email')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $visit->id)
            ->assertJsonPath('data.0.visitor_name', 'Awa Diop')
            ->assertJsonPath('data.0.visitor_phone', '+221771112233')
            ->assertJsonPath('data.0.visitor_email', 'awa.visit@example.test');
    }

    public function test_visit_detail_exposes_loaded_visitor_phone(): void
    {
        $visitor = User::factory()->create([
            'phone' => '+221700001111',
        ]);
        $visit = PropertyVisit::factory()->create(['visitor_id' => $visitor->id]);

        Sanctum::actingAs($visitor);

        $this->getJson("/api/property-visits/{$visit->id}")
            ->assertOk()
            ->assertJsonPath('data.visitor.id', $visitor->id)
            ->assertJsonPath('data.visitor.phone', '+221700001111');
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
            'status' => VisitStatus::Cancelled,
        ]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/property-visits/{$visit->id}/confirm")->assertStatus(422);
    }

    public function test_customer_linked_user_can_list_and_view_visit_with_customer_payload(): void
    {
        $customerUser = User::factory()->create();
        $customer = Customer::factory()->create([
            'user_id' => $customerUser->id,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'email' => 'awa.diop@example.test',
            'phone' => '+221770000000',
        ]);
        $visit = PropertyVisit::factory()->create([
            'visitor_id' => User::factory()->create()->id,
            'customer_id' => $customer->id,
        ]);

        Sanctum::actingAs($customerUser);

        $this->getJson('/api/property-visits?include=customer')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $visit->id)
            ->assertJsonPath('data.0.customer.id', $customer->id)
            ->assertJsonPath('data.0.customer.user_id', $customerUser->id)
            ->assertJsonPath('data.0.customer.first_name', 'Awa')
            ->assertJsonPath('data.0.customer.phone', '+221770000000');

        $this->getJson("/api/property-visits/{$visit->id}")
            ->assertOk()
            ->assertJsonPath('data.customer.id', $customer->id)
            ->assertJsonPath('data.customer.user_id', $customerUser->id)
            ->assertJsonPath('data.customer.last_name', 'Diop')
            ->assertJsonPath('data.customer.email', 'awa.diop@example.test');
    }
}
