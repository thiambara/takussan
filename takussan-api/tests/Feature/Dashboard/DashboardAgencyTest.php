<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Services\Dashboard\KpiResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * Tests for GET /api/dashboard/agency (TCK-032 P1).
 */
class DashboardAgencyTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_primary_admin_receives_agency_summary(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        Property::factory()->count(3)->create(['agency_id' => $agency->id]);
        Lease::factory()->active()->create([
            'agency_id' => $agency->id,
            'monthly_rent' => 150_000,
            'commission_amount' => 50_000,
            'signed_at' => now(),
        ]);

        $response = $this->apiGet('/api/dashboard/agency')->assertOk();

        $response->assertJsonStructure([
            'data' => [
                'agency_id',
                'period' => ['start', 'end'],
                'properties' => ['total', 'rented', 'available', 'published'],
                'leases' => ['active'],
                'customers_count',
                'members_count',
                'bookings' => ['pending'],
                'maintenance' => ['open'],
                'finance' => [
                    'revenue_month',
                    'commission_month',
                    'overdue_count',
                    'overdue_amount',
                    'unpaid_rate_percent',
                ],
                'occupancy' => ['rate_percent'],
            ],
        ]);

        $this->assertSame($agency->id, $response->json('data.agency_id'));
        $this->assertSame(3, $response->json('data.properties.total'));
        $this->assertSame(1, $response->json('data.leases.active'));
    }

    /**
     * P93.05 (TCK-1114) — sans bien éligible longue durée, le taux d'occupation n'a pas de
     * dénominateur : `null`, comme `short_stay_percent` (TCK-595), et non 0 %.
     */
    public function test_occupancy_rate_is_null_without_any_eligible_property(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $response = $this->apiGet('/api/dashboard/agency')->assertOk();

        $this->assertSame(0, $response->json('data.properties.total'));
        $this->assertNull($response->json('data.occupancy.rate_percent'));
        $this->assertArrayHasKey('rate_percent', $response->json('data.occupancy'));
        $this->assertNull(app(KpiResolver::class)->forAgency($agency)['occupancy_rate_percent']);
    }

    /**
     * P93.06 (TCK-1115) — « publiés » compte par le prédicat du catalogue (`Property::public()`)
     * borné à l'agence : un bien vendu, même publié, n'est plus au catalogue.
     */
    public function test_published_count_follows_the_public_catalogue(): void
    {
        $agency = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $publie = [
            'agency_id' => $agency->id,
            'published_at' => now()->subDay(),
            'visibility' => PropertyVisibility::Public,
            'is_test' => false,
        ];
        $disponible = Property::factory()->create($publie + ['status' => PropertyStatus::Available]);
        Property::factory()->create($publie + ['status' => PropertyStatus::Sold]);
        // Un bien public d'une autre agence ne compte pas.
        Property::factory()->create(['agency_id' => Agency::factory()->create(['status' => AgencyStatus::Active])->id] + $publie + ['status' => PropertyStatus::Available]);

        $this->assertTrue(Property::query()->public()->whereKey($disponible->id)->exists());

        $response = $this->apiGet('/api/dashboard/agency')->assertOk();

        $this->assertSame(2, $response->json('data.properties.total'));
        $this->assertSame(1, $response->json('data.properties.published'));
    }

    public function test_user_from_different_agency_is_denied(): void
    {
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiGet('/api/dashboard/agency?agency_id='.$other->id)->assertForbidden();
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->apiGet('/api/dashboard/agency')->assertUnauthorized();
    }

    public function test_finance_summary_computes_revenue_and_overdue(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $lease = Lease::factory()->active()->create([
            'agency_id' => $agency->id,
            'monthly_rent' => 200_000,
        ]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);

        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 100_000,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
            'due_date' => now()->toDateString(),
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 100_000,
            'status' => PaymentStatus::Late,
            'paid_at' => null,
            'due_date' => now()->subDays(5)->toDateString(),
        ]);

        $data = $this->apiGet('/api/dashboard/agency')->assertOk()->json('data');

        $this->assertEquals(100_000.0, $data['finance']['revenue_month']);
        $this->assertSame(1, $data['finance']['overdue_count']);
        $this->assertEquals(100_000.0, $data['finance']['overdue_amount']);
        $this->assertGreaterThan(0, $data['finance']['unpaid_rate_percent']);
    }

    /**
     * P93.03 (TCK-1177) — le taux d'impayés rapporte l'impayé des échéances échues sur 12 mois au
     * facturé échu des mêmes échéances : borné à 100, juste quand l'impayé vient d'un bail clos, et
     * `null` sans échéance échue.
     */
    public function test_p93_03_unpaid_rate_is_owed_over_billed_of_the_same_past_due_installments(): void
    {
        Carbon::setTestNow('2026-07-15 00:00:00');
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);
        $rate = fn (): mixed => $this->apiGet('/api/dashboard/agency')->assertOk()->json('data.finance.unpaid_rate_percent');

        $this->assertNull($rate(), 'aucune échéance échue : pas de dénominateur');

        $closed = Lease::factory()->create(['agency_id' => $agency->id, 'status' => LeaseStatus::Terminated, 'monthly_rent' => 50_000]);
        $due = fn (Lease $l, float $amount, PaymentStatus $status, string $date) => LeasePayment::factory()->create([
            'lease_id' => $l->id,
            'amount' => $amount,
            'status' => $status,
            'paid_at' => $status === PaymentStatus::Paid ? $date : null,
            'due_date' => $date,
        ]);
        $due($closed, 50_000, PaymentStatus::Pending, '2026-05-05');

        $this->assertEquals(100.0, $rate(), 'seul bail terminé, impayé : 0 % avant');

        $active = Lease::factory()->active()->create(['agency_id' => $agency->id, 'monthly_rent' => 100_000]);
        foreach (['2026-04-05', '2026-05-05', '2026-06-05'] as $date) {
            $due($active, 100_000, PaymentStatus::Late, $date);
        }
        $due($active, 100_000, PaymentStatus::Paid, '2026-03-05');
        $due($active, 100_000, PaymentStatus::Pending, '2026-07-20');
        $due($active, 100_000, PaymentStatus::Late, '2025-06-05');

        $data = $this->apiGet('/api/dashboard/agency')->assertOk()->json('data.finance');
        // 350 000 impayés sur 450 000 facturés échus depuis le 2025-07-15 (350 % avant).
        $this->assertEquals(77.78, $data['unpaid_rate_percent']);
        $this->assertEquals(450000.0, $data['overdue_amount'], 'l\'impayé cumulé, lui, ne change pas');
    }

    public function test_timeseries_returned_when_requested(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $response = $this->apiGet('/api/dashboard/agency?include=timeseries&months=6')->assertOk();

        $this->assertCount(6, $response->json('timeseries.months'));
        $this->assertCount(6, $response->json('timeseries.revenue'));
        $this->assertCount(6, $response->json('timeseries.occupancy'));
    }

    public function test_sparse_fields_filter_sections(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $data = $this->apiGet('/api/dashboard/agency?fields[summary]=finance,occupancy')
            ->assertOk()
            ->json('data');

        $this->assertArrayHasKey('finance', $data);
        $this->assertArrayHasKey('occupancy', $data);
        $this->assertArrayHasKey('agency_id', $data); // always present
        $this->assertArrayNotHasKey('properties', $data);
    }

    public function test_individual_agency_admin_receives_403(): void
    {
        $agency = Agency::factory()->individual()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $this->apiGet('/api/dashboard/agency')->assertForbidden();

        $agency->update(['kind' => AgencyKind::Standard]);

        $this->apiGet('/api/dashboard/agency')->assertOk();
    }
}
