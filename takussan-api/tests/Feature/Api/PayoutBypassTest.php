<?php

namespace Tests\Feature\Api;

use App\Domain\Notifications\NotificationCode;
use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\Capability;
use App\Models\Enums\InvoiceKind;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\PayoutMethod;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Billing\PlatformPayoutService;
use App\Services\Model\PayoutService;
use App\Services\Payout\PayoutApprovalRule;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FakeSmsRouter;
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
        // Depuis TCK-589 (p3-1), remplacer un numéro VÉRIFIÉ exige une preuve que la prise de compte
        // n'a pas : le compte part donc d'un numéro non vérifié, et la vérification fraîche du
        // nouveau numéro reste le cas éprouvé — elle ne vaut rien pour la destination.
        $landlord->forceFill(['phone' => '+221770000001', 'phone_verified_at' => null])->save();
        $issuer = $this->agencyAdmin($agency);

        // TCK-589 — la réponse de `send-otp` est neutre (plus de `debug_code`) : le code se lit au SMS.
        $sms = FakeSmsRouter::install();
        $this->actingWithStepUp($landlord);
        $this->postJson('/api/auth/phone/send-otp', ['phone' => '+221778887766'])->assertOk();
        $this->postJson('/api/auth/phone/verify-otp', ['code' => $sms->lastCodeFor('+221778887766')])->assertOk();
        $this->assertNotNull($landlord->fresh()->phone_verified_at);

        $methodId = $this->postJson('/api/me/payout-methods', ['kind' => 'wave', 'account_identifier' => '+221778887766', 'is_default' => true])
            ->assertCreated()
            ->assertJsonPath('data.verified', false)
            ->json('data.id');

        $this->actingWithStepUp($issuer);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 300_000);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->json('data.id');

        $this->postJson("/api/payouts/{$id}/mark-processed", [
            'payment_method' => 'wave', 'transaction_id' => 'W-9', 'payout_method_id' => $methodId,
        ])->assertStatus(422)->assertJsonPath('code', 'payout.unverified_destination');

        // Un membre de l'agence vérifie : le paiement passe.
        $this->actingWithStepUp($this->agencyAgent($agency));
        $this->postJson("/api/payout-methods/{$methodId}/verify")->assertOk();
        $this->actingWithStepUp($issuer);
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
        $this->actingWithStepUp($this->agencyAdmin($agency));
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
        $this->actingWithStepUp($issuer);

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
        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$second}/approve")->assertOk();
        $this->actingWithStepUp($issuer);
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
        $this->actingWithStepUp($admin);

        $id = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 1_500_000])
            ->assertCreated()->json('data.payout_id');
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::query()->findOrFail($id)->status);
        Notification::assertSentTo($approver, CodedNotification::class, fn ($n): bool => $n->code === NotificationCode::PayoutAwaitingApproval);

        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'check', 'transaction_id' => 'CHQ-7'])
            ->assertStatus(422)->assertJsonPath('code', 'payout.awaiting_approval');

        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();
        $this->actingWithStepUp($admin);
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

        $this->actingWithStepUp($this->agencyAgent($a));
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertOk()->assertJsonPath('data.verified', true);

        $payerB = $this->agencyAdmin($b);
        $this->actingWithStepUp($payerB);
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
        $this->actingWithStepUp($this->agencyAgent($b));
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertOk();
        $this->actingWithStepUp($payerB);
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
        $this->actingWithStepUp($approver);
        $this->getJson("/api/payouts/{$id}")->assertOk()->assertJsonPath('data.payout_method_masked', '•••• 1111');
        $this->postJson("/api/payouts/{$id}/approve")->assertOk()->assertJsonPath('data.approved_destination_masked', '•••• 1111');

        // Le compte du bailleur change le numéro de la MÊME destination ; un tiers la revérifie.
        $this->actingWithStepUp($landlord);
        $this->patchJson("/api/me/payout-methods/{$m1->id}", ['account_identifier' => '+221779999999'])->assertOk();
        $this->actingWithStepUp($agent);
        $this->postJson("/api/payout-methods/{$m1->id}/verify")->assertOk();

        $this->actingWithStepUp($issuer);
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
        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();

        $this->actingWithStepUp($issuer);
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
        // Pas la destination par défaut : sinon la préparation la prend (VERIF-594 N-1).
        $m1 = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subDays(3))->create(['user_id' => $landlord->id, 'is_default' => false]);
        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, null);
        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();

        $this->actingWithStepUp($issuer);
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
        $this->actingWithStepUp($payer);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 50_000);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id], 'payout_method_id' => $method->id])
            ->assertCreated()->assertJsonPath('data.status', 'pending')->json('data.id');

        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertOk();
        $body = ['payment_method' => 'wave', 'transaction_id' => 'W-4'];
        $this->travel(1)->hours();
        $this->actingWithStepUp($payer);
        $this->postJson("/api/payouts/{$id}/mark-processed", $body)
            ->assertForbidden()->assertJsonPath('code', 'payout.verifier_cannot_pay_yet');

        $this->travel(24)->hours();
        $this->actingWithStepUp($payer);
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
        $this->actingWithStepUp($issuer);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000);

        return $this->postJson('/api/payouts', array_filter([
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
            'payout_method_id' => $method?->id,
            'payment_method' => 'wave',
        ]))->assertCreated()->assertJsonPath('data.status', 'awaiting_approval')->json('data.id');
    }

    /**
     * M-2 — celui qui allait payer coupait le seuil seul, payait seul, puis le remettait. Relâcher
     * le contrôle (le couper, ou le relever) attend désormais un SECOND détenteur de
     * `payouts.approve` ; le resserrer reste immédiat.
     */
    public function test_m2_relaxing_the_threshold_waits_for_a_second_approver(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $a = $this->agencyAdmin($agency);
        $b = $this->agencyAdmin($agency);
        $this->actingWithStepUp($a);

        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 100_000])->assertOk();
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => null])
            ->assertStatus(202)
            ->assertJsonPath('data.payout_approval_threshold', 100000)
            ->assertJsonPath('data.pending_payout_threshold_change.threshold', null)
            ->assertJsonPath('data.pending_payout_threshold_change.requested_by_id', $a->id);
        Notification::assertSentTo($b, CodedNotification::class, fn ($n): bool => $n->code === NotificationCode::PayoutThresholdRelaxRequested);
        Notification::assertNotSentTo($a, CodedNotification::class, fn ($n): bool => $n->code === NotificationCode::PayoutThresholdRelaxRequested);

        // Tant que personne n'a confirmé, le seuil tient.
        $this->createFor($agency, $landlord, 5_000_000)->assertJsonPath('data.status', 'awaiting_approval');
        $this->postJson("/api/agencies/{$agency->id}/payout-threshold/confirm", ['expected_threshold' => null])
            ->assertForbidden()->assertJsonPath('code', 'segregation.approve');

        // Un resserrement est immédiat, et remplace la demande.
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 50_000])
            ->assertOk()->assertJsonPath('data.pending_payout_threshold_change', null);
        $this->assertEquals(50000, (float) $agency->fresh()->payout_approval_threshold);

        // Relevé (une hausse relâche aussi), puis confirmé par le second : il prend effet.
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 400_000])->assertStatus(202);
        $this->assertEquals(50000, (float) $agency->fresh()->payout_approval_threshold);
        $this->actingWithStepUp($b);
        $this->postJson("/api/agencies/{$agency->id}/payout-threshold/confirm", ['expected_threshold' => 400_000])
            ->assertOk()
            ->assertJsonPath('data.payout_approval_threshold', 400000)
            ->assertJsonPath('data.pending_payout_threshold_change', null);
        $this->postJson("/api/agencies/{$agency->id}/payout-threshold/confirm", ['expected_threshold' => 400_000])
            ->assertStatus(422)->assertJsonPath('code', 'payout.no_pending_threshold_change');
    }

    /** M-2 — une agence qui n'a qu'un détenteur ne relâche pas son seuil : personne ne confirmerait. */
    public function test_m2_a_single_approver_cannot_relax_the_threshold(): void
    {
        $agency = $this->moneyAgency();
        $admin = $this->agencyAdmin($agency);
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $this->actingWithStepUp($admin);

        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => null])
            ->assertForbidden()->assertJsonPath('code', 'payout.threshold_needs_second_approver');
        $this->assertEquals(100000, (float) $agency->fresh()->payout_approval_threshold);
    }

    /**
     * m-1 — une agence `individual` n'émet pas de `Payout` à un tiers : son argent sort par la chaîne
     * plateforme. L'hôte paie son prestataire par `createForBill`, pas un bailleur tiers par `create`.
     */
    public function test_m1_an_individual_agency_does_not_pay_a_third_party(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency(['kind' => AgencyKind::Individual, 'commission_rate' => 0]);
        $host = $this->agencyAdmin($agency);
        $third = $this->landlordOf($agency);
        $this->actingWithStepUp($host);
        $rent = $this->leasePayment($this->leaseOf($agency, $third, 0), 80_000);

        $this->postJson('/api/payouts', ['landlord_id' => $third->id, 'lease_payment_ids' => [$rent->id]])
            ->assertStatus(422)->assertJsonPath('code', 'payout.individual_third_party');
        $this->assertSame(0, Payout::query()->count());

        // L'hôte lui-même, payé par la plateforme, reste permis.
        OwnerProfile::factory()->create(['user_id' => $host->id, 'agency_id' => $agency->id]);
        $own = $this->leasePayment($this->leaseOf($agency, $host, 0), 80_000);
        $this->actingAsRole('super_admin');
        $this->postJson('/api/payouts', ['landlord_id' => $host->id, 'agency_id' => $agency->id, 'lease_payment_ids' => [$own->id]])
            ->assertCreated();
    }

    /**
     * m-2 — le bailleur lisait le seuil des quatre yeux de son agence : le connaître aide à fractionner
     * sous lui (M-1). Seuls ceux qui préparent ou approuvent les reversements de l'agence le lisent.
     */
    public function test_m2_the_threshold_is_not_shown_to_a_landlord(): void
    {
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 250_000])->save();
        $other = $this->moneyAgency();

        $this->actingWithStepUp($this->landlordOf($agency));
        $this->getJson("/api/agencies/{$agency->id}")->assertOk()
            ->assertJsonMissingPath('data.payout_approval_threshold')
            ->assertJsonMissingPath('data.pending_payout_threshold_change');

        // L'administrateur d'une AUTRE agence ne le lit pas davantage.
        $this->actingWithStepUp($this->agencyAdmin($other));
        $this->getJson("/api/agencies/{$agency->id}")->assertJsonMissingPath('data.payout_approval_threshold');

        $this->actingWithStepUp($this->agencyAdmin($agency));
        $this->getJson("/api/agencies/{$agency->id}")->assertOk()
            ->assertJsonPath('data.payout_approval_threshold', 250000)
            ->assertJsonPath('data.pending_payout_threshold_change', null);
    }

    /**
     * VERIF-594 N-1 — sans destination à la préparation (la destination par défaut du bailleur n'est
     * pas vérifiée pour l'agence), l'approbateur la fixe en approuvant : elle entre dans l'empreinte
     * figée, et le paiement Wave passe.
     */
    public function test_n1_the_approver_sets_the_destination_and_it_is_paid(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer, $approver, $agent] = $this->fourEyesAgency();
        PayoutMethod::factory()->create(['user_id' => $landlord->id, 'is_default' => true]);
        $verified = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subDays(3))
            ->create(['user_id' => $landlord->id, 'is_default' => false]);
        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, null);
        $this->assertNull(Payout::query()->findOrFail($id)->payout_method_id);

        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve", ['payout_method_id' => $verified->id])->assertOk()
            ->assertJsonPath('data.payout_method_id', $verified->id)
            ->assertJsonPath('data.approved_destination_masked', $verified->masked_identifier);

        $this->actingWithStepUp($issuer);
        $this->postJson("/api/payouts/{$id}/mark-processed", ['payment_method' => 'wave', 'transaction_id' => 'W-N1b', 'payout_method_id' => $verified->id])
            ->assertOk()->assertJsonPath('data.status', 'completed');
    }

    /**
     * VERIF-594 N-1 — l'approbateur ne fixe qu'une destination du bénéficiaire vérifiée POUR
     * L'AGENCE : vérifiée par une autre agence, ou d'un autre utilisateur, elle est refusée.
     */
    public function test_n1_the_approver_cannot_set_an_unverified_destination(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer, $approver] = $this->fourEyesAgency();
        $elsewhere = PayoutMethod::factory()->verifiedFor($this->moneyAgency(), null, now()->subDays(3))
            ->create(['user_id' => $landlord->id, 'is_default' => false]);
        $foreign = PayoutMethod::factory()->verifiedFor($agency, null, now()->subDays(3))->create();
        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, null);

        $this->actingWithStepUp($approver);
        foreach ([$elsewhere, $foreign] as $method) {
            $this->postJson("/api/payouts/{$id}/approve", ['payout_method_id' => $method->id])
                ->assertStatus(422)->assertJsonPath('code', 'payout.unverified_destination');
        }
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::query()->findOrFail($id)->status);
    }

    /**
     * VERIF-594 N-1 — un reversement au bailleur préparé sans destination prend sa destination par
     * défaut, si elle est vérifiée pour l'agence ; vérifiée par une autre agence seulement, aucune.
     */
    public function test_n1_a_landlord_payout_takes_the_default_destination_verified_for_the_agency(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer, , $agent] = $this->fourEyesAgency();
        $default = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subDays(3))
            ->create(['user_id' => $landlord->id, 'is_default' => true]);
        $other = $this->landlordOf($agency);
        PayoutMethod::factory()->verifiedFor($this->moneyAgency(), null, now()->subDays(3))
            ->create(['user_id' => $other->id, 'is_default' => true]);

        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, null);
        $this->assertSame($default->id, Payout::query()->findOrFail($id)->payout_method_id);
        $id = $this->awaitingPayoutTo($agency, $other, $issuer, null);
        $this->assertNull(Payout::query()->findOrFail($id)->payout_method_id);
    }

    /**
     * VERIF-594 N-1 — l'approbateur qui ne prépare pas (`payouts.approve` sans `payouts.create`) lit
     * les destinations masquées du bénéficiaire pour en fixer une ; il ne les vérifie pas.
     */
    public function test_n1_an_approver_reads_the_beneficiary_destinations_but_does_not_verify_them(): void
    {
        [$agency, $landlord] = $this->fourEyesAgency();
        $method = PayoutMethod::factory()->create(['user_id' => $landlord->id]);
        $approver = $this->adminWithout($agency, Capability::PayoutsCreate);
        $this->assertTrue($approver->canActAt(Capability::PayoutsApprove, $agency));
        $this->actingWithStepUp($approver);

        $this->getJson('/api/payout-methods?filter[user_id]='.$landlord->id)->assertOk()
            ->assertJsonPath('data.0.id', $method->id)
            ->assertJsonMissingPath('data.0.account_identifier');
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertForbidden();
    }

    /**
     * VERIF-594 passe 2, N-2 — une caution dont l'approbation est refusée (`cancel`, le seul refus de
     * l'approbateur) laissait le bail « caution rendue » sans qu'aucun argent soit parti, et ne se
     * rendait plus jamais (`deposit_refund.already_refunded`).
     */
    public function test_n2_a_refused_deposit_refund_can_be_refunded_again(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 0])->save();
        $lease = $this->leaseOf($agency, $this->landlordOf($agency));
        $lease->forceFill(['status' => LeaseStatus::Terminated, 'deposit_amount' => 400_000])->save();
        $this->actingWithStepUp($this->agencyAdmin($agency));

        $id = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 400_000])->assertCreated()->json('data.payout_id');
        $this->postJson("/api/payouts/{$id}/cancel")->assertOk()->assertJsonPath('data.status', 'cancelled');

        $this->assertEquals(0, (float) $lease->fresh()->deposit_refunded_amount);
        $this->assertNull($lease->fresh()->deposit_refunded_at);
        $this->assertSame(PaymentStatus::Failed, LeasePayment::query()->where('lease_id', $lease->id)->sole()->status);
        $this->assertSame(1, DB::table('activity_log')->where('event', 'deposit_refund_reversed')->where('subject_id', $lease->id)->count());

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 400_000])->assertCreated();
        $this->assertEquals(400000, (float) $lease->fresh()->deposit_refunded_amount);
    }

    /**
     * VERIF-594 passe 2, N-2 — le même défaut sur l'échec du virement, sans seuil ; et un reversement
     * échoué PUIS annulé ne rend pas la caution deux fois. Une restitution partielle garde le reste
     * exact. (Passe 4 : la retenue de la première est annulée par l'agence, sans quoi la caution est
     * soldée et la seconde restitution refusée — P4-2.)
     */
    public function test_n2_a_failed_deposit_refund_is_released_once(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $lease = $this->leaseOf($agency, $this->landlordOf($agency));
        $lease->forceFill(['status' => LeaseStatus::Terminated, 'deposit_amount' => 400_000])->save();
        $this->actingWithStepUp($this->agencyAdmin($agency));

        $partial = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 100_000, 'reason' => 'peinture'])->assertCreated();
        $first = $partial->json('data.payout_id');
        $this->postJson("/api/invoices/{$partial->json('data.invoice_id')}/cancel")->assertOk();
        $second = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000])->assertCreated()->json('data.payout_id');
        $this->postJson("/api/payouts/{$second}/mark-failed", ['failed_reason' => 'numéro erroné'])->assertOk();
        $this->postJson("/api/payouts/{$second}/cancel")->assertOk();

        $this->assertEquals(100000, (float) $lease->fresh()->deposit_refunded_amount, 'le premier reste rendu, le second une fois');
        $this->assertNotNull($lease->fresh()->deposit_refunded_at);
        $this->assertSame(PayoutStatus::Pending, Payout::query()->findOrFail($first)->status);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000])->assertCreated();
        $this->assertEquals(400000, (float) $lease->fresh()->deposit_refunded_amount);
    }

    /**
     * VERIF-594 passe 2, N-3 — sur 30 jours glissants, un bailleur payé chaque mois de plus de la
     * moitié du seuil passait en approbation un mois sur deux (31/01 puis 28/02). Sur 27 jours, une
     * cadence mensuelle ne se cumule plus avec elle-même ; deux reversements à 10 jours d'écart, si.
     */
    public function test_n3_a_monthly_cadence_does_not_add_up_but_a_split_within_the_month_does(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer] = $this->fourEyesAgency();
        $this->actingWithStepUp($issuer);

        $this->travelTo('2027-01-31 10:00:00');
        $this->createFor($agency, $landlord, 60_000)->assertJsonPath('data.status', 'pending');
        $this->travelTo('2027-02-28 10:00:00');
        $this->createFor($agency, $landlord, 60_000)->assertJsonPath('data.status', 'pending');
        $this->travelTo('2027-03-10 10:00:00');
        $this->createFor($agency, $landlord, 60_000)->assertJsonPath('data.status', 'awaiting_approval');

        // L'écran lit la fenêtre dans la préparation : une seule valeur.
        $this->getJson("/api/payouts/preparation?landlord_id={$landlord->id}&period_start=2027-03-01&period_end=2027-03-31")
            ->assertOk()->assertJsonPath('data.approval_window_days', PayoutApprovalRule::WINDOW_DAYS);
        $this->assertSame(27, PayoutApprovalRule::WINDOW_DAYS);
    }

    /**
     * VERIF-594 passe 2, N-4 — une demande de relâchement se confirmait 90 jours plus tard. Elle
     * expire au bout de 7 jours : confirmée après, 422 `payout.threshold_request_expired`, et la
     * demande est effacée ; dans le délai, elle se confirme.
     */
    public function test_n4_a_relax_request_expires_after_seven_days(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        [$a, $b] = [$this->agencyAdmin($agency), $this->agencyAdmin($agency)];
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();

        $this->actingWithStepUp($a);
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => null])->assertStatus(202);
        $this->travel(8)->days();
        $this->actingWithStepUp($b);
        $this->getJson("/api/agencies/{$agency->id}")->assertJsonPath('data.pending_payout_threshold_change', null);
        $this->postJson("/api/agencies/{$agency->id}/payout-threshold/confirm", ['expected_threshold' => null])
            ->assertStatus(422)->assertJsonPath('code', 'payout.threshold_request_expired');
        $this->assertEquals(100000, (float) $agency->fresh()->payout_approval_threshold);
        $this->assertNull($agency->fresh()->pending_payout_threshold_requested_at);
        $this->postJson("/api/agencies/{$agency->id}/payout-threshold/confirm", ['expected_threshold' => null])
            ->assertStatus(422)->assertJsonPath('code', 'payout.no_pending_threshold_change');

        $this->actingWithStepUp($a);
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => null])->assertStatus(202);
        $this->travel(6)->days();
        $this->actingWithStepUp($b);
        $this->getJson("/api/agencies/{$agency->id}")->assertJsonPath('data.pending_payout_threshold_change.threshold', null)
            ->assertJsonPath('data.pending_payout_threshold_change.expires_at', $agency->fresh()->pending_payout_threshold_requested_at->addDays(7)->toIso8601String());
        $this->postJson("/api/agencies/{$agency->id}/payout-threshold/confirm", ['expected_threshold' => null])->assertOk();
        $this->assertNull($agency->fresh()->payout_approval_threshold);
    }

    /**
     * VERIF-594 passe 2, N-5 — A demande 150 000, B lit 150 000, A REMPLACE sa demande par une
     * coupure, B confirme en croyant confirmer 150 000 : le seuil était coupé. La confirmation porte
     * la valeur lue ; différente de la demande en cours, 409 et rien n'est appliqué. Sans elle, 422.
     */
    public function test_n5_a_confirmation_confirms_the_value_it_read(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        [$a, $b] = [$this->agencyAdmin($agency), $this->agencyAdmin($agency)];
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $confirm = "/api/agencies/{$agency->id}/payout-threshold/confirm";

        $this->actingWithStepUp($a);
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 150_000])->assertStatus(202);
        $this->actingWithStepUp($b);
        $read = $this->getJson("/api/agencies/{$agency->id}")->json('data.pending_payout_threshold_change.threshold');
        $this->assertEquals(150000, $read);
        $this->actingWithStepUp($a);
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => null])->assertStatus(202);

        $this->actingWithStepUp($b);
        $this->postJson($confirm, ['expected_threshold' => $read])
            ->assertStatus(409)->assertJsonPath('code', 'payout.threshold_request_changed');
        $this->assertEquals(100000, (float) $agency->fresh()->payout_approval_threshold);
        $this->assertNotNull($agency->fresh()->pending_payout_threshold_requested_at, 'la demande reste à confirmer');

        $this->postJson($confirm)->assertStatus(422);
        $this->assertEquals(100000, (float) $agency->fresh()->payout_approval_threshold);
        $this->postJson($confirm, ['expected_threshold' => null])->assertOk()->assertJsonPath('data.payout_approval_threshold', null);
    }

    /**
     * VERIF-594 passe 3, P3-1 — refuser une restitution partielle annule sa facture de retenue :
     * sinon la restitution suivante en créait une seconde, et la retenue se facturait deux fois.
     */
    public function test_p3_1_a_refused_partial_refund_cancels_its_draft_retention_invoice(): void
    {
        Notification::fake();
        [$lease, $admin] = $this->endedLeaseWithDeposit(400_000);
        $this->actingWithStepUp($admin);

        $first = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000, 'reason' => 'peinture'])->assertCreated();
        $this->postJson("/api/payouts/{$first->json('data.payout_id')}/cancel")->assertOk();
        $this->assertSame(InvoiceStatus::Cancelled, Invoice::query()->findOrFail($first->json('data.invoice_id'))->status);

        $second = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000, 'reason' => 'peinture'])->assertCreated();

        $live = $this->liveRetentionInvoices($lease);
        $this->assertSame([$second->json('data.invoice_id')], $live->pluck('id')->all(), 'une seule facture de retenue vivante');
        $this->assertEquals(100000, (float) $live->sole()->total_amount);
        $this->assertSame(0, Invoice::query()->where('kind', InvoiceKind::CreditNote->value)->count(), 'un brouillon s\'annule sans avoir');
    }

    /** VERIF-594 passe 3, P3-1 — émise, la facture de retenue se contrepasse par un avoir. */
    public function test_p3_1_a_refused_partial_refund_credits_its_issued_retention_invoice(): void
    {
        Notification::fake();
        [$lease, $admin] = $this->endedLeaseWithDeposit(400_000);
        $this->actingWithStepUp($admin);

        $first = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000, 'reason' => 'peinture'])->assertCreated();
        $invoiceId = $first->json('data.invoice_id');
        $this->postJson("/api/invoices/{$invoiceId}/send")->assertOk();
        $this->postJson("/api/payouts/{$first->json('data.payout_id')}/mark-failed", ['failed_reason' => 'numéro erroné'])->assertOk();

        $this->assertSame(InvoiceStatus::Cancelled, Invoice::query()->findOrFail($invoiceId)->status);
        $credit = Invoice::query()->where('kind', InvoiceKind::CreditNote->value)->sole();
        $this->assertSame($invoiceId, $credit->credited_invoice_id);
        $this->assertEquals(100000, (float) $credit->total_amount);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000, 'reason' => 'peinture'])->assertCreated();
        $this->assertEquals(100000, (float) $this->liveRetentionInvoices($lease)->sole()->total_amount);
    }

    /** @return array{0: Lease, 1: User} */
    private function endedLeaseWithDeposit(int $deposit): array
    {
        $agency = $this->moneyAgency();
        $lease = $this->leaseOf($agency, $this->landlordOf($agency));
        $lease->forceFill(['status' => LeaseStatus::Terminated, 'deposit_amount' => $deposit])->save();

        return [$lease, $this->agencyAdmin($agency)];
    }

    /** @return Collection<int, Invoice> */
    private function liveRetentionInvoices(Lease $lease): Collection
    {
        return Invoice::query()
            ->where('invoiceable_type', Lease::class)->where('invoiceable_id', $lease->id)
            ->where('kind', InvoiceKind::Invoice->value)
            ->whereNotIn('status', [InvoiceStatus::Cancelled->value, InvoiceStatus::Void->value])
            ->get();
    }

    /**
     * VERIF-594 passe 3, P3-2 — la ligne `deposit_refund` d'une restitution se retrouve par son lien,
     * jamais par son montant : deux restitutions de 100 000, on annule la première, c'est SA ligne qui
     * échoue ; la seconde payée, sa ligne passe `paid`. (Passe 4 : la retenue de la première est
     * annulée par l'agence, sans quoi la caution est soldée — P4-2.)
     */
    public function test_p3_2_the_deposit_refund_line_is_found_by_its_link(): void
    {
        Notification::fake();
        [$lease, $admin] = $this->endedLeaseWithDeposit(400_000);
        $this->actingWithStepUp($admin);

        $p1 = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 100_000, 'reason' => 'x'])->assertCreated();
        $this->postJson("/api/invoices/{$p1->json('data.invoice_id')}/cancel")->assertOk();
        $p2 = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 100_000, 'reason' => 'x'])->assertCreated();

        $this->postJson("/api/payouts/{$p1->json('data.payout_id')}/cancel")->assertOk();
        $this->assertSame(PaymentStatus::Failed, LeasePayment::query()->findOrFail($p1->json('data.payment_id'))->status);
        $this->assertSame(PaymentStatus::Pending, LeasePayment::query()->findOrFail($p2->json('data.payment_id'))->status);

        $this->postJson("/api/payouts/{$p2->json('data.payout_id')}/mark-processed", ['payment_method' => 'cash', 'notes' => 'remis en main propre'])
            ->assertOk()->assertJsonPath('data.status', 'completed');
        $line = LeasePayment::query()->findOrFail($p2->json('data.payment_id'));
        $this->assertSame(PaymentStatus::Paid, $line->status);
        $this->assertNotNull($line->paid_at);

        // Payée, la ligne reste une SORTIE : la clôture plateforme ne la compte pas comme un encaissement
        // à reverser à l'agence.
        $closed = app(PlatformPayoutService::class)->closePeriod($lease->agency, now(), $admin);
        $this->assertSame([], $closed['created']);
        $this->assertNull($line->fresh()->platform_payout_id);
    }

    /**
     * VERIF-594 passe 3, P3-3 — l'approbateur qui vient de vérifier un numéro ne le fixe pas en
     * approuvant : la destination qu'il fixe ne passerait sous les yeux de personne d'autre que le
     * payeur. Une destination vérifiée par un tiers, il la fixe.
     */
    public function test_p3_3_the_approver_does_not_set_a_destination_they_just_verified(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer, $approver, $agent] = $this->fourEyesAgency();
        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, null);
        $fresh = PayoutMethod::factory()->create(['user_id' => $landlord->id, 'is_default' => false]);
        $byThird = PayoutMethod::factory()->verifiedFor($agency, $agent, now()->subHour())
            ->create(['user_id' => $landlord->id, 'is_default' => false]);

        $this->actingWithStepUp($approver);
        $this->postJson("/api/payout-methods/{$fresh->id}/verify")->assertOk();
        $this->postJson("/api/payouts/{$id}/approve", ['payout_method_id' => $fresh->id])
            ->assertForbidden()->assertJsonPath('code', 'payout.approver_verified_destination_recently');
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::query()->findOrFail($id)->status);

        $this->postJson("/api/payouts/{$id}/approve", ['payout_method_id' => $byThird->id])->assertOk()
            ->assertJsonPath('data.payout_method_id', $byThird->id);
    }

    /**
     * VERIF-594 passe 4, P4-1 — la facture de retenue PAYÉE survit à l'échec de la restitution : elle
     * est déduite du restituable. La restitution suivante rend ce qui reste, sans seconde facture.
     */
    public function test_p4_1_a_paid_retention_is_deducted_from_what_is_refunded_next(): void
    {
        Notification::fake();
        [$lease, $admin] = $this->endedLeaseWithDeposit(400_000);
        $this->actingWithStepUp($admin);

        $first = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000, 'reason' => 'peinture'])->assertCreated();
        $invoiceId = $first->json('data.invoice_id');
        $this->postJson("/api/invoices/{$invoiceId}/send")->assertOk();
        $this->postJson("/api/invoices/{$invoiceId}/mark-paid", ['payment_method' => 'cash'])->assertOk();
        $this->postJson("/api/payouts/{$first->json('data.payout_id')}/mark-failed", ['failed_reason' => 'numéro erroné'])->assertOk();
        $this->assertSame(InvoiceStatus::Paid, Invoice::query()->findOrFail($invoiceId)->status);

        $this->assertEquals(300000, $this->getJson("/api/leases/{$lease->id}/deposit-refund")->json('data.deposit_remaining'));
        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 400_000])
            ->assertUnprocessable()->assertJsonPath('code', 'deposit_refund.exceeds_remaining');

        $second = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000])->assertCreated();
        $this->assertNull($second->json('data.invoice_id'));
        $this->assertSame([$invoiceId], $this->liveRetentionInvoices($lease)->pluck('id')->all(), 'une seule facture de retenue vivante');
        $this->assertSame([300000, 100000], $this->depositLedger($lease));
    }

    /**
     * VERIF-594 passe 4, P4-2 — une restitution partielle retient le reste : la caution est soldée. Une
     * seconde restitution partielle ne facture pas une retenue de plus, qui dépasserait la caution.
     */
    public function test_p4_2_a_partial_refund_retains_the_rest_and_closes_the_deposit(): void
    {
        Notification::fake();
        [$lease, $admin] = $this->endedLeaseWithDeposit(400_000);
        $this->actingWithStepUp($admin);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 100_000, 'reason' => 'peinture'])->assertCreated()
            ->assertJsonPath('data.state.state', 'partial');
        $this->assertEquals(0, $this->getJson("/api/leases/{$lease->id}/deposit-refund")->json('data.deposit_remaining'));

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 200_000, 'reason' => 'clés'])
            ->assertUnprocessable()->assertJsonPath('code', 'deposit_refund.already_refunded');
        $this->assertSame([100000, 300000], $this->depositLedger($lease));
    }

    /**
     * VERIF-594 passe 4, P4-2 — refuser la première restitution rend toute la caution restituable, et
     * la restitution du reste tombe juste : ce qui sort plus ce qui est retenu vaut la caution.
     */
    public function test_p4_2_refusing_the_first_refund_then_refunding_the_rest_matches_the_deposit(): void
    {
        Notification::fake();
        [$lease, $admin] = $this->endedLeaseWithDeposit(400_000);
        $this->actingWithStepUp($admin);

        $first = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 100_000, 'reason' => 'peinture'])->assertCreated();
        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 200_000, 'reason' => 'clés']);
        $this->postJson("/api/payouts/{$first->json('data.payout_id')}/cancel")->assertOk();

        $rest = $this->getJson("/api/leases/{$lease->id}/deposit-refund")->json('data.deposit_remaining');
        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => $rest])->assertCreated();

        [$out, $retained] = $this->depositLedger($lease);
        $this->assertSame(400000, $out + $retained, 'sorti + retenu = la caution');
        $this->assertEquals(0, $lease->fresh()->deposit_remaining);
    }

    /**
     * VERIF-594 passe 4, P4-1/P4-2 — seule la retenue posée par une restitution se déduit : une autre
     * facture du bail (un loyer facturé, par exemple) ne réduit pas la caution à rendre.
     */
    public function test_p4_2_only_the_retention_invoices_are_deducted(): void
    {
        Notification::fake();
        [$lease, $admin] = $this->endedLeaseWithDeposit(400_000);
        Invoice::factory()->sent()->create([
            'invoiceable_type' => Lease::class, 'invoiceable_id' => $lease->id, 'agency_id' => $lease->agency_id,
            'subtotal' => 50_000, 'total_amount' => 50_000,
        ]);
        $this->actingWithStepUp($admin);

        $this->assertEquals(400000, $this->getJson("/api/leases/{$lease->id}/deposit-refund")->json('data.deposit_remaining'));
        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000, 'reason' => 'peinture'])->assertCreated();
        $this->assertEquals(0, $lease->fresh()->deposit_remaining);
        $this->assertEquals(100000, $lease->fresh()->liveDepositRetention());
    }

    /**
     * VERIF-594 passe 4, P4-3 — P3-3 se juge sur la destination FIXÉE, citée ou non : l'approbateur qui
     * a vérifié la destination par défaut, puis approuve sans la citer, la fixe tout autant.
     */
    public function test_p4_3_the_approver_does_not_approve_the_default_destination_they_just_verified(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer, $approver] = $this->fourEyesAgency();
        $default = PayoutMethod::factory()->create(['user_id' => $landlord->id, 'is_default' => true]);
        $this->actingWithStepUp($approver);
        $this->postJson("/api/payout-methods/{$default->id}/verify")->assertOk();

        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, null);
        $this->assertSame($default->id, Payout::query()->findOrFail($id)->payout_method_id);

        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")
            ->assertForbidden()->assertJsonPath('code', 'payout.approver_verified_destination_recently');
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::query()->findOrFail($id)->status);
    }

    /**
     * VERIF-594 passe 4, P4-3 — le préparateur cite un numéro que l'approbateur vient de vérifier :
     * l'approbation, sans rien citer, le fixerait. Refusée.
     */
    public function test_p4_3_the_approver_does_not_approve_a_cited_destination_they_just_verified(): void
    {
        Notification::fake();
        [$agency, $landlord, $issuer, $approver] = $this->fourEyesAgency();
        PayoutMethod::factory()->create(['user_id' => $landlord->id, 'is_default' => true]);
        $fresh = PayoutMethod::factory()->create(['user_id' => $landlord->id, 'is_default' => false]);
        $this->actingWithStepUp($approver);
        $this->postJson("/api/payout-methods/{$fresh->id}/verify")->assertOk();

        $id = $this->awaitingPayoutTo($agency, $landlord, $issuer, $fresh);
        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")
            ->assertForbidden()->assertJsonPath('code', 'payout.approver_verified_destination_recently');

        // Passé le délai, la règle se lève.
        $this->travel(25)->hours();
        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk()->assertJsonPath('data.payout_method_id', $fresh->id);
    }

    /**
     * VERIF-594 passe 4, P4-4 — la retenue réglée pendant que sa restitution échoue : l'échec juge la
     * facture sur la ligne verrouillée et la laisse payée (P4-1 la déduit), au lieu d'échouer en entier
     * sur un `invoice.cannot_cancel` qui parle d'une facture. La course est rejouée sur ce que l'échec
     * lit : le règlement concurrent se pose juste APRÈS une lecture sans verrou de la facture
     * (l'instance lue est alors périmée), ou juste AVANT une lecture verrouillée (il l'a précédée — sous
     * le verrou, il ne pourrait que l'attendre).
     */
    public function test_p4_4_a_retention_paid_meanwhile_does_not_fail_the_failed_refund(): void
    {
        Notification::fake();
        [$lease, $admin] = $this->endedLeaseWithDeposit(400_000);
        $this->actingWithStepUp($admin);
        $refund = $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 300_000, 'reason' => 'peinture'])->assertCreated();
        $invoiceId = (int) $refund->json('data.invoice_id');
        $this->postJson("/api/invoices/{$invoiceId}/send")->assertOk();

        $paid = false;
        $payMeanwhile = function (string $sql, array $bindings) use (&$paid, $invoiceId): void {
            if ($paid || ! str_contains($sql, 'from "invoices"') || ! in_array($invoiceId, $bindings)) {
                return;
            }
            $paid = true;
            DB::table('invoices')->where('id', $invoiceId)->update(['status' => InvoiceStatus::Paid->value]);
        };
        DB::beforeExecuting(function (string $sql, array $bindings) use ($payMeanwhile): void {
            if (str_contains($sql, 'for update')) {
                $payMeanwhile($sql, $bindings);
            }
        });
        DB::listen(function (QueryExecuted $query) use ($payMeanwhile): void {
            if (! str_contains($query->sql, 'for update')) {
                $payMeanwhile($query->sql, $query->bindings);
            }
        });

        $this->postJson("/api/payouts/{$refund->json('data.payout_id')}/mark-failed", ['failed_reason' => 'numéro erroné'])
            ->assertOk()->assertJsonPath('data.status', 'failed');

        $this->assertTrue($paid, 'le règlement concurrent a eu lieu');
        $this->assertSame(InvoiceStatus::Paid, Invoice::query()->findOrFail($invoiceId)->status);
        $this->assertSame(0, Invoice::query()->where('kind', InvoiceKind::CreditNote->value)->count());
        $this->assertEquals(300000, $lease->fresh()->deposit_remaining);
    }

    /**
     * Le grand livre d'une caution : ce qui sort vers le locataire (restitutions ni refusées ni
     * échouées), et ce qui est retenu (factures de retenue vivantes).
     *
     * @return array{0: int, 1: int}
     */
    private function depositLedger(Lease $lease): array
    {
        $out = Payout::query()->where('lease_id', $lease->id)->where('payee_role', 'tenant')
            ->whereNotIn('status', [PayoutStatus::Cancelled->value, PayoutStatus::Failed->value])->sum('net_amount');

        return [(int) $out, (int) $this->liveRetentionInvoices($lease)->sum(fn (Invoice $i) => (float) $i->total_amount)];
    }
}
