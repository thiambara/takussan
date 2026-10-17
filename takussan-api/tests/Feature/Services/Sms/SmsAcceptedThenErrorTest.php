<?php

namespace Tests\Feature\Services\Sms;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Integration;
use App\Models\NotificationDeliveryAttempt;
use App\Services\Notifications\Sms\SmsResult;
use App\Services\Notifications\Sms\SmsRouterDriver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * TCK-767 (P27.03) — une erreur levée APRÈS qu'un fournisseur a accepté le SMS
 * (écriture de `last_used_at`, écriture de la tentative) ne fait ni passer le
 * numéro au fournisseur suivant, ni sortir une exception qui ferait rejouer le
 * job : le SMS est parti, il ne repart pas.
 */
class SmsAcceptedThenErrorTest extends TestCase
{
    use RefreshDatabase;

    private const NUMBER = '+221761234567';

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        config()->set('sms.webhook_url_token', 'tck-767-test-token');
        config()->set('sms.quiet_hours.enabled', false);
        foreach (['sms_lafricamobile', 'sms_mtarget'] as $provider) {
            Integration::create([
                'provider' => $provider,
                'agency_id' => $this->agency->id,
                'credentials' => ['accountid' => 'lam', 'password' => 'p', 'username' => 'u', 'sender_id' => 'TAKUSSAN'],
                'metadata' => [],
                'is_active' => true,
            ]);
        }
        Http::preventStrayRequests();
        Http::fake([
            'lampush*' => Http::response(['push_id' => 'lam-push-1'], 200),
            'api-public-2.mtarget.fr/*' => Http::response(['results' => [['code' => 0, 'ticket' => 'mtg-1']]], 200),
        ]);
    }

    /** @param  array<string,mixed>  $context */
    private function send(array $context = []): SmsResult
    {
        return app(SmsRouterDriver::class)->send(self::NUMBER, 'bonjour', $context + [
            'agency_id' => $this->agency->id,
            'is_critical' => true,
        ])[self::NUMBER];
    }

    public function test_a_failing_last_used_at_write_keeps_the_accepted_sms(): void
    {
        Integration::saving(function (Integration $integration): void {
            if ($integration->isDirty('last_used_at')) {
                throw new \RuntimeException('écriture de last_used_at impossible');
            }
        });

        $result = $this->send();

        $this->assertSame('lafricamobile', $result->provider);
        $this->assertSame(SmsResult::STATUS_SENT, $result->status);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'mtarget'));
    }

    public function test_a_failing_attempt_write_after_a_sent_does_not_throw_nor_resend(): void
    {
        // Un fournisseur qui réutilise un identifiant : l'index unique
        // (provider, provider_message_id) refuse la seconde tentative.
        NotificationDeliveryAttempt::query()->create([
            'app_notification_id' => AppNotification::factory()->create()->id,
            'attempt' => 1,
            'provider' => 'lafricamobile',
            'provider_message_id' => 'lam-push-1',
            'to' => '+221760000000',
            'status' => SmsResult::STATUS_SENT,
        ]);
        $notification = AppNotification::factory()->create();

        $result = $this->send(['notification_id' => $notification->id]);

        $this->assertSame('lafricamobile', $result->provider);
        $this->assertSame(SmsResult::STATUS_SENT, $result->status);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'mtarget'));
    }
}
