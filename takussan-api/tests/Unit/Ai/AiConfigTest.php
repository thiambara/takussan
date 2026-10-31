<?php

namespace Tests\Unit\Ai;

use App\Services\Ai\AiMoney;
use Tests\TestCase;

/**
 * TCK-2383 (ADR-0076 §2, §3) — la configuration du socle se tient : chaque maillon de repli vise un
 * fournisseur déclaré et un modèle tarifé (sans tarif, un appel ne se budgète pas), et chaque
 * fournisseur porte le nom que `privacy.ts` doit citer.
 */
class AiConfigTest extends TestCase
{
    public function test_every_fallback_link_targets_a_declared_provider_and_a_priced_model(): void
    {
        foreach (config('ai.roles') as $role => $chain) {
            foreach ($chain as $link) {
                $this->assertArrayHasKey($link['provider'], config('ai.providers'), "rôle {$role}");
                $this->assertArrayHasKey($link['model'], config('ai.pricing')[$link['provider']] ?? [], "rôle {$role}");
                $this->assertArrayNotHasKey('temperature', $link, "rôle {$role} : refusé par l'API depuis le 2026-10-21");
            }
        }
    }

    public function test_every_provider_has_a_legal_name_and_no_hardcoded_key(): void
    {
        $this->assertNotEmpty(config('ai.providers'));
        foreach (config('ai.providers') as $key => $provider) {
            $this->assertNotEmpty($provider['legal_name'] ?? null, $key);
        }
        $this->assertStringContainsString("env('ANTHROPIC_API_KEY')", (string) file_get_contents(config_path('ai.php')));
    }

    /** ADR-0086 — un tarif de la configuration est une chaîne : un `float` arrondirait le coût. */
    public function test_every_configured_price_is_a_decimal_string(): void
    {
        foreach (config('ai.pricing') as $provider => $models) {
            foreach ($models as $model => $prices) {
                $this->assertSame(['input', 'output', 'cache_read', 'cache_write'], array_keys($prices), "{$provider}/{$model}");
                foreach ($prices as $kind => $price) {
                    $this->assertTrue(AiMoney::isAmount($price), "{$provider}/{$model} {$kind}");
                }
            }
        }
    }

    public function test_the_exchange_rate_and_the_global_budget_survive_an_empty_environment_value(): void
    {
        $this->assertSame(1, AiMoney::compare(config('ai.usd_to_xof'), '0'));
        $this->assertSame(1, AiMoney::compare(config('ai.budgets.daily_global_usd'), '0'));
        $this->assertSame(300, config('ai.timeout_seconds'));
    }
}
