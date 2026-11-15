<?php

namespace Tests\Feature\Payout;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\TestCase;

/**
 * TCK-2649 (AC5) — les champs ajoutés au relevé ne réécrivent pas le relevé envoyé (TCK-2321) :
 * l'instantané garde ses totaux, `remaining_to_pay` compris, et le rectificatif reste servi. Un
 * instantané écrit AVANT ce champ le reçoit recomposé sur ses propres totaux, sans faux
 * rectificatif. Titre du bien et nom du locataire ne sont pas figés : ils se lisent au jour.
 */
class OwnerStatementSnapshotUnchangedTest extends TestCase
{
    use BuildsMoneyOut;
    use RefreshDatabase;

    private Agency $agency;

    private User $landlord;

    private Lease $lease;

    private LeasePayment $pendingRent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = $this->moneyAgency();
        $this->landlord = $this->landlordOf($this->agency);
        $this->lease = $this->leaseOf($this->agency, $this->landlord, 10);
        $this->lease->forceFill([
            'tenant_id' => Customer::factory()->create(['agency_id' => $this->agency->id, 'first_name' => 'Awa', 'last_name' => 'Ndiaye'])->id,
            'start_date' => '2026-01-01', 'end_date' => '2026-12-31',
        ])->save();
        // net 198 000, rien versé ; un loyer de septembre encore dû.
        [, , , $this->pendingRent] = $this->septemberOf($this->lease);
        $this->travelTo('2026-10-01 08:00:00');
        $this->artisan('payouts:send-owner-statements', ['--period' => '2026-09'])->assertSuccessful();
        Sanctum::actingAs($this->landlord);
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
        return json_decode(DB::table('owner_statement_snapshots')->sole()->payload, true);
    }

    public function test_ac5_le_releve_envoye_garde_ses_totaux_et_le_rectificatif_reste_servi(): void
    {
        $this->assertEquals(198000, $this->payload()['totals']['remaining_to_pay']);
        $this->assertArrayNotHasKey('next_payout', $this->payload());
        $this->assertArrayNotHasKey('tenant_name', $this->payload()['properties'][0], 'le nom du locataire ne se fige pas');
        $this->assertArrayNotHasKey('title', $this->payload()['properties'][0]);

        $this->travelTo('2026-11-20 10:00:00');
        $this->pendingRent->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => '2026-09-15 10:00:00'])->save();

        $data = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data');

        $this->assertEquals([220000, 198000, 0, 198000], [$data['totals']['gross'], $data['totals']['net'], $data['totals']['paid_out'], $data['totals']['remaining_to_pay']]);
        $this->assertEquals(378000, $data['rectification']['totals']['remaining_to_pay']);
        $this->assertEquals(180000, $data['rectification']['delta']['remaining_to_pay']);
        $this->assertSame([$this->pendingRent->id], array_column($data['rectification']['lines']['added']['lease_payments'], 'id'));
        // Lus au jour.
        $this->assertSame('Awa Ndiaye', $data['properties'][0]['tenant_name']);
        $this->assertSame($this->lease->property->title, $data['properties'][0]['title']);
        $this->assertArrayHasKey('next_payout', $data);
    }

    /** Un instantané d'avant TCK-2649 (sans `remaining_to_pay`) ne fait naître aucun rectificatif. */
    public function test_un_instantane_d_avant_le_champ_le_recoit_sur_ses_totaux_sans_faux_rectificatif(): void
    {
        $old = $this->payload();
        unset($old['totals']['remaining_to_pay']);
        $old['properties'] = array_map(fn (array $r) => array_intersect_key($r, array_flip(['property_id', 'collected', 'commission', 'fees', 'net'])), $old['properties']);
        DB::table('owner_statement_snapshots')->update(['payload' => json_encode($old)]);

        $data = $this->getJson('/api/owner-statements?period=2026-09')->assertOk()->json('data');

        $this->assertEquals(198000, $data['totals']['remaining_to_pay']);
        $this->assertNull($data['rectification'], 'rien n\'a été écrit depuis l\'envoi');
        $this->assertArrayNotHasKey('month_status', $data['properties'][0], 'aucun état fabriqué après coup');
        $this->assertSame('Awa Ndiaye', $data['properties'][0]['tenant_name']);
    }
}
