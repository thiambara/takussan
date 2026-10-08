<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 (AC3, AC19) — une pièce citée appartient à l'agence ET au bailleur du reversement, et un
 * paiement n'est reversé qu'une fois. Chaque refus vérifie que RIEN n'est écrit.
 */
class PayoutItemScopeTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private function assertNothingWritten(): void
    {
        $this->assertDatabaseCount('payouts', 0);
        $this->assertDatabaseCount('payout_lease_payment', 0);
    }

    public function test_ac19_a_lease_payment_of_another_agency_is_refused(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $other = $this->moneyAgency();
        $foreign = $this->leasePayment($this->leaseOf($other, $this->landlordOf($other)), 100_000);
        Sanctum::actingAs($this->agencyAgent($agency));

        $response = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$foreign->id],
        ])->assertStatus(422)->assertJsonValidationErrors(['lease_payment_ids']);

        $this->assertSame(
            __('money_out.payout.foreign_item', ['id' => $foreign->id]),
            $response->json('errors.lease_payment_ids.0'),
        );
        $this->assertNothingWritten();
    }

    public function test_ac19_a_lease_payment_of_another_landlord_of_the_same_agency_is_refused(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $neighbour = $this->leasePayment($this->leaseOf($agency, $this->landlordOf($agency)), 100_000);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$neighbour->id],
        ])->assertStatus(422)->assertJsonValidationErrors(['lease_payment_ids']);

        $this->assertNothingWritten();
    }

    public function test_ac19_a_body_without_any_item_is_refused(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->postJson('/api/payouts', ['landlord_id' => $landlord->id])
            ->assertStatus(422)->assertJsonValidationErrors(['lease_payment_ids']);

        $this->assertNothingWritten();
    }

    public function test_ac19_lease_id_is_prohibited_even_with_a_valid_item(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord);
        $rent = $this->leasePayment($lease, 100_000);
        $other = $this->moneyAgency();
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'lease_id' => $this->leaseOf($other, $this->landlordOf($other))->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['lease_id']);

        $this->assertNothingWritten();
    }

    public function test_an_unpaid_or_deposit_payment_is_not_an_item(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        [, , $deposit, $pending] = $this->septemberOf($this->leaseOf($agency, $landlord));
        Sanctum::actingAs($this->agencyAgent($agency));

        foreach ([$deposit, $pending] as $item) {
            $this->postJson('/api/payouts', [
                'landlord_id' => $landlord->id,
                'lease_payment_ids' => [$item->id],
            ])->assertStatus(422)->assertJsonValidationErrors(['lease_payment_ids']);
        }

        $this->assertNothingWritten();
    }

    public function test_ac3_a_rent_is_paid_out_once_and_again_after_cancel(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        [$rent, $charges] = $this->septemberOf($this->leaseOf($agency, $landlord));
        Sanctum::actingAs($this->agencyAgent($agency));

        $first = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id, $charges->id],
        ])->assertCreated()->json('data.id');

        // Une période qui chevauche la première ne compte pas deux fois le même loyer.
        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'period_start' => '2026-09-15',
            'period_end' => '2026-10-15',
        ])->assertStatus(409);

        $this->assertSame(1, DB::table('payout_lease_payment')->where('lease_payment_id', $rent->id)->count());
        $this->assertSame(1, Payout::query()->count());

        $this->postJson("/api/payouts/{$first}/cancel")->assertOk();
        $this->assertSame(0, DB::table('payout_lease_payment')->where('lease_payment_id', $rent->id)->count());

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
        ])->assertCreated()->assertJsonPath('data.gross_amount', 200000);
    }

    public function test_ac3_the_database_refuses_a_second_pivot_row_for_one_payment(): void
    {
        // La garde de dernier recours : la course que la relecture sous verrou ne voit pas.
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord), 100_000);
        $a = Payout::factory()->create(['agency_id' => $agency->id, 'landlord_id' => $landlord->id]);
        $b = Payout::factory()->create(['agency_id' => $agency->id, 'landlord_id' => $landlord->id]);
        $a->leasePayments()->attach($rent->id);

        $this->expectException(UniqueConstraintViolationException::class);
        $b->leasePayments()->attach($rent->id);
    }

    public function test_a_failed_payout_releases_its_items(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord), 100_000);
        Sanctum::actingAs($this->agencyAgent($agency));

        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/payouts/{$id}/mark-failed", ['failed_reason' => 'Numéro invalide'])->assertOk();

        $this->assertSame(PayoutStatus::Failed, Payout::find($id)->status);
        $this->assertSame(0, DB::table('payout_lease_payment')->count());
    }

    public function test_a_payout_over_several_leases_keeps_its_origin_in_the_pivots(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $a = $this->leasePayment($this->leaseOf($agency, $landlord), 100_000);
        $b = $this->leasePayment($this->leaseOf($agency, $landlord), 50_000);
        Sanctum::actingAs($this->agencyAgent($agency));

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$a->id, $b->id],
        ])->assertCreated()->assertJsonPath('data.lease_id', null);

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$this->leasePayment($a->lease, 10_000)->id],
        ])->assertCreated()->assertJsonPath('data.lease_id', $a->lease_id);
    }
}
