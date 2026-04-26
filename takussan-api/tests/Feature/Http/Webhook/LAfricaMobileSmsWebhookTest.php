<?php

namespace Tests\Feature\Http\Webhook;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class LAfricaMobileSmsWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.webhook_url_token', 'tck-102-token');
        config()->set('sms.webhook_allowed_ips.lafricamobile', []);
    }

    private function makeNotificationWithAttempt(string $pushId): AppNotification
    {
        $user = User::factory()->create();
        $notification = AppNotification::factory()->create(['user_id' => $user->id]);
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => 1,
            'provider' => 'lafricamobile',
            'to' => '+221761111111',
            'status' => SmsResult::STATUS_SENT,
            'provider_message_id' => $pushId,
            'sent_at' => now(),
        ]);

        return $notification;
    }

    public function test_delivered_status_6_marks_delivered_on_signed_url(): void
    {
        $n = $this->makeNotificationWithAttempt('lam-1');
        $url = URL::signedRoute('sms.webhook.lafricamobile', [
            'token' => 'tck-102-token',
            'notification' => $n->id,
            'push_id' => 'lam-1',
            'status' => 6,
            'text' => 'DELIVRD',
        ]);
        $response = $this->getJson($url);
        $response->assertOk();
        $attempt = NotificationDeliveryAttempt::query()
            ->where('app_notification_id', $n->id)
            ->where('provider_message_id', 'lam-1')
            ->first();
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempt->status);
    }

    public function test_unsigned_url_returns_403(): void
    {
        $n = $this->makeNotificationWithAttempt('lam-2');
        $response = $this->getJson("/api/webhooks/sms/lafricamobile/status/tck-102-token/{$n->id}?push_id=lam-2&status=6");
        $response->assertForbidden();
    }
}
