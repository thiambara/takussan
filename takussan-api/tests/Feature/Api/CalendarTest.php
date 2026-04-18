<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CalendarTest extends TestCase
{
    use RefreshDatabase;

    public function test_calendar_returns_bookings_and_visits(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        $customer = Customer::factory()->create();
        Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
        ]);

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(2),
        ]);

        Sanctum::actingAs($owner);

        $response = $this->getJson('/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString());

        $response->assertOk()
            ->assertJsonCount(2, 'data');

        $types = collect($response->json('data'))->pluck('type')->sort()->values();
        $this->assertEquals(['booking', 'visit'], $types->toArray());
    }

    public function test_calendar_requires_date_range(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/calendar')->assertStatus(422);
    }

    public function test_calendar_scopes_to_owner_only(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();

        $ownerProperty = Property::factory()->create(['user_id' => $owner->id]);
        $otherProperty = Property::factory()->create(['user_id' => $other->id]);

        Booking::factory()->create([
            'property_id' => $ownerProperty->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        Booking::factory()->create([
            'property_id' => $otherProperty->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/calendar?start_date='.now()->toDateString().'&end_date='.now()->addWeek()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
}
