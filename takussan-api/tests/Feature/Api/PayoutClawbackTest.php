<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\User;
use App\Services\Dashboard\PortfolioMetrics;
use App\Services\Dashboard\PortfolioScope;
use App\Services\Model\BookingPaymentService;
use App\Services\Model\PayoutService;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-2151 (P177.01, P205.01, P205.03 ; ADR-0039, amendement du 2026-10-24) — un remboursement
 * d'une pièce déjà reversée au bailleur crée une reprise au net de commission, datée du
 * remboursement, imputée au reversement suivant du même bailleur avec report du reliquat. Le relevé
 * lit un reversement versé par la copie de son pivot ; la reprise y est la seule ligne négative, et
 * le versé du relevé et de l'accueil compte le reversement qui l'impute avant reprise.
 */
class PayoutClawbackTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EncaissementsPlateforme;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /**
     * Le jeu de P177.01 : loyer de 200 000 et charges de 20 000 à 10 %, encaissés par l'agence,
     * reversés (198 000) et versés le 30 septembre.
     *
     * @return array{0: Agency, 1: User, 2: Lease, 3: LeasePayment, 4: LeasePayment, 5: int}
     */
    private function paidOutSeptember(): array
    {
        $this->travelTo('2026-09-30 08:00:00');
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        [$rent, $charges] = $this->septemberOf($lease);
        $this->soldeParLAgence($rent, $agency);
        $this->soldeParLAgence($charges, $agency);
        $id = $this->payout($agency, $landlord, [$rent->id, $charges->id], 198000);
        $this->complete($id, '2026-09-30 09:00:00');

        return [$agency, $landlord, $lease, $rent->refresh(), $charges->refresh(), $id];
    }

    public function test_p177_01_the_paid_out_month_is_unchanged_the_refund_is_one_line_of_its_month_and_the_next_payout_carries_it(): void
    {
        [$agency, $landlord, $lease, $rent, , $september] = $this->paidOutSeptember();

        $this->travelTo('2026-10-10 11:00:00');
        $this->assertSame(1, $this->refundByWebhook($rent, 50_000));

        $clawback = DB::table('payout_clawbacks')->sole();
        $this->assertSame([50000, 10, 5000, 45000], array_map('intval', [
            $clawback->refund_amount, $clawback->commission_rate, $clawback->commission_amount, $clawback->amount,
        ]));
        $this->assertSame($september, (int) $clawback->source_payout_id);
        $this->assertSame('2026-10-10', CarbonImmutable::parse($clawback->refunded_at)->toDateString());

        // Novembre : un loyer neuf de 200 000 donne 180 000 avant reprise, 135 000 partent.
        $this->travelTo('2026-11-20 08:00:00');
        $november = $this->leasePayment($lease, 200_000, LeasePaymentType::Rent, '2026-11-05 10:00:00');
        $next = $this->payout($agency, $landlord, [$november->id], 135000);
        $this->assertEquals(45000, Payout::findOrFail($next)->clawback_amount);
        $this->complete($next, '2026-11-30 09:00:00');

        Sanctum::actingAs($landlord);
        $this->assertSame(['gross' => 220000, 'net' => 198000, 'paid_out' => 198000], $this->totals('2026-09'));
        $this->assertSame(['gross' => 0, 'net' => -45000, 'paid_out' => -45000], $this->totals('2026-10'));
        $this->assertSame(['gross' => 200000, 'net' => 180000, 'paid_out' => 180000], $this->totals('2026-11'));
        $this->assertSame(['gross' => 420000, 'net' => 333000, 'paid_out' => 333000], $this->totals('2026'));

        $october = $this->getJson('/api/owner-statements?period=2026-10')->json('data');
        $this->assertCount(1, $october['lines']['clawbacks']);
        $this->assertEquals(-45000, $october['lines']['clawbacks'][0]['amount']);
        $this->assertSame([], $october['payouts'], 'le constaté reste hors du relevé');

        // L'accueil : la reprise au mois du remboursement, le reversement qui l'impute avant reprise.
        $paidOut = app(PortfolioMetrics::class)->netPaidOutByMonth(
            PortfolioScope::landlord($landlord->id),
            CarbonImmutable::parse('2026-09-01'),
            CarbonImmutable::parse('2026-11-30'),
        );
        $this->assertSame([198000, -45000, 180000], array_map('intval', array_values(array_intersect_key(
            $paidOut, array_flip(['2026-09', '2026-10', '2026-11']),
        ))));
    }

    public function test_p177_01_both_pieces_refunded_in_full_the_payout_stays_on_its_month(): void
    {
        [, $landlord, , $rent, $charges] = $this->paidOutSeptember();

        $this->travelTo('2026-10-10 11:00:00');
        $this->refundByWebhook($rent, 200_000);
        $this->refundByWebhook($charges, 20_000);
        $this->assertSame(PaymentStatus::Refunded, $rent->refresh()->status);

        Sanctum::actingAs($landlord);
        $september = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data');
        $this->assertSame([220000, 198000, 198000], array_map('intval', [
            $september['totals']['gross'], $september['totals']['net'], $september['totals']['paid_out'],
        ]));
        $this->assertCount(1, $september['payouts']);
        $this->assertSame(['gross' => 0, 'net' => -198000, 'paid_out' => -198000], $this->totals('2026-10'));
    }

    public function test_p205_01_a_declared_refund_of_a_paid_out_advance_is_carried_over_two_payouts(): void
    {
        $this->travelTo('2026-09-30 08:00:00');
        $agency = $this->moneyAgency(['commission_rate' => 10]);
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $booking = Booking::factory()->create(['property_id' => $lease->property_id, 'agency_id' => $agency->id]);
        $advance = BookingPayment::factory()->create([
            'booking_id' => $booking->id, 'amount' => 50_000, 'payment_type' => BookingPaymentType::Advance,
            'status' => PaymentStatus::Paid, 'paid_at' => '2026-09-15 10:00:00', 'currency' => 'XOF',
        ]);
        $first = $this->payout($agency, $landlord, [], 45000, [$advance->id]);
        $this->complete($first, '2026-09-30 09:00:00');

        $this->travelTo('2026-10-10 11:00:00');
        Sanctum::actingAs($this->agencyAgent($agency));
        app(BookingPaymentService::class)->refund($advance, ['refund_amount' => 50_000]);
        $this->assertEquals(45000, DB::table('payout_clawbacks')->sole()->amount);

        // Un net de 18 000 avant reprise : imputé en entier, le reversement naît à zéro.
        $small = $this->leasePayment($lease, 20_000, LeasePaymentType::Rent, '2026-10-05 10:00:00');
        $zero = $this->payout($agency, $landlord, [$small->id], 0);
        $this->assertEquals(18000, Payout::findOrFail($zero)->clawback_amount);
        $this->complete($zero, '2026-10-31 09:00:00');

        // Le reliquat de 27 000 passe au suivant.
        $big = $this->leasePayment($lease, 200_000, LeasePaymentType::Rent, '2026-10-06 10:00:00');
        $last = $this->payout($agency, $landlord, [$big->id], 153000);
        $this->assertEquals(27000, Payout::findOrFail($last)->clawback_amount);
    }

    public function test_p205_01_a_cancelled_payout_gives_its_clawback_back_and_a_never_paid_out_piece_gives_none(): void
    {
        [$agency, $landlord, $lease, $rent] = $this->paidOutSeptember();
        $this->travelTo('2026-10-10 11:00:00');
        $this->refundByWebhook($rent, 50_000);

        $october = $this->leasePayment($lease, 100_000, LeasePaymentType::Rent, '2026-10-05 10:00:00');
        $cancelled = $this->payout($agency, $landlord, [$october->id], 45000);
        app(PayoutService::class)->cancel(Payout::findOrFail($cancelled));
        $this->assertSame(0, DB::table('payout_clawback_imputations')->count());

        $again = $this->payout($agency, $landlord, [$october->id], 45000);
        $this->assertEquals(45000, Payout::findOrFail($again)->clawback_amount);

        // Témoin : un loyer jamais reversé, remboursé, ne crée aucune reprise.
        $loose = $this->leasePayment($lease, 100_000, LeasePaymentType::Rent, '2026-10-07 10:00:00');
        $this->soldeParLAgence($loose, $agency);
        $this->refundByWebhook($loose, 100_000);
        $this->assertSame(1, DB::table('payout_clawbacks')->count());
    }

    /** @param  list<int>  $leaseIds  @param  list<int>  $bookingIds */
    private function payout(Agency $agency, User $landlord, array $leaseIds, int $net, array $bookingIds = []): int
    {
        Sanctum::actingAs($this->agencyAgent($agency));

        return (int) $this->postJson('/api/payouts', array_filter([
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => $leaseIds,
            'booking_payment_ids' => $bookingIds,
        ]))->assertCreated()->assertJsonPath('data.net_amount', $net)->json('data.id');
    }

    private function complete(int $id, string $at): void
    {
        Payout::query()->whereKey($id)->update(['status' => 'completed', 'processed_at' => $at]);
    }

    /** @return array{gross: int, net: int, paid_out: int} */
    private function totals(string $period): array
    {
        $totals = $this->getJson("/api/owner-statements?period={$period}")->assertOk()->json('data.totals');

        return ['gross' => (int) $totals['gross'], 'net' => (int) $totals['net'], 'paid_out' => (int) $totals['paid_out']];
    }

    private function refundByWebhook(Model $payment, int $amount): int
    {
        $payment->refresh();
        $integration = Integration::query()->findOrFail($payment->metadata['gateway']['integration_id']);

        return app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave',
            PaymentEvent::TYPE_REFUNDED,
            $payment->metadata['gateway']['settled_by'],
            ['amount' => (string) $amount, 'currency' => 'XOF'],
            WebhookAuthority::of($integration),
        ));
    }
}
