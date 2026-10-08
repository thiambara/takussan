<?php

namespace Tests\Feature\Webhooks;

use App\Models\Integration;
use App\Models\IntegrationWebhookLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-602 (ADR-0051 §4, AC13) — la route du paquet `lemonsqueezy/laravel` est reprise à l'URL et
 * au nom identiques, sous limiteur et journal : sa signature fausse laisse une ligne `rejected`,
 * sa signature juste une ligne authentifiée au nom de la plateforme.
 */
class LemonSqueezyWebhookJournalTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'ls_signing_602';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config()->set('lemon-squeezy.signing_secret', self::SECRET);
    }

    public function test_the_package_route_keeps_its_url_and_name_under_the_journal_and_a_limiter(): void
    {
        $route = Route::getRoutes()->getByName('lemon-squeezy.webhook');
        $this->assertNotNull($route);
        $this->assertSame(trim((string) config('lemon-squeezy.path'), '/').'/webhook', $route->uri());
        $this->assertContains('webhook.journal:payment,lemon_squeezy', $route->gatherMiddleware());
        $this->assertContains('throttle:60,1', $route->gatherMiddleware());
        $this->assertCount(1, array_filter(
            Route::getRoutes()->getRoutes(),
            fn ($r) => $r->uri() === $route->uri() && in_array('POST', $r->methods(), true),
        ), 'Une seule route : celle du paquet est ignorée.');
    }

    /** AC13 — `X-Signature` faux : 403, une ligne `rejected`, `provider = lemon_squeezy`. */
    public function test_a_wrong_signature_leaves_a_rejected_row(): void
    {
        $this->postLemonSqueezy($this->body(), 'faux')->assertForbidden();

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_REJECTED, $log->status);
        $this->assertSame('lemon_squeezy', $log->provider);
        $this->assertSame('payment', $log->channel);
        $this->assertSame(403, $log->http_status);
        $this->assertNull($log->authenticated_at);
    }

    /** AC13 — signature juste : `processed`, `authenticated_at` posé, rattachée à l'intégration plateforme. */
    public function test_a_right_signature_is_processed_and_authenticated_for_the_platform(): void
    {
        $platform = Integration::factory()->create(['agency_id' => null, 'provider' => 'lemon_squeezy', 'is_active' => true]);
        $body = $this->body();

        $this->postLemonSqueezy($body, hash_hmac('sha256', $body, self::SECRET))->assertOk();

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertSame(IntegrationWebhookLog::STATUS_PROCESSED, $log->status);
        $this->assertNotNull($log->authenticated_at);
        $this->assertSame($platform->id, $log->integration_id);
        $this->assertNull($log->agency_id);
        $this->assertSame('lemon-squeezy.webhook', $log->route_name);
        $this->assertSame($body, $log->body);
    }

    /** Sans secret configuré, le paquet ne vérifie rien : la ligne n'est jamais authentifiée. */
    public function test_without_a_signing_secret_nothing_is_authenticated(): void
    {
        config()->set('lemon-squeezy.signing_secret', '');
        $this->postLemonSqueezy($this->body(), 'quelconque')->assertOk();

        $log = IntegrationWebhookLog::query()->sole();
        $this->assertNull($log->authenticated_at);
        $this->assertFalse($log->isReplayable());
    }

    private function body(): string
    {
        return json_encode(['meta' => ['event_name' => 'tck_602_unhandled'], 'data' => ['id' => 'ls_602', 'type' => 'orders']]);
    }

    private function postLemonSqueezy(string $body, string $signature): TestResponse
    {
        return $this->call('POST', '/'.trim((string) config('lemon-squeezy.path'), '/').'/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_SIGNATURE' => $signature,
        ], $body);
    }
}
