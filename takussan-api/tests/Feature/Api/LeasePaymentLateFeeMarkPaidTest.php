<?php

namespace Tests\Feature\Api;

use App\Models\Enums\Capability;
use App\Models\Enums\PaymentStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-593 (AC5) — `POST lease-payments/{p}/late-fee/mark-paid` : l'agence enregistre une pénalité
 * réglée chez elle. Le loyer garde son statut ; une pénalité ne se règle qu'une fois ; le locataire
 * ne peut pas déclarer sa propre pénalité réglée.
 */
class LeasePaymentLateFeeMarkPaidTest extends TestCase
{
    use CreatesAgencyMembers;
    use LeaseDueFixture;
    use RefreshDatabase;

    public function test_l_agent_enregistre_la_penalite_reglee_et_le_loyer_reste_paye(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        Sanctum::actingAs($ctx['agent']);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid", [
            'payment_method' => 'cash',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.late_fee_outstanding', 0)
            ->assertJsonPath('data.amount_due', 0);

        $payment = $ctx['payment']->refresh();
        $this->assertNotNull($payment->late_fee_paid_at);
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertSame('cash', $payment->metadata['late_fee_payment_method'] ?? null);
        $this->assertDatabaseHas('activity_log', [
            'subject_id' => $payment->id,
            'event' => 'late_fee_paid',
        ]);
    }

    public function test_un_second_appel_rend_409_late_fee_not_due(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        Sanctum::actingAs($ctx['agent']);

        $url = "/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid";
        $this->postJson($url)->assertOk();
        $this->postJson($url)
            ->assertStatus(409)
            ->assertJsonPath('code', 'lease_payment.late_fee_not_due');
    }

    public function test_une_echeance_sans_penalite_rend_409(): void
    {
        $ctx = $this->leaseDue(null, ['late_fee_amount' => null, 'late_fee_applied_at' => null, 'status' => PaymentStatus::Pending]);
        Sanctum::actingAs($ctx['agent']);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid")->assertStatus(409);
    }

    public function test_sur_un_loyer_impaye_le_statut_reste_late(): void
    {
        $ctx = $this->leaseDue();
        Sanctum::actingAs($ctx['agent']);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid", ['paid_at' => '2026-10-01'])
            ->assertOk()
            ->assertJsonPath('data.status', 'late')
            ->assertJsonPath('data.late_fee_outstanding', 0);

        $this->assertSame('2026-10-01', $ctx['payment']->refresh()->late_fee_paid_at->toDateString());
    }

    public function test_une_date_de_reglement_future_est_refusee(): void
    {
        // Vérification adverse V7 — `paid_at` dans un an était enregistré tel quel.
        $ctx = $this->leaseDue();
        Sanctum::actingAs($ctx['agent']);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid", ['paid_at' => now()->addYear()->toDateString()])
            ->assertStatus(422)
            ->assertJsonValidationErrors('paid_at');
        $this->assertNull($ctx['payment']->refresh()->late_fee_paid_at);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid", ['paid_at' => now()->subDay()->toDateString()])
            ->assertOk();
    }

    public function test_le_locataire_recoit_403(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        Sanctum::actingAs($ctx['tenant']);

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid")->assertForbidden();
        $this->assertNull($ctx['payment']->refresh()->late_fee_paid_at);
    }

    /**
     * Alignement sur TCK-587 (`LeasePolicy::recordPayment` / `landlordWrites`) : un bailleur bloqué
     * dans l'agence du bail ne règle pas la pénalité ; débloqué, il la règle.
     */
    public function test_un_bailleur_bloque_ne_regle_pas_la_penalite(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        $bailleur = User::factory()->withOwnerProfile($ctx['agency'])->create();
        $ctx['lease']->update(['landlord_id' => $bailleur->id]);
        OwnerProfile::query()->where('user_id', $bailleur->id)->update(['status' => 'blocked']);
        Sanctum::actingAs($bailleur->fresh());

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid")->assertForbidden();
        $this->assertNull($ctx['payment']->refresh()->late_fee_paid_at);

        OwnerProfile::query()->where('user_id', $bailleur->id)->update(['status' => 'active']);
        Sanctum::actingAs($bailleur->fresh());
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid")->assertOk();
    }

    /**
     * Alignement sur TCK-587 — régler une pénalité, c'est ENCAISSER : le personnel sans
     * `payments.record` est refusé. `LeasePolicy::update` n'exigeait aucune capacité.
     */
    public function test_sans_payments_record_le_personnel_ne_regle_pas_la_penalite(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        $url = "/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid";

        Sanctum::actingAs($this->agentWithout($ctx['agency'], Capability::PaymentsRecord));
        $this->postJson($url)->assertForbidden();
        $this->assertNull($ctx['payment']->refresh()->late_fee_paid_at);

        Sanctum::actingAs($this->agencyAgent($ctx['agency']));
        $this->postJson($url)->assertOk();
    }

    public function test_un_tiers_recoit_403(): void
    {
        $ctx = $this->leaseDue(null, ['status' => PaymentStatus::Paid, 'paid_at' => now()]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid")->assertForbidden();
    }
}
