<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PlatformPayoutStatus;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\PlatformPayout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * P206.01 (ADR-0039, amendement du 2026-10-24, point 6 ; rappel de TCK-594) — la pénalité de retard
 * réglée est une ligne propre du reversement au bailleur : elle entre au brut au mois de
 * `late_fee_paid_at`, porte la commission du bail, et son éligibilité se lit sur
 * `lease_payments.late_fee_payout_id`, avec une copie figée.
 *
 * Avant : un loyer de 150 000 réglé avec 7 500 de pénalité donnait un brut de 150 000, à la
 * préparation, à la création et au relevé.
 */
class PayoutLateFeeTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EncaissementsPlateforme;
    use RefreshDatabase;

    private function prepare(int $landlordId, string $start = '2026-09-01', string $end = '2026-09-30'): TestResponse
    {
        return $this->getJson("/api/payouts/preparation?landlord_id={$landlordId}&period_start={$start}&period_end={$end}")->assertOk();
    }

    private function withLateFee(LeasePayment $payment, float $fee, ?string $paidAt = '2026-09-12 10:00:00'): LeasePayment
    {
        $payment->forceFill([
            'late_fee_amount' => $fee,
            'late_fee_applied_at' => '2026-09-08 00:00:00',
            'late_fee_paid_at' => $paidAt,
        ])->save();

        return $payment->refresh();
    }

    public function test_the_settled_late_fee_is_a_line_of_the_preparation_creation_and_statement(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $rent = $this->withLateFee($this->leasePayment($lease, 150_000), 7_500);
        $other = $this->leasePayment($lease, 100_000);
        Sanctum::actingAs($this->agencyAgent($agency));

        $prep = $this->prepare($landlord->id);
        $this->assertSame([257500, 25750, 231750], array_map('intval', [
            $prep->json('data.totals.gross'), $prep->json('data.totals.commission'), $prep->json('data.totals.net'),
        ]));
        $this->assertSame([$rent->id], array_column($prep->json('data.lines.late_fees'), 'id'));
        $this->assertSame(7500, (int) $prep->json('data.lines.late_fees.0.amount'));
        $this->assertSame(750, (int) $prep->json('data.lines.late_fees.0.commission'));

        // Le relevé, avant tout reversement : la pénalité réglée y est encaissée.
        $this->assertSame(257500, (int) $this->getJson('/api/owner-statements?period=2026-09&landlord_id='.$landlord->id)
            ->assertOk()->json('data.totals.gross'));

        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'late_fee_lease_payment_ids' => [$rent->id],
        ])->assertCreated()
            ->assertJsonPath('data.gross_amount', 157500)
            ->assertJsonPath('data.net_amount', 141750)
            ->json('data.id');

        $rent->refresh();
        $this->assertSame($id, (int) $rent->late_fee_payout_id);
        $this->assertSame([7500.0, 10.0, 750.0], [
            (float) $rent->late_fee_payout_amount, (float) $rent->late_fee_payout_commission_rate, (float) $rent->late_fee_payout_commission_amount,
        ]);

        // Prise une fois : la préparation ne la propose plus, la création la refuse.
        $this->assertSame([], $this->prepare($landlord->id)->json('data.lines.late_fees'));
        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$other->id],
            'late_fee_lease_payment_ids' => [$rent->id],
        ])->assertStatus(409)->assertJsonPath('code', 'payout.already_paid_out');

        // Le relevé relit la copie : un taux du bail changé depuis ne la recalcule pas.
        Payout::query()->whereKey($id)->update(['status' => 'completed', 'processed_at' => '2026-09-30 09:00:00']);
        $lease->forceFill(['commission_rate' => 20])->save();
        Sanctum::actingAs($landlord);
        $statement = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data');
        $this->assertSame(257500, (int) $statement['totals']['gross']);
        $this->assertSame(750, (int) $statement['lines']['late_fees'][0]['commission']);
    }

    public function test_a_late_fee_settled_after_its_rent_was_paid_out_stays_payable(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $rent = $this->withLateFee($this->leasePayment($this->leaseOf($agency, $landlord, 10), 150_000), 7_500, null);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->assertJsonPath('data.gross_amount', 150000);

        $rent->forceFill(['late_fee_paid_at' => '2026-10-05 10:00:00'])->save();

        $october = $this->prepare($landlord->id, '2026-10-01', '2026-10-31');
        $this->assertSame([], $october->json('data.lines.lease_payments'));
        $this->assertSame([$rent->id], array_column($october->json('data.lines.late_fees'), 'id'));
        $this->assertSame(7500, (int) $october->json('data.totals.gross'));

        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'late_fee_lease_payment_ids' => [$rent->id]])
            ->assertCreated()
            ->assertJsonPath('data.gross_amount', 7500)
            ->assertJsonPath('data.net_amount', 6750);
    }

    public function test_a_cancelled_payout_gives_its_late_fee_back(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $rent = $this->withLateFee($this->leasePayment($this->leaseOf($agency, $landlord, 10), 150_000), 7_500);
        $issuer = $this->agencyAdmin($agency);
        $this->actingWithStepUp($issuer);

        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'late_fee_lease_payment_ids' => [$rent->id],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/payouts/{$id}/cancel")->assertOk();

        $rent->refresh();
        $this->assertNull($rent->late_fee_payout_id);
        $this->assertNull($rent->late_fee_payout_amount);
        $this->assertNull($rent->late_fee_payout_commission_rate);
        $this->assertNull($rent->late_fee_payout_commission_amount);
        $this->assertSame([$rent->id], array_column($this->prepare($landlord->id)->json('data.lines.late_fees'), 'id'));
    }

    public function test_an_unsettled_or_foreign_late_fee_is_refused(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $due = $this->withLateFee($this->leasePayment($this->leaseOf($agency, $landlord, 10), 150_000), 7_500, null);
        $otherAgency = $this->moneyAgency();
        $foreign = $this->withLateFee($this->leasePayment($this->leaseOf($otherAgency, $this->landlordOf($otherAgency), 10), 150_000), 7_500);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->assertSame([], $this->prepare($landlord->id)->json('data.lines.late_fees'));
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'late_fee_lease_payment_ids' => [$due->id]])
            ->assertStatus(422)->assertJsonValidationErrors(['late_fee_lease_payment_ids']);
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'late_fee_lease_payment_ids' => [$foreign->id]])
            ->assertStatus(422)->assertJsonValidationErrors(['late_fee_lease_payment_ids']);
        $this->assertSame(0, Payout::query()->count());
    }

    public function test_a_late_fee_settled_in_a_platform_checkout_waits_for_the_platform_payout(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        // Le checkout de la plateforme qui a soldé le loyer portait la pénalité.
        $online = $this->withLateFee($this->soldeParLaPlateforme($this->leasePayment($lease, 150_000), 7_500), 7_500);
        // La pénalité d'un loyer encaissé par la plateforme, réglée à l'agence : reversable aussitôt.
        $atAgency = $this->withLateFee($this->soldeParLaPlateforme($this->leasePayment($lease, 100_000)), 5_000);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->assertSame([$atAgency->id], array_column($this->prepare($landlord->id)->json('data.lines.late_fees'), 'id'));
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'late_fee_lease_payment_ids' => [$online->id]])
            ->assertStatus(422)->assertJsonValidationErrors(['late_fee_lease_payment_ids']);

        $platformPayout = PlatformPayout::factory()->create(['agency_id' => $agency->id, 'status' => PlatformPayoutStatus::Paid]);
        $online->forceFill(['platform_payout_id' => $platformPayout->id])->save();

        $this->assertEqualsCanonicalizing([$online->id, $atAgency->id], array_column($this->prepare($landlord->id)->json('data.lines.late_fees'), 'id'));
    }
}
