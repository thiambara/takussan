<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-1156 (P76.01) — un reversement de la plateforme clos avant un remboursement ne s'approuve ni
 * ne se paie : une ligne qui n'est plus `paid` renvoie à l'annulation, puis à une nouvelle clôture.
 * Avant : `approve` et `mark-paid` rendaient 200, et l'agence recevait 95 000 pour un loyer que la
 * plateforme avait rendu au locataire.
 */
class PlatformPayoutRefundedItemsTest extends TestCase
{
    use EncaissementsPlateforme;
    use RefreshDatabase;

    private User $closer;

    private User $approver;

    public function test_a_payout_whose_line_was_refunded_after_closing_is_not_approved(): void
    {
        [$payout, $rent] = $this->closeOne();
        $this->refund($rent);

        $this->actingAs($this->approver);
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")
            ->assertStatus(422)
            ->assertJsonPath('code', 'platform_payout.items_changed');

        $this->assertSame(PlatformPayoutStatus::Pending, $payout->fresh()->status);
    }

    public function test_an_approved_payout_whose_line_was_refunded_is_not_marked_paid(): void
    {
        [$payout, $rent] = $this->closeOne();

        $this->actingAs($this->approver);
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertOk();

        $this->refund($rent);

        $this->actingAs($this->closer);
        $this->postJson("/api/admin/payouts/{$payout->id}/mark-paid", [
            'processed_at' => '2026-10-01T10:00:00Z',
            'payment_reference' => 'VIR-1',
        ])->assertStatus(422)->assertJsonPath('code', 'platform_payout.items_changed');

        $this->assertSame(PlatformPayoutStatus::Approved, $payout->fresh()->status);
    }

    public function test_cancelling_frees_the_refunded_line_and_a_new_close_leaves_it_out(): void
    {
        [$payout, $rent] = $this->closeOne();
        $this->refund($rent);

        $this->actingAs($this->approver);
        $this->postJson("/api/admin/payouts/{$payout->id}/cancel", ['reason' => 'remboursement'])->assertOk();

        $this->assertNull($rent->fresh()->platform_payout_id);
        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $payout->agency_id,
            'period_end' => '2026-09-30',
        ])->assertCreated()->assertJsonPath('data', []);
    }

    /** @return array{0: PlatformPayout, 1: LeasePayment} */
    private function closeOne(): array
    {
        $this->approver = $this->actingAsRole('super_admin');
        $this->closer = $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['is_verified' => true]);

        $rent = $this->soldeParLaPlateforme(LeasePayment::factory()->create([
            'lease_id' => Lease::factory()->create(['agency_id' => $agency->id])->id,
            'amount' => 100_000,
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-09-15 10:00:00',
        ]));

        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-09-30',
        ])->assertCreated();

        $payout = PlatformPayout::query()->where('agency_id', $agency->id)->firstOrFail();
        $this->assertSame($payout->id, $rent->fresh()->platform_payout_id);

        return [$payout, $rent];
    }

    /** L'état que laisse le remboursement rapporté par le fournisseur (`PaymentGatewayService`). */
    private function refund(LeasePayment $rent): void
    {
        $rent->forceFill(['status' => PaymentStatus::Refunded, 'refund_amount' => 100_000])->save();
    }
}
