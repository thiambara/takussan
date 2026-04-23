<?php

namespace Tests\Feature\Dashboard;

use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Tests for GET /api/dashboard/tenant (TCK-032 P1).
 */
class DashboardTenantTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_tenant_without_profile_receives_empty_summary(): void
    {
        $this->apiActingAsRole('customer');
        $data = $this->apiGet('/api/dashboard/tenant')->assertOk()->json('data');

        $this->assertFalse($data['has_customer_profile']);
        $this->assertNull($data['customer_id']);
        $this->assertSame(0, $data['leases']['active']);
    }

    public function test_tenant_with_profile_receives_payments_and_lease(): void
    {
        $user = $this->apiActingAsRole('customer');
        $customer = Customer::factory()->create(['user_id' => $user->id]);

        $lease = Lease::factory()->active()->create([
            'tenant_id' => $customer->id,
        ]);

        // Next upcoming
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 80_000,
            'status' => PaymentStatus::Pending,
            'due_date' => now()->addDays(5)->toDateString(),
        ]);
        // Overdue
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 80_000,
            'status' => PaymentStatus::Late,
            'due_date' => now()->subDays(10)->toDateString(),
        ]);

        $data = $this->apiGet('/api/dashboard/tenant')->assertOk()->json('data');

        $this->assertTrue($data['has_customer_profile']);
        $this->assertSame(1, $data['leases']['active']);
        $this->assertNotNull($data['payments']['next_due']);
        $this->assertSame(1, $data['payments']['overdue_count']);
        // upcoming_30d = entries whose due_date is within [today, today+30d] — 1 matches.
        $this->assertGreaterThanOrEqual(1, count($data['payments']['upcoming_30d']));
    }

    public function test_recent_documents_are_returned(): void
    {
        $user = $this->apiActingAsRole('customer');
        $customer = Customer::factory()->create(['user_id' => $user->id]);

        Document::factory()->create([
            'documentable_type' => Customer::class,
            'documentable_id' => $customer->id,
            'uploaded_by' => $user->id,
            'name' => 'contrat.pdf',
            'type' => DocumentType::LeaseContract,
        ]);

        $data = $this->apiGet('/api/dashboard/tenant')->assertOk()->json('data');

        $this->assertNotEmpty($data['documents']['recent']);
        $this->assertSame('contrat.pdf', $data['documents']['recent'][0]['name']);
    }

    public function test_unauthenticated_is_rejected(): void
    {
        $this->apiGet('/api/dashboard/tenant')->assertUnauthorized();
    }
}
