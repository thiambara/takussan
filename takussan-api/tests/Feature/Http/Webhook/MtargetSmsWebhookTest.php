<?php

namespace Tests\Feature\Http\Webhook;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MtargetSmsWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.webhook_url_token', 'tck-102-token');
        config()->set('sms.webhook_allowed_ips.mtarget', []);
    }

    private function makeNotificationWithAttempt(string $providerMessageId): AppNotification
    {
        $user = User::factory()->create();
        $notification = AppNotification::factory()->create(['user_id' => $user->id]);
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => 1,
            'provider' => 'mtarget',
            'to' => '+221771111111',
            'status' => SmsResult::STATUS_SENT,
            'provider_message_id' => $providerMessageId,
            'sent_at' => now(),
        ]);

        return $notification;
    }

    public function test_delivered_status_3_marks_delivered(): void
    {
        $n = $this->makeNotificationWithAttempt('mtg-1');
        $response = $this->post('/api/webhooks/sms/mtarget/status/tck-102-token', [
            'MsgId' => 'mtg-1',
            'Status' => 3,
            'StatusText' => 'OK',
            'DestinationAdress' => '221771111111',
        ]);
        $response->assertOk();
        $attempt = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)
            ->where('provider_message_id', 'mtg-1')
            ->first();
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempt->status);
    }

    public function test_unknown_msgid_returns_404(): void
    {
        $this->makeNotificationWithAttempt('mtg-2');
        $response = $this->post('/api/webhooks/sms/mtarget/status/tck-102-token', [
            'MsgId' => 'unknown-id',
            'Status' => 3,
            'StatusText' => 'OK',
            'DestinationAdress' => '221771111111',
        ]);
        $response->assertNotFound();
    }

    // ─── TCK-285 ─────────────────────────────────────────────────
    //
    // Ce webhook ne vérifie AUCUNE signature (ardoise D-49) : le jeton d'URL
    // et l'allowlist d'IP sont ses deux seules gardes. Elles n'avaient aucun
    // test ici, alors que le webhook Orange — même modèle d'authentification —
    // les éprouve toutes les deux depuis avril.

    public function test_a_wrong_url_token_returns_404(): void
    {
        $this->makeNotificationWithAttempt('mtg-3');

        $this->post('/api/webhooks/sms/mtarget/status/mauvais-jeton', [
            'MsgId' => 'mtg-3',
            'Status' => 3,
            'StatusText' => 'OK',
            'DestinationAdress' => '221771111111',
        ])->assertNotFound();

        // Le statut n'a pas bougé : un jeton faux ne doit rien écrire.
        $this->assertSame(
            SmsResult::STATUS_SENT,
            NotificationDeliveryAttempt::query()->where('provider_message_id', 'mtg-3')->first()->status,
        );
    }

    public function test_an_empty_configured_token_fails_closed(): void
    {
        // Échec fermé : jeton non configuré → 404, et non « on laisse passer
        // parce qu'il n'y a rien à comparer ». C'est ce qui rend l'absence des
        // clés d'environnement (D-49) silencieuse plutôt que dangereuse.
        config()->set('sms.webhook_url_token', '');
        $this->makeNotificationWithAttempt('mtg-4');

        $this->post('/api/webhooks/sms/mtarget/status/', [
            'MsgId' => 'mtg-4',
            'Status' => 3,
        ])->assertNotFound();
    }

    public function test_the_ip_allowlist_blocks_when_configured(): void
    {
        config()->set('sms.webhook_allowed_ips.mtarget', ['203.0.113.7']);
        $this->makeNotificationWithAttempt('mtg-5');

        $this->post('/api/webhooks/sms/mtarget/status/tck-102-token', [
            'MsgId' => 'mtg-5',
            'Status' => 3,
            'StatusText' => 'OK',
            'DestinationAdress' => '221771111111',
        ])->assertForbidden();
    }

    public function test_replaying_the_same_delivery_report_is_idempotent(): void
    {
        // Un opérateur rejoue ses accusés. Le second passage ne doit ni
        // dupliquer la tentative, ni faire régresser son statut.
        $n = $this->makeNotificationWithAttempt('mtg-6');

        $payload = [
            'MsgId' => 'mtg-6',
            'Status' => 3,
            'StatusText' => 'OK',
            'DestinationAdress' => '221771111111',
        ];

        $this->post('/api/webhooks/sms/mtarget/status/tck-102-token', $payload)->assertOk();
        $this->post('/api/webhooks/sms/mtarget/status/tck-102-token', $payload);

        $attempts = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)
            ->where('provider_message_id', 'mtg-6')
            ->get();

        $this->assertCount(1, $attempts);
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempts->first()->status);
    }

    public function test_a_failure_status_records_the_reason_and_does_not_mark_delivered(): void
    {
        $this->makeNotificationWithAttempt('mtg-7');

        $this->post('/api/webhooks/sms/mtarget/status/tck-102-token', [
            'MsgId' => 'mtg-7',
            'Status' => 5,
            'StatusText' => 'ABSENT_SUBSCRIBER',
            'DestinationAdress' => '221771111111',
        ])->assertOk();

        $attempt = NotificationDeliveryAttempt::query()->where('provider_message_id', 'mtg-7')->first();
        $this->assertSame(SmsResult::STATUS_FAILED, $attempt->status);
        $this->assertSame('ABSENT_SUBSCRIBER', $attempt->failure_reason);
    }
}
