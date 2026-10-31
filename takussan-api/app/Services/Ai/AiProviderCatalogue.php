<?php

namespace App\Services\Ai;

/**
 * TCK-2385 (ADR-0076 §3) — ce que la console peut savoir d'un fournisseur : son nom légal, si une clé
 * est présente (un booléen, jamais la valeur) et ses modèles actifs au catalogue, les seuls affectables.
 */
final class AiProviderCatalogue
{
    public function __construct(private readonly AiModelCatalogue $models) {}

    /** @return list<array{key: string, legal_name: string, key_present: bool, models: list<string>}> */
    public function describe(): array
    {
        $providers = [];
        foreach (config('ai.providers') as $key => $provider) {
            $providers[] = [
                'key' => $key,
                'legal_name' => (string) ($provider['legal_name'] ?? $key),
                'key_present' => filled($provider['key'] ?? null),
                'models' => $this->models->assignableModels($key),
            ];
        }

        return $providers;
    }

    public function has(string $provider): bool
    {
        return array_key_exists($provider, config('ai.providers'));
    }

    public function keyPresent(string $provider): bool
    {
        return filled(config('ai.providers')[$provider]['key'] ?? null);
    }

    public function cheapestModel(string $provider): ?string
    {
        return $this->models->cheapestModel($provider);
    }
}
