<?php

namespace Tests\Feature\Api;

use App\Models\Enums\LeasePaymentType;
use App\Models\Payout;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC1, AC2) — le brut d'un reversement se lit sur les loyers encaissés : il ne se saisit
 * plus. Commission au taux du bail, à défaut à celui de l'agence, ligne par ligne, à l'unité.
 */
class PayoutPreparationTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private function prepare(int $landlordId, string $start = '2026-09-01', string $end = '2026-09-30')
    {
        return $this->getJson("/api/payouts/preparation?landlord_id={$landlordId}&period_start={$start}&period_end={$end}");
    }

    public function test_ac1_september_gross_commission_and_net_from_collected_rent_only(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $this->septemberOf($this->leaseOf($agency, $landlord, 10));
        Sanctum::actingAs($this->agencyAgent($agency));

        $response = $this->prepare($landlord->id)->assertOk();

        $this->assertSame(220000, (int) $response->json('data.totals.gross'));
        $this->assertSame(22000, (int) $response->json('data.totals.commission'));
        $this->assertSame(198000, (int) $response->json('data.totals.net'));
        // La caution et le loyer en attente ne sont pas des lignes.
        $this->assertCount(2, $response->json('data.lines.lease_payments'));
        $this->assertSame(['rent', 'charges'], array_column($response->json('data.lines.lease_payments'), 'payment_type'));
    }

    public function test_ac1_a_lease_without_rate_falls_back_on_the_agency_rate(): void
    {
        $agency = $this->moneyAgency(['commission_rate' => 8]);
        $landlord = $this->landlordOf($agency);
        $this->septemberOf($this->leaseOf($agency, $landlord, null));
        Sanctum::actingAs($this->agencyAgent($agency));

        $response = $this->prepare($landlord->id)->assertOk();

        $this->assertSame(17600, (int) $response->json('data.totals.commission'));
        $this->assertSame('agency', $response->json('data.lines.lease_payments.0.commission_rate_source'));
    }

    public function test_commission_is_rounded_to_the_unit_line_by_line_in_xof(): void
    {
        // 3 333 × 7,5 % = 249,975 → 250 ; deux fois → 500. Arrondir la somme (6 666 × 7,5 % =
        // 499,95 → 500) donnerait le même total ici, mais pas une sous-unité : XOF n'en a pas.
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 7.5);
        $this->leasePayment($lease, 3_333);
        $this->leasePayment($lease, 3_333);
        Sanctum::actingAs($this->agencyAgent($agency));

        $response = $this->prepare($landlord->id)->assertOk();

        $this->assertSame([250.0, 250.0], array_map('floatval', array_column($response->json('data.lines.lease_payments'), 'commission')));
        $this->assertSame(500, (int) $response->json('data.totals.commission'));
        $this->assertSame(6166, (int) $response->json('data.totals.net'));
    }

    public function test_the_period_bounds_paid_at_and_a_paid_out_rent_is_not_offered_again(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord, 10);
        $september = $this->leasePayment($lease, 200_000, LeasePaymentType::Rent, '2026-09-30 23:00:00');
        $this->leasePayment($lease, 200_000, LeasePaymentType::Rent, '2026-10-01 08:00:00');
        $agent = $this->agencyAgent($agency);
        Sanctum::actingAs($agent);

        $this->assertSame([$september->id], array_column($this->prepare($landlord->id)->json('data.lines.lease_payments'), 'id'));

        $payout = Payout::factory()->create(['agency_id' => $agency->id, 'landlord_id' => $landlord->id]);
        $payout->leasePayments()->attach($september->id);

        $lines = $this->prepare($landlord->id, '2026-09-01', '2026-10-31')->json('data.lines.lease_payments');
        $this->assertCount(1, $lines);
        $this->assertNotSame($september->id, $lines[0]['id']);
    }

    public function test_preparation_only_reads_the_landlords_leases_of_the_issuers_agency(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $this->leasePayment($this->leaseOf($agency, $landlord, 10), 100_000);
        // Un autre bailleur de la même agence, et le même bailleur dans une autre agence.
        $this->leasePayment($this->leaseOf($agency, $this->landlordOf($agency), 10), 999_000);
        $other = $this->moneyAgency();
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $other->id]);
        $this->leasePayment($this->leaseOf($other, $landlord, 10), 777_000);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->assertSame(100000, (int) $this->prepare($landlord->id)->json('data.totals.gross'));
    }

    public function test_preparation_requires_payouts_create(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        Sanctum::actingAs($landlord);

        $this->prepare($landlord->id)->assertForbidden();
    }

    public function test_ac2_the_payout_created_from_the_ids_carries_the_computed_gross_whatever_the_body_says(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        [$rent, $charges] = $this->septemberOf($this->leaseOf($agency, $landlord, 10));
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id, $charges->id],
            'gross_amount' => 1,
        ])->assertStatus(422)->assertJsonValidationErrors(['gross_amount']);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id, $charges->id],
            'notes' => 'brut 999 999',
        ])->assertCreated()
            ->assertJsonPath('data.gross_amount', 220000)
            ->assertJsonPath('data.commission_amount', 22000)
            ->assertJsonPath('data.net_amount', 198000)
            ->assertJsonPath('data.payee_role', 'landlord')
            ->assertJsonPath('data.status', 'pending');
    }
}
