<?php

namespace Tests\Feature\Payout;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\TaskStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\BookingRefundTaskService;
use App\Services\Model\BookingPaymentService;
use App\Services\Model\BookingService;
use App\Services\Model\PayoutService;
use App\Services\Payout\PayoutCalculator;
use App\Services\Payout\PayoutPreparationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2154 (P200.02, décision du porteur du 2026-10-24) — l'acompte encaissé d'une réservation
 * `cancelled`, `rejected` ou `expired` n'entre pas au reversement du bailleur tant que la tâche
 * `booking_refund` de la réservation est ouverte. Le geste « remboursé » (partiel : le reste gardé
 * redevient reversable) ou la clôture de la tâche le libère. La préparation le signale.
 *
 * Avant : `bookingPayments()` ne lisait ni le statut de la réservation ni la tâche, et l'acompte à
 * rendre au client partait au bailleur.
 */
class HeldForRefundBookingPaymentTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $landlord;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = $this->moneyAgency();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->landlord = $this->landlordOf($this->agency);
    }

    public function test_a_deposit_of_a_cancelled_booking_with_an_open_refund_task_is_held(): void
    {
        [$booking, $deposit] = $this->paidDeposit();

        app(BookingService::class)->cancel($booking, $this->admin);

        $this->assertSame(TaskStatus::Open, app(BookingRefundTaskService::class)->taskFor($booking)?->status);
        $this->assertSame([], $this->eligible());

        $preparation = $this->prepare();
        $this->assertSame([], $preparation['lines']['booking_payments']);
        $this->assertSame([$deposit->id], array_column($preparation['held_for_refund'], 'id'));
        $this->assertSame($booking->id, $preparation['held_for_refund'][0]['booking_id']);

        try {
            app(PayoutService::class)->create($this->admin, $this->landlord, ['booking_payment_ids' => [$deposit->id]]);
            $this->fail('Un acompte à rembourser a été reversé.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('booking_payment_ids', $e->errors());
        }
        $this->assertDatabaseCount('payouts', 0);
    }

    public function test_rejected_and_expired_bookings_hold_their_deposit_too(): void
    {
        foreach ([BookingStatus::Rejected, BookingStatus::Expired] as $status) {
            [$booking, $deposit] = $this->paidDeposit();
            $booking->update(['status' => $status]);
            app(BookingRefundTaskService::class)->openFor($booking);

            $this->assertNotContains($deposit->id, $this->eligible(), $status->value);
        }
    }

    public function test_a_partial_refund_releases_the_kept_part(): void
    {
        [$booking, $deposit] = $this->paidDeposit();
        app(BookingService::class)->cancel($booking, $this->admin);

        app(BookingPaymentService::class)->refund($deposit, ['refund_amount' => '10000']);

        $this->assertSame([$deposit->id], $this->eligible());
        $preparation = $this->prepare();
        $this->assertSame([], $preparation['held_for_refund']);
        $this->assertEquals(20_000, $preparation['lines']['booking_payments'][0]['amount']);
    }

    /** Le geste libère sa pièce seule : l'autre, tâche encore ouverte, reste retenue. */
    public function test_the_refund_gesture_releases_its_own_piece_only(): void
    {
        [$booking, $deposit] = $this->paidDeposit();
        $advance = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 20_000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
            'payment_type' => BookingPaymentType::Advance,
        ]);
        app(BookingService::class)->cancel($booking, $this->admin);

        app(BookingPaymentService::class)->refund($deposit, ['refund_amount' => '10000']);

        $this->assertSame(TaskStatus::Open, app(BookingRefundTaskService::class)->taskFor($booking)?->status);
        $this->assertSame([$deposit->id], $this->eligible());
        $this->assertSame([$advance->id], array_column($this->prepare()['held_for_refund'], 'id'));
    }

    public function test_closing_the_task_releases_the_deposit(): void
    {
        [$booking, $deposit] = $this->paidDeposit();
        app(BookingService::class)->cancel($booking, $this->admin);

        app(BookingRefundTaskService::class)->taskFor($booking)->update(['status' => TaskStatus::Done]);

        $this->assertSame([$deposit->id], $this->eligible());
    }

    /** Témoin : la réservation ouverte reverse son acompte. */
    public function test_an_open_booking_deposit_stays_eligible(): void
    {
        [, $deposit] = $this->paidDeposit();

        $this->assertSame([$deposit->id], $this->eligible());
        $this->assertSame([], $this->prepare()['held_for_refund']);
    }

    /** @return list<int> */
    private function eligible(): array
    {
        return app(PayoutCalculator::class)->bookingPayments($this->agency->id, $this->landlord->id)
            ->pluck('booking_payments.id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return array<string, mixed> */
    private function prepare(): array
    {
        return app(PayoutPreparationService::class)->prepare($this->admin, $this->landlord, now()->subMonth(), now()->addDay());
    }

    /** @return array{0: Booking, 1: BookingPayment} */
    private function paidDeposit(): array
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $booking = Booking::factory()->confirmed()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'agency_id' => $this->agency->id,
            'currency' => Currency::XOF,
        ]);
        $deposit = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 30_000,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
            'payment_type' => BookingPaymentType::Deposit,
        ]);

        return [$booking, $deposit];
    }
}
