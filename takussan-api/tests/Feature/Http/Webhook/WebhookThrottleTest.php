<?php

namespace Tests\Feature\Http\Webhook;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/**
 * P36.07 (TCK-798) — les accusés de livraison arrivent en rafale (jusqu'à 500 par envoi Mtarget,
 * un statut par message chez Meta) depuis quelques IP : un limiteur nommé par fournisseur, plus
 * large que l'ancien `throttle:120,1`, et un `Log::warning` sur chaque refus — le journal des
 * webhooks, placé après le débit, n'en garde aucune ligne.
 */
class WebhookThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('sms.webhook_url_token', 'tck-798-token');
        config()->set('whatsapp.webhook_url_token', 'tck-798-wa');
        foreach (['orange', 'mtarget', 'lafricamobile'] as $provider) {
            config()->set("sms.webhook_allowed_ips.{$provider}", []);
        }
    }

    public function test_a_burst_above_120_per_minute_is_not_refused(): void
    {
        for ($i = 0; $i < 125; $i++) {
            $response = $this->postJson('/api/webhooks/sms/orange/status/tck-798-token', [
                'deliveryInfoNotification' => ['deliveryInfo' => [
                    'deliveryStatus' => 'DeliveredToTerminal',
                    'link' => "https://api.orange.com/x/y/rafale-{$i}",
                ]],
            ]);
            $this->assertNotSame(429, $response->getStatusCode(), "accusé n° {$i}");
        }
    }

    public function test_each_provider_has_its_own_named_limiter_wider_than_120(): void
    {
        $routes = [
            'sms.webhook.orange' => 'webhook-sms-orange',
            'sms.webhook.mtarget' => 'webhook-sms-mtarget',
            'sms.webhook.lafricamobile' => 'webhook-sms-lafricamobile',
            'whatsapp.webhook.status' => 'webhook-whatsapp',
        ];
        foreach ($routes as $route => $limiter) {
            $middleware = app('router')->getRoutes()->getByName($route)->middleware();
            $this->assertContains("throttle:{$limiter}", $middleware, $route);
            $this->assertNotContains('throttle:120,1', $middleware, $route);
            // Le journal reste après le débit (TCK-602).
            $this->assertGreaterThan(array_search("throttle:{$limiter}", $middleware, true), $this->indexOfJournal($middleware), $route);

            $limit = RateLimiter::limiter($limiter)(request());
            $this->assertGreaterThan(120, $limit->maxAttempts, $limiter);
        }
    }

    public function test_a_refusal_is_logged_and_does_not_spill_onto_another_provider(): void
    {
        Log::spy();
        $limit = RateLimiter::limiter('webhook-sms-orange')(request());
        for ($i = 0; $i < $limit->maxAttempts; $i++) {
            RateLimiter::hit(md5('webhook-sms-orange'.$limit->key), 60);
        }

        $this->postJson('/api/webhooks/sms/orange/status/tck-798-token', ['deliveryInfoNotification' => []])
            ->assertStatus(429)
            ->assertJsonPath('message', 'Too many attempts. Try again in a moment.'); // l'enveloppe globale d'un 429, inchangée

        Log::shouldHaveReceived('warning')->once()->withArgs(
            fn (string $message, array $context) => str_contains($message, 'débit dépassé') && $context['limiter'] === 'webhook-sms-orange',
        );

        // Un autre fournisseur, même IP : son propre seau.
        $this->post('/api/webhooks/sms/mtarget/status/tck-798-token', ['MsgId' => 'inconnu', 'Status' => 3])->assertNotFound();
    }

    /** @param  list<string>  $middleware */
    private function indexOfJournal(array $middleware): int
    {
        foreach ($middleware as $i => $name) {
            if (str_starts_with($name, 'webhook.journal:')) {
                return $i;
            }
        }
        $this->fail('webhook.journal absent');
    }
}
