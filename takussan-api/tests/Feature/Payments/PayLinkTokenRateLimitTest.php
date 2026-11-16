<?php

namespace Tests\Feature\Payments;

use App\Services\Payments\LeasePaymentLinkService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-606 (verif-602 m4) — `verify` et `initiate` d'un lien de paiement sont bornés par JETON en
 * plus de l'IP : un lien qui fuit ne se martèle pas depuis N IP, et `verify` ne déclenche plus
 * d'appel sortant chez le fournisseur au-delà du seuil.
 */
class PayLinkTokenRateLimitTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        config()->set('app.frontend_url', 'https://front.test');
    }

    /** AC5 — 7 IP distinctes sur un même jeton : la 7ᵉ rend 429, et le pilote n'est pas appelé. */
    public function test_verify_is_throttled_per_token_across_ips(): void
    {
        Http::fake(['*' => Http::response(['id' => 'txn_606', 'payment_status' => 'processing', 'checkout_status' => 'open'])]);
        [$ctx, $token] = $this->link();
        DB::table('lease_payments')->where('id', $ctx['payment']->id)->update([
            'transaction_id' => 'txn_606',
            'metadata' => json_encode(['gateway' => ['provider' => 'wave', 'transaction_id' => 'txn_606']]),
        ]);

        for ($i = 1; $i <= 6; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "10.6.0.{$i}"])->postJson("/api/pay/{$token}/verify")->assertOk();
        }
        $sent = count(Http::recorded());
        $this->assertGreaterThan(0, $sent, 'la vérification doit interroger le pilote sous le seuil');

        $this->withServerVariables(['REMOTE_ADDR' => '10.6.0.7'])->postJson("/api/pay/{$token}/verify")->assertStatus(429);
        Http::assertSentCount($sent);
    }

    /** `initiate` : 10 par jeton, quelle que soit l'IP. */
    public function test_initiate_is_throttled_per_token_across_ips(): void
    {
        $unknown = str_repeat('B', 43);
        for ($i = 1; $i <= 10; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "10.7.0.{$i}"])->postJson("/api/pay/{$unknown}/initiate", ['provider' => 'wave'])->assertNotFound();
        }
        $this->withServerVariables(['REMOTE_ADDR' => '10.7.0.11'])->postJson("/api/pay/{$unknown}/initiate", ['provider' => 'wave'])->assertStatus(429);

        // Un autre jeton depuis une IP neuve n'est pas touché.
        $this->withServerVariables(['REMOTE_ADDR' => '10.7.0.12'])->postJson('/api/pay/'.str_repeat('C', 43).'/initiate', ['provider' => 'wave'])->assertNotFound();
    }

    /** AC5 — aucune clé de limiteur ne contient le jeton en clair : son empreinte `sha256`. */
    public function test_no_limiter_key_holds_the_token_in_clear(): void
    {
        $token = str_repeat('D', 43);
        foreach (['verify', 'initiate'] as $action) {
            $request = Request::create("/api/pay/{$token}/{$action}", 'POST');
            $request->setRouteResolver(fn () => app('router')->getRoutes()->match($request));

            $keys = array_map(fn (Limit $limit): string => (string) $limit->key, RateLimiter::limiter("pay-link-{$action}")($request));

            $this->assertContains("pay_link:{$action}:".hash('sha256', $token), $keys);
            foreach ($keys as $key) {
                $this->assertStringNotContainsString($token, $key, $action);
            }
        }
    }

    /** @return array{0: array<string, mixed>, 1: string} */
    private function link(): array
    {
        $ctx = $this->leaseDue();
        $ctx['lease']->tenant->forceFill(['user_id' => null])->save();
        $url = app(LeasePaymentLinkService::class)->urlFor($ctx['payment']);

        return [$ctx, substr($url, strlen('https://front.test/pay/'))];
    }
}
