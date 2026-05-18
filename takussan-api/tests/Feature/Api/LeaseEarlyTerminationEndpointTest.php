<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaseEarlyTerminationEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Listener notifies tenant + landlord (both Users in this scaffold);
        // fake the Notification facade so the listener doesn't try to write
        // to the missing `notifications` table.
        Notification::fake();
    }

    public function test_landlord_can_request_early_termination_with_valid_notice(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $effective = now()->addDays(45)->toDateString();

        $response = $this->postJson("/api/leases/{$lease->id}/early-termination", [
            'effective_date' => $effective,
            'reason' => 'Tenant relocation',
        ])->assertCreated();

        $this->assertSame(LeaseStatus::Terminating->value, $response->json('data.status'));
        $this->assertSame($effective, $response->json('data.early_termination_effective_date'));
        $this->assertNotNull($response->json('data.early_termination_invoice_id'));
        $this->assertEquals(800_000.0, (float) $response->json('data.early_termination_penalty_amount'));
    }

    public function test_request_returns_422_when_notice_too_short(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/early-termination", [
            'effective_date' => now()->addDays(10)->toDateString(),
        ])->assertStatus(422);
    }

    public function test_double_request_returns_422_already_in_progress(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/early-termination", [
            'effective_date' => now()->addDays(45)->toDateString(),
        ])->assertCreated();

        $this->postJson("/api/leases/{$lease->id}/early-termination", [
            'effective_date' => now()->addDays(60)->toDateString(),
        ])->assertStatus(422);
    }

    public function test_cancel_before_effective_date_reverts_to_active(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/early-termination", [
            'effective_date' => now()->addDays(45)->toDateString(),
        ])->assertCreated();

        $response = $this->deleteJson("/api/leases/{$lease->id}/early-termination")
            ->assertStatus(200);

        $this->assertSame(LeaseStatus::Active->value, $response->json('data.status'));
    }

    public function test_cancel_after_penalty_paid_returns_422(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/early-termination", [
            'effective_date' => now()->addDays(45)->toDateString(),
        ])->assertCreated();

        $invoiceId = $lease->fresh()->early_termination_invoice_id;
        Invoice::find($invoiceId)->forceFill(['status' => InvoiceStatus::Paid])->save();

        $this->deleteJson("/api/leases/{$lease->id}/early-termination")->assertStatus(422);
    }

    public function test_tenant_can_open_their_own_request_without_terminate_permission(): void
    {
        [, $lease, $tenantUser] = $this->scaffold();
        Sanctum::actingAs($tenantUser);

        $this->postJson("/api/leases/{$lease->id}/early-termination", [
            'effective_date' => now()->addDays(45)->toDateString(),
        ])->assertCreated();
    }

    public function test_stranger_cannot_request_early_termination(): void
    {
        [, $lease] = $this->scaffold();
        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);

        $this->postJson("/api/leases/{$lease->id}/early-termination", [
            'effective_date' => now()->addDays(45)->toDateString(),
        ])->assertStatus(403);
    }

    public function test_confirm_succeeds_when_paid_and_date_reached(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/early-termination", [
            'effective_date' => now()->addDays(45)->toDateString(),
        ])->assertCreated();

        $invoiceId = $lease->fresh()->early_termination_invoice_id;
        Invoice::find($invoiceId)->forceFill(['status' => InvoiceStatus::Paid])->save();

        Carbon::setTestNow(now()->addDays(46));
        try {
            $response = $this->postJson("/api/leases/{$lease->id}/early-termination/confirm")
                ->assertStatus(200);
            $this->assertSame(LeaseStatus::Terminated->value, $response->json('data.status'));
        } finally {
            Carbon::setTestNow();
        }
    }

    /**
     * @return array{0: User, 1: Lease, 2: User}
     */
    private function scaffold(): array
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);

        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
            'monthly_rent' => 400_000,
            'deposit_amount' => 800_000,
        ]);

        return [$landlord, $lease, $tenantUser];
    }
}
