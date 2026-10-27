<?php

namespace Tests\Feature\Api\Admin;

use App\Ai\Agents\ConnectionTestAgent;
use App\Ai\Usages\ConnectionTestUsage;
use App\Models\AiCall;
use App\Models\Enums\AiCallOutcome;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Ai\Exceptions\RateLimitedException;
use Tests\Support\Ai\SocleIaDEssai;
use Tests\TestCase;

/** TCK-2385 (AC3) — la console voit si une clé est présente, et la teste ; jamais sa valeur. */
class AdminAiProvidersTest extends TestCase
{
    use RefreshDatabase;
    use SocleIaDEssai;

    private const CLE = 'sk-ant-valeur-de-test-a-ne-jamais-rendre';

    protected function setUp(): void
    {
        parent::setUp();
        $this->installerSocleDEssai();
        config(['ai.providers.anthropic.key' => self::CLE]);
    }

    public function test_no_read_route_ever_returns_the_key(): void
    {
        $this->actingAsRole('super_admin');

        foreach (['/api/admin/ai/providers', '/api/admin/ai/roles', '/api/admin/ai/usages'] as $route) {
            $this->assertStringNotContainsString(self::CLE, $this->getJson($route)->assertOk()->getContent(), $route);
        }
        $this->assertTrue($this->getJson('/api/admin/ai/providers')->json('data.0.key_present'));
    }

    public function test_the_connection_test_calls_the_cheapest_priced_model_through_the_gateway(): void
    {
        $this->actingAsRole('super_admin');
        ConnectionTestAgent::fake(['OK']);

        $this->postJson('/api/admin/ai/providers/anthropic/test')->assertOk()
            ->assertJsonPath('data.ok', true)->assertJsonPath('data.model', 'modele-b');

        $call = AiCall::query()->sole();
        $this->assertSame([ConnectionTestUsage::KEY, 'modele-b'], [$call->usage_key, $call->model]);
    }

    public function test_a_failing_provider_is_reported_without_its_message(): void
    {
        $this->actingAsRole('super_admin');
        ConnectionTestAgent::fake(fn () => throw RateLimitedException::forProvider('anthropic'));

        $this->postJson('/api/admin/ai/providers/anthropic/test')->assertOk()
            ->assertJsonPath('data.ok', false)->assertJsonPath('data.error_code', 'ai.provider_rate_limited');
    }

    public function test_a_missing_key_and_an_unknown_provider_are_refused(): void
    {
        $this->actingAsRole('super_admin');

        $this->postJson('/api/admin/ai/providers/mistral/test')->assertStatus(404)->assertJsonPath('code', 'ai.provider_unknown');
        config(['ai.providers.anthropic.key' => null]);
        $this->postJson('/api/admin/ai/providers/anthropic/test')->assertStatus(422)->assertJsonPath('code', 'ai.provider_key_missing');
    }

    public function test_the_connection_test_is_never_served_from_the_cache(): void
    {
        $this->actingAsRole('super_admin');
        ConnectionTestAgent::fake(['OK', 'OK']);

        $this->postJson('/api/admin/ai/providers/anthropic/test')->assertOk()->assertJsonPath('data.ok', true);
        $this->postJson('/api/admin/ai/providers/anthropic/test')->assertOk()->assertJsonPath('data.ok', true);

        $this->assertSame(0, AiCall::query()->where('outcome', AiCallOutcome::CacheHit)->count());
        $this->assertSame(2, AiCall::query()->where('outcome', AiCallOutcome::Success)->count());
        $this->assertSame(0, (new ConnectionTestUsage)->cacheTtlSeconds());
    }

    public function test_the_connection_test_never_leaks_the_key_or_the_sdk_message(): void
    {
        $this->actingAsRole('super_admin');
        ConnectionTestAgent::fake(fn () => throw new \RuntimeException('boom '.self::CLE));

        $response = $this->postJson('/api/admin/ai/providers/anthropic/test')->assertOk()->assertJsonPath('data.ok', false);

        $this->assertStringNotContainsString(self::CLE, $response->getContent());
        $this->assertStringNotContainsString('boom', $response->getContent());
    }
}
