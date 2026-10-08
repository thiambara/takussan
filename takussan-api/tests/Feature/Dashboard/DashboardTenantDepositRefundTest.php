<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-595 — AC16 bis : un client de deux agences lit TOUTES ses fiches, et une restitution de caution
 * (qu'il reçoit) n'est ni son « prochain loyer », ni un impayé, ni une dette qui bloque la suppression
 * de son compte (H-2, vérification de TCK-594).
 */
class DashboardTenantDepositRefundTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array{user: User, x: Customer, y: Customer, leaseX: Lease, leaseY: Lease} */
    private function clientOfTwoAgencies(): array
    {
        Carbon::setTestNow('2026-07-15 09:00:00');
        $user = $this->apiActingAsRole('customer');
        // X d'abord : c'est la fiche que `->first()` lisait seule.
        $x = Customer::factory()->create(['user_id' => $user->id, 'agency_id' => Agency::factory()->create()->id]);
        $y = Customer::factory()->create(['user_id' => $user->id, 'agency_id' => Agency::factory()->create()->id]);
        $leaseX = Lease::factory()->create(['tenant_id' => $x->id, 'agency_id' => $x->agency_id, 'status' => LeaseStatus::Active]);
        $leaseY = Lease::factory()->create(['tenant_id' => $y->id, 'agency_id' => $y->agency_id, 'status' => LeaseStatus::Active]);

        $due = fn (Lease $l, Customer $c, LeasePaymentType $type, int $amount, string $date) => LeasePayment::factory()->create([
            'lease_id' => $l->id, 'payer_id' => $c->id, 'payment_type' => $type,
            'amount' => $amount, 'status' => PaymentStatus::Pending, 'due_date' => $date,
        ]);
        $due($leaseY, $y, LeasePaymentType::Rent, 100_000, '2026-07-05');
        $due($leaseX, $x, LeasePaymentType::Rent, 120_000, '2026-08-01');
        $due($leaseX, $x, LeasePaymentType::DepositRefund, 40_000, '2026-07-20');

        return compact('user', 'x', 'y', 'leaseX', 'leaseY');
    }

    public function test_ac16bis_all_customer_records_are_read_and_a_deposit_refund_is_never_due(): void
    {
        $this->clientOfTwoAgencies();

        $data = $this->apiGet('/api/dashboard/tenant')->assertOk()->json('data');

        $this->assertSame(2, $data['leases']['active']);
        $this->assertSame(1, $data['payments']['overdue_count']);
        $this->assertEquals(100000.0, $data['payments']['overdue_amount']);
        $this->assertEquals(120000.0, $data['payments']['next_due']['amount']);
        $this->assertNotContains(40000.0, array_map('floatval', array_column($data['payments']['upcoming_30d'], 'amount')));
    }

    public function test_an_overdue_deposit_refund_is_not_an_overdue_payment(): void
    {
        $ref = $this->clientOfTwoAgencies();
        Carbon::setTestNow('2026-07-25 09:00:00');

        $data = $this->apiGet('/api/dashboard/tenant')->assertOk()->json('data');

        // La restitution du 20 est échue : elle n'est toujours pas une dette du locataire.
        $this->assertSame(1, $data['payments']['overdue_count']);
        $this->assertEquals(100000.0, $data['payments']['overdue_amount']);
        $this->assertNotNull($ref['user']);
    }

    public function test_h2_a_pending_deposit_refund_does_not_block_account_deletion(): void
    {
        Carbon::setTestNow('2026-07-15 09:00:00');
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $lease = Lease::factory()->create(['tenant_id' => $customer->id, 'status' => LeaseStatus::Terminated]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id, 'payer_id' => $customer->id, 'payment_type' => LeasePaymentType::DepositRefund,
            'amount' => 40_000, 'status' => PaymentStatus::Pending, 'due_date' => '2026-07-01',
        ]);

        $types = array_column(app(AccountDeletionService::class)->collectOpenObligations($user), 'type');

        $this->assertNotContains('lease_payment', $types);
    }
}
