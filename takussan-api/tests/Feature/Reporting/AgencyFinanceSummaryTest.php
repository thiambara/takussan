<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2657 — le point du mois de l'argent d'une agence :
 * `GET /api/agencies/{agency}/finance/summary?period=YYYY-MM`.
 *
 * L'encaissé est celui de la tuile de l'accueil (`CollectedPayments`, `PortfolioScope::agency`),
 * borné au mois civil lu à l'heure de Dakar ; l'impayé est celui de la balance âgée, réparti en
 * trois tranches de retard. Même autorisation que `finance/aging` (`AgencyPolicy::viewReports`).
 */
class AgencyFinanceSummaryTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private Lease $leaseA;

    private Lease $leaseB;

    private Agency $foreign;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-11 10:00:00', 'Africa/Dakar'));
        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->leaseA = $this->leaseOf($this->agency, User::factory()->create());
        $this->leaseB = $this->leaseOf($this->agency, User::factory()->create());
        $this->foreign = Agency::factory()->create();
    }

    private function leaseOf(Agency $agency, User $landlord): Lease
    {
        $property = Property::factory()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);

        return Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $landlord->id,
            'agency_id' => $agency->id,
            'tenant_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'status' => LeaseStatus::Active,
            'late_fee_percent' => null,
        ]);
    }

    private function paid(Lease $lease, float $amount, string $paidAtDakar, LeasePaymentType $type = LeasePaymentType::Rent): LeasePayment
    {
        $paidAt = Carbon::parse($paidAtDakar, 'Africa/Dakar');

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => $type,
            'status' => PaymentStatus::Paid,
            'amount' => $amount,
            'due_date' => $paidAt->toDateString(),
            'paid_at' => $paidAt,
        ]);
    }

    private function owed(Lease $lease, float $amount, int $daysLate, PaymentStatus $status = PaymentStatus::Pending): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'payment_type' => LeasePaymentType::Rent,
            'status' => $status,
            'amount' => $amount,
            'due_date' => now('Africa/Dakar')->subDays($daysLate)->toDateString(),
            'paid_at' => null,
        ]);
    }

    private function summary(?string $period = null): array
    {
        $this->actingAsApi($this->admin);
        $query = $period !== null ? "?period={$period}" : '';

        return $this->getJson("/api/agencies/{$this->agency->id}/finance/summary{$query}")->assertOk()->json('data');
    }

    public function test_ac4_collected_is_the_dakar_calendar_month_and_previous_is_the_month_before(): void
    {
        // Octobre : premier et dernier instant du mois à Dakar.
        $this->paid($this->leaseA, 100_000, '2026-10-01 00:00:00');
        $this->paid($this->leaseB, 200_000, '2026-10-31 23:30:00');
        // Le 1er novembre à 00:30, heure de Dakar : novembre, pas octobre.
        $this->paid($this->leaseA, 999_000, '2026-11-01 00:30:00');
        // Septembre : le mois précédent.
        $this->paid($this->leaseA, 50_000, '2026-09-15 12:00:00');
        $this->paid($this->leaseB, 25_000, '2026-09-30 23:59:00');
        // Une caution n'est pas un encaissement (`CollectedPayments`).
        $this->paid($this->leaseA, 300_000, '2026-10-10 10:00:00', LeasePaymentType::Deposit);
        // Un acompte de réservation sur un bien de l'agence payé en octobre en est un.
        $booking = Booking::factory()->create(['property_id' => $this->leaseA->property_id, 'agency_id' => $this->agency->id]);
        BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'status' => PaymentStatus::Paid,
            'amount' => 40_000,
            'paid_at' => Carbon::parse('2026-10-20 09:00:00', 'Africa/Dakar'),
        ]);
        // Une autre agence : jamais.
        $this->paid($this->leaseOf($this->foreign, User::factory()->create()), 777_000, '2026-10-15 10:00:00');

        $collected = $this->summary('2026-10')['collected'];

        $this->assertEquals(340_000.0, $collected['amount']);
        $this->assertSame(3, $collected['count']);
        $this->assertEquals(75_000.0, $collected['previous_amount']);
    }

    public function test_the_current_month_matches_the_dashboard_tile(): void
    {
        $this->paid($this->leaseA, 100_000, '2026-11-02 08:00:00');
        $this->paid($this->leaseB, 60_000, '2026-11-10 08:00:00');
        $this->paid($this->leaseB, 80_000, '2026-10-10 08:00:00');

        $data = $this->summary();

        $this->assertSame('2026-11', $data['period']);
        $this->assertEquals(160_000.0, $data['collected']['amount']);
        $this->assertEquals(80_000.0, $data['collected']['previous_amount']);
        $this->assertEquals(
            $this->getJson('/api/dashboard/agency')->assertOk()->json('data.finance.revenue_month'),
            $data['collected']['amount'],
        );
    }

    public function test_ac5_overdue_is_split_in_three_age_buckets(): void
    {
        $this->owed($this->leaseA, 100_000, 5);
        $this->owed($this->leaseA, 110_000, 20, PaymentStatus::Late);
        $this->owed($this->leaseB, 120_000, 40, PaymentStatus::PartiallyPaid);
        // Pas encore échue, ou échue aujourd'hui : pas un impayé.
        $this->owed($this->leaseB, 500_000, 0);
        $this->owed($this->leaseB, 500_000, -3);
        // Une autre agence : jamais.
        $this->owed($this->leaseOf($this->foreign, User::factory()->create()), 900_000, 20);

        $overdue = $this->summary()['overdue'];

        $this->assertSame(3, $overdue['count']);
        $this->assertEquals(330_000.0, $overdue['amount']);
        $this->assertSame(2, $overdue['leases_count']);
        $this->assertSame(1, $overdue['by_age']['under_8']['count']);
        $this->assertEquals(100_000.0, $overdue['by_age']['under_8']['amount']);
        $this->assertSame(1, $overdue['by_age']['from_8_to_30']['count']);
        $this->assertEquals(110_000.0, $overdue['by_age']['from_8_to_30']['amount']);
        $this->assertSame(1, $overdue['by_age']['over_30']['count']);
        $this->assertEquals(120_000.0, $overdue['by_age']['over_30']['amount']);

        $finance = $this->getJson('/api/dashboard/agency')->assertOk()->json('data.finance');
        $this->assertSame($finance['overdue_count'], $overdue['count']);
        $this->assertEquals($finance['overdue_amount'], $overdue['amount']);

        // Une seule définition du retard : l'historique en rend autant, et la seule à 40 jours au-delà de 30.
        $this->assertSame($overdue['count'], $this->getJson('/api/payments/history?filter[days_late_min]=1')->assertOk()->json('meta.total'));
        $late = $this->getJson('/api/payments/history?filter[days_late_min]=31')->assertOk()->json('data');
        $this->assertSame([40], array_column($late, 'days_late'));
    }

    /** TCK-2658 — AC6 : une relance notée fait sortir l'échéance des « jamais relancées ». */
    public function test_never_reminded_count_drops_when_the_only_unreminded_instalment_is_chased(): void
    {
        $chased = $this->owed($this->leaseA, 100_000, 12);
        $remindedByTakussan = $this->owed($this->leaseB, 100_000, 9);
        $remindedByTakussan->forceFill(['metadata' => ['reminder_overdue_7_sent_at' => now()->subDays(2)->toIso8601String()]])->saveQuietly();
        // Une échéance pas encore due, jamais relancée : hors des impayés, hors du compte.
        $this->owed($this->leaseB, 100_000, -4);

        $this->assertSame(1, $this->summary()['overdue']['never_reminded_count']);

        $this->postJson("/api/lease-payments/{$chased->id}/reminders", ['channel' => 'call'])->assertCreated();

        $overdue = $this->summary()['overdue'];
        $this->assertSame(0, $overdue['never_reminded_count']);
        $this->assertSame(2, $overdue['count']);
    }

    public function test_age_bucket_bounds_are_7_8_30_31_days(): void
    {
        foreach ([7, 8, 30, 31] as $days) {
            $this->owed($this->leaseA, 1_000, $days);
        }

        $byAge = $this->summary()['overdue']['by_age'];

        $this->assertSame([1, 2, 1], [$byAge['under_8']['count'], $byAge['from_8_to_30']['count'], $byAge['over_30']['count']]);
    }

    public function test_deposits_payouts_and_draft_invoices(): void
    {
        $this->paid($this->leaseA, 300_000, '2026-01-10 10:00:00', LeasePaymentType::Deposit);
        $this->paid($this->leaseA, 50_000, '2026-06-10 10:00:00', LeasePaymentType::DepositRefund);
        $this->paid($this->leaseB, 200_000, '2026-02-10 10:00:00', LeasePaymentType::Deposit);

        $landlordA = $this->leaseA->landlord_id;
        $landlordB = $this->leaseB->landlord_id;
        $payout = fn (int $landlordId, PayoutStatus $status, float $net, ?Agency $agency = null) => Payout::factory()->create([
            'agency_id' => ($agency ?? $this->agency)->id,
            'landlord_id' => $landlordId,
            'status' => $status,
            'gross_amount' => $net,
            'commission_amount' => 0,
            'net_amount' => $net,
        ]);
        $payout($landlordA, PayoutStatus::AwaitingApproval, 400_000);
        $payout($landlordA, PayoutStatus::AwaitingApproval, 100_000);
        $payout($landlordB, PayoutStatus::AwaitingApproval, 250_000);
        $payout($landlordB, PayoutStatus::Pending, 90_000);
        $payout($landlordB, PayoutStatus::Completed, 1_000_000);
        $payout($landlordA, PayoutStatus::Pending, 999_000, $this->foreign);

        Invoice::factory()->create(['agency_id' => $this->agency->id, 'status' => InvoiceStatus::Draft, 'subtotal' => 30_000, 'total_amount' => 30_000]);
        Invoice::factory()->create(['agency_id' => $this->agency->id, 'status' => InvoiceStatus::Draft, 'subtotal' => 45_000, 'total_amount' => 45_000]);
        Invoice::factory()->create(['agency_id' => $this->agency->id, 'status' => InvoiceStatus::Paid, 'subtotal' => 99_000, 'total_amount' => 99_000]);
        Invoice::factory()->create(['agency_id' => $this->foreign->id, 'status' => InvoiceStatus::Draft, 'subtotal' => 88_000, 'total_amount' => 88_000]);

        $data = $this->summary();

        $this->assertEquals(450_000.0, $data['deposits_held']);
        $this->assertEquals(
            $this->getJson("/api/agencies/{$this->agency->id}/finance/aging")->assertOk()->json('data.deposits_held.total'),
            $data['deposits_held'],
        );
        $this->assertSame(3, $data['payouts_awaiting_approval']['count']);
        $this->assertEquals(750_000.0, $data['payouts_awaiting_approval']['amount']);
        $this->assertSame(2, $data['payouts_awaiting_approval']['landlords_count']);
        $this->assertSame(1, $data['payouts_pending']['count']);
        $this->assertEquals(90_000.0, $data['payouts_pending']['amount']);
        $this->assertSame(2, $data['invoices_draft']['count']);
        $this->assertEquals(75_000.0, $data['invoices_draft']['amount']);
        $this->assertSame($this->agency->currency?->value ?? 'XOF', $data['currency']);
    }

    public function test_an_empty_agency_reads_zeros(): void
    {
        $data = $this->summary('2026-10');

        $this->assertSame('2026-10', $data['period']);
        $this->assertSame(['amount' => 0, 'count' => 0, 'previous_amount' => 0], $data['collected']);
        $this->assertSame(0, $data['overdue']['count']);
        $this->assertSame(0, $data['payouts_awaiting_approval']['landlords_count']);
    }

    public function test_an_unreadable_period_is_rejected(): void
    {
        $this->actingAsApi($this->admin);

        foreach (['2026-13', '2026-1', 'octobre', '2026-10-01'] as $period) {
            $this->getJson("/api/agencies/{$this->agency->id}/finance/summary?period={$period}")
                ->assertStatus(422)->assertJsonPath('code', 'reporting.invalid_period');
        }
        // Une valeur en liste vaut une valeur absente (ADR-0075) : le mois courant.
        $this->getJson("/api/agencies/{$this->agency->id}/finance/summary?period[]=2026-10")
            ->assertOk()->assertJsonPath('data.period', '2026-11');
    }

    public function test_ac6_an_agent_is_refused_even_with_a_bad_period(): void
    {
        $this->actingAsApi($this->agencyAgent($this->agency));

        $this->getJson("/api/agencies/{$this->agency->id}/finance/summary")->assertForbidden();
        $this->getJson("/api/agencies/{$this->agency->id}/finance/summary?period=nope")->assertForbidden();
    }

    public function test_ac6_the_admin_of_another_agency_is_refused(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->foreign));

        $this->getJson("/api/agencies/{$this->agency->id}/finance/summary")->assertForbidden();
        // La même réponse que la balance âgée, sous la même Policy.
        $this->getJson("/api/agencies/{$this->agency->id}/finance/aging")->assertForbidden();
    }
}
