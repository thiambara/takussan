<?php

namespace Tests\Feature\Http\Webhook;

use App\Models\AppNotification;
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

        return AppNotification::factory()->create([
            'user_id' => $user->id,
            'delivery_attempts' => [[
                'attempt' => 1,
                'provider' => 'mtarget',
                'to' => '+221771111111',
                'status' => SmsResult::STATUS_SENT,
                'provider_message_id' => $providerMessageId,
                'sent_at' => now()->toAtomString(),
            ]],
        ]);
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
        $attempts = AppNotification::find($n->id)->refresh()->getAttribute('delivery_attempts');
        $this->assertSame(SmsResult::STATUS_DELIVERED, $attempts[1]['status']);
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
