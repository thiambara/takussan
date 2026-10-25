<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Customer;
use App\Models\Enums\PaymentStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Support\EncaissementsPlateforme;
use Tests\Support\EnvoisParCode;
use Tests\TestCase;

/**
 * TCK-2320 (P39.07, porteur 2026-10-25) — un remboursement du fournisseur sur un loyer encaissé en
 * ligne avertit le locataire et le bailleur, de la part neuve du remboursement. Avant : la branche
 * `REFUNDED` d'`applyStatusToPayment` n'émettait rien, et la quittance déjà envoyée restait seule.
 */
class RentRefundNoticeTest extends TestCase
{
    use EncaissementsPlateforme, EnvoisParCode, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_a_partial_refund_tells_the_tenant_and_the_landlord_of_the_refunded_part(): void
    {
        $tenant = User::factory()->create(['preferred_language' => 'fr', 'phone_verified_at' => now()]);
        $landlord = User::factory()->create(['preferred_language' => 'fr']);
        $rent = $this->rentOf(Customer::factory()->create(['user_id' => $tenant->id, 'first_name' => 'Awa', 'last_name' => 'Diop']), $landlord);

        $this->refundByWebhook($rent, 50_000);

        $toTenant = AppNotification::query()->where('user_id', $tenant->id)->where('code', NotificationCode::LeasePaymentRefunded->value)->sole();
        $this->assertSame('Villa des Almadies', $toTenant->params['property']);
        $this->assertSame(['amount' => '50000.00', 'currency' => 'XOF'], $toTenant->params['amount'], 'la part remboursée, pas le loyer');

        $toLandlord = AppNotification::query()->where('user_id', $landlord->id)->where('code', NotificationCode::LeasePaymentRefundedLandlord->value)->sole();
        $this->assertSame('Awa Diop', $toLandlord->params['tenant']);
        $this->assertSame($toTenant->params['amount'], $toLandlord->params['amount']);
    }

    public function test_a_tenant_without_account_is_told_on_their_phone_and_a_replayed_refund_tells_no_one_again(): void
    {
        $landlord = User::factory()->create();
        $rent = $this->rentOf(Customer::factory()->create(['user_id' => null, 'phone' => '+221 77 123 45 67']), $landlord);

        $this->refundByWebhook($rent, 150_000);
        $this->refundByWebhook($rent, 150_000);

        $this->assertSame(PaymentStatus::Refunded, $rent->refresh()->status);
        $envois = self::envoisALaDemande(NotificationCode::LeasePaymentRefunded);
        $this->assertCount(1, $envois);
        $this->assertSame('+221771234567', $envois->first()[2]->routes['sms']);
        $this->assertSame(1, AppNotification::query()->where('code', NotificationCode::LeasePaymentRefundedLandlord->value)->count());
    }

    private function rentOf(Customer $tenant, User $landlord): LeasePayment
    {
        $agency = Agency::factory()->create();
        $lease = Lease::factory()->create([
            'agency_id' => $agency->id,
            'tenant_id' => $tenant->id,
            'landlord_id' => $landlord->id,
            'property_id' => Property::factory()->create(['agency_id' => $agency->id, 'title' => 'Villa des Almadies'])->id,
        ]);

        return $this->soldeParLAgence(LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 150_000,
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
        ]), $agency);
    }

    private function refundByWebhook(LeasePayment $payment, int $amount): int
    {
        $payment->refresh();
        $integration = Integration::query()->findOrFail($payment->metadata['gateway']['integration_id']);

        return app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave',
            PaymentEvent::TYPE_REFUNDED,
            $payment->metadata['gateway']['settled_by'],
            ['amount' => (string) $amount, 'currency' => 'XOF'],
            WebhookAuthority::of($integration),
        ));
    }
}
