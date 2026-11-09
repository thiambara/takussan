<?php

namespace Tests\Feature\Payments;

use App\Models\Enums\PaymentStatus;
use App\Services\Payments\LeasePaymentLinkService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-2504 — le lien de paiement dit au locataire comment payer HORS LIGNE : les numéros Wave et
 * Orange Money et les coordonnées bancaires que l'agence déclare (`AgencySettings`), et le téléphone
 * de l'agence. Un champ absent est omis ; rien du locataire n'est ajouté.
 */
class PayLinkOfflinePaymentTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Notification::fake();
        config()->set('app.frontend_url', 'https://front.test');
    }

    /** @return array{0: array<string, mixed>, 1: string} */
    private function linkFor(?array $settings = null, array $payment = []): array
    {
        $ctx = $this->leaseDue($settings, $payment);
        $ctx['lease']->tenant->forceFill(['user_id' => null, 'first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221771111111'])->save();
        $url = app(LeasePaymentLinkService::class)->urlFor($ctx['payment']);

        return [$ctx, substr($url, strlen('https://front.test/pay/'))];
    }

    /** AC1 — le numéro Wave déclaré par l'agence est rendu sur ses liens ; les champs nuls sont omis. */
    public function test_les_moyens_declares_sont_rendus_et_les_absents_omis(): void
    {
        [$ctx, $token] = $this->linkFor([
            'offline_payment_wave_number' => '+221772223344',
            'offline_payment_bank_details' => 'CBAO SN012 01001 012345678901 23',
        ]);
        $ctx['agency']->forceFill(['phone' => '+221338201234'])->save();

        $response = $this->getJson("/api/pay/{$token}")->assertOk();

        $this->assertSame([
            'wave_number' => '+221772223344',
            'bank_details' => 'CBAO SN012 01001 012345678901 23',
            'agency_phone' => '+221338201234',
        ], $response->json('data.offline_payment'));
        $this->assertArrayNotHasKey('orange_money_number', $response->json('data.offline_payment'));
        $this->assertArrayNotHasKey('agency_whatsapp', $response->json('data.offline_payment'));

        $body = $response->getContent();
        foreach (['Awa', 'Ndiaye', '771111111'] as $secret) {
            $this->assertStringNotContainsString($secret, $body, $secret);
        }
    }

    /** Rien de déclaré, aucun téléphone d'agence : `offline_payment` vaut `null`, pas un objet vide. */
    public function test_rien_de_declare_rend_null(): void
    {
        [$ctx, $token] = $this->linkFor();
        $ctx['agency']->forceFill(['phone' => null])->save();

        $this->getJson("/api/pay/{$token}")->assertOk()->assertJsonPath('data.offline_payment', null);
    }

    /** Une échéance réglée, pénalité comprise, n'invite plus à payer : ni en ligne, ni hors ligne. */
    public function test_une_echeance_reglee_ne_rend_aucun_moyen_hors_ligne(): void
    {
        [, $token] = $this->linkFor(['offline_payment_wave_number' => '+221772223344'], ['status' => PaymentStatus::Paid, 'paid_at' => now(), 'late_fee_paid_at' => now()]);

        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.late_fee_outstanding', 0)
            ->assertJsonPath('data.offline_payment', null)
            ->assertJsonPath('data.providers', []);
    }

    /**
     * Revue (point 6) — le loyer est payé, la pénalité reste due : elle se règle à l'agence, le bloc
     * hors ligne reste. Le bloc suit « quelque chose reste dû » (`amount_due` > 0 OU
     * `late_fee_outstanding` > 0), pas « un paiement en ligne s'ouvre ».
     */
    public function test_loyer_paye_penalite_due_le_bloc_hors_ligne_reste(): void
    {
        [, $token] = $this->linkFor(['offline_payment_wave_number' => '+221772223344'], ['status' => PaymentStatus::Paid, 'paid_at' => now()]);

        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.amount_due', 0)
            ->assertJsonPath('data.late_fee_outstanding', 7500)
            ->assertJsonPath('data.offline_payment.wave_number', '+221772223344');
    }

    /** Revue (point 6) — remboursée : rien n'est dû, pénalité comprise ; aucun bloc hors ligne. */
    public function test_une_echeance_remboursee_ne_doit_rien_et_n_a_pas_de_bloc_hors_ligne(): void
    {
        [$ctx, $token] = $this->linkFor(['offline_payment_wave_number' => '+221772223344']);
        DB::table('lease_payments')->where('id', $ctx['payment']->id)->update(['status' => PaymentStatus::Refunded->value, 'paid_at' => now()->subDay()]);

        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.status', 'refunded')
            ->assertJsonPath('data.amount_due', 0)
            ->assertJsonPath('data.late_fee_outstanding', 0)
            ->assertJsonPath('data.offline_payment', null);
    }
}
