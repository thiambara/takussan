<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AgencyDetailTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_view_agency_detail(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['name' => 'Dakar Immo']);

        $this->getJson("/api/admin/agencies/{$agency->id}?fields[agencies]=id,name,slug,status,email")
            ->assertOk()
            ->assertJsonPath('data.id', $agency->id)
            ->assertJsonPath('data.name', 'Dakar Immo')
            ->assertJsonMissingPath('data.settings');
    }

    public function test_agency_admin_is_forbidden_on_detail_routes(): void
    {
        $this->actingAsRole('agency_admin');
        $agency = Agency::factory()->create();

        foreach ([
            "/api/admin/agencies/{$agency->id}",
            "/api/admin/agencies/{$agency->id}/health",
            "/api/admin/agencies/{$agency->id}/team",
            "/api/admin/agencies/{$agency->id}/properties",
        ] as $uri) {
            $this->getJson($uri)->assertForbidden();
        }
    }

    public function test_health_payload_counts_agency_activity(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $otherAgency = Agency::factory()->create();

        $active = Property::factory()->create([
            'agency_id' => $agency->id,
            'status' => PropertyStatus::Available,
        ]);
        Property::factory()->create([
            'agency_id' => $agency->id,
            'status' => PropertyStatus::PendingReview,
            'published_at' => null,
        ]);
        Property::factory()->create([
            'agency_id' => $otherAgency->id,
            'status' => PropertyStatus::Available,
        ]);

        $booking = Booking::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $active->id,
        ]);
        BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'status' => PaymentStatus::Paid,
            'amount' => 125000,
            'paid_at' => now()->subDays(3),
        ]);

        $lease = Lease::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $active->id,
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'status' => PaymentStatus::Paid,
            'amount' => 75000,
            'paid_at' => now()->subDays(2),
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'status' => PaymentStatus::Paid,
            'amount' => 99999,
            'paid_at' => now()->subDays(45),
        ]);

        PropertyReport::query()->create([
            'property_id' => $active->id,
            'reason' => 'fraud',
            'details' => 'Suspicious listing',
        ]);

        $this->getJson("/api/admin/agencies/{$agency->id}/health")
            ->assertOk()
            ->assertJsonPath('data.active_properties', 1)
            ->assertJsonPath('data.properties_in_moderation', 1)
            ->assertJsonPath('data.transactions_30d', 2)
            ->assertJsonPath('data.revenue_30d', 200000)
            ->assertJsonPath('data.open_complaints', 1)
            ->assertJsonStructure(['data' => ['last_platform_payment_at']]);
    }

    public function test_team_and_properties_are_paginated(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $user = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Diallo']);
        AgentProfile::factory()->create(['agency_id' => $agency->id, 'user_id' => $user->id]);
        Property::factory()->create(['agency_id' => $agency->id, 'title' => 'Villa Almadies']);

        // TCK-278 — `include=roles` était un alias spatie ; les rôles sont
        // désormais dérivés des profils polymorphes et déjà inclus dans la
        // réponse via `$user->profileTypes()` côté controller.
        $this->getJson("/api/admin/agencies/{$agency->id}/team?fields[users]=id,first_name,last_name,email,status&per_page=10")
            ->assertOk()
            ->assertJsonPath('data.0.full_name', 'Awa Diallo')
            ->assertJsonStructure(['meta' => ['total', 'current_page', 'last_page', 'per_page']]);

        $this->getJson("/api/admin/agencies/{$agency->id}/properties?fields[properties]=id,agency_id,reference_number,title,slug,type,contract_type,status,visibility,price,currency,published_at,created_at&include=address,agency&per_page=10")
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Villa Almadies')
            ->assertJsonStructure(['meta' => ['total', 'current_page', 'last_page', 'per_page']]);
    }
}
