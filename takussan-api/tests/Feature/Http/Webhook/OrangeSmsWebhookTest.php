<?php

namespace Tests\Feature\Http\Webhook;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class OrangeSmsWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.webhook_url_token', 'tck-102-token');
        config()->set('sms.webhook_allowed_ips.orange', []);
    }

    private function makeNotificationWithOrangeAttempt(string $providerMessageId): AppNotification
    {
        $user = User::factory()->create();
        $notification = AppNotification::factory()->create(['user_id' => $user->id]);
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => 1,
            'provider' => 'orange',
            'to' => '+221771111111',
            'status' => SmsResult::STATUS_SENT,
            'provider_message_id' => $providerMessageId,
            'sent_at' => now(),
        ]);

        return $notification;
    }

    public function test_delivered_status_marks_attempt_delivered(): void
    {
        $n = $this->makeNotificationWithOrangeAttempt('orange-msg-1');

        $response = $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', [
            'deliveryInfoNotification' => [
                'callbackData' => 'https://api.orange.com/r/orange-msg-1',
                'deliveryInfo' => [
                    'address' => 'tel:+221771111111',
                    'deliveryStatus' => 'DeliveredToTerminal',
                    'link' => 'https://api.orange.com/x/y/orange-msg-1',
                ],
            ],
        ]);

        $response->assertOk();
        $attempt = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)
            ->where('provider_message_id', 'orange-msg-1')
            ->first();
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempt->status);
    }

    public function test_invalid_token_returns_404(): void
    {
        $this->makeNotificationWithOrangeAttempt('orange-msg-2');
        $response = $this->postJson('/api/webhooks/sms/orange/status/wrong-token', [
            'deliveryInfoNotification' => ['deliveryInfo' => ['deliveryStatus' => 'DeliveredToTerminal', 'link' => 'orange-msg-2']],
        ]);
        $response->assertNotFound();
    }

    public function test_unknown_message_id_returns_404(): void
    {
        $this->makeNotificationWithOrangeAttempt('orange-msg-3');
        $response = $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', [
            'deliveryInfoNotification' => [
                'deliveryInfo' => ['deliveryStatus' => 'DeliveredToTerminal', 'link' => 'unknown-id'],
            ],
        ]);
        $response->assertNotFound();
    }

    public function test_ip_allowlist_blocks_when_configured(): void
    {
        config()->set('sms.webhook_allowed_ips.orange', ['9.9.9.9']);
        $this->makeNotificationWithOrangeAttempt('orange-msg-4');
        $response = $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', [
            'deliveryInfoNotification' => [
                'deliveryInfo' => ['deliveryStatus' => 'DeliveredToTerminal', 'link' => 'orange-msg-4'],
            ],
        ]);
        $response->assertForbidden();
    }

    public function test_idempotent_webhook_does_not_duplicate(): void
    {
        $n = $this->makeNotificationWithOrangeAttempt('orange-msg-5');
        $payload = [
            'deliveryInfoNotification' => [
                'deliveryInfo' => ['deliveryStatus' => 'DeliveredToTerminal', 'link' => 'orange-msg-5'],
            ],
        ];
        $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', $payload)->assertOk();
        $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', $payload)->assertOk();

        $deliveredCount = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)
            ->where('status', SmsResult::STATUS_DELIVERED)
            ->count();
        $this->assertSame(1, $deliveredCount);
    }

    // ─── P36.02 (TCK-796) ────────────────────────────────────────

    public function test_a_later_delivered_does_not_overwrite_a_failed_attempt(): void
    {
        // Précédence du pulling `[sent, delivered, failed]` : `failed` est le
        // rang le plus haut, un accusé de rang inférieur arrivé après lui
        // (tardif ou rejoué) ne le fait pas reculer.
        $this->makeNotificationWithOrangeAttempt('orange-msg-p3602');
        $dlr = fn (string $status) => [
            'deliveryInfoNotification' => [
                'deliveryInfo' => [
                    'address' => 'tel:+221771111111',
                    'deliveryStatus' => $status,
                    'link' => 'https://api.orange.com/x/y/orange-msg-p3602',
                ],
            ],
        ];

        $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', $dlr('DeliveryImpossible'))->assertOk();
        $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', $dlr('DeliveredToTerminal'))->assertOk();

        $attempt = NotificationDeliveryAttempt::query()->where('provider_message_id', 'orange-msg-p3602')->first();
        $this->assertSame(SmsResult::STATUS_FAILED, $attempt->status);
        $this->assertSame('DeliveryImpossible', $attempt->failure_reason);
        $this->assertNull($attempt->delivered_at);
    }

    // ─── P36.03 (TCK-797) ────────────────────────────────────────

    /** @return array<string, mixed> */
    private function orangeDlr(string $messageId, string $status): array
    {
        return [
            'deliveryInfoNotification' => [
                'deliveryInfo' => [
                    'address' => 'tel:+221771111111',
                    'deliveryStatus' => $status,
                    'link' => 'https://api.orange.com/x/y/'.$messageId,
                ],
            ],
        ];
    }

    public function test_a_non_terminal_status_is_ignored_with_a_warning(): void
    {
        Log::spy();
        foreach (['DeliveredToNetwork', 'DeliveryUncertain', 'MessageWaiting', 'DeliveryNotificationNotSupported', 'Inconnu'] as $i => $status) {
            $this->makeNotificationWithOrangeAttempt("orange-p3603-{$i}");

            $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', $this->orangeDlr("orange-p3603-{$i}", $status))->assertOk();

            $attempt = NotificationDeliveryAttempt::query()->where('provider_message_id', "orange-p3603-{$i}")->first();
            $this->assertSame(SmsResult::STATUS_SENT, $attempt->status, $status);
            $this->assertNull($attempt->failure_reason, $status);
        }
        Log::shouldHaveReceived('warning')->times(5)->withArgs(fn (string $message) => str_contains($message, 'statut non terminal'));
    }

    public function test_message_waiting_after_delivered_keeps_delivered(): void
    {
        $this->makeNotificationWithOrangeAttempt('orange-p3603-w');
        $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', $this->orangeDlr('orange-p3603-w', 'DeliveredToTerminal'))->assertOk();
        $this->postJson('/api/webhooks/sms/orange/status/tck-102-token', $this->orangeDlr('orange-p3603-w', 'MessageWaiting'))->assertOk();

        $this->assertSame(SmsResult::STATUS_DELIVERED, NotificationDeliveryAttempt::query()->where('provider_message_id', 'orange-p3603-w')->first()->status);
    }
}
