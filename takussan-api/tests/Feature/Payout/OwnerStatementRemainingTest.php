<?php

namespace Tests\Feature\Payout;

use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\TestCase;

/**
 * TCK-2649 (ADR-0100) — le relevé du bailleur dit « ce qui reste à vous verser »
 * (`totals.remaining_to_pay = net − paid_out`, calculé une fois, négatif s'il a été trop versé) et
 * le prochain reversement programmé (`next_payout`). Avant : ni l'un ni l'autre, le front
 * soustrayait.
 */
class OwnerStatementRemainingTest extends TestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
    }

    /** @param  array<string, mixed>  $attributes */
    private function payout(int $agencyId, User $landlord, array $attributes): Payout
    {
        return Payout::factory()->create($attributes + [
            'agency_id' => $agencyId,
            'landlord_id' => $landlord->id,
            'payee_role' => PayeeRole::Landlord,
        ]);
    }

    /** AC4 — `remaining_to_pay = net − paid_out` au centime : rien versé, puis trop versé. */
    public function test_ac4_le_reste_a_verser_vaut_le_net_moins_le_verse_et_peut_etre_negatif(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $this->septemberOf($this->leaseOf($agency, $landlord, 10)); // net 198 000
        Sanctum::actingAs($landlord);

        $totals = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data.totals');
        $this->assertEquals(198000, $totals['net']);
        $this->assertEquals(0, $totals['paid_out']);
        $this->assertEquals(198000, $totals['remaining_to_pay']);

        // Un reversement de 150 000,50 versé en septembre : reste 47 999,50.
        $this->payout($agency->id, $landlord, ['status' => PayoutStatus::Completed, 'processed_at' => '2026-09-30 09:00:00', 'net_amount' => 150_000.50]);
        $totals = $this->getJson('/api/owner-statements?period=2026-09')->json('data.totals');
        $this->assertSame(round($totals['net'] - $totals['paid_out'], 2), round((float) $totals['remaining_to_pay'], 2));
        $this->assertEquals(47999.5, $totals['remaining_to_pay']);

        // Trop versé : le reste est négatif, rendu tel quel.
        $this->payout($agency->id, $landlord, ['status' => PayoutStatus::Completed, 'processed_at' => '2026-09-30 10:00:00', 'net_amount' => 100_000]);
        $this->assertEquals(-52000.5, $this->getJson('/api/owner-statements?period=2026-09')->json('data.totals.remaining_to_pay'));

        // L'attestation annuelle porte le même champ.
        $year = $this->getJson('/api/owner-statements?period=2026')->json('data.totals');
        $this->assertEquals(round($year['net'] - $year['paid_out'], 2), $year['remaining_to_pay']);
    }

    /** `next_payout` : le plus tôt programmé des reversements à venir de CE bailleur, dans CETTE agence. */
    public function test_le_prochain_reversement_est_le_plus_tot_programme_de_ce_bailleur(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $this->leaseOf($agency, $landlord);
        Sanctum::actingAs($landlord);

        $this->assertNull($this->getJson('/api/owner-statements?period=2026-11')->assertOk()->json('data.next_payout'));

        $this->payout($agency->id, $landlord, ['status' => PayoutStatus::Pending, 'scheduled_at' => null]);
        $this->payout($agency->id, $landlord, ['status' => PayoutStatus::Scheduled, 'scheduled_at' => '2026-12-05 09:00:00', 'payment_method' => PaymentMethod::Wave]);
        $next = $this->payout($agency->id, $landlord, ['status' => PayoutStatus::Scheduled, 'scheduled_at' => '2026-11-20 09:00:00', 'payment_method' => PaymentMethod::BankTransfer, 'net_amount' => 180_000]);
        // Plus tôt, mais hors de portée : annulé, versé, autre bailleur, autre agence, payé au locataire.
        $this->payout($agency->id, $landlord, ['status' => PayoutStatus::Cancelled, 'scheduled_at' => '2026-11-12 09:00:00']);
        $this->payout($agency->id, $landlord, ['status' => PayoutStatus::Completed, 'scheduled_at' => '2026-11-12 09:00:00', 'processed_at' => '2026-11-12 09:00:00']);
        $this->payout($agency->id, $this->landlordOf($agency), ['status' => PayoutStatus::Scheduled, 'scheduled_at' => '2026-11-12 09:00:00']);
        $this->payout($this->moneyAgency()->id, $landlord, ['status' => PayoutStatus::Scheduled, 'scheduled_at' => '2026-11-12 09:00:00']);
        $this->payout($agency->id, $landlord, ['status' => PayoutStatus::Scheduled, 'scheduled_at' => '2026-11-12 09:00:00', 'payee_role' => PayeeRole::Tenant]);

        $data = $this->getJson('/api/owner-statements?period=2026-11')->json('data.next_payout');

        $this->assertSame($next->id, $data['id']);
        $this->assertSame('2026-11-20T09:00:00+00:00', $data['scheduled_at']);
        $this->assertSame('bank_transfer', $data['payment_method']);
        $this->assertSame('scheduled', $data['status']);
        $this->assertEquals(180000, $data['net_amount']);
    }
}
