<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Tests for GET /api/export/{entity} (TCK-032 P2).
 */
class ExportControllerTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_unknown_entity_returns_404(): void
    {
        $this->apiActingAsRole('agency_admin');
        $this->apiGet('/api/export/widgets?format=csv')->assertStatus(404);
    }

    public function test_unauthenticated_is_rejected(): void
    {
        $this->apiGet('/api/export/payments')->assertUnauthorized();
    }

    public function test_csv_payments_export_matches_scope(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $lease = Lease::factory()->active()->create(['agency_id' => $agency->id]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 123_456,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
        ]);

        // Noise: another agency's payment must not leak.
        $otherLease = Lease::factory()->active()->create();
        LeasePayment::factory()->create([
            'lease_id' => $otherLease->id,
            'amount' => 999_999,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
        ]);

        $response = $this->apiGet('/api/export/payments?format=csv');
        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

        $body = $response->streamedContent();
        $this->assertStringContainsString('reference', $body);
        $this->assertStringContainsString('123456', $body);
        $this->assertStringNotContainsString('999999', $body);
    }

    public function test_xlsx_payments_export_returns_spreadsheet(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $response = $this->apiGet('/api/export/payments?format=xlsx');
        $response->assertOk();

        $contentType = $response->headers->get('Content-Type');
        $this->assertTrue(
            str_contains((string) $contentType, 'spreadsheetml') || str_contains((string) $contentType, 'officedocument'),
            "Expected XLSX Content-Type, got: {$contentType}",
        );
    }

    public function test_pdf_leases_export_returns_pdf(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $response = $this->apiGet('/api/export/leases?format=pdf');
        $response->assertOk();

        $contentType = $response->headers->get('Content-Type');
        $this->assertStringContainsString('application/pdf', (string) $contentType);

        // A valid PDF starts with "%PDF-"
        $body = $response->getContent();
        $this->assertStringStartsWith('%PDF-', (string) $body);
    }

    public function test_customers_export_is_denied_for_tenants(): void
    {
        $this->apiActingAsRole('customer');
        $this->apiGet('/api/export/customers?format=csv')->assertForbidden();
    }

    public function test_properties_export_is_allowed_for_owner(): void
    {
        $owner = $this->apiActingAsRole('owner');
        Property::factory()->count(2)->create(['user_id' => $owner->id]);

        $response = $this->apiGet('/api/export/properties?format=csv');
        $response->assertOk();

        $body = $response->streamedContent();
        $this->assertStringContainsString('reference', $body);
    }

    public function test_invalid_format_is_rejected(): void
    {
        $this->apiActingAsRole('agency_admin');
        $this->apiGet('/api/export/payments?format=tsv')->assertStatus(422);
    }

    public function test_date_range_filters_are_applied(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $lease = Lease::factory()->active()->create(['agency_id' => $agency->id]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);

        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 111_111,
            'status' => PaymentStatus::Paid,
            'due_date' => now()->subMonths(6)->toDateString(),
            'paid_at' => now()->subMonths(6),
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 222_222,
            'status' => PaymentStatus::Paid,
            'due_date' => now()->toDateString(),
            'paid_at' => now(),
        ]);

        $body = $this->apiGet('/api/export/payments?format=csv&from='.now()->subDays(15)->toDateString())
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('222222', $body);
        $this->assertStringNotContainsString('111111', $body);
    }
}
