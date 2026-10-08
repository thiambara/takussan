<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\PayoutMethod;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Model\PayoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
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

    /**
     * M-1 — le seuil se jugeait reversement par reversement : deux fois 60 000 sous un seuil de
     * 100 000 passaient d'une seule main. Il se juge désormais sur le cumul des nets NON approuvés
     * vers le même bénéficiaire, dans l'agence, sur 30 jours glissants — un reversement déjà payé
     * compte, un reversement approuvé ne compte plus.
     */
    public function test_m1_splitting_under_the_threshold_still_requires_an_approval(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $landlord = $this->landlordOf($agency);
        $other = $this->landlordOf($agency);
        $issuer = $this->agencyAdmin($agency);
        $approver = $this->agencyAdmin($agency);
        Sanctum::actingAs($issuer);

        $first = $this->createFor($agency, $landlord, 60_000)->assertJsonPath('data.status', 'pending')->json('data.id');
        $this->postJson("/api/payouts/{$first}/mark-processed", ['payment_method' => 'check', 'transaction_id' => 'CHQ-1'])->assertOk();

        // La préparation le dit avant la création.
        $this->getJson("/api/payouts/preparation?landlord_id={$landlord->id}&period_start=2026-01-01&period_end=2026-12-31")
            ->assertOk()->assertJsonPath('data.requires_approval', false);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 60_000);
        $this->getJson("/api/payouts/preparation?landlord_id={$landlord->id}&period_start=2026-01-01&period_end=2026-12-31")
            ->assertOk()->assertJsonPath('data.requires_approval', true);
        $second = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->assertJsonPath('data.status', 'awaiting_approval')->json('data.id');

        // Un autre bénéficiaire n'hérite pas du cumul.
        $this->createFor($agency, $other, 60_000)->assertJsonPath('data.status', 'pending');

        // Approuvé, le second ne compte plus : le suivant repart de 60 000 non approuvés.
        Sanctum::actingAs($approver);
        $this->postJson("/api/payouts/{$second}/approve")->assertOk();
        Sanctum::actingAs($issuer);
        $this->createFor($agency, $landlord, 30_000)->assertJsonPath('data.status', 'pending');

        // Hors de la fenêtre de 30 jours, un reversement non approuvé ne compte plus. Sans fenêtre, 60 000 + 30 000 + 15 000 dépasseraient le seuil.
        Payout::query()->whereKey($first)->update(['created_at' => now()->subDays(31)]);
        $this->createFor($agency, $landlord, 15_000)->assertJsonPath('data.status', 'pending');
    }

    private function createFor(Agency $agency, User $landlord, int $net): TestResponse
    {
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), $net);

        return $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])->assertCreated();
    }

    /**
     * M-3 — la caution rendue naissait `pending`, sans passer par le seuil : avec un seuil à 0
     * (approbation toujours exigée), 1 500 000 sortaient d'une seule main.
     */
    public function test_m3_a_deposit_refund_goes_through_the_four_eyes(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 0])->save();
        $landlord = $this->landlordOf($agency);
        $lease = $this->leaseOf($agency, $landlord);
        $lease->forceFill(['status' => LeaseStatus::Terminated, 'deposit_amount' => 1_500_000])->save();
        $admin = $this->agencyAdmin($agency);
        $approver = $this->agencyAdmin($agency);
        Sanctum::actingAs($admin);

        $id = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 1_500_000])
            ->assertCreated()->json('data.payout_id');
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::query()->findOrFail($id)->status);
        Notification::assertSentTo($approver, CodedNotification::class, fn ($n): bool => $n->code === NotificationCode::PayoutAwaitingApproval);

        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'check', 'transaction_id' => 'CHQ-7'])
            ->assertStatus(422)->assertJsonPath('code', 'payout.awaiting_approval');

        Sanctum::actingAs($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();
        Sanctum::actingAs($admin);
        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'check', 'transaction_id' => 'CHQ-7'])
            ->assertOk()->assertJsonPath('data.status', 'completed');
    }

    /**
     * M-6 — `verified_at` était global : vérifiée par l'agence A, une destination servait à payer
     * depuis l'agence B où le titulaire est aussi bailleur. La vérification vaut par agence.
     */
    public function test_m6_a_destination_verified_by_one_agency_does_not_pay_from_another(): void
    {
        Notification::fake();
        $a = $this->moneyAgency();
        $b = $this->moneyAgency();
        $landlord = User::factory()->withOwnerProfile($a)->create();
        OwnerProfile::factory()->create(['user_id' => $landlord->id, 'agency_id' => $b->id]);
        $method = PayoutMethod::factory()->create(['user_id' => $landlord->id]);

        Sanctum::actingAs($this->agencyAgent($a));
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertOk()->assertJsonPath('data.verified', true);

        $payerB = $this->agencyAdmin($b);
        Sanctum::actingAs($payerB);
        // L'agence B la lit non vérifiée, partout où elle la lit.
        $this->getJson("/api/payout-methods?filter[user_id]={$landlord->id}")->assertOk()->assertJsonPath('data.0.verified', false);
        $rent = $this->leasePayment($this->leaseOf($b, $landlord, 0), 100_000);
        $this->getJson("/api/payouts/preparation?landlord_id={$landlord->id}&period_start=2026-01-01&period_end=2026-12-31")
            ->assertOk()->assertJsonPath('data.payout_methods.0.verified', false);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->json('data.id');

        $body = ['payment_method' => 'wave', 'transaction_id' => 'W-B', 'payout_method_id' => $method->id];
        $this->postJson("/api/payouts/{$id}/mark-processed", $body)
            ->assertStatus(422)->assertJsonPath('code', 'payout.unverified_destination');

        // Vérifiée par un membre de B, elle sert depuis B.
        Sanctum::actingAs($this->agencyAgent($b));
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertOk();
        Sanctum::actingAs($payerB);
        $this->postJson("/api/payouts/{$id}/mark-processed", $body)->assertOk();
        $this->assertSame(2, $method->verifications()->count());
    }

    /**
     * M-4 — l'approbation ne couvrait que le net. Le numéro de la destination approuvée changeait
     * (même `id`), était revérifié, et l'argent partait ailleurs que ce que l'approbateur avait vu.
     */
    public function test_m4_the_destination_changed_after_approval_is_refused(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer, $approver, $agent] = $this->fourEyesAgency();
        $m1 = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subDays(3))->create([
            'user_id' => $landlord->id, 'account_identifier' => '+221771111111', 'masked_identifier' => PayoutMethod::mask('+221771111111'),
        ]);
        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, $m1);

        // L'approbateur voit la destination qu'il approuve, masquée.
        Sanctum::actingAs($approver);
        $this->getJson("/api/payouts/{$id}")->assertOk()->assertJsonPath('data.payout_method_masked', '•••• 1111');
        $this->postJson("/api/payouts/{$id}/approve")->assertOk()->assertJsonPath('data.approved_destination_masked', '•••• 1111');

        // Le compte du bailleur change le numéro de la MÊME destination ; un tiers la revérifie.
        Sanctum::actingAs($landlord);
        $this->patchJson("/api/me/payout-methods/{$m1->id}", ['account_identifier' => '+221779999999'])->assertOk();
        Sanctum::actingAs($agent);
        $this->postJson("/api/payout-methods/{$m1->id}/verify")->assertOk();

        Sanctum::actingAs($issuer);
        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'wave', 'transaction_id' => 'W-1'])
            ->assertStatus(422)->assertJsonPath('code', 'payout.destination_changed_since_approval');
        $this->assertSame(PayoutStatus::Pending, Payout::query()->findOrFail($id)->status);
    }

    /** M-4 — le payeur ne choisit pas une AUTRE destination que celle approuvée, même vérifiée. */
    public function test_m4_another_destination_than_the_approved_one_is_refused(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer, $approver, $agent] = $this->fourEyesAgency();
        $m1 = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subDays(3))->create(['user_id' => $landlord->id]);
        $m2 = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subDays(3))->create(['user_id' => $landlord->id, 'is_default' => false]);
        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, $m1);
        Sanctum::actingAs($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();

        Sanctum::actingAs($issuer);
        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'wave', 'transaction_id' => 'W-2', 'payout_method_id' => $m2->id])
            ->assertStatus(422)->assertJsonPath('code', 'payout.destination_changed_since_approval');
        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'wave', 'transaction_id' => 'W-2', 'payout_method_id' => $m1->id])
            ->assertOk()->assertJsonPath('data.payout_method_id', $m1->id);
    }

    /** M-4 — un reversement approuvé SANS destination ne part pas vers une destination choisie au paiement. */
    public function test_m4_a_payout_approved_without_destination_is_not_paid_to_one(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer, $approver, $agent] = $this->fourEyesAgency();
        $m1 = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subDays(3))->create(['user_id' => $landlord->id]);
        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, null);
        Sanctum::actingAs($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();

        Sanctum::actingAs($issuer);
        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'wave', 'transaction_id' => 'W-3', 'payout_method_id' => $m1->id])
            ->assertStatus(422)->assertJsonPath('code', 'payout.destination_changed_since_approval');
        // Un chèque ne part vers aucune destination : il reste permis.
        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'check', 'transaction_id' => 'CHQ-3'])->assertOk();
    }

    /**
     * M-4 — celui qui a vérifié une destination ne la paie pas dans les 24 h qui suivent, approbation
     * ou non : sinon il vérifie le numéro qu'il veut et paie aussitôt, seul.
     */
    public function test_m4_the_verifier_does_not_pay_the_destination_within_24_hours(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $payer = $this->agencyAdmin($agency);
        $method = PayoutMethod::factory()->create(['user_id' => $landlord->id]);
        Sanctum::actingAs($payer);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 50_000);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id], 'payout_method_id' => $method->id])
            ->assertCreated()->assertJsonPath('data.status', 'pending')->json('data.id');

        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertOk();
        $body = ['payment_method' => 'wave', 'transaction_id' => 'W-4'];
        $this->travel(1)->hours();
        $this->postJson("/api/payouts/{$id}/mark-processed", $body)
            ->assertForbidden()->assertJsonPath('code', 'payout.verifier_cannot_pay_yet');

        $this->travel(24)->hours();
        $this->postJson("/api/payouts/{$id}/mark-processed", $body)->assertOk();
    }

    /** @return array{0: Agency, 1: User, 2: User, 3: User, 4: User} */
    private function fourEyesAgency(): array
    {
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();

        return [$agency, $this->landlordOf($agency), $this->agencyAdmin($agency), $this->agencyAdmin($agency), $this->agencyAgent($agency)];
    }

    private function awaitingPayoutTo(Agency $agency, User $landlord, User $issuer, ?PayoutMethod $method): int
    {
        Sanctum::actingAs($issuer);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000);

        return $this->postJson('/api/payouts', array_filter([
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'payout_method_id' => $method?->id,
            'payment_method' => 'wave',
        ]))->assertCreated()->assertJsonPath('data.status', 'awaiting_approval')->json('data.id');
    }
}
