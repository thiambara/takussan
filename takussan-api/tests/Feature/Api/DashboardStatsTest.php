<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardStatsTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_user_scoped_stats(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);
        Booking::factory()->count(2)->create([
            'property_id' => $property->id,
            'status' => BookingStatus::Pending,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/dashboard/stats')
            ->assertOk()
            ->assertJsonPath('data.properties_count', 1)
            ->assertJsonPath('data.pending_bookings', 2);
    }
}
