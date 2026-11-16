<?php

namespace Tests\Feature\Database\Seeders;

use App\Models\Agency;
use App\Models\BankStatementLine;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Services\Reporting\PlatformMetricsSnapshotter;
use Database\Seeders\Support\ReferentialIntegrityChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-2381 — les trois invariants du lot 2 MORDENT : chacun compte la ligne fausse qu'on lui plante, et
 * se tait sur sa jumelle juste. `SeedingFeatureTablesTest` affirme qu'un seed les tient ; sans ce test,
 * un invariant qui rendrait toujours zéro y passerait aussi.
 */
class RemainingTablesInvariantsTest extends TestCase
{
    use RefreshDatabase;

    private function violations(string $invariant): int
    {
        return (new ReferentialIntegrityChecker)->violations()[$invariant];
    }

    public function test_une_ligne_rapprochee_d_un_autre_montant_ou_trop_loin_est_comptee(): void
    {
        $lease = Lease::factory()->create();
        $paiement = LeasePayment::factory()->create(['lease_id' => $lease->id, 'amount' => 150000, 'paid_at' => '2026-09-03 10:00:00', 'currency' => 'XOF', 'late_fee_paid_at' => null, 'metadata' => null]);

        $juste = BankStatementLine::factory()->confirmed(LeasePayment::class, $paiement->id)->create(['amount' => 150000, 'posted_at' => '2026-09-04']);
        $paiement->forceFill(['bank_statement_line_id' => $juste->id, 'bank_reconciled_at' => '2026-09-04'])->save();
        $this->assertSame(0, $this->violations('ligne_rapprochee_sans_paiement_du_meme_montant'));

        $juste->forceFill(['amount' => 140000])->save();
        $this->assertSame(1, $this->violations('ligne_rapprochee_sans_paiement_du_meme_montant'));

        $juste->forceFill(['amount' => 150000, 'posted_at' => '2026-09-20'])->save();
        $this->assertSame(1, $this->violations('ligne_rapprochee_sans_paiement_du_meme_montant'));
    }

    public function test_une_reprise_qui_depasse_la_ligne_du_reversement_est_comptee(): void
    {
        $lease = Lease::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $paiement = LeasePayment::factory()->create(['lease_id' => $lease->id, 'amount' => 100000]);
        $payout = Payout::factory()->create(['lease_id' => $lease->id, 'agency_id' => $lease->agency_id, 'landlord_id' => $lease->landlord_id, 'status' => PayoutStatus::Completed]);
        DB::table('payout_lease_payment')->insert(['payout_id' => $payout->id, 'lease_payment_id' => $paiement->id, 'amount' => 100000, 'commission_rate' => 8, 'commission_amount' => 8000]);

        $reprise = fn (float $base) => DB::table('payout_clawbacks')->insertGetId([
            'agency_id' => $payout->agency_id, 'landlord_id' => $payout->landlord_id,
            'refunded_payment_type' => LeasePayment::class, 'refunded_payment_id' => $paiement->id, 'part' => 'payment',
            'source_payout_id' => $payout->id, 'refund_amount' => $base, 'commission_rate' => 8,
            'commission_amount' => round($base * 0.08), 'amount' => $base - round($base * 0.08), 'currency' => 'XOF',
            'refunded_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $premiere = $reprise(60000);
        $this->assertSame(0, $this->violations('reprise_superieure_a_ce_que_le_reversement_a_pris'));

        // Deux reprises de la même pièce : leur somme dépasse ce que le reversement en a pris.
        $reprise(50000);
        $this->assertSame(2, $this->violations('reprise_superieure_a_ce_que_le_reversement_a_pris'));

        DB::table('payout_clawbacks')->where('id', '!=', $premiere)->delete();
        DB::table('payout_lease_payment')->where('payout_id', $payout->id)->delete();
        $this->assertSame(1, $this->violations('reprise_superieure_a_ce_que_le_reversement_a_pris'), 'Une reprise dont la pièce n\'est pas portée par son reversement.');
    }

    public function test_une_metrique_du_jour_qui_ne_se_recalcule_pas_est_comptee(): void
    {
        $lease = Lease::factory()->create();
        LeasePayment::factory()->create(['lease_id' => $lease->id, 'amount' => 75000, 'status' => 'paid', 'paid_at' => '2026-09-03 10:00:00', 'payment_type' => 'rent', 'currency' => 'XOF']);
        $snapshotter = app(PlatformMetricsSnapshotter::class);
        $snapshotter->snapshot(Carbon::parse('2026-09-03'), withStocks: false);
        $this->assertSame(0, $this->violations('metrique_du_jour_qui_ne_se_recalcule_pas'));

        DB::table('platform_metrics_daily')->whereDate('date', '2026-09-03')->update(['gmv_amount' => 1]);
        $this->assertSame(1, $this->violations('metrique_du_jour_qui_ne_se_recalcule_pas'));
    }
}
