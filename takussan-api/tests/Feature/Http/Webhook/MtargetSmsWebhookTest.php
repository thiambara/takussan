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
}
