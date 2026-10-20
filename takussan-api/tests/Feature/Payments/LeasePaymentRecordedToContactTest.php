<?php

namespace Tests\Feature\Payments;

use App\Domain\Notifications\NotificationCode;
use App\Models\Enums\PaymentStatus;
use App\Models\NotificationPreference;
use App\Notifications\CodedNotification;
use App\Services\Model\LeasePaymentService;
use App\Services\Payments\LeasePaymentLinkService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Support\EnvoisParCode;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-1002 (P48.02) — le paiement enregistré par l'agence (`markPaid`) prévient le locataire SANS
 * COMPTE sur son téléphone, avec le lien `/pay/{jeton}` de sa quittance, comme le paiement en
 * ligne (TCK-602). Un compte, lui, le lit dans son espace : ni lien porteur, ni canal mobile neuf.
 */
class LeasePaymentRecordedToContactTest extends TestCase
{
    use EnvoisParCode, LeaseDueFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        config()->set('app.frontend_url', 'https://front.test');
    }

    public function test_a_tenant_without_account_receives_the_recorded_payment_with_its_receipt_link(): void
    {
        $ctx = $this->leaseDue();
        $ctx['lease']->tenant->forceFill(['user_id' => null, 'phone' => '+221771234567'])->save();

        app(LeasePaymentService::class)->markPaid($ctx['payment']->fresh(), [], $ctx['agent']);

        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->fresh()->status);
        $envois = self::envoisALaDemande(NotificationCode::LeasePaymentRecorded);
        $this->assertCount(1, $envois);
        [$notification, $channels] = $envois->first();
        $this->assertSame(app(LeasePaymentLinkService::class)->urlFor($ctx['payment']->fresh()), $notification->params['receipt_url']);
        $this->assertStringStartsWith('https://front.test/pay/', $notification->params['receipt_url']);
        $this->assertContains('sms', $channels);
    }

    public function test_a_tenant_with_account_receives_it_on_the_account_without_the_bearer_link(): void
    {
        $ctx = $this->leaseDue();
        // Un compte qui a tout pour recevoir un SMS de ce code (numéro vérifié, interrupteur
        // allumé) : le paiement enregistré n'en ouvre pas un neuf vers lui.
        $ctx['tenant']->forceFill(['phone' => '+221771234568', 'phone_verified_at' => now()])->save();
        NotificationPreference::query()->updateOrCreate(['user_id' => $ctx['tenant']->id, 'event_type' => 'lease_payment_received', 'channel' => 'sms'], ['enabled' => true]);

        app(LeasePaymentService::class)->markPaid($ctx['payment']->fresh(), [], $ctx['agent']);

        $this->assertSame(1, self::nombreDEnvois($ctx['tenant'], NotificationCode::LeasePaymentRecorded));
        $this->assertCount(0, self::envoisALaDemande(NotificationCode::LeasePaymentRecorded));
        Notification::assertSentTo($ctx['tenant'], CodedNotification::class, function ($n, array $channels) {
            return $n->code === NotificationCode::LeasePaymentRecorded
                && ! array_key_exists('receipt_url', $n->params)
                && array_intersect($channels, ['sms', 'whatsapp']) === [];
        });
    }

    public function test_a_tenant_without_account_nor_phone_receives_nothing(): void
    {
        $ctx = $this->leaseDue();
        $ctx['lease']->tenant->forceFill(['user_id' => null, 'phone' => null, 'email' => null])->save();

        app(LeasePaymentService::class)->markPaid($ctx['payment']->fresh(), [], $ctx['agent']);

        $this->assertCount(0, self::envoisALaDemande(NotificationCode::LeasePaymentRecorded));
    }
}
