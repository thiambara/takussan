<?php

namespace Tests\Feature\Payments;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Services\Payments\LeasePaymentLinkService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-2504 — celui qui a déjà payé le VOIT : le lien d'une échéance payée rend son statut et
 * `paid_at` ; celui d'une échéance remboursée aussi, au lieu de « lien plus valide ». Aucun des deux
 * n'ouvre un paiement (TCK-593).
 */
class PayLinkAlreadyPaidTest extends TestCase
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
    private function linkFor(array $payment = []): array
    {
        $ctx = $this->leaseDue(null, $payment);
        $url = app(LeasePaymentLinkService::class)->urlFor($ctx['payment']);

        return [$ctx, substr($url, strlen('https://front.test/pay/'))];
    }

    private function setRow(LeasePayment $payment, array $values): void
    {
        DB::table('lease_payments')->where('id', $payment->id)->update($values);
    }

    /** AC2 — payée : 200, statut `paid`, `paid_at` ; `initiate` reste refusé. */
    public function test_une_echeance_payee_rend_son_statut_et_sa_date(): void
    {
        $paidAt = CarbonImmutable::parse('2026-11-02 10:15:00', 'UTC');
        $this->travelTo($paidAt->addDays(3));
        [, $token] = $this->linkFor(['status' => PaymentStatus::Paid, 'paid_at' => $paidAt, 'late_fee_paid_at' => $paidAt]);

        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.status', 'paid')
            ->assertJsonPath('data.paid_at', '2026-11-02T10:15:00+00:00')
            ->assertJsonPath('data.providers', []);

        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertStatus(409)->assertJsonPath('code', 'payment.not_payable');
    }

    /** Une échéance due : `paid_at` est présent et nul. */
    public function test_une_echeance_due_porte_paid_at_nul(): void
    {
        [, $token] = $this->linkFor();

        $response = $this->getJson("/api/pay/{$token}")->assertOk()->assertJsonPath('data.paid_at', null);
        $this->assertNotSame('paid', $response->json('data.status'));
        $this->assertArrayHasKey('paid_at', $response->json('data'));
    }

    /**
     * Remboursée : la page rend son état et `paid_at` au lieu de 410 ; aucun paiement ne s'ouvre
     * (`initiate` et `verify` restent 410), et aucune quittance.
     */
    public function test_une_echeance_remboursee_rend_son_etat_sans_rouvrir_le_paiement(): void
    {
        [$ctx, $token] = $this->linkFor();
        $paidAt = now()->subDay()->startOfSecond();
        $this->setRow($ctx['payment'], ['status' => PaymentStatus::Refunded->value, 'paid_at' => $paidAt]);

        $this->getJson("/api/pay/{$token}")->assertOk()
            ->assertJsonPath('data.status', 'refunded')
            ->assertJsonPath('data.paid_at', $paidAt->utc()->format('Y-m-d\TH:i:sP'))
            ->assertJsonPath('data.providers', [])
            ->assertJsonPath('data.receipt_available', false)
            ->assertJsonPath('data.offline_payment', null);

        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertStatus(410);
        $this->postJson("/api/pay/{$token}/verify")->assertStatus(410);
        $this->getJson("/api/pay/{$token}/receipt")->assertStatus(410);
    }

    /** Ce qui n'est pas « réglé » reste 410 : une caution rendue, un lien révoqué. */
    public function test_le_reste_est_toujours_gone(): void
    {
        [$ctx, $token] = $this->linkFor();
        $this->setRow($ctx['payment'], ['status' => PaymentStatus::Refunded->value, 'payment_type' => LeasePaymentType::DepositRefund->value]);
        $this->getJson("/api/pay/{$token}")->assertStatus(410);

        $this->setRow($ctx['payment'], ['status' => PaymentStatus::Refunded->value, 'payment_type' => LeasePaymentType::Rent->value]);
        app(LeasePaymentLinkService::class)->revoke($ctx['payment']);
        $this->getJson("/api/pay/{$token}")->assertStatus(410);
    }

    /**
     * Revue (point 3) — une échéance remboursée tombe en 410 trente jours après le remboursement,
     * comme la payée trente jours après le paiement : la date est la réception de l'événement
     * `refunded` du fournisseur.
     */
    public function test_une_echeance_remboursee_tombe_trente_jours_apres_le_remboursement(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-09 12:00:00', 'UTC'));
        [$ctx, $token] = $this->linkFor();
        DB::table('lease_payment_links')->where('lease_payment_id', $ctx['payment']->id)->update(['expires_at' => now()->addDays(90)]);
        $this->setRow($ctx['payment'], [
            'status' => PaymentStatus::Refunded->value,
            'paid_at' => now()->subDays(40),
            'metadata' => json_encode(['gateway_events' => [
                ['provider' => 'wave', 'transaction_id' => 't1', 'type' => 'paid', 'received_at' => now()->subDays(40)->toIso8601String()],
                ['provider' => 'wave', 'transaction_id' => 't1', 'type' => 'refunded', 'received_at' => now()->subDays(29)->toIso8601String()],
            ]]),
        ]);

        // Payée il y a 40 jours, remboursée il y a 29 : encore lisible.
        $this->getJson("/api/pay/{$token}")->assertOk()->assertJsonPath('data.status', 'refunded');

        $this->travel(2)->days();
        $this->getJson("/api/pay/{$token}")->assertStatus(410)->assertJsonPath('code', 'pay_link.gone');
    }

    /** Revue (point 3) — un remboursement sans date : trente jours après le paiement. */
    public function test_une_echeance_remboursee_sans_date_tombe_trente_jours_apres_le_paiement(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-09 12:00:00', 'UTC'));
        [$ctx, $token] = $this->linkFor();
        DB::table('lease_payment_links')->where('lease_payment_id', $ctx['payment']->id)->update(['expires_at' => now()->addDays(90)]);
        $this->setRow($ctx['payment'], ['status' => PaymentStatus::Refunded->value, 'paid_at' => now()->subDays(29), 'metadata' => null]);

        $this->getJson("/api/pay/{$token}")->assertOk();

        $this->travel(2)->days();
        $this->getJson("/api/pay/{$token}")->assertStatus(410);
    }

    /** Revue (point 4) — une échéance ANNULÉE n'est pas lisible comme « réglée » : 410. */
    public function test_une_echeance_annulee_reste_gone(): void
    {
        [$ctx, $token] = $this->linkFor();
        $this->setRow($ctx['payment'], ['status' => PaymentStatus::Cancelled->value, 'paid_at' => now()->subDay()]);

        $this->getJson("/api/pay/{$token}")->assertStatus(410)->assertJsonPath('code', 'pay_link.gone');
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertStatus(410);
    }
}
