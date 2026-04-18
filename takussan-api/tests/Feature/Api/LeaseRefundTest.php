<?php

namespace Tests\Feature\Api;

use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaseRefundTest extends TestCase
{
    use RefreshDatabase;

    public function test_refund_deposit_on_terminated_lease(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/refund-deposit")
            ->assertCreated()
            ->assertJsonPath('data.payment_type', 'deposit_refund')
            ->assertJsonPath('data.amount', '500000.00');
    }

    public function test_cannot_refund_deposit_on_active_lease(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/refund-deposit")
            ->assertStatus(422);
    }

    public function test_cannot_double_refund_deposit(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/refund-deposit")
            ->assertCreated();

        $this->postJson("/api/leases/{$lease->id}/refund-deposit")
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

        // A penalty payment should have been created
        $this->assertDatabaseHas('lease_payments', [
            'lease_id' => $lease->id,
            'payment_type' => 'penalty',
        ]);
    }
}
