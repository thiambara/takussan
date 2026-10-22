<?php

namespace Tests\Feature\Http\Webhook;

use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Notifications\Sms\SmsResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1360 (P106.01) — en `production`, une liste d'IP vide ferme les trois accusés SMS en 403
 * `webhook.ip_allowlist_not_configured` (`RestrictIpMiddleware`). C'est la seule défense de la
 * production si les `SMS_*_WEBHOOK_IPS` y manquent ; jusqu'ici, les classes de webhook tournaient en
 * `testing`, où la branche n'est jamais prise, et la retirer laissait tout vert.
 */
class SmsWebhookEmptyAllowlistInProductionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.webhook_url_token', 'tck-1360-token');
        foreach (['orange', 'mtarget', 'lafricamobile'] as $provider) {
            config()->set("sms.webhook_allowed_ips.{$provider}", []);
        }
    }

    protected function tearDown(): void
    {
        $this->app['env'] = 'testing';
        parent::tearDown();
    }

    /** @return array<string, array{string, string}> */
    public static function routes(): array
    {
        return [
            'orange' => ['POST', '/api/webhooks/sms/orange/status/tck-1360-token'],
            'mtarget' => ['POST', '/api/webhooks/sms/mtarget/status/tck-1360-token'],
            'lafricamobile' => ['GET', '/api/webhooks/sms/lafricamobile/status/tck-1360-token/1'],
        ];
    }

    #[DataProvider('routes')]
    public function test_en_production_une_liste_vide_ferme_l_accuse(string $method, string $uri): void
    {
        $this->app['env'] = 'production';

        $this->json($method, $uri)
            ->assertStatus(403)
            ->assertJsonPath('code', 'webhook.ip_allowlist_not_configured');
    }

    public function test_l_accuse_refuse_ne_touche_pas_la_tentative(): void
    {
        $notification = AppNotification::factory()->create(['user_id' => User::factory()->create()->id]);
        $attempt = NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => $notification->id,
            'attempt' => 1,
            'provider' => 'orange',
            'to' => '+221771111111',
            'status' => SmsResult::STATUS_SENT,
            'provider_message_id' => 'orange-msg-1360',
            'sent_at' => now(),
        ]);
        $this->app['env'] = 'production';

        $this->postJson('/api/webhooks/sms/orange/status/tck-1360-token', [
            'deliveryInfoNotification' => [
                'callbackData' => 'https://api.orange.com/r/orange-msg-1360',
                'deliveryInfo' => [
                    'address' => 'tel:+221771111111',
                    'deliveryStatus' => 'DeliveryImpossible',
                    'link' => 'https://api.orange.com/x/y/orange-msg-1360',
                ],
            ],
        ])->assertStatus(403);

        $this->assertSame(SmsResult::STATUS_SENT, $attempt->fresh()->status);
    }

    public function test_hors_production_la_liste_vide_laisse_passer(): void
    {
        $response = $this->postJson('/api/webhooks/sms/orange/status/tck-1360-token', []);

        $this->assertNotSame('webhook.ip_allowlist_not_configured', $response->json('code'));
    }
}
