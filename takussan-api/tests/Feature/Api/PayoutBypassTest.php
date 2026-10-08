<?php

namespace Tests\Feature\Api;

use App\Exceptions\ApiError;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\PayoutMethod;
use App\Services\Model\PayoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 — les contournements que la vérification adverse a reproduits (VERIF-594), un test par
 * point. Le chemin nominal est couvert ailleurs ; ici, chaque test rejoue le détour d'un attaquant
 * ou d'une personne seule, et vérifie qu'il est refusé.
 */
class PayoutBypassTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /**
     * B-1 — après une prise de compte, l'attaquant change le téléphone, le revérifie, puis déclare son
     * numéro comme destination. Rien n'est vérifié d'office : l'agence ne paie pas tant qu'un de ses
     * membres n'a pas vérifié la destination.
     */
    public function test_b1_a_destination_equal_to_a_freshly_verified_phone_is_not_verified(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $landlord->forceFill(['phone' => '+221770000001', 'phone_verified_at' => now()->subYear()])->save();
        $issuer = $this->agencyAdmin($agency);

        Sanctum::actingAs($landlord);
        $otp = $this->postJson('/api/auth/phone/send-otp', ['phone' => '+221778887766'])->assertOk();
        $this->postJson('/api/auth/phone/verify-otp', ['code' => (string) $otp->json('data.debug_code')])->assertOk();
        $this->assertNotNull($landlord->fresh()->phone_verified_at);

        $methodId = $this->postJson('/api/me/payout-methods', ['kind' => 'wave', 'account_identifier' => '+221778887766', 'is_default' => true])
            ->assertCreated()
            ->assertJsonPath('data.verified', false)
            ->json('data.id');

        Sanctum::actingAs($issuer);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 300_000);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->json('data.id');

        $this->postJson("/api/payouts/{$id}/mark-processed", [
            'payment_method' => 'wave', 'transaction_id' => 'W-9', 'payout_method_id' => $methodId,
        ])->assertStatus(422)->assertJsonPath('code', 'payout.unverified_destination');

        // Un membre de l'agence vérifie : le paiement passe.
        Sanctum::actingAs($this->agencyAgent($agency));
        $this->postJson("/api/payout-methods/{$methodId}/verify")->assertOk();
        Sanctum::actingAs($issuer);
        $this->postJson("/api/payouts/{$id}/mark-processed", [
            'payment_method' => 'wave', 'transaction_id' => 'W-9', 'payout_method_id' => $methodId,
        ])->assertOk()->assertJsonPath('data.status', 'completed');
        $this->assertSame(1, PayoutMethod::query()->count());
    }

    /**
     * M-5 — `mark-failed` et `cancel` jugeaient le statut sur le modèle lié, hors verrou. En
     * concurrence réelle, un reversement payé repassait `failed` et ses pièces se détachaient : les
     * loyers redevenaient reversables (double paiement). Le modèle chargé AVANT le paiement rejoue
     * exactement ce que voyait le second processus.
     */
    public function test_m5_a_stale_mark_failed_or_cancel_does_not_undo_a_payment(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        Sanctum::actingAs($this->agencyAdmin($agency));
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 100_000);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->json('data.id');

        $stale = Payout::query()->findOrFail($id);
        $this->assertSame(PayoutStatus::Pending, $stale->status);

        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'check', 'transaction_id' => 'CHQ-1'])->assertOk();

        foreach (['markFailed' => 'payout.cannot_fail', 'cancel' => 'payout.cannot_cancel'] as $gesture => $code) {
            try {
                $gesture === 'markFailed'
                    ? app(PayoutService::class)->markFailed($stale, ['failed_reason' => 'course'])
                    : app(PayoutService::class)->cancel($stale);
                $this->fail("{$gesture} a défait un paiement.");
            } catch (ApiError $e) {
                $this->assertSame(422, $e->getStatusCode());
                $this->assertSame($code, $e->errorCode);
            }
        }

        $payout = Payout::query()->findOrFail($id);
        $this->assertSame(PayoutStatus::Completed, $payout->status);
        $this->assertSame(1, $payout->leasePayments()->count(), 'les pièces restent attachées');
    }

    /** M-5 — le modèle lui-même refuse toute sortie de `completed`, quel que soit le chemin. */
    public function test_m5_the_model_refuses_to_leave_completed(): void
    {
        $payout = Payout::factory()->create(['status' => PayoutStatus::Completed]);

        foreach ([PayoutStatus::Failed, PayoutStatus::Cancelled] as $target) {
            try {
                $payout->fresh()->update(['status' => $target]);
                $this->fail("completed → {$target->value} accepté.");
            } catch (ApiError $e) {
                $this->assertSame('payout.status_transition_invalid', $e->errorCode);
            }
        }
        $this->assertSame(PayoutStatus::Completed, $payout->fresh()->status);
    }
}
