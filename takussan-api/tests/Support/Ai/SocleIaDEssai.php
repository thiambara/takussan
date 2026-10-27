<?php

namespace Tests\Support\Ai;

use App\Ai\Usages\ConnectionTestUsage;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\PromptRepository;

/**
 * Le socle IA d'essai : deux modèles fictifs tarifés (`modele-a`, puis `modele-b` en bascule), une
 * clé factice, aucun plafond, et un catalogue réduit à l'usage d'essai et au test de connexion.
 * Aucun identifiant de vrai modèle : la suite n'en joint jamais.
 */
trait SocleIaDEssai
{
    protected function installerSocleDEssai(): void
    {
        config([
            'ai.providers.anthropic.key' => 'cle-de-test',
            'ai.roles.extraction' => [
                ['provider' => 'anthropic', 'model' => 'modele-a', 'max_tokens' => 1000],
                ['provider' => 'anthropic', 'model' => 'modele-b', 'max_tokens' => 1000],
            ],
            'ai.pricing' => ['anthropic' => [
                'modele-a' => ['input' => 2.0, 'output' => 10.0, 'cache_read' => 0.2, 'cache_write' => 2.5],
                'modele-b' => ['input' => 1.0, 'output' => 5.0, 'cache_read' => 0.1, 'cache_write' => 1.25],
            ]],
            'ai.usd_to_xof' => 600.0,
            'ai.budgets.daily_global_xof' => null,
            'ai.budgets.daily_per_agency_xof' => null,
        ]);

        $this->app->instance(AiUsageRegistry::class, new AiUsageRegistry([UsageDEssai::class, ConnectionTestUsage::class]));
        $this->app->instance(PromptRepository::class, new PromptRepository([resource_path('ai/prompts'), base_path('tests/Support/Ai/prompts')]));
    }
}
