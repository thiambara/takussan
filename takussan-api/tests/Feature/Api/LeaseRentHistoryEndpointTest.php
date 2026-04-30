<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\RentReviewService;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaseRentHistoryEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        Notification::fake();
    }

    public function test_history_returns_reviews_in_descending_order(): void
    {
        [$landlord, $lease, $service] = $this->scaffold();

        $service->review($lease->fresh(), $landlord, [
            'new_rent' => 215_000,
            'reason' => 'First review',
        ]);
        $service->review($lease->fresh(), $landlord, [
            'new_rent' => 230_000,
            'reason' => 'Second review',
        ]);

        Sanctum::actingAs($landlord);
        $response = $this->getJson("/api/leases/{$lease->id}/rent-history")->assertStatus(200);

        $entries = $response->json('data');
        $this->assertCount(2, $entries);
        // Most recent first: second review then first review.
        $this->assertSame('Second review', $entries[0]['reason']);
        $this->assertSame(230_000.0, (float) $entries[0]['new_rent']);
        $this->assertSame(215_000.0, (float) $entries[0]['old_rent']);

        $this->assertSame('First review', $entries[1]['reason']);
        $this->assertSame(215_000.0, (float) $entries[1]['new_rent']);
        $this->assertSame(200_000.0, (float) $entries[1]['old_rent']);
    }

    public function test_history_response_exposes_expected_fields(): void
    {
        [$landlord, $lease, $service] = $this->scaffold();

        $service->review($lease->fresh(), $landlord, [
            'new_rent' => 215_000,
            'reason' => 'Sole review',
        ]);

        Sanctum::actingAs($landlord);
        $response = $this->getJson("/api/leases/{$lease->id}/rent-history")->assertStatus(200);

        $entry = $response->json('data.0');
        $this->assertSame([
            'id', 'event', 'old_rent', 'new_rent', 'reason',
            'effective_date', 'variation_pct', 'forced',
            'causer_id', 'causer_type', 'created_at',
        ], array_keys($entry));
        $this->assertSame('lease_rent_reviewed', $entry['event']);
        $this->assertFalse($entry['forced']);
    }

    public function test_history_paginates(): void
    {
        [$landlord, $lease, $service] = $this->scaffold();
        $rent = 200_000;
        for ($i = 0; $i < 6; $i++) {
            $rent += 1_000;
            $service->review($lease->fresh(), $landlord, [
                'new_rent' => $rent,
                'reason' => "Review #{$i}",
            ]);
        }

        Sanctum::actingAs($landlord);
        $response = $this->getJson("/api/leases/{$lease->id}/rent-history?per_page=3")->assertStatus(200);

        $this->assertCount(3, $response->json('data'));
        $this->assertSame(6, $response->json('meta.total'));
        $this->assertSame(2, $response->json('meta.last_page'));
        $this->assertSame(3, $response->json('meta.per_page'));
    }

    public function test_stranger_cannot_read_history(): void
    {
        [, $lease] = $this->scaffold();
        $stranger = User::factory()->create();
        $stranger->assignRole('customer');
        Sanctum::actingAs($stranger);

        $this->getJson("/api/leases/{$lease->id}/rent-history")->assertStatus(403);
    }

    /**
     * @return array{0: User, 1: Lease, 2: RentReviewService}
     */
    private function scaffold(): array
    {
        $landlord = User::factory()->create();
        $landlord->assignRole('owner');
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();

        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'monthly_rent' => 200_000,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
        ]);

        return [$landlord, $lease, app(RentReviewService::class)];
    }
}
