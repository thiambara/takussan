<?php

namespace Tests\Feature\Api;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\BaseTestCase;

/**
 * TCK-088 — Smoke tests preserved from TCK-027 but ported to the new
 * `/deposit-refund` endpoint. The richer scenarios (partial, retention
 * invoice, idempotency, …) live in `LeaseDepositRefundEndpointTest` and
 * `Tests\Unit\Lease\DepositRefundServiceTest`.
 */
class LeaseRefundTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_refund_deposit_on_terminated_lease(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $landlord = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'agency_id' => $landlord->agency_id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($landlord);

        $response = $this->postJson("/api/leases/{$lease->id}/deposit-refund", [
            'amount' => 500000,
        ])
            ->assertCreated()
            ->assertJsonPath('data.state.state', 'full');

        $this->assertEquals(500000, $response->json('data.lease.deposit_refunded_amount'));
    }

    public function test_cannot_refund_deposit_on_active_lease(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $landlord = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'agency_id' => $landlord->agency_id,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 500000])
            ->assertStatus(422);
    }

    public function test_cannot_double_refund_deposit_after_full(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $landlord = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'agency_id' => $landlord->agency_id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 500000])
            ->assertCreated();

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 1])
            ->assertStatus(422);
    }

    public function test_early_termination_creates_penalty_payment(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'end_date' => now()->addMonths(6)->toDateString(),
            'monthly_rent' => 300000,
        ]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/terminate", ['reason' => 'early exit'])
            ->assertOk()
            ->assertJsonPath('data.status', 'terminated');

        $this->assertDatabaseHas('lease_payments', [
            'lease_id' => $lease->id,
            'payment_type' => 'penalty',
        ]);
    }
}
