<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Payout;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\BaseTestCase;

/**
 * TCK-088 — HTTP layer for `POST/GET /api/leases/{lease}/deposit-refund`.
 * Covers the AC matrix at the wire level: 201, 422 status, reason-required,
 * exceeds-remaining, 403 from a tenant-side caller, GET state shape, and
 * media attachments transferred onto `lease_deposit_refund`.
 */
class LeaseDepositRefundEndpointTest extends BaseTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        Storage::fake('public');
    }

    public function test_full_refund_returns_201_and_full_state(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 500000])
            ->assertCreated()
            ->assertJsonPath('data.lease.status', 'terminated')
            ->assertJsonPath('data.state.state', 'full');

        $this->assertEquals(500000, $response->json('data.lease.deposit_refunded_amount'));
        $this->assertEquals(0, $response->json('data.state.deposit_remaining'));

        $this->assertSame(1, Payout::query()->where('lease_id', $lease->id)->count());
        $this->assertSame(0, Invoice::query()->where('invoiceable_id', $lease->id)->count());
    }

    public function test_partial_refund_creates_invoice_and_sets_partial_state(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $tenant = Customer::factory()->create(['agency_id' => $admin->agency_id]);
        $lease = Lease::factory()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'tenant_id' => $tenant->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/leases/{$lease->id}/deposit-refund", [
            'amount' => 300000,
            'reason' => 'Trous dans le mur du salon',
        ])
            ->assertCreated()
            ->assertJsonPath('data.state.state', 'partial');

        $this->assertEquals(200000, $response->json('data.state.deposit_remaining'));

        $this->assertSame(1, Invoice::query()->where('invoiceable_id', $lease->id)->count());
    }

    public function test_active_lease_returns_422(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 500000])
            ->assertStatus(422);
    }

    public function test_amount_exceeding_remaining_returns_422(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 999999])
            ->assertStatus(422);
    }

    public function test_partial_refund_without_reason_returns_422(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 100000])
            ->assertStatus(422);
    }

    public function test_tenant_side_user_gets_403(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $tenantUser = User::factory()->create();
        $tenantCustomer = Customer::factory()->create([
            'user_id' => $tenantUser->id,
            'agency_id' => $admin->agency_id,
        ]);
        $lease = Lease::factory()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'tenant_id' => $tenantCustomer->id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        // tenant role does NOT have `leases.refund_deposit`
        $tenantUser->assignRole('tenant');
        Sanctum::actingAs($tenantUser);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 500000])
            ->assertStatus(403);
    }

    public function test_show_returns_state_and_attachments(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        $lease->addMedia(UploadedFile::fake()->image('damage.jpg'))
            ->toMediaCollection('lease_deposit_refund');

        Sanctum::actingAs($admin);

        $response = $this->getJson("/api/leases/{$lease->id}/deposit-refund")
            ->assertOk()
            ->assertJsonPath('data.state', 'none')
            ->assertJsonCount(1, 'data.attachments');

        $this->assertEquals(500000, $response->json('data.deposit_amount'));
        $this->assertEquals(500000, $response->json('data.deposit_remaining'));
    }

    public function test_attachments_are_moved_to_dedicated_collection_on_refund(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => LeaseStatus::Terminated,
            'deposit_amount' => 500000,
        ]);

        $upload = $lease->addMedia(UploadedFile::fake()->image('damage.jpg'))
            ->toMediaCollection('default');

        Sanctum::actingAs($admin);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", [
            'amount' => 200000,
            'reason' => 'fissures',
            'attachments' => [$upload->id],
        ])->assertCreated();

        $this->assertSame(
            'lease_deposit_refund',
            $upload->fresh()->collection_name
        );
    }
}
