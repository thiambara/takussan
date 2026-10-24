<?php

namespace Tests\Feature\Api;

use App\Http\Resources\LeasePaymentResource;
use App\Models\Agency;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\PlatformPayout;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Reporting\PlatformMetricsSnapshotter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * P206.04 (ADR-0039, amendement du 2026-10-24, point 7) — un remboursement d'un checkout qui portait
 * la pénalité s'impute d'abord à elle, puis au loyer ; son plafond est loyer + pénalité du checkout ;
 * la part rendue s'écrit dans `late_fee_refund_amount`, et une pénalité rendue en entier est remise :
 * `late_fee_paid_at` garde sa valeur, et rien ne la compte plus.
 *
 * Avant : un checkout de 157 500 (pénalité de 7 500 comprise) remboursé en entier donnait
 * `refund_amount 150000`, la pénalité restait « acquittée » et les 7 500 n'étaient tracés nulle part.
 */
class RemboursementPenaliteDAbordTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EncaissementsPlateforme;
    use RefreshDatabase;

    private Agency $agency;

    private function checkout(bool $byTheAgency = false): LeasePayment
    {
        $this->agency = $this->moneyAgency();
        $rent = $this->leasePayment($this->leaseOf($this->agency, $this->landlordOf($this->agency), 10), 150_000, paidAt: '2026-09-15 10:00:00');
        $rent->forceFill([
            'late_fee_amount' => 7_500,
            'late_fee_applied_at' => '2026-09-08 00:00:00',
            'late_fee_paid_at' => '2026-09-15 10:00:00',
            'platform_fee_pct_at_payment' => 5,
        ])->save();

        /** @var LeasePayment */
        return $byTheAgency
            ? $this->soldePar($rent, Integration::factory()->create(['provider' => 'wave', 'agency_id' => $this->agency->id]), 7_500)
            : $this->soldeParLaPlateforme($rent, 7_500);
    }

    private function refund(LeasePayment $rent, int $amount): LeasePayment
    {
        $meta = $rent->fresh()->metadata;
        app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave',
            PaymentEvent::TYPE_REFUNDED,
            $meta['gateway']['settled_by'],
            ['amount' => (string) $amount, 'currency' => 'XOF'],
            WebhookAuthority::of(Integration::query()->findOrFail($meta['gateway']['integration_id'])),
        ));

        return $rent->fresh();
    }

    public function test_a_full_refund_gives_the_late_fee_back_first_and_remits_it(): void
    {
        $rent = $this->refund($this->checkout(), 157_500);

        $this->assertSame(PaymentStatus::Refunded, $rent->status);
        $this->assertEquals(150_000, (float) $rent->refund_amount);
        $this->assertEquals(7_500, (float) $rent->late_fee_refund_amount);
        // Remise : ni acquittée ni due.
        $this->assertNotNull($rent->late_fee_paid_at);
        $this->assertSame(0.0, $rent->lateFeeOutstanding());

        $data = (new LeasePaymentResource($rent))->toArray(Request::create('/'));
        $this->assertEquals(7_500, $data['late_fee_refund_amount']);
    }

    public function test_a_partial_refund_is_imputed_to_the_late_fee_first(): void
    {
        $rent = $this->refund($this->checkout(), 5_000);

        $this->assertSame(PaymentStatus::Paid, $rent->status);
        $this->assertEquals(5_000, (float) $rent->late_fee_refund_amount);
        $this->assertEquals(0, (float) ($rent->refund_amount ?? 0));
    }

    public function test_a_refund_beyond_the_late_fee_reaches_the_rent(): void
    {
        $rent = $this->refund($this->checkout(), 10_000);

        $this->assertEquals(7_500, (float) $rent->late_fee_refund_amount);
        $this->assertEquals(2_500, (float) $rent->refund_amount);
        $this->assertSame(PaymentStatus::Paid, $rent->status);
    }

    public function test_the_readers_count_the_late_fee_net_of_its_refunded_part(): void
    {
        $rent = $this->refund($this->checkout(), 5_000);

        // L'Encaissé : 150 000 + (7 500 − 5 000).
        $flows = app(PlatformMetricsSnapshotter::class)->flowsBetween(Carbon::parse('2026-09-01'), Carbon::parse('2026-09-30 23:59:59'));
        $this->assertEquals(152_500, $flows['gmv']);
        // Les frais de la pénalité : 2 500 × 5 % = 125, à côté de 150 000 × 5 %.
        $this->assertEquals(7_625, $flows['fees']);

        // La clôture de la plateforme.
        $this->actingAsRole('super_admin');
        $this->postJson('/api/admin/payouts/close-period', ['agency_id' => $this->agency->id, 'period_end' => '2026-09-30'])->assertCreated();
        $closing = PlatformPayout::query()->where('agency_id', $this->agency->id)->firstOrFail();
        $this->assertEquals(2_500, (float) $closing->metadata['late_fees_gross']);
        $this->assertEquals(152_500, (float) $closing->gross_amount);

        // Le reversement au bailleur, une fois la plateforme payée.
        $closing->forceFill(['status' => 'paid', 'processed_at' => now()])->save();
        Sanctum::actingAs($this->agencyAgent($this->agency));
        $landlordId = $rent->lease->landlord_id;
        $prep = $this->getJson("/api/payouts/preparation?landlord_id={$landlordId}&period_start=2026-09-01&period_end=2026-09-30")->assertOk();
        $this->assertSame(2500, (int) $prep->json('data.lines.late_fees.0.amount'));
    }

    public function test_the_observed_refund_carries_the_whole_refund(): void
    {
        // Encaissé par l'intégration de l'agence : le constaté existe (point 9 du 2026-10-23).
        $this->refund($this->checkout(byTheAgency: true), 157_500);

        $observed = Payout::query()->where('payee_role', PayeeRole::Tenant->value)->firstOrFail();
        $this->assertEquals(157_500, (float) $observed->net_amount);
    }

    /**
     * Le brut d'un reversement porte sa pénalité (P206.01) : la relecture du paiement l'ajoute aux
     * pièces, et voit la part de pénalité rendue depuis la préparation.
     */
    public function test_paying_a_payout_reads_its_late_fee_and_its_refunded_part(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $rent = $this->leasePayment($lease, 150_000);
        $rent->forceFill(['late_fee_amount' => 7_500, 'late_fee_paid_at' => '2026-09-12 10:00:00'])->save();
        // Remboursé en partie AVANT la préparation : le reversement prend ce qui est gardé.
        $other = $this->leasePayment($lease, 100_000);
        $other->forceFill(['refund_amount' => 10_000])->save();
        $this->actingWithStepUp($this->agencyAdmin($agency));

        $create = fn (array $ids, array $fees) => $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id, 'lease_payment_ids' => $ids, 'late_fee_lease_payment_ids' => $fees,
        ])->assertCreated()->json('data.id');
        $pay = fn (int $id) => $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'check', 'transaction_id' => 'CHQ-'.$id]);

        $first = $create([$rent->id, $other->id], [$rent->id]);
        $pay($first)->assertOk();

        // Une pénalité reversée, rendue en partie avant le paiement : le reversement se refuse.
        $third = $this->leasePayment($lease, 50_000);
        $third->forceFill(['late_fee_amount' => 2_500, 'late_fee_paid_at' => '2026-09-13 10:00:00'])->save();
        $second = $create([$third->id], [$third->id]);
        $third->forceFill(['late_fee_refund_amount' => 1_000])->save();
        $pay($second)->assertStatus(422)->assertJsonPath('code', 'payout.items_changed');
    }
}
