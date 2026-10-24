<?php

namespace Tests\Feature\Api;

use App\Models\Enums\AgencyKind;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-2074 (P178.03, décision du porteur du 2026-10-23) — l'agence porte la commission de la
 * plateforme (`features.md` § 1.5) ; la préparation du reversement au bailleur la montre ligne par
 * ligne, avec ce que l'agence a reçu, et avertit sans bloquer quand le taux du bail est inférieur.
 *
 * Avant : la préparation ne lisait jamais `platform_fee_pct_at_payment` ; un bail à 0 % proposait au
 * bailleur 150 000 quand la plateforme n'en avait reversé que 142 500 à l'agence, sans un mot.
 */
class CommissionPlateformeALaPreparationTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EncaissementsPlateforme;
    use RefreshDatabase;

    private function prepare(int $landlordId): TestResponse
    {
        return $this->getJson("/api/payouts/preparation?landlord_id={$landlordId}&period_start=2026-09-01&period_end=2026-09-30")->assertOk();
    }

    /** Soldé par la plateforme, à `$pct` %, et reversé à l'agence (P178.01 : sinon hors préparation). */
    private function paidThroughPlatform(LeasePayment $payment, float $pct): LeasePayment
    {
        $payment = $this->soldeParLaPlateforme($payment);
        $payout = PlatformPayout::factory()->create(['agency_id' => $payment->lease->agency_id, 'status' => PlatformPayoutStatus::Paid]);
        $payment->forceFill(['platform_fee_pct_at_payment' => $pct, 'platform_payout_id' => $payout->id])->save();

        return $payment;
    }

    public function test_a_lease_at_zero_percent_shows_the_platform_fee_and_warns_without_blocking(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $rent = $this->paidThroughPlatform($this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000), 5);
        Sanctum::actingAs($this->agencyAgent($agency));

        $response = $this->prepare($landlord->id);

        $response->assertJsonPath('data.lines.lease_payments.0.settled_by_platform', true)
            ->assertJsonPath('data.lines.lease_payments.0.commission_below_platform_fee', true);
        $this->assertEquals(5, $response->json('data.lines.lease_payments.0.platform_fee_rate'));
        $this->assertEquals(7500, $response->json('data.lines.lease_payments.0.platform_fee'));
        $this->assertEquals(142500, $response->json('data.lines.lease_payments.0.agency_received'));
        $this->assertEquals(7500, $response->json('data.totals.platform_fee'));
        // La règle actuelle reste : le bailleur reçoit son loyer entier, l'agence porte la commission.
        $this->assertEquals(150000, $response->json('data.totals.net'));

        // Sans blocage : le reversement se crée.
        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])->assertCreated();
    }

    public function test_a_lease_rate_above_the_platform_fee_shows_it_without_warning(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $this->paidThroughPlatform($this->leasePayment($this->leaseOf($agency, $landlord, 10), 150_000), 5);
        Sanctum::actingAs($this->agencyAgent($agency));

        $line = $this->prepare($landlord->id)->json('data.lines.lease_payments.0');

        $this->assertTrue($line['settled_by_platform']);
        $this->assertFalse($line['commission_below_platform_fee']);
        $this->assertEquals(7500, $line['platform_fee']);
        $this->assertEquals(15000, $line['commission']);
    }

    public function test_a_rent_collected_by_the_agency_carries_no_platform_fee(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 0);
        $cash = $this->leasePayment($lease, 20_000);
        $cash->forceFill(['platform_fee_pct_at_payment' => 5])->save();
        $this->soldeParLAgence($this->leasePayment($lease, 30_000), $agency);
        Sanctum::actingAs($this->agencyAgent($agency));

        $response = $this->prepare($landlord->id);

        foreach ($response->json('data.lines.lease_payments') as $line) {
            $this->assertFalse($line['settled_by_platform']);
            $this->assertNull($line['platform_fee']);
            $this->assertNull($line['agency_received']);
            $this->assertFalse($line['commission_below_platform_fee']);
        }
        $this->assertEquals(0, $response->json('data.totals.platform_fee'));
    }

    public function test_an_individual_agency_sees_the_fee_on_a_rent_the_platform_still_holds(): void
    {
        $agency = $this->moneyAgency(['kind' => AgencyKind::Individual]);
        $host = $this->landlordOf($agency);
        $rent = $this->soldeParLaPlateforme($this->leasePayment($this->leaseOf($agency, $host, 0), 100_001));
        $rent->forceFill(['platform_fee_pct_at_payment' => 5])->save();
        Sanctum::actingAs($this->agencyAgent($agency));

        $line = $this->prepare($host->id)->json('data.lines.lease_payments.0');

        $this->assertTrue($line['settled_by_platform']);
        // Arrondie à l'unité XOF, comme la clôture (5 000,05 → 5 000).
        $this->assertEquals(5000, $line['platform_fee']);
        $this->assertEquals(95001, $line['agency_received']);
    }
}
