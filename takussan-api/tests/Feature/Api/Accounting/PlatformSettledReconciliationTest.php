<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Accounting\ReconciliationMatcher;
use App\Services\Billing\PlatformPayoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * Angle 141 du fichier de pistes — l'argent que la plateforme encaisse pour une agence, face au
 * relevé bancaire de cette agence.
 */
class PlatformSettledReconciliationTest extends TestCase
{
    use EncaissementsPlateforme, RefreshDatabase;

    protected Agency $agency;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    // ─── P141.01 (TCK-1415) ─────────────────────────────────────

    public function test_un_loyer_encaisse_par_la_plateforme_n_est_ni_suggere_ni_cherche_ni_confirmable(): void
    {
        $payment = $this->soldeParLaPlateforme($this->paidRent(150_000, '2026-04-10 10:00:00'));
        $this->assertTrue(app(PlatformPayoutService::class)->isSettledByPlatform($payment));

        $line = $this->creditLine(150_000, '2026-04-11');

        $this->assertNull(app(ReconciliationMatcher::class)->suggestFor($line));
        $this->assertSame([], $this->search(150_000));

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'lease_payment',
                'payment_id' => $payment->id,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payment_id');

        $this->assertNull($payment->fresh()->bank_reconciled_at);
    }

    public function test_un_acompte_encaisse_par_la_plateforme_n_est_ni_suggere_ni_cherche_ni_confirmable(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $this->agency->id]);
        $deposit = $this->soldeParLaPlateforme(BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 80_000,
            'currency' => 'XOF',
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-04-10 10:00:00',
            'bank_reconciled_at' => null,
        ]));
        $this->assertTrue(app(PlatformPayoutService::class)->isSettledByPlatform($deposit));

        $line = $this->creditLine(80_000, '2026-04-10');

        $this->assertNull(app(ReconciliationMatcher::class)->suggestFor($line));
        $this->assertSame([], $this->search(80_000));
        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'booking_payment',
                'payment_id' => $deposit->id,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payment_id');
    }

    public function test_apres_la_cloture_le_loyer_rattache_au_reversement_reste_ecarte(): void
    {
        $payment = $this->soldeParLaPlateforme($this->paidRent(150_000, '2026-04-10 10:00:00'));
        $payment->lease->update(['agency_id' => $this->agency->id]);
        app(PlatformPayoutService::class)->closePeriod($this->agency, Carbon::parse('2026-04-30'), $this->admin);
        $this->assertNotNull($payment->fresh()->platform_payout_id);

        $this->assertNull(app(ReconciliationMatcher::class)->suggestFor($this->creditLine(150_000, '2026-04-15')));
        $this->assertSame([], $this->search(150_000));
    }

    public function test_un_loyer_encaisse_par_l_integration_de_l_agence_reste_rapprochable(): void
    {
        $payment = $this->soldeParLAgence($this->paidRent(150_000, '2026-04-10 10:00:00'), $this->agency);
        $this->assertFalse(app(PlatformPayoutService::class)->isSettledByPlatform($payment));

        $line = $this->creditLine(150_000, '2026-04-11');

        $suggestion = app(ReconciliationMatcher::class)->suggestFor($line);
        $this->assertSame([LeasePayment::class, $payment->id], [$suggestion?->paymentType, $suggestion?->paymentId]);
        $this->assertSame([['lease_payment', $payment->id]], $this->search(150_000));

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'lease_payment',
                'payment_id' => $payment->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.match_status', 'confirmed');
    }

    public function test_un_loyer_regle_hors_ligne_reste_rapprochable(): void
    {
        $payment = $this->paidRent(150_000, '2026-04-10 10:00:00');

        $suggestion = app(ReconciliationMatcher::class)->suggestFor($this->creditLine(150_000, '2026-04-11'));
        $this->assertSame([LeasePayment::class, $payment->id], [$suggestion?->paymentType, $suggestion?->paymentId]);
        $this->assertSame([['lease_payment', $payment->id]], $this->search(150_000));
    }

    // ─── P141.04 (TCK-1417) ─────────────────────────────────────

    public function test_l_agence_d_un_acompte_est_celle_de_la_reservation_partout(): void
    {
        // Une réservation de l'agence sur un bien d'une autre agence : la colonne que lit la
        // clôture plateforme et l'audit (`bookings.agency_id`) décide, pour le matcher, la
        // recherche et la garde d'agence de la confirmation.
        $other = Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $other->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $this->agency->id]);
        $deposit = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 80_000,
            'currency' => 'XOF',
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-04-10 10:00:00',
            'bank_reconciled_at' => null,
        ]);
        $line = $this->creditLine(80_000, '2026-04-10');

        $suggestion = app(ReconciliationMatcher::class)->suggestFor($line);
        $this->assertSame([BookingPayment::class, $deposit->id], [$suggestion?->paymentType, $suggestion?->paymentId]);
        $this->assertSame([['booking_payment', $deposit->id]], $this->search(80_000));
        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'booking_payment',
                'payment_id' => $deposit->id,
            ])
            ->assertOk();
    }

    public function test_un_acompte_d_une_reservation_d_une_autre_agence_n_est_pas_rapprochable(): void
    {
        $other = Agency::factory()->create();
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $other->id]);
        $deposit = BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => 80_000,
            'currency' => 'XOF',
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-04-10 10:00:00',
            'bank_reconciled_at' => null,
        ]);
        $line = $this->creditLine(80_000, '2026-04-10');

        $this->assertNull(app(ReconciliationMatcher::class)->suggestFor($line));
        $this->assertSame([], $this->search(80_000));
        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'booking_payment',
                'payment_id' => $deposit->id,
            ])
            ->assertForbidden();
    }

    // ─── Outillage ──────────────────────────────────────────────

    private function paidRent(int $amount, string $paidAt): LeasePayment
    {
        $payment = LeasePayment::factory()->create([
            'amount' => $amount,
            'currency' => 'XOF',
            'status' => PaymentStatus::Paid,
            'paid_at' => $paidAt,
            'bank_reconciled_at' => null,
            'bank_statement_line_id' => null,
        ]);
        $payment->lease->update(['agency_id' => $this->agency->id, 'currency' => 'XOF']);

        return $payment;
    }

    private function creditLine(int $amount, string $postedAt): BankStatementLine
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        return BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'direction' => BankStatementLineDirection::Credit,
            'amount' => $amount,
            'currency' => 'XOF',
            'posted_at' => $postedAt,
            'reference' => null,
            'counterparty' => null,
        ]);
    }

    /** @return list<array{0: string, 1: int}> */
    private function search(int $amount): array
    {
        $data = $this->actingAs($this->admin)
            ->getJson("/api/agencies/{$this->agency->id}/bank-statements/payment-search?amount={$amount}&direction=credit")
            ->assertOk()
            ->json('data');

        return array_map(fn ($c) => [$c['type'], $c['id']], $data);
    }
}
