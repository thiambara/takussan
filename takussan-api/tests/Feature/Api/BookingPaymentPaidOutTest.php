<?php

namespace Tests\Feature\Api;

use App\Http\Resources\BookingPaymentResource;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Payout;
use App\Models\User;
use App\Services\Booking\BookingRefundTaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2153 (P205.02 ; ADR-0039, amendement du 2026-10-24, point 5) — l'acompte porté par un
 * reversement au bailleur `completed` rend ce reversement (référence, `processed_at`), dans
 * `BookingPaymentResource` et dans la tâche « remboursement à traiter ». L'API ne refuse pas le
 * remboursement : la reprise suit (TCK-2151). La référence ne se lit que par qui peut lire le
 * reversement (`PayoutPolicy::view`).
 */
class BookingPaymentPaidOutTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_a_paid_out_advance_carries_its_payout_reference_and_date_and_a_fresh_one_none(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency(['commission_rate' => 10]);
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $booking = Booking::factory()->create(['property_id' => $lease->property_id, 'agency_id' => $agency->id]);
        $advance = $this->advance($booking, '2026-09-15 10:00:00');
        $fresh = $this->advance($booking, '2026-09-20 10:00:00');
        $agent = $this->agencyAgent($agency);

        Sanctum::actingAs($agent);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'booking_payment_ids' => [$advance->id]])
            ->assertCreated()->json('data.id');
        Payout::query()->whereKey($id)->update(['status' => 'completed', 'processed_at' => '2026-09-30 09:00:00']);
        $payout = Payout::findOrFail($id);

        $rows = collect($this->getJson("/api/bookings/{$booking->id}/payments")->assertOk()->json('data'))->keyBy('id');
        $this->assertSame($payout->reference_number, $rows[$advance->id]['paid_out']['reference_number']);
        $this->assertSame($id, $rows[$advance->id]['paid_out']['payout_id']);
        $this->assertStringStartsWith('2026-09-30', $rows[$advance->id]['paid_out']['processed_at']);
        $this->assertNull($rows[$fresh->id]['paid_out']);

        // Qui ne lit pas le reversement n'en lit pas la référence.
        $stranger = User::factory()->create();
        $request = Request::create('/');
        $request->setUserResolver(fn () => $stranger);
        $this->assertNull(BookingPaymentResource::make($advance)->resolve($request)['paid_out']);

        // La tâche « remboursement à traiter » le porte aussi.
        $booking->update(['status' => BookingStatus::Cancelled]);
        $task = app(BookingRefundTaskService::class)->openFor($booking->refresh());
        $paidOut = $task->refresh()->metadata['paid_out'];
        $this->assertSame($payout->reference_number, $paidOut[$advance->id]['reference_number']);
        $this->assertArrayNotHasKey($fresh->id, $paidOut);

        // L'API ne refuse pas : le remboursement passe, et la reprise suit.
        Sanctum::actingAs($this->agencyAdmin($agency));
        $this->postJson("/api/booking-payments/{$advance->id}/refund", ['refund_amount' => 50_000])
            ->assertOk()->assertJsonPath('data.paid_out.reference_number', $payout->reference_number);
    }

    private function advance(Booking $booking, string $paidAt): BookingPayment
    {
        return BookingPayment::factory()->create([
            'booking_id' => $booking->id, 'amount' => 50_000, 'payment_type' => BookingPaymentType::Advance,
            'status' => PaymentStatus::Paid, 'paid_at' => $paidAt, 'currency' => 'XOF',
        ]);
    }
}
