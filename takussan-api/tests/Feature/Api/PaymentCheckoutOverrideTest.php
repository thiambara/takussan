<?php

namespace Tests\Feature\Api;

use App\Models\AppNotification;
use App\Models\Enums\PaymentStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-593 (passe 2, M5) — un checkout abandonné bloquait l'espèce reçue au guichet pendant 30
 * minutes, sans recours. Le personnel de l'agence peut passer outre, motif à l'appui ; le checkout
 * écarté, s'il est payé quand même, devient un double encaissement signalé (V3).
 */
class PaymentCheckoutOverrideTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    private function ouvrirUnCheckout(array $ctx): void
    {
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
    }

    public function test_le_personnel_passe_outre_au_checkout_et_le_doublon_est_signale(): void
    {
        $ctx = $this->leaseDue();
        $admin = User::factory()->create(['agency_id' => $ctx['agency']->id]);
        $ctx['agency']->update(['primary_admin_id' => $admin->id]);
        $this->ouvrirUnCheckout($ctx);
        $url = "/api/lease-payments/{$ctx['payment']->id}/mark-paid";
        Sanctum::actingAs($ctx['agent']);

        // Sans passage outre : 409, comme avant.
        $this->postJson($url, [])->assertStatus(409)->assertJsonPath('code', 'checkout_in_progress');
        // Le motif est obligatoire.
        $this->postJson($url, ['override_open_checkout' => true])
            ->assertStatus(422)
            ->assertJsonValidationErrors('override_reason');

        $this->postJson($url, ['override_open_checkout' => true, 'override_reason' => 'Espèces reçues au guichet'])
            ->assertOk()
            ->assertJsonPath('data.status', 'paid');

        $payment = $ctx['payment']->refresh();
        $this->assertNotNull($payment->metadata['gateway']['superseded_at'] ?? null);
        $this->assertSame('Espèces reçues au guichet', $payment->metadata['gateway']['superseded_reason']);
        $this->assertNotNull($payment->metadata['gateway']['transactions'][0]['superseded_at'] ?? null);

        $log = Activity::query()
            ->where('subject_id', $payment->id)->where('event', 'open_checkout_overridden')->sole();
        $this->assertSame($ctx['agent']->id, $log->causer_id);
        $this->assertSame('spy_txn_1', $log->properties['transaction_id']);
        $this->assertSame('mark_paid', $log->properties['gesture']);
        $this->assertStringNotContainsString('guichet', json_encode($log->properties->all()), 'Le motif, texte libre, ne va pas au journal.');

        // Le checkout écarté est payé quand même : doublon marqué, admins prévenus.
        $this->waveWebhook('spy_txn_1', 150_000)->assertOk();
        $payment->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertSame('spy_txn_1', $payment->metadata['gateway_duplicate_payment'][0]['transaction_id']);
        $this->assertSame(1, AppNotification::query()->where('user_id', $admin->id)
            ->where('title', __('payments.duplicate_payment.title'))->count());
    }

    public function test_la_penalite_incluse_se_regle_a_l_agence_en_passant_outre(): void
    {
        $ctx = $this->leaseDue(['late_fee_online_collection' => true]);
        $this->ouvrirUnCheckout($ctx);
        $url = "/api/lease-payments/{$ctx['payment']->id}/late-fee/mark-paid";
        Sanctum::actingAs($ctx['agent']);

        $this->postJson($url, [])->assertStatus(409);
        $this->postJson($url, ['override_open_checkout' => true, 'override_reason' => 'Pénalité payée en espèces'])->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertNotNull($payment->late_fee_paid_at);
        $this->assertNotNull($payment->metadata['gateway']['superseded_at'] ?? null);
        $this->assertSame('late_fee_mark_paid', Activity::query()
            ->where('subject_id', $payment->id)->where('event', 'open_checkout_overridden')->sole()->properties['gesture']);

        // Le checkout écarté ne bloque plus rien : le loyer se paie en ligne par un NOUVEAU
        // checkout, au montant dû désormais (sans la pénalité réglée).
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])
            ->assertOk()
            ->assertJsonPath('data.transaction_id', 'spy_txn_2');
    }

    public function test_hors_du_personnel_personne_ne_passe_outre(): void
    {
        $ctx = $this->leaseDue();
        $bailleur = User::factory()->withOwnerProfile($ctx['agency'])->create();
        $ctx['lease']->update(['landlord_id' => $bailleur->id]);
        $this->ouvrirUnCheckout($ctx);
        $corps = ['override_open_checkout' => true, 'override_reason' => 'Reçu'];

        foreach (['mark-paid', 'late-fee/mark-paid'] as $geste) {
            $url = "/api/lease-payments/{$ctx['payment']->id}/{$geste}";

            Sanctum::actingAs($ctx['tenant']);
            $this->postJson($url, $corps)->assertForbidden();

            // Le bailleur encaisse son loyer (recordPayment), mais ne passe pas outre.
            Sanctum::actingAs($bailleur->fresh());
            $this->postJson($url, $corps)->assertForbidden();
        }

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Late, $payment->status);
        $this->assertArrayNotHasKey('superseded_at', $payment->metadata['gateway']);
    }
}
