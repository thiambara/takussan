<?php

namespace Tests\Feature\Payments;

use App\Domain\Notifications\NotificationCode;
use App\Models\Enums\PaymentStatus;
use App\Models\IntegrationWebhookLog;
use App\Services\Payments\Dto\PaymentStatus as DriverStatus;
use App\Services\Payments\LeasePaymentLinkService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\Support\EnvoisParCode;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §2) — la quittance d'un paiement en ligne part UNE fois, au passage à `paid`,
 * vers le locataire même sans compte, et le bailleur est prévenu.
 */
class RentReceiptAfterOnlinePaymentTest extends TestCase
{
    use EnvoisParCode, LeaseDueFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Notification::fake();
        config()->set('app.frontend_url', 'https://front.test');
        config()->set('laravel-pdf.driver', 'dompdf');
    }

    /** @return array{0: array<string, mixed>, 1: string, 2: object} */
    private function initiatedWithoutAccount(): array
    {
        $ctx = $this->leaseDue();
        $ctx['lease']->tenant->forceFill(['user_id' => null, 'phone' => '+221771234567'])->save();
        $spy = $this->spyDriver();
        $token = substr(app(LeasePaymentLinkService::class)->urlFor($ctx['payment']), strlen('https://front.test/pay/'));
        $this->postJson("/api/pay/{$token}/initiate", ['provider' => 'wave'])->assertOk();

        return [$ctx, $token, $spy];
    }

    /**
     * AC18 — un locataire SANS COMPTE paie par son lien : une quittance vers son téléphone (lien
     * `/pay/{jeton}`), le bailleur prévenu ; le PDF se télécharge une fois payé, 409 avant.
     */
    public function test_a_tenant_without_account_receives_the_receipt_and_the_landlord_is_told(): void
    {
        [$ctx, $token] = $this->initiatedWithoutAccount();
        $this->getJson("/api/pay/{$token}/receipt")->assertStatus(409)->assertJsonPath('code', 'pay_link.receipt_unavailable');

        $this->waveWebhook('spy_txn_1', 150000)->assertOk();
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->fresh()->status);

        $envois = self::envoisALaDemande(NotificationCode::LeasePaymentSettledOnline);
        $this->assertCount(1, $envois);
        [$notification] = $envois->first();
        $this->assertSame("https://front.test/pay/{$token}", $notification->params['receipt_url']);
        $this->assertSame(1, self::nombreDEnvois($ctx['lease']->landlord, NotificationCode::LeasePaymentReceivedLandlord));

        $pdf = $this->get("/api/pay/{$token}/receipt")->assertOk();
        $this->assertStringContainsString('application/pdf', (string) $pdf->headers->get('Content-Type'));
    }

    /** Un locataire AVEC compte : la quittance part à son compte, une fois. */
    public function test_a_tenant_with_account_receives_it_on_the_account(): void
    {
        $ctx = $this->leaseDue();
        $this->spyDriver();
        $this->actingAs($ctx['tenant'], 'sanctum');
        $this->postJson('/api/lease-payments/'.$ctx['payment']->id.'/initiate', ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', 150000)->assertOk();

        $this->assertSame(1, self::nombreDEnvois($ctx['tenant'], NotificationCode::LeasePaymentSettledOnline));
        $this->assertCount(0, self::envoisALaDemande(NotificationCode::LeasePaymentSettledOnline));
    }

    /**
     * AC19 — le webhook DEUX fois, le rejeu de sa ligne, puis `verify` : une seule quittance, un seul
     * avis au bailleur.
     */
    public function test_webhook_twice_replay_and_verify_send_a_single_receipt(): void
    {
        [$ctx, $token, $spy] = $this->initiatedWithoutAccount();

        $this->waveWebhook('spy_txn_1', 150000)->assertOk();
        $this->waveWebhook('spy_txn_1', 150000)->assertOk();

        $log = IntegrationWebhookLog::query()->where('channel', 'payment')->latest('id')->firstOrFail();
        DB::table('integration_webhook_logs')->where('id', $log->id)->update(['status' => 'failed']);
        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/webhook-logs/{$log->id}/replay")->assertOk();

        $spy->verifyStatus = DriverStatus::SUCCESS;
        $this->postJson("/api/pay/{$token}/verify")->assertOk()->assertJsonPath('data.status', 'paid');

        $this->assertCount(1, self::envoisALaDemande(NotificationCode::LeasePaymentSettledOnline));
        $this->assertSame(1, self::nombreDEnvois($ctx['lease']->landlord, NotificationCode::LeasePaymentReceivedLandlord));
    }

    /** AC19 — `verify` seul (webhook perdu) : une quittance. */
    public function test_verify_alone_sends_one_receipt(): void
    {
        [, $token, $spy] = $this->initiatedWithoutAccount();
        $spy->verifyStatus = DriverStatus::SUCCESS;

        $this->postJson("/api/pay/{$token}/verify")->assertOk()->assertJsonPath('data.status', 'paid');
        $this->postJson("/api/pay/{$token}/verify")->assertOk();

        $this->assertCount(1, self::envoisALaDemande(NotificationCode::LeasePaymentSettledOnline));
    }
}
