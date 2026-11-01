<?php

namespace Tests\Feature\Ai;

use App\Ai\Agents\SocleAgent;
use App\Models\Enums\AiDataClass;
use App\Services\Ai\AiUsage;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\EmbeddingUsage;
use App\Services\Ai\PromptRepository;
use InvalidArgumentException;
use Tests\TestCase;

/**
 * TCK-2383 (ADR-0076 §4) — chaque usage du catalogue est complet : un prompt chargeable à sa
 * version, un agent du socle, une autorité, et jamais la classe `sensible`.
 */
class AiUsageRegistryTest extends TestCase
{
    public function test_every_declared_usage_is_complete(): void
    {
        $registry = app(AiUsageRegistry::class);
        $this->assertNotEmpty($registry->all());

        foreach ($registry->all() as $key => $usage) {
            $this->assertInstanceOf(AiUsage::class, $usage);
            $this->assertMatchesRegularExpression('/^[a-z]+\.[a-z_]+$/', $key);
            $this->assertNotSame(AiDataClass::Sensible, $usage->maxDataClass(), $key);
            // TCK-2423 — un usage d'embeddings n'a ni agent ni prompt, et se joue par `AiGateway::embed()`.
            if ($usage instanceof EmbeddingUsage) {
                continue;
            }
            $this->assertTrue(is_subclass_of($usage->agentClass(), SocleAgent::class), $key);
            $this->assertNotSame('', app(PromptRepository::class)->load($key, $usage->promptVersion()), $key);
        }
    }

    public function test_an_unknown_usage_is_refused_by_a_code(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('ai.usage_unknown');

        app(AiUsageRegistry::class)->get('inconnu.usage');
    }
}
