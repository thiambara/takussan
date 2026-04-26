<?php

namespace Tests\Feature\Http\Webhook;

use App\Models\AppNotification;
use App\Models\User;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

        return AppNotification::factory()->create([
            'user_id' => $user->id,
            'delivery_attempts' => [[
                'attempt' => 1,
                'provider' => 'orange',
                'to' => '+221771111111',
                'status' => SmsResult::STATUS_SENT,
                'provider_message_id' => $providerMessageId,
                'sent_at' => now()->toAtomString(),
            ]],
        ]);
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
        $attempts = AppNotification::find($n->id)->refresh()->getAttribute('delivery_attempts');
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempts[1]['status']);
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

        $attempts = AppNotification::find($n->id)->refresh()->getAttribute('delivery_attempts');
        $deliveredCount = count(array_filter($attempts, fn ($a) => ($a['status'] ?? null) === SmsResult::STATUS_DELIVERED));
        $this->assertSame(1, $deliveredCount);
    }
}
