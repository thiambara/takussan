<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Integration;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-606 (O-2, ADR-0046 amendement du 2026-11-16 point 4) — le webhook de paiement est débité par
 * INTÉGRATION (empreinte du jeton) : deux intégrations derrière une même IP de fournisseur
 * n'épuisent pas le seau l'une de l'autre, et la route 410 a le sien.
 */
class PaymentWebhookRateLimitTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    public function test_two_integrations_behind_one_ip_do_not_share_a_bucket(): void
    {
        $a = $this->waveIntegration('secret_a');
        $b = $this->waveIntegration('secret_b');

        for ($i = 0; $i < 60; $i++) {
            $this->postFrom('10.0.0.1', $this->uri($a))->assertStatus(401);
        }
        $this->postFrom('10.0.0.1', $this->uri($a))->assertStatus(429);

        // Même IP, autre intégration : son seau est intact.
        $this->postFrom('10.0.0.1', $this->uri($b))->assertStatus(401);
    }

    /** La moitié de l'AC4 tenue par TCK-634 reste tenue : 60 appels à la route 410 n'épuisent rien. */
    public function test_the_gone_route_never_drains_the_token_buckets(): void
    {
        $a = $this->waveIntegration('secret_a');

        for ($i = 0; $i < 60; $i++) {
            $this->postFrom('10.0.0.2', '/api/webhooks/payments/wave')->assertStatus(410);
        }
        $this->postFrom('10.0.0.2', '/api/webhooks/payments/wave')->assertStatus(429);

        $this->postFrom('10.0.0.2', $this->uri($a))->assertStatus(401);
    }

    /** Un jeton n'apparaît jamais en clair dans une clé de limiteur : son empreinte seulement. */
    public function test_no_limiter_key_holds_the_token_in_clear(): void
    {
        $token = str_repeat('T', 48);
        $request = Request::create('/api/webhooks/payments/wave/'.$token, 'POST');
        $request->setRouteResolver(fn () => app('router')->getRoutes()->match($request));

        $limits = RateLimiter::limiter('payment-webhook')($request);
        $keys = array_map(fn (Limit $limit): string => (string) $limit->key, $limits);

        $this->assertContains('payment-webhook-integration:'.hash('sha256', $token), $keys);
        foreach ($keys as $key) {
            $this->assertStringNotContainsString($token, $key);
        }
    }

    private function waveIntegration(string $secret): Integration
    {
        return Integration::factory()->create([
            'agency_id' => Agency::factory()->create()->id,
            'provider' => 'wave',
            'is_active' => true,
            'credentials' => ['api_key' => 'k', 'webhook_secret' => $secret],
        ]);
    }

    private function uri(Integration $integration): string
    {
        return '/api/webhooks/payments/wave/'.$integration->webhook_token;
    }

    private function postFrom(string $ip, string $uri): TestResponse
    {
        return $this->call('POST', $uri, [], [], [], [
            'REMOTE_ADDR' => $ip,
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_WAVE_SIGNATURE' => 't=1,v1=faux',
        ], '{"type":"checkout.session.completed","data":{"id":"x"}}');
    }
}
