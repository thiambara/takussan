<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 — AC18 : la balance âgée applique la règle *Impayé* (`pending | late` échu, hors restitution).
 *
 * Les loyers restent `pending` : leurs baux n'ont pas de `late_fee_percent`, donc rien ne les fait
 * passer à `late`. C'est le cas que l'onglet Impayés (`filter[status]=late`) rendait vide.
 */
class AgingBalanceTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    /** @var array<string, User> */
    private array $landlords = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-15 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);

        foreach (['L1' => [10, 40], 'L2' => [75, 120]] as $name => $daysLate) {
            $landlord = User::factory()->create();
            $this->landlords[$name] = $landlord;
            $lease = $this->leaseOf($landlord);
            foreach ($daysLate as $days) {
                $this->payment($lease, LeasePaymentType::Rent, PaymentStatus::Pending, 100_000, now()->subDays($days));
            }
            $this->payment($lease, LeasePaymentType::Deposit, PaymentStatus::Paid, 200_000, now()->subYear());
        }
        // Une restitution de caution échue : le locataire la REÇOIT, ce n'est pas un impayé.
        $refunded = $this->leaseOf($this->landlords['L1']);
        $this->payment($refunded, LeasePaymentType::Deposit, PaymentStatus::Paid, 150_000, now()->subYear());
        $this->payment($refunded, LeasePaymentType::DepositRefund, PaymentStatus::Pending, 150_000, now()->subDays(20));
        $this->payment($refunded, LeasePaymentType::DepositRefund, PaymentStatus::Paid, 50_000, now()->subDays(30));

        // Une autre agence : jamais dans la balance.
        $foreign = Lease::factory()->create(['agency_id' => Agency::factory()->create()->id, 'late_fee_percent' => null]);
        $this->payment($foreign, LeasePaymentType::Rent, PaymentStatus::Pending, 999_000, now()->subDays(40));
    }

    private function leaseOf(User $landlord): Lease
    {
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $this->agency->id]);

        return Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);
    }

    private function payment(Lease $lease, LeasePaymentType $type, PaymentStatus $status, float $amount, Carbon $due): void
    {
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => $type,
            'status' => $status,
            'amount' => $amount,
            'due_date' => $due->toDateString(),
            'paid_at' => $status === PaymentStatus::Paid ? $due : null,
        ]);
    }

    private function aging(string $groupBy = 'tenant'): array
    {
        $this->actingAsApi($this->admin);

        return $this->getJson("/api/agencies/{$this->agency->id}/finance/aging?group_by={$groupBy}")->assertOk()->json('data');
    }

    public function test_ac18_one_pending_rent_in_each_bucket_and_no_deposit_refund(): void
    {
        $data = $this->aging();

        foreach (['1_30', '31_60', '61_90', '90_plus'] as $bucket) {
            $this->assertSame(1, $data['buckets'][$bucket]['count'], $bucket);
            $this->assertEquals(100000.0, $data['buckets'][$bucket]['amount'], $bucket);
        }
        $this->assertSame(['count' => 4, 'amount' => 400000], $data['total']);
        $this->assertCount(2, $data['rows']);
    }

    public function test_ac18_group_by_landlord_totals_per_landlord(): void
    {
        $rows = collect($this->aging('landlord')['rows'])->keyBy('id');

        $this->assertEquals(200000.0, $rows[$this->landlords['L1']->id]['total']['amount']);
        $this->assertSame(1, $rows[$this->landlords['L1']->id]['buckets']['1_30']['count']);
        $this->assertSame(1, $rows[$this->landlords['L1']->id]['buckets']['31_60']['count']);
        $this->assertEquals(200000.0, $rows[$this->landlords['L2']->id]['total']['amount']);
        $this->assertSame(1, $rows[$this->landlords['L2']->id]['buckets']['90_plus']['count']);
    }

    public function test_ac18_deposits_held_follow_the_dashboard_rule(): void
    {
        $deposits = $this->aging()['deposits_held'];

        // 200 000 + 200 000 + 150 000 encaissés, 50 000 restitués (la restitution `pending` ne compte pas).
        $this->assertEquals(500000.0, $deposits['total']);
        $byLandlord = collect($deposits['by_landlord'])->keyBy('landlord_id');
        $this->assertEquals(300000.0, $byLandlord[$this->landlords['L1']->id]['amount']);
        $this->assertEquals(200000.0, $byLandlord[$this->landlords['L2']->id]['amount']);

        $this->assertEquals(500000.0, $this->getJson('/api/dashboard/agency')->assertOk()->json('data.finance.deposits_held'));
    }

    public function test_ac18_consolidation_the_late_filter_misses_what_the_tile_counts(): void
    {
        $this->actingAsApi($this->admin);

        $this->assertCount(0, $this->getJson('/api/payments/history?filter[status]=late')->assertOk()->json('data'));
        $finance = $this->getJson('/api/dashboard/agency')->assertOk()->json('data.finance');
        $this->assertSame(4, $finance['overdue_count']);
        $this->assertEquals(400000.0, $finance['overdue_amount']);
        $this->assertSame(['count' => 4, 'amount' => 400000], $this->aging()['total']);
    }

    /**
     * TCK-596 (VERIF-596 M-E) — une échéance `cancelled` (remplacée par un renouvellement) n'est plus
     * due : ni dans la balance âgée, ni dans les impayés de la tuile, ni dans l'export, ni dans
     * l'encaissé. Elle porte ici un `paid_at` du mois, pour qu'une règle par date et non par statut
     * se voie.
     */
    public function test_a_cancelled_installment_is_neither_owed_nor_collected(): void
    {
        $this->actingAsApi($this->admin);
        $incomeBefore = $this->getJson('/api/dashboard/agency')->assertOk()->json('data.finance.lease_income_month');

        $lease = $this->leaseOf($this->landlords['L2']);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'reference_number' => 'LPY-CANCELLED',
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Cancelled,
            'amount' => 700_000,
            'due_date' => now()->subDays(40)->toDateString(),
            'paid_at' => now()->subDay(),
        ]);

        $this->assertSame(['count' => 4, 'amount' => 400000], $this->aging()['total']);
        $finance = $this->getJson('/api/dashboard/agency')->assertOk()->json('data.finance');
        $this->assertSame(4, $finance['overdue_count']);
        $this->assertEquals(400000.0, $finance['overdue_amount']);
        $this->assertEquals($incomeBefore, $finance['lease_income_month']);

        $csv = $this->getJson('/api/export/aging?format=csv')->assertOk()->streamedContent();
        $this->assertStringNotContainsString('LPY-CANCELLED', $csv);
    }

    public function test_an_agent_is_refused(): void
    {
        $this->actingAsApi($this->agencyAgent($this->agency))
            ->getJson("/api/agencies/{$this->agency->id}/finance/aging")
            ->assertForbidden();
    }

    public function test_an_unknown_grouping_is_rejected(): void
    {
        $this->actingAsApi($this->admin);

        $this->getJson("/api/agencies/{$this->agency->id}/finance/aging?group_by=property")
            ->assertStatus(422)->assertJsonPath('code', 'reporting.invalid_group_by');
    }
}
