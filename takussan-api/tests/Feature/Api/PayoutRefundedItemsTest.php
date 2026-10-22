<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-1158 (P76.03) — un reversement au bailleur préparé avant un remboursement ne s'approuve ni ne
 * se verse : une échéance rattachée qui n'est plus `paid` renvoie à l'annulation. Avant :
 * `mark-processed` rendait 200 et versait au bailleur un loyer rendu au locataire.
 */
class PayoutRefundedItemsTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_a_payout_whose_rent_was_refunded_is_not_marked_processed(): void
    {
        [$agency, $landlord] = $this->setUpAgency();
        $issuer = $this->agencyAdmin($agency);
        $this->actingWithStepUp($issuer);

        [$id, $rent] = $this->createPayout($agency, $landlord);
        $this->refund($rent);

        $this->pay($id)->assertStatus(422)->assertJsonPath('code', 'payout.items_changed');
        $this->assertSame(PayoutStatus::Pending, Payout::find($id)->status);
    }

    public function test_a_payout_awaiting_approval_whose_rent_was_refunded_is_not_approved(): void
    {
        [$agency, $landlord] = $this->setUpAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $issuer = $this->agencyAdmin($agency);
        $approver = $this->agencyAdmin($agency);

        $this->actingWithStepUp($issuer);
        [$id, $rent] = $this->createPayout($agency, $landlord);
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::find($id)->status);
        $this->refund($rent);

        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertStatus(422)->assertJsonPath('code', 'payout.items_changed');
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::find($id)->status);
    }

    public function test_a_rent_refunded_between_the_scope_check_and_the_lock_is_not_paid_out(): void
    {
        [$agency, $landlord] = $this->setUpAgency();
        $this->actingWithStepUp($this->agencyAdmin($agency));
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000);

        // Le remboursement arrive après la vérification hors transaction (`assertItemsInScope`,
        // première lecture de la ligne) et avant la relecture sous verrou.
        $reads = 0;
        LeasePayment::retrieved(function (LeasePayment $payment) use ($rent, &$reads): void {
            if ($payment->id === $rent->id && ++$reads === 1) {
                LeasePayment::query()->whereKey($rent->id)->update(['status' => PaymentStatus::Refunded->value, 'refund_amount' => 150_000]);
            }
        });

        $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
        ])->assertStatus(422)->assertJsonValidationErrors(['lease_payment_ids']);

        $this->assertSame(0, Payout::query()->count());
    }

    /** @return array{0: Agency, 1: User} */
    private function setUpAgency(): array
    {
        $agency = $this->moneyAgency();

        return [$agency, $this->landlordOf($agency)];
    }

    /** @return array{0: int, 1: LeasePayment} */
    private function createPayout(Agency $agency, User $landlord): array
    {
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000);

        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
        ])->assertCreated()->json('data.id');

        return [$id, $rent];
    }

    /** L'état que laisse le remboursement rapporté par le fournisseur (`PaymentGatewayService`). */
    private function refund(LeasePayment $rent): void
    {
        $rent->forceFill(['status' => PaymentStatus::Refunded, 'refund_amount' => 150_000])->save();
    }

    private function pay(int $id): TestResponse
    {
        return $this->postJson("/api/payouts/{$id}/mark-processed", [
            'payment_method' => 'check',
            'transaction_id' => 'CHQ-0042',
        ]);
    }
}
