<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaseTest extends TestCase
{
    use RefreshDatabase;

    public function test_landlord_can_create_lease(): void
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();

        Sanctum::actingAs($landlord);

        $this->postJson('/api/leases', [
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'type' => 'residential_rent',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 400000,
            'deposit_amount' => 800000,
            'currency' => 'XOF',
            'payment_day' => 5,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.type', 'residential_rent');

        $this->assertDatabaseCount('leases', 1);
    }

    public function test_activate_and_terminate_lease(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create(['landlord_id' => $landlord->id]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/activate")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => 'mutual agreement'])
            ->assertOk()
            ->assertJsonPath('data.status', 'terminated');
    }

    public function test_create_lease_payment_and_mark_paid(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->active()->create(['landlord_id' => $landlord->id]);

        Sanctum::actingAs($landlord);

        $response = $this->postJson("/api/leases/{$lease->id}/payments", [
            'amount' => 400000,
            'payment_type' => 'rent',
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-31',
            'due_date' => '2026-01-05',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending');

        $paymentId = $response->json('data.id');

        $this->postJson("/api/lease-payments/{$paymentId}/mark-paid")
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');
    }

    public function test_can_renew_active_lease(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'end_date' => now()->subDay()->toDateString(),
        ]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/renew", [
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 450000,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.monthly_rent', 450000);
    }

    public function test_cannot_renew_inactive_lease(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'status' => LeaseStatus::Draft->value,
            'end_date' => now()->subDay()->toDateString(),
        ]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/renew", [
            'end_date' => now()->addYear()->toDateString(),
        ])->assertStatus(422);
    }

    public function test_cannot_activate_already_active_lease(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->active()->create(['landlord_id' => $landlord->id]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/activate")
            ->assertStatus(422);
    }
}
