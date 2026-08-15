<?php

namespace Tests\Feature\Http\Webhook;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Whatsapp\WhatsappResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-283 — WhatsApp DLR status webhook: signature, idempotency and the
 * delivered/read/failed → attempt mapping. Queue is sync in tests, so the
 * async job runs inline.
 */
class WhatsappStatusWebhookTest extends TestCase
{
    use RefreshDatabase;

    private string $token = 'tck-283-token';

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('whatsapp.webhook_url_token', $this->token);
        config()->set('whatsapp.webhook_app_secret', '');
    }

    private function attempt(string $messageId, string $status = WhatsappResult::STATUS_SENT): AppNotification
    {
        $user = User::factory()->create();
        $notification = AppNotification::factory()->create(['user_id' => $user->id]);
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => 1,
            'provider' => 'whatsapp_cloud',
            'provider_message_id' => $messageId,
            'to' => '+221761234567',
            'status' => $status,
            'sent_at' => now(),
        ]);

        return $notification;
    }

    private function payload(string $messageId, string $status): array
    {
        return [
            'entry' => [[
                'changes' => [[
                    'field' => 'messages',
                    'value' => [
                        'statuses' => [[
                            'id' => $messageId,
                            'status' => $status,
                            'timestamp' => '1700000000',
                            'recipient_id' => '221761234567',
                        ]],
                    ],
                ]],
            ]],
        ];
    }

    private function postStatus(array $payload, ?string $token = null): TestResponse
    {
        return $this->postJson('/api/webhooks/whatsapp/status/'.($token ?? $this->token), $payload);
    }

    public function test_delivered_marks_attempt_delivered(): void
    {
        $n = $this->attempt('wamid.deliv1');
        $this->postStatus($this->payload('wamid.deliv1', 'delivered'))->assertOk();

        $attempt = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)->first();
        $this->assertSame(WhatsappResult::STATUS_DELIVERED, $attempt->status);
        $this->assertNotNull($attempt->delivered_at);
    }

    public function test_read_marks_attempt_delivered(): void
    {
        $n = $this->attempt('wamid.read1');
        $this->postStatus($this->payload('wamid.read1', 'read'))->assertOk();

        $this->assertSame(
            WhatsappResult::STATUS_DELIVERED,
            NotificationDeliveryAttempt::query()->where('app_notification_id', $n->id)->value('status'),
        );
    }

    public function test_failed_marks_attempt_failed_with_reason(): void
    {
        $n = $this->attempt('wamid.fail1');
        $payload = $this->payload('wamid.fail1', 'failed');
        $payload['entry'][0]['changes'][0]['value']['statuses'][0]['errors'] = [['title' => 'Undeliverable']];
        $this->postStatus($payload)->assertOk();

        $attempt = NotificationDeliveryAttempt::query()->where('app_notification_id', $n->id)->first();
        $this->assertSame(WhatsappResult::STATUS_FAILED, $attempt->status);
        $this->assertSame('Undeliverable', $attempt->failure_reason);
    }

    public function test_invalid_token_returns_404(): void
    {
        $this->attempt('wamid.x');
        $this->postStatus($this->payload('wamid.x', 'delivered'), token: 'wrong')->assertNotFound();
    }

    public function test_unknown_message_id_is_ignored_with_200(): void
    {
        // No matching attempt — the webhook still 200s (Meta must not retry).
        $this->postStatus($this->payload('wamid.unknown', 'delivered'))->assertOk();
    }

    public function test_invalid_signature_returns_403(): void
    {
        config()->set('whatsapp.webhook_app_secret', 'shhh');
        $this->attempt('wamid.sig1');
        $content = json_encode($this->payload('wamid.sig1', 'delivered'));

        $response = $this->call('POST', '/api/webhooks/whatsapp/status/'.$this->token, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => 'sha256=deadbeef',
        ], $content);

        $response->assertForbidden();
    }

    public function test_missing_secret_in_production_is_rejected(): void
    {
        // Fail-closed: an unset app secret in production must not let an
        // unsigned webhook through (the URL token alone is insufficient).
        config()->set('whatsapp.webhook_app_secret', '');
        $this->app['env'] = 'production';
        $this->attempt('wamid.prod');

        $this->postStatus($this->payload('wamid.prod', 'delivered'))->assertForbidden();
    }

    public function test_valid_signature_is_accepted(): void
    {
        config()->set('whatsapp.webhook_app_secret', 'shhh');
        $n = $this->attempt('wamid.sig2');
        $content = json_encode($this->payload('wamid.sig2', 'delivered'));
        $sig = 'sha256='.hash_hmac('sha256', $content, 'shhh');

        $this->call('POST', '/api/webhooks/whatsapp/status/'.$this->token, [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => $sig,
        ], $content)->assertOk();

        $this->assertSame(
            WhatsappResult::STATUS_DELIVERED,
            NotificationDeliveryAttempt::query()->where('app_notification_id', $n->id)->value('status'),
        );
    }

    public function test_late_sent_does_not_regress_a_delivered_attempt(): void
    {
        // Meta does not guarantee DLR ordering; a replayed/late `sent` after
        // `delivered` must not clobber the row nor wipe `delivered_at`.
        $n = $this->attempt('wamid.ooo');
        $this->postStatus($this->payload('wamid.ooo', 'delivered'))->assertOk();
        $this->postStatus($this->payload('wamid.ooo', 'sent'))->assertOk();

        $attempt = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)->first();
        $this->assertSame(WhatsappResult::STATUS_DELIVERED, $attempt->status);
        $this->assertNotNull($attempt->delivered_at);
    }

    public function test_replay_is_idempotent(): void
    {
        $n = $this->attempt('wamid.idem');
        $payload = $this->payload('wamid.idem', 'delivered');
        $this->postStatus($payload)->assertOk();
        $this->postStatus($payload)->assertOk();

        $count = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)
            ->where('status', WhatsappResult::STATUS_DELIVERED)
            ->count();
        $this->assertSame(1, $count);
    }
}
