<?php

namespace Tests\Feature\Api;

use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\PayoutMethod;
use App\Models\ServiceProviderBill;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 × TCK-589 — le raccord du step-up : ce qui décide qu'un argent sort, et vers où, exige un
 * TOTP saisi sur CE jeton il y a moins de 10 min (`ProtectedActions::STEP_UP`). Une session volée —
 * même à deux facteurs, mais sans preuve récente — n'approuve pas, ne marque pas payé, ne paie pas
 * une facture d'intervention et ne touche pas aux destinations du titulaire.
 *
 * `actingAs()` sert ici la session d'après une connexion à deux facteurs : TOTP saisi il y a une
 * heure (`TestCase::be`), step-up expiré.
 */
class PayoutStepUpTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_approving_and_marking_paid_require_a_fresh_step_up(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $agency->forceFill(['payout_approval_threshold' => 100_000])->save();
        $landlord = $this->landlordOf($agency);
        $issuer = $this->agencyAdmin($agency);
        $approver = $this->agencyAdmin($agency);
        $payer = $this->agencyAdmin($agency);

        $this->actingAs($issuer);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000);
        $id = $this->postJson('/api/payouts', ['landlord_id' => $landlord->id, 'lease_payment_ids' => [$rent->id]])
            ->assertCreated()->assertJsonPath('data.status', 'awaiting_approval')->json('data.id');

        $this->actingAs($approver);
        $this->stepUpRefused($this->postJson("/api/payouts/{$id}/approve"));
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::query()->findOrFail($id)->status);
        $this->actingWithStepUp($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();

        $body = ['payment_method' => 'check', 'transaction_id' => 'CHQ-1'];
        $this->actingAs($payer);
        $this->stepUpRefused($this->postJson("/api/payouts/{$id}/mark-processed", $body));
        $this->assertSame(PayoutStatus::Pending, Payout::query()->findOrFail($id)->status);
        $this->actingWithStepUp($payer);
        $this->postJson("/api/payouts/{$id}/mark-processed", $body)->assertOk()->assertJsonPath('data.status', 'completed');
    }

    public function test_paying_a_service_provider_bill_requires_a_fresh_step_up(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $admin = $this->agencyAdmin($agency);
        $bill = ServiceProviderBill::factory()->create(['agency_id' => $agency->id]);

        $this->actingAs($admin);
        $this->stepUpRefused($this->postJson("/api/service-provider-bills/{$bill->id}/pay"));
        $this->assertSame(0, Payout::query()->count());
    }

    /**
     * Les destinations du titulaire : sans second facteur, il est invité à le configurer
     * (`two_factor_required`) ; avec, il en donne une preuve récente.
     */
    public function test_a_holder_manages_their_destinations_under_step_up(): void
    {
        Notification::fake();
        $landlord = $this->landlordOf($this->moneyAgency());
        $method = PayoutMethod::factory()->create(['user_id' => $landlord->id]);
        $new = ['kind' => 'wave', 'account_identifier' => '+221778887766'];

        $this->actingAs($landlord);
        $this->postJson('/api/me/payout-methods', $new)->assertForbidden()->assertJsonPath('code', 'two_factor_required');

        $landlord->forceFill(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET])->save();
        $this->actingAs($landlord->fresh());
        $this->stepUpRefused($this->postJson('/api/me/payout-methods', $new));
        $this->stepUpRefused($this->patchJson("/api/me/payout-methods/{$method->id}", ['account_identifier' => '+221770000999']));
        $this->stepUpRefused($this->deleteJson("/api/me/payout-methods/{$method->id}"));
        $this->assertSame(1, PayoutMethod::query()->count());
        $this->assertSame($method->account_identifier, $method->fresh()->account_identifier);

        $this->actingWithStepUp($landlord->fresh());
        $this->postJson('/api/me/payout-methods', $new)->assertCreated();
    }

    /**
     * VERIF-594 passe 4, P4-6 (décision de session, réversible) — vérifier une destination décide où
     * l'argent part : le geste exige un step-up. Une session sans preuve récente est refusée, et un
     * membre sans second facteur — un agent, que la 2FA de l'agence ne visait pas — ne vérifie plus.
     */
    public function test_verifying_a_destination_requires_a_fresh_step_up(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $admin = $this->agencyAdmin($agency);
        $agent = $this->agencyAgent($agency);
        $method = PayoutMethod::factory()->create(['user_id' => $landlord->id]);

        $this->actingAs($admin);
        $this->stepUpRefused($this->postJson("/api/payout-methods/{$method->id}/verify"));

        $this->assertFalse((bool) $agent->two_factor_enabled);
        $this->actingAs($agent);
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertForbidden()->assertJsonPath('code', 'two_factor_required');
        $this->assertNull($method->fresh()->verificationFor($agency->id));

        $this->actingWithStepUp($admin);
        $this->postJson("/api/payout-methods/{$method->id}/verify")->assertOk();
        $this->assertSame($admin->id, (int) $method->fresh()->verificationFor($agency->id)?->verified_by_id);
    }

    private function stepUpRefused(TestResponse $response): void
    {
        $response->assertForbidden()->assertJsonPath('code', 'two_factor_step_up_required');
    }
}
